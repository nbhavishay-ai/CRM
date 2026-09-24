# ORVION application audit

**Date:** 20 September 2026  
**Verdict:** Not ready for an unrestricted production release. Fix database configuration and authorization before expanding use.  
**Scope:** Current local working tree, including uncommitted work. Application source was not changed. This is an evidence-based engineering audit, not a guarantee that every defect has been discovered.

## Executive assessment

The app compiles, and many business-rule tests pass. However, passing compilation and rejecting unauthenticated requests do not establish correct access control. The strongest findings are authenticated authorization failures: an executive can modify another executive's leads, a team lead can delete leads outside their team, and staff compensation is exposed to ordinary executives.

There are **24 findings: 11 high, 11 medium, and 2 low priority**. Seventeen findings have isolated executable reproductions. Other findings are supported by observed validation failures or identified code paths; conditional risks are explicitly marked. No production exploit, production database mutation, or external push notification was performed.

High priority means a release blocker involving access control, sensitive data, account integrity, or basic availability. Medium means a material correctness, integrity, reliability, or testability problem. Low means a localized issue or quality-gate problem. These are engineering priorities, not formal CVSS scores.

## What was verified

| Check | Result | Evidence / qualification |
|---|---|---|
| Source inventory | 172 files; 38,168 lines; 40 API route files; 36 page files | [Inventory and SHA-256 hashes](inventory.json). Inventory is not a claim that every line received exhaustive manual review. |
| TypeScript | Passed | `npx tsc --noEmit --incremental false`, during initial validation of the same application source. |
| Production compilation | Completed | Direct `next build` succeeded after allowing build worker execution. Repeated Prisma datasource errors were emitted while collecting page data. The mutating database preparation script was intentionally bypassed. |
| Application lint | 2 errors, 174 warnings | [Machine-readable output](lint.json). Audit support files excluded. See A20 for why these errors are not proof of render-time execution. |
| Production dependency advisory scan | 0 reported vulnerabilities | [npm audit output](dependencies.json), `npm audit --omit=dev --json`. This covers the registry's reported advisories, not all possible vulnerabilities. |
| Existing suite, fresh isolated database and real clock | 86 passed, 3 failed | [Initial test log](existing-tests.log). |
| Existing suite, isolated database with core fixtures and fixed noon IST clock | 88 passed, 1 failed | [Controlled test log](controlled-tests.log). 89 tests across 14 files. |
| Targeted audit tests | 18 passed | [Reproduction log](reproductions.log): 17 tests demonstrate undesirable behavior; the remaining test verifies anonymous rejection. A passing reproduction means the bug was observed, not that the application is correct. |
| Anonymous API checks | 68 protected route-method combinations rejected requests | [Detailed results](anonymous-routes.json). Public login, logout, sample template, and VAPID-key discovery excluded. This tests handler responses, not every network or proxy configuration. |
| Running production server smoke check | 11 routes/assets checked | [HTTP results](http-smoke.json). Login/assets returned 200; protected pages redirected to login; tested protected APIs rejected anonymous requests. |
| Browser | Login screen rendered with labeled email/password controls and sign-in button | Inspected at desktop viewport. No authenticated end-to-end or mobile-browser certification is implied. |

### Isolation and limitations

The application schema and generated client use PostgreSQL, while the current local effective URL is incompatible with that provider. Docker's local engine was unavailable, so PostgreSQL integration testing could not be completed.

Tests used a **separate SQLite database and separately generated Prisma client** beneath this audit directory. The schema copy differs only in provider, datasource environment variable, and generated-client output. A Bun preload redirects application database imports to the disposable client; push keys are disabled for the test process. Application routes/services themselves were exercised, not replaced with fake business logic.

SQLite results establish the observed application behavior in this harness. They do not certify PostgreSQL locking, collation, query plans, deployment migrations, or concurrent transaction behavior. Existing tests also depend on shared fixtures and real dates; the second run controls those conditions and is reported separately.

Not certified: deployed infrastructure, production secrets, backups/restoration, external integrations, notification delivery, real workloads, concurrent load, all visual states, mobile accessibility, and a complete multi-browser journey. The local login page was inspected, but authenticated browser flows remain blocked by the original database configuration. Real user data was not used for synthetic tests.

## Findings and fixes

### A01 — High: local database provider and URL disagree

**Evidence:** `prisma/schema.prisma:8` selects PostgreSQL. The production compilation emitted: “the URL must start with the protocol postgresql:// or postgres://”. `lib/db.ts` still includes SQLite setup and fallback logic. **Observed runtime/configuration defect.**

**Impact:** Compilation can succeed while authenticated database-backed features fail. README setup instructions still describe SQLite, adding confusion.

**Fix:** Choose the supported database configuration explicitly for each environment; align schema, generated client, URL, setup docs, and deployment. Validate the datasource at startup. Do not silently switch a deployed CRM to ephemeral `/tmp` storage.

**Acceptance:** A real PostgreSQL connection, representative authenticated queries, and the full integration suite pass using the intended deployment provider.

### A02 — High: bulk status updates bypass lead ownership

**Evidence:** `app/api/leads/bulk-action/route.ts:57`; `services/lead.service.ts:792`. The route admits executives; the service selects supplied IDs without actor scope. **Reproduced:** executive A changed executive B's lead to `CLOSED_LOST`, receiving HTTP 200.

**Fix:** Scope all requested lead IDs by current permissions before mutation; reject the entire batch if any requested lead is unauthorized. Validate status/category transitions.

**Acceptance:** Cross-owner and cross-team batches receive 403 and leave all records and history unchanged; valid own-scope updates succeed.

### A03 — High: team leads can delete leads outside their team

**Evidence:** `app/api/leads/[id]/route.ts:107`; `services/lead.service.ts:621` and `:652`; bulk-action delete also permits team leads. Neither deletion service checks target ownership. **Reproduced:** a team lead deleted another user's lead by ID.

**Impact:** Lead deletion cascades through associated history, meetings, calls, and follow-ups.

**Fix:** Enforce the intended deletion policy centrally, including team ownership if team-lead deletion is allowed. Apply the same rule to single and bulk deletion.

**Acceptance:** Both single and bulk cross-team deletion fail atomically; all associated records remain intact.

### A04 — High: meeting mutations lack lead/meeting authorization

**Evidence:** `services/meeting.service.ts:17` and `:90`; `app/api/meetings/route.ts`. Authentication and HR exclusion are present, but there is no target-level authorization. **Reproduced:** an executive scheduled a meeting for another executive's lead; a third executive completed it.

**Fix:** Check current lead access and meeting-management permissions inside both services before writing any meeting, lead, timeline, or follow-up record.

**Acceptance:** Unauthorized creation/completion receives 403, with no side effects or notifications.

### A05 — High: a follow-up ID can escape the authorized lead in the URL

**Evidence:** `app/api/leads/[id]/followups/route.ts:47`; `services/followup.service.ts:16`. The route authorizes the URL lead, but completion loads the independent body `followupId`. **Reproduced:** an executive used their own lead URL to complete another lead's follow-up and change that lead's status.

**Fix:** Require the follow-up's `leadId` to equal the authorized URL lead ID, and verify current actor access inside the completion service.

**Acceptance:** A mismatched follow-up is rejected without modifying either lead.

### A06 — High: old sessions preserve removed privileges

**Evidence:** `lib/auth.ts:20` and `:23`. Tokens last 30 days; most handlers trust the embedded role without checking the current user. `/api/auth/me` does check active status, but calling it is not mandatory before directly invoking other APIs. **Reproduced:** a token issued to an admin still retrieved admin-only attention metrics after that user was deactivated and demoted.

**Fix:** Resolve current active status and role in a shared authorization layer; introduce revocable sessions or token versions. Apply invalidation to deactivation, deletion, password changes, and role changes.

**Acceptance:** Previously issued tokens immediately lose access after each of those changes, including direct bearer-token calls.

### A07 — High: executives receive private staff fields

**Evidence:** `app/api/users/route.ts:31` and `:51`. Executives can list active staff, while the response includes `baseSalary` and `emergencyContact`. **Reproduced:** an executive received another employee's synthetic salary and emergency contact.

**Fix:** Use role-specific response projections. Assignment directories should expose only the minimal public work identity fields. Restrict compensation and emergency contacts to authorized HR/admin workflows.

**Acceptance:** Neither executives nor team leads receive sensitive fields through directory endpoints unless expressly authorized by policy.

### A08 — High: teamless team leads receive company-wide meetings and reports

**Evidence:** `services/meeting.service.ts:179`; `services/report.service.ts:54` and `:125`. Scope is added only when the token contains a team ID; otherwise filters remain global. **Reproduced:** a teamless team lead saw another employee's meeting and executive report entry.

**Fix:** Resolve current membership and fail closed when it is absent; never treat missing scope as company-wide scope.

**Acceptance:** A removed/teamless team lead gets an empty authorized view or 403, not company-wide results. Stale team tokens also lose old-team access.

### A09 — High: normal requests recreate fixed-credential core accounts

**Evidence:** `lib/ensure-users.ts:7` and `:24`; `app/api/auth/login/route.ts:13`. Login and directory requests invoke provisioning. Missing core accounts, including an administrator, are recreated with a password embedded in source. **Code-confirmed; privileged recreation is conditional on an account being absent.**

**Fix:** Move initial provisioning into an explicit one-time administrative process. Remove account recreation from request handling and require unique credentials. Do not restore intentionally deleted or renamed accounts automatically.

**Acceptance:** Deleting or renaming a core account is not undone by login attempts or user-directory reads.

### A10 — High: deployment can reset credentials and accept data loss

**Evidence:** `scripts/prepare-database.ts:3`, `package.json` build command, and `prisma/seed.ts:17`. When `VERCEL=1` and `DATABASE_URL` starts with `postgres`, the build runs `db push --accept-data-loss` followed by a seed that overwrites core users' password hashes, active states, and other fields. **Code-confirmed conditional deployment risk; not executed against user data.**

**Fix:** Separate migrations from compilation; use reviewed migrations, preflight checks, and a tested backup/restore plan. Make seeding create-only and exclude credential resets from deployments.

**Acceptance:** A redeploy preserves changed passwords, deactivated accounts, assignments, and existing data; destructive schema changes require an explicit migration decision.

### A11 — Medium: deleting a user with follow-ups fails

**Evidence:** `prisma/schema.prisma:213` restricts deletion of follow-up authors; `app/api/users/route.ts:330` deletes users without handling those follow-ups. **Reproduced:** HTTP 500 / Prisma P2003; the transaction rolled back.

**Fix:** Prefer deactivation or an archival model that retains authorship. If physical deletion is required, define and implement a consistent policy for every dependent relation.

**Acceptance:** The user operation either succeeds under that policy or returns a clear conflict response rather than an internal-server error.

### A12 — Medium: user deletion falsifies historical attribution

**Evidence:** `app/api/users/route.ts:300` onward changes remarks, assignments, calls, status histories, and meeting authors to the deleting admin. **Reproduced:** a historical remark's author became the administrator.

**Fix:** Retain immutable actor identity through soft deletion or immutable actor snapshots. Do not assign another person's past actions to the administrator.

**Acceptance:** Historical records continue to identify their original author after account removal/deactivation.

### A13 — Medium: lead-number allocation is not atomic

**Evidence:** `lib/lead-number.ts:32`; callers compute the next number before inserting. **Reproduced:** two simultaneous allocations returned the same identifier. The unique constraint prevents duplicate storage but can make a legitimate create/import fail. Actual PostgreSQL concurrent transaction behavior was not load-tested.

**Fix:** Use a database sequence or locked counter with an atomic reservation. Define retry/idempotency behavior. The top-100 lexicographic scan also needs replacement to support nonstandard or larger identifiers reliably.

**Acceptance:** Concurrent lead creation and imports produce unique permanent identifiers without lost requests.

### A14 — Medium: zero commission is saved as 2 percent

**Evidence:** `app/api/hr/payroll/route.ts:49` uses `parseFloat(value) || 2.0`. **Reproduced:** submitting zero returned and stored 2.

**Fix:** Default only when the field is absent; explicitly validate finite numeric values and permitted bounds.

**Acceptance:** Zero remains zero, valid decimals round-trip correctly, and invalid values are rejected.

### A15 — Medium: scheduling overwrites closed lead status inconsistently

**Evidence:** `services/meeting.service.ts:49` unconditionally sets `MEETING`, despite a comment limiting the change to early stages. **Reproduced:** a `CLOSED_WON` / `CLOSED` lead became `MEETING` / `CLOSED`.

**Fix:** Define permitted transitions and update status/category together. Preserve closed outcomes or require an explicit, authorized reopen operation.

**Acceptance:** Scheduling a meeting cannot silently remove a won outcome or create contradictory status/category values.

### A16 — Medium: meeting and calling times depend on server timezone

**Evidence:** `services/meeting.service.ts:18`; `services/import.service.ts:579`; daily task filtering in `app/api/tasks/route.ts:19`. These parse or compare timezone-free local values, while attendance uses India time. **Reproduced:** `2026-09-22 14:30` parsed to 14:30Z under UTC and 09:00Z under Asia/Kolkata, a 5.5-hour difference.

**Fix:** Use one explicit business timezone for user-entered dates and daily boundaries; persist instants in UTC. Return validation errors for malformed import dates instead of silently scheduling two hours later.

**Acceptance:** Identical requests under UTC and India server environments create the same instant and daily classification.

### A17 — Medium: stale cache entries persist and keys are shared across users

**Evidence:** `lib/fast-data.ts:36` ignores TTL on memory hits. `components/tasks/ExecutiveTasksWidget.tsx:29` and `app/dashboard/meetings/page.tsx:26` use keys without user identity; `components/layout/Navbar.tsx:87` does not clear the cache on logout. **Reproduced:** an already-expired cache entry was returned. **Source-supported additional risk:** a subsequent account in the same tab may initially render the prior account's cached data; that complete browser transition was not exercised.

**Fix:** Partition cache and in-flight requests by authenticated user/session; clear both on account changes/logout; enforce TTL on all read paths and guard stale request completion.

**Acceptance:** Expired entries return a miss, and switching accounts never displays or restores previous-account data even during failed refreshes.

### A18 — Medium: CSV exports preserve formula prefixes

**Evidence:** `lib/export-utils.ts:13` quotes CSV values but does not neutralize spreadsheet formulas. **Reproduced:** `=1+1` exported as a quoted formula string. Spreadsheet execution itself was not performed.

**Impact:** Exported user-controlled names/notes can be interpreted as formulas by compatible spreadsheet software. CSV quoting alone addresses separators, not formula evaluation.

**Fix:** Apply a spreadsheet-safe export policy for formula prefixes, preserving data intentionally and documenting the format.

**Acceptance:** Exporting cells beginning with `=`, `+`, `-`, `@`, or relevant control characters opens as intended text in supported spreadsheet programs.

### A19 — Low: calling-assignment notification points to a missing route

**Evidence:** `services/assignment.service.ts:229` links to `/dashboard/calling`; the app defines `/dashboard/executive/calling` and role-specific alternatives. **Code-confirmed route mismatch.**

**Fix:** Use the actual recipient-role route; centralize notification route generation.

**Acceptance:** Clicking an executive calling-assignment notification opens their calling workspace.

### A20 — Low: lint is a failing quality gate

**Evidence:** [Lint output](lint.json): 2 errors and 174 warnings. Both errors flag `Date.now()` at `app/dashboard/admin/bulk-upload/page.tsx:313` and `:398`.

**Important correction:** Both calls are inside the form's `handleSubmit` callback, attached at line 644. These are confirmed lint failures, but the warning text alone does not establish that the clock runs during render. Treat the rule interaction separately from runtime defects.

**Fix:** Resolve the analyzer interaction or narrowly justify an exception after verifying the callback behavior. Triage dependency-array warnings before removing cosmetic unused code.

**Acceptance:** The agreed application lint command exits successfully without broad rule suppression that hides unrelated bugs.

### A21 — Medium: tests depend on environment and disagree with implementation

**Evidence:** First isolated run: 86/89. After provisioning required core accounts and fixing the clock to noon IST: 88/89.

- `tests/bulk-import.test.ts:249` failed after working hours because the calling-data path auto-clocks out and hides the calling queue; it passed under the controlled clock.
- `tests/meeting-visibility.test.ts:21` requires specific existing accounts instead of creating its own fixtures; it passed after core fixtures were added.
- `tests/bulk-upload-hub.test.ts:262` still expects script notes in `LeadUpdate`. Calling import stores script notes in `Lead.notes`, but its pending timeline update array is not populated for new records. This is an unresolved contract mismatch: decide whether import history is mandatory, then align code and test. The data is not proven lost.

**Fix:** Use explicit isolated databases, owned fixtures, fixed clocks, and a documented import-history contract. Existing tests import the normal database module and mutate/delete records; plain `bun test` is not safely isolated by default.

**Acceptance:** The full suite is deterministic on a fresh test database at any wall-clock time and cannot accidentally target production data.

### A22 — Medium: task priority sorts in the wrong order

**Evidence:** `app/api/tasks/route.ts:78` sorts the string field descending with a “HIGH first” comment. **Reproduced:** the returned order was `NORMAL`, `LOW`, `HIGH`.

**Fix:** Use an explicit priority rank in the query/data model or a stable application sort before pagination.

**Acceptance:** HIGH precedes NORMAL, which precedes LOW, with a defined secondary deadline order.

### A23 — High: missing JWT configuration falls back to a known signing key

**Evidence:** `lib/auth.ts:7` uses a source-code literal when the environment secret is absent. **Conditional configuration vulnerability; no claim that the deployed secret is currently missing.**

**Impact:** An instance started without the secret accepts signatures made with the known fallback, undermining role-based protection.

**Fix:** Fail startup if a secure secret is missing; rotate any previously exposed/fallback signing key and invalidate affected sessions.

**Acceptance:** Missing/empty secret prevents production startup; old-key signatures are rejected after rotation.

### A24 — Medium: phone-format variations bypass duplicate lead checks

**Evidence:** `services/lead.service.ts:27` compares the raw phone value; the schema indexes phone but does not enforce canonical uniqueness. Imports apply normalization through a different path. **Reproduced:** the same synthetic Indian number in local and `+91` formats produced two leads.

**Fix:** Define canonical phone identity consistently across creation, editing, sync, and imports; store/display original formatting separately if needed. Add a suitable database uniqueness strategy after reviewing existing duplicates and business exceptions.

**Acceptance:** Equivalent phone formats are handled as the same identity, including concurrent requests and edits.

## Further risks requiring targeted verification

These are not counted as additional confirmed findings:

- Calling-pool allocation reads candidate records, updates only still-unassigned IDs, then creates histories for the original selection without checking the update count. PostgreSQL concurrency tests are required to determine the actual resulting histories under overlapping allocations (`services/assignment.service.ts:176`).
- `services/audit.service.ts` catches logging failures and returns null, while core writes can already be committed. Verify the intended guarantee for immutable audit completeness under database faults.
- `prisma/dev.db` is not covered by the current ignore rules. It is not claimed to be committed or publicly exposed; review local data artifacts before adding the untracked Prisma directory to source control.
- Login has no visible application-level rate limiter. Deployed gateway protections were not inspected; verify them before calling this an exposed production weakness.
- Date ranges, body types, maximum batch/page sizes, unsupported role/status strings, and large-file resource usage need a systematic validation/fuzz pass on the intended PostgreSQL environment.
- Browser accessibility, responsiveness, real-time refresh, offline/PWA behavior, and account switching require a dedicated authenticated UI pass after A01 is resolved.

## Recommended repair order

1. **Restore a reproducible environment:** resolve A01, provide an isolated PostgreSQL test database, capture backups, and remove deployment-time reset behavior (A10).
2. **Close authorization/account gaps:** A02–A09 and A23. Add both allowed-operation and denied-operation tests for ADMIN, HR, TEAM_LEAD with/without team, and EXECUTIVE.
3. **Protect history and correctness:** A11–A16, A22, A24. Add PostgreSQL concurrency and fault-injection tests for allocation and audit writes.
4. **Protect browser/export boundaries:** A17–A19, plus an authenticated browser pass through all four roles and mobile widths.
5. **Make the quality gates reliable:** A20–A21, deterministic full tests, successful lint/typecheck/build, and a deployment dry run that cannot reset business data.

Release acceptance should require zero unresolved high-priority findings, no unexpected 500s in representative workflows, a clean provider-matched integration run, and demonstrated backup restoration. A green compilation alone is insufficient.

## Reproduction artifacts and rerun notes

- [Targeted characterization tests](reproductions.test.js): assert the currently observed unsafe behavior. Convert these into deny/correctness regression tests when implementing repairs.
- [Anonymous route sweep](anonymous-routes.test.js).
- [Database isolation preload](preload.js), [copied audit schema](schema.prisma), [controlled clock/fixture preload](controlled-preload.js).
- [Initial results](existing-tests.log), [controlled results](controlled-tests.log), [targeted results](reproductions.log), [lint results](lint.json), [dependency results](dependencies.json), [HTTP results](http-smoke.json).

Run from the repository root, with the generated audit client and disposable database present:

```powershell
bun test --preload ./audit/2026-09-20/preload.js ./audit/2026-09-20/reproductions.test.js ./audit/2026-09-20/anonymous-routes.test.js
```

The audit tests skip their mutation checks when the isolation preload is absent. Database files and the generated client are ignored inside this audit directory. The existing application suite does not have that safety guard; use the preload and fresh fixtures. To reproduce the clean controlled run from scratch, generate the copied schema's client, create an empty disposable database from that schema, and use the controlled preload. Reusing a dirty database can introduce fixture collisions.

The report does not contain JWTs, database credentials, or the fixed passwords found in source. The original source and user database were not repaired or rewritten as part of this audit.
