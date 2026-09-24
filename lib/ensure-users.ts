/**
 * Core accounts are provisioned explicitly by `bun run seed`.
 * Request handlers must never recreate deleted or renamed accounts.
 */
export async function ensureCoreUsers(): Promise<void> {
  return;
}
