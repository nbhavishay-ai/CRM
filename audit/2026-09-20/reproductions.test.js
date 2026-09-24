import { test as bunTest, expect } from 'bun:test';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { POST as bulk } from '@/app/api/leads/bulk-action/route';
import { GET as users, DELETE as deleteUser } from '@/app/api/users/route';
import { GET as leads } from '@/app/api/leads/route';
import { DELETE as deleteLead } from '@/app/api/leads/[id]/route';
import { POST as followup } from '@/app/api/leads/[id]/followups/route';
import { POST as meeting, PATCH as completeMeeting, GET as meetings } from '@/app/api/meetings/route';
import { POST as payroll } from '@/app/api/hr/payroll/route';
import { GET as reports } from '@/app/api/reports/route';
import { generateNextLeadNumber } from '@/lib/lead-number';
import { GET as tasks } from '@/app/api/tasks/route';
import { createLead } from '@/services/lead.service';
import { escapeCSVValue } from '@/lib/export-utils';
import { setFastCache, getFastCache } from '@/lib/fast-data';
import { spawnSync } from 'node:child_process';

// Characterization tests: PASS means the named bug was reproduced, NOT that
// the behavior is correct. Every record is synthetic in disposable audit.db.
// A plain `bun test` must never execute these mutations against app data.
const test = globalThis.__auditPrisma === prisma ? bunTest : bunTest.skip;
const run = crypto.randomUUID();
let sequence = 0;
async function user(role = 'EXECUTIVE', extra = {}) {
  return prisma.user.create({data: {name: 'Audit fixture', email: `${run}-${sequence++}@example.invalid`, role, passwordHash: 'not-a-real-password', ...extra}});
}
async function lead(owner, extra = {}) {
  return prisma.lead.create({data: {leadNumber: `AUDIT-${run}-${sequence++}`, clientName: 'Synthetic audit lead', phone: `${sequence++}`, currentOwnerId: owner.id, ...extra}});
}
function request(path, actor, method = 'GET', body) {
  return new NextRequest(`http://localhost${path}`, {method, headers: {Authorization: `Bearer ${signToken({id:actor.id,name:actor.name,email:actor.email,role:actor.role,teamId:actor.teamId})}`, 'Content-Type':'application/json'}, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
}

test('A02: executive changes another executive lead through bulk status endpoint', async () => {
  const actor = await user(); const victim = await user(); const target = await lead(victim);
  const res = await bulk(request('/api/leads/bulk-action', actor, 'POST', {action:'STATUS_UPDATE',ids:[target.id],status:'CLOSED_LOST'}));
  expect(res.status).toBe(200);
  expect((await prisma.lead.findUnique({where:{id:target.id}})).currentStatus).toBe('CLOSED_LOST');
});
test('A03: team lead deletes another team lead record by ID', async () => {
  const actor = await user('TEAM_LEAD'); const victim = await user(); const target = await lead(victim);
  const res = await deleteLead(request(`/api/leads/${target.id}`, actor, 'DELETE'), {params:Promise.resolve({id:target.id})});
  expect(res.status).toBe(200); expect(await prisma.lead.findUnique({where:{id:target.id}})).toBeNull();
});
test('A04: executive creates and completes meeting on another executive lead', async () => {
  const actor = await user(); const victim = await user(); const target = await lead(victim);
  const res = await meeting(request('/api/meetings',actor,'POST',{leadId:target.id,date:'2026-09-22',time:'14:30',meetingType:'Online'}));
  expect(res.status).toBe(201); const data = await res.json();
  const otherActor = await user();
  const done = await completeMeeting(request('/api/meetings',otherActor,'PATCH',{meetingId:data.meeting.id,outcome:'Unauthorized change'}));
  expect(done.status).toBe(200);
});
test('A05: follow-up ID from a different lead bypasses URL lead authorization', async () => {
  const actor = await user(); const victim = await user(); const own = await lead(actor); const target = await lead(victim);
  const item = await prisma.leadFollowup.create({data:{leadId:target.id,userId:victim.id,dueAt:new Date()}});
  const res = await followup(request(`/api/leads/${own.id}/followups`,actor,'POST',{followupId:item.id,outcome:'Unauthorized',newStatus:'CLOSED_LOST'}),{params:Promise.resolve({id:own.id})});
  expect(res.status).toBe(200); expect((await prisma.lead.findUnique({where:{id:target.id}})).currentStatus).toBe('CLOSED_LOST');
});
test('A06: deactivated and demoted admin token still gets admin-only metrics', async () => {
  const actor = await user('ADMIN'); const req = request('/api/leads?attention=true',actor);
  await prisma.user.update({where:{id:actor.id},data:{active:false,role:'EXECUTIVE'}});
  expect((await leads(req)).status).toBe(200);
});
test('A07: executive receives other staff salary and emergency contact', async () => {
  const actor = await user(); const victim = await user('EXECUTIVE',{baseSalary:123456,emergencyContact:'synthetic-private-contact'});
  const res = await users(request('/api/users',actor)); expect(res.status).toBe(200);
  const data = await res.json(); const exposed = data.users.find(u=>u.id===victim.id);
  expect(exposed.baseSalary).toBe(123456); expect(exposed.emergencyContact).toBe('synthetic-private-contact');
});
test('A08: team lead with no team sees another team meeting and global reports', async () => {
  const actor = await user('TEAM_LEAD'); const victim = await user(); const target = await lead(victim);
  const item = await prisma.meeting.create({data:{leadId:target.id,createdById:victim.id,scheduledAt:new Date(Date.now()+86400000),date:'2026-09-21',time:'14:00'}});
  const res = await meetings(request('/api/meetings?timeframe=upcoming',actor));
  expect((await res.json()).meetings.some(m=>m.id===item.id)).toBe(true);
  const report = await reports(request('/api/reports',actor)); expect(report.status).toBe(200);
  expect((await report.json()).report.executiveBreakdown.some(u=>u.id===victim.id)).toBe(true);
});
test('A11: deleting user with a follow-up fails and transaction rolls back', async () => {
  const actor = await user('ADMIN'); const victim = await user(); const target = await lead(victim);
  await prisma.leadFollowup.create({data:{leadId:target.id,userId:victim.id,dueAt:new Date()}});
  const res = await deleteUser(request('/api/users',actor,'DELETE',{id:victim.id}));
  expect(res.status).toBe(500); expect(await prisma.user.findUnique({where:{id:victim.id}})).not.toBeNull();
});
test('A12: user deletion rewrites historical author to administrator', async () => {
  const actor = await user('ADMIN'); const victim = await user(); const target = await lead(victim);
  const item = await prisma.leadUpdate.create({data:{leadId:target.id,userId:victim.id,remark:'Written by original employee'}});
  expect((await deleteUser(request('/api/users',actor,'DELETE',{id:victim.id}))).status).toBe(200);
  expect((await prisma.leadUpdate.findUnique({where:{id:item.id}})).userId).toBe(actor.id);
});
test('A13: two concurrent lead-number allocations return the same ID', async () => {
  const [first, second] = await Promise.all([generateNextLeadNumber(),generateNextLeadNumber()]);
  expect(first).toBe(second);
});
test('A14: setting zero commission saves two percent instead', async () => {
  const actor = await user('HR'); const victim = await user();
  const res = await payroll(request('/api/hr/payroll',actor,'POST',{userId:victim.id,period:'2026-09',commissionRate:0}));
  expect(res.status).toBe(200); expect((await res.json()).target.commissionRate).toBe(2);
});
test('A15: scheduling a meeting reopens a won lead into MEETING status', async () => {
  const actor = await user(); const target = await lead(actor,{currentStatus:'CLOSED_WON',currentCategory:'CLOSED'});
  const res = await meeting(request('/api/meetings',actor,'POST',{leadId:target.id,date:'2026-09-22',time:'14:30',meetingType:'Online'}));
  expect(res.status).toBe(201); const changed = await prisma.lead.findUnique({where:{id:target.id}});
  expect(changed.currentStatus).toBe('MEETING'); expect(changed.currentCategory).toBe('CLOSED');
});
test('A18: CSV exporter preserves a spreadsheet formula prefix', () => {
  expect(escapeCSVValue('=1+1')).toBe('"=1+1"');
});
test('A22: priority descending returns NORMAL then LOW then HIGH', async () => {
  const actor = await user(); const manager = await user('ADMIN');
  for (const priority of ['HIGH','LOW','NORMAL']) await prisma.executiveTask.create({data:{title:`Priority ${priority}`,priority,dueDate:'2030-01-01',dueTime:'12:00',assigneeId:actor.id,createdById:manager.id}});
  const res = await tasks(request('/api/tasks?all=true',actor));
  expect((await res.json()).tasks.map(t=>t.priority)).toEqual(['NORMAL','LOW','HIGH']);
});
test('A24: createLead allows duplicate phone identities in different formats', async () => {
  const actor = await user('ADMIN');
  const digits = `9${String(Date.now()).slice(-9)}`;
  const first = await createLead({clientName:'Phone format one',phone:digits},actor);
  const second = await createLead({clientName:'Phone format two',phone:`+91 ${digits}`},actor);
  expect(first.id).not.toBe(second.id);
});
test('A17: expired in-memory data is returned despite its TTL', () => {
  setFastCache('audit:expired', {private:'synthetic'}, -1);
  expect(getFastCache('audit:expired')).toEqual({private:'synthetic'});
});
test('A16: timezone-free meeting date shifts 5.5 hours across server timezones', () => {
  const parse = tz => {
    const result = spawnSync(process.execPath, ['-e', "console.log(new Date('2026-09-22T14:30:00').toISOString())"], {encoding:'utf8',env:{...process.env,TZ:tz}});
    if (result.status !== 0) throw new Error(result.stderr || 'Timezone check child failed');
    return result.stdout.trim();
  };
  expect(parse('UTC')).toBe('2026-09-22T14:30:00.000Z');
  expect(parse('Asia/Kolkata')).toBe('2026-09-22T09:00:00.000Z');
});
