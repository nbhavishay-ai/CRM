/**
 * Production Database Purge & Fresh Initialization
 * Removes all test leads, team leads, test executive data, tasks, notifications, attendance, leaves, candidates, and logs.
 * Preserves strictly the 3 authentic production accounts:
 * 1. Nehra (Admin)
 * 2. Meera (HR Manager)
 * 3. Shubham (Sales Executive)
 */

import { prisma } from '../lib/db';
import { hashPassword } from '../lib/auth';

async function purgeAllTestData() {
  console.log('=====================================================');
  console.log('  ORVION ENTERPRISE CRM — DATABASE PURGE & RESET     ');
  console.log('=====================================================\n');

  console.log('1. Deleting all notifications...');
  const delNotifs = await prisma.notification.deleteMany({});
  console.log(`   Deleted ${delNotifs.count} notifications.`);

  console.log('2. Deleting all audit logs...');
  const delAudit = await prisma.auditLog.deleteMany({});
  console.log(`   Deleted ${delAudit.count} audit logs.`);

  console.log('3. Deleting all sync logs...');
  const delSync = await prisma.syncLog.deleteMany({});
  console.log(`   Deleted ${delSync.count} sync logs.`);

  console.log('4. Deleting all tasks...');
  const delTasks = await prisma.executiveTask.deleteMany({});
  console.log(`   Deleted ${delTasks.count} tasks.`);

  console.log('5. Deleting all attendance records...');
  const delAtt = await prisma.attendance.deleteMany({});
  console.log(`   Deleted ${delAtt.count} attendance records.`);

  console.log('6. Deleting all leave requests...');
  const delLeaves = await prisma.leaveRequest.deleteMany({});
  console.log(`   Deleted ${delLeaves.count} leave requests.`);

  console.log('7. Deleting all candidates and job openings...');
  const delCand = await prisma.candidate.deleteMany({});
  console.log(`   Deleted ${delCand.count} candidates.`);
  const delJobs = await prisma.jobOpening.deleteMany({});
  console.log(`   Deleted ${delJobs.count} job openings.`);

  console.log('8. Deleting all sales targets...');
  const delTargets = await prisma.salesTarget.deleteMany({});
  console.log(`   Deleted ${delTargets.count} sales targets.`);

  console.log('9. Deleting all meetings...');
  const delMeetings = await prisma.meeting.deleteMany({});
  console.log(`   Deleted ${delMeetings.count} meetings.`);

  console.log('10. Deleting all call logs...');
  const delCalls = await prisma.callLog.deleteMany({});
  console.log(`   Deleted ${delCalls.count} call logs.`);

  console.log('11. Deleting all lead followups, status history, updates, assignments & leads...');
  const delFollowups = await prisma.leadFollowup.deleteMany({});
  console.log(`    Deleted ${delFollowups.count} followups.`);
  const delStatusHistory = await prisma.leadStatusHistory.deleteMany({});
  console.log(`    Deleted ${delStatusHistory.count} status history entries.`);
  const delUpdates = await prisma.leadUpdate.deleteMany({});
  console.log(`    Deleted ${delUpdates.count} lead updates.`);
  const delAssigns = await prisma.leadAssignment.deleteMany({});
  console.log(`    Deleted ${delAssigns.count} assignments.`);
  const delLeads = await prisma.lead.deleteMany({});
  console.log(`    Deleted ${delLeads.count} leads.`);

  console.log('12. Unlinking all users from teams and deleting all teams...');
  await prisma.user.updateMany({
    data: { teamId: null },
  });
  const delTeams = await prisma.team.deleteMany({});
  console.log(`    Deleted ${delTeams.count} teams.`);

  console.log('13. Purging all test users, keeping only authentic Nehra, Meera, Shubham...');
  const authenticEmails = ['nehra@orvion.com', 'meera@orvion.com', 'shubham@orvion.com'];
  const delUsers = await prisma.user.deleteMany({
    where: {
      email: {
        notIn: authenticEmails,
      },
    },
  });
  console.log(`    Deleted ${delUsers.count} test users.`);

  console.log('\n14. Ensuring the 3 authentic production accounts are initialized with exact credentials...');

  const adminPass = await hashPassword('admin123');
  const hrPass = await hashPassword('hr123');
  const execPass = await hashPassword('exec123');

  // Admin: Nehra
  const admin = await prisma.user.upsert({
    where: { email: 'nehra@orvion.com' },
    update: {
      name: 'Nehra',
      passwordHash: adminPass,
      role: 'ADMIN',
      active: true,
      designation: 'Managing Director / Administrator',
      department: 'Executive Leadership',
      phone: '+91 98765 43210',
      routingAvailable: true,
      teamId: null,
    },
    create: {
      name: 'Nehra',
      email: 'nehra@orvion.com',
      passwordHash: adminPass,
      role: 'ADMIN',
      active: true,
      designation: 'Managing Director / Administrator',
      department: 'Executive Leadership',
      phone: '+91 98765 43210',
      routingAvailable: true,
      teamId: null,
    },
  });
  console.log(`    ✓ Admin initialized: ${admin.name} (${admin.email}) [${admin.role}]`);

  // HR Manager: Meera
  const hr = await prisma.user.upsert({
    where: { email: 'meera@orvion.com' },
    update: {
      name: 'Meera',
      passwordHash: hrPass,
      role: 'HR',
      active: true,
      designation: 'Head of Human Resources',
      department: 'Human Resources',
      phone: '+91 98765 43211',
      routingAvailable: false,
      teamId: null,
    },
    create: {
      name: 'Meera',
      email: 'meera@orvion.com',
      passwordHash: hrPass,
      role: 'HR',
      active: true,
      designation: 'Head of Human Resources',
      department: 'Human Resources',
      phone: '+91 98765 43211',
      routingAvailable: false,
      teamId: null,
    },
  });
  console.log(`    ✓ HR initialized: ${hr.name} (${hr.email}) [${hr.role}]`);

  // Sales Executive: Shubham
  const exec = await prisma.user.upsert({
    where: { email: 'shubham@orvion.com' },
    update: {
      name: 'Shubham',
      passwordHash: execPass,
      role: 'EXECUTIVE',
      active: true,
      designation: 'Senior Sales Closer',
      department: 'Sales & Closures',
      phone: '+91 98765 43212',
      routingAvailable: true,
      teamId: null,
    },
    create: {
      name: 'Shubham',
      email: 'shubham@orvion.com',
      passwordHash: execPass,
      role: 'EXECUTIVE',
      active: true,
      designation: 'Senior Sales Closer',
      department: 'Sales & Closures',
      phone: '+91 98765 43212',
      routingAvailable: true,
      teamId: null,
    },
  });
  console.log(`    ✓ Executive initialized: ${exec.name} (${exec.email}) [${exec.role}]`);

  console.log('\n=====================================================');
  console.log('  DATABASE PURGE COMPLETE — CLEAN PRODUCTION STATE   ');
  console.log('=====================================================\n');

  const finalUsers = await prisma.user.findMany({ select: { name: true, email: true, role: true } });
  console.log('Final Active Users Count:', finalUsers.length);
  console.log(finalUsers);
  console.log('Final Leads Count:', await prisma.lead.count());
  console.log('Final Teams Count:', await prisma.team.count());
  console.log('Final Tasks Count:', await prisma.executiveTask.count());
  console.log('Final Notifications Count:', await prisma.notification.count());
}

purgeAllTestData()
  .catch((err) => {
    console.error('Purge error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
