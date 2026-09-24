import { prisma } from '../lib/db';
import { signToken } from '../lib/auth';
import { getAdminAttentionMetrics, getLeads } from '../services/lead.service';
import { getCallingData } from '../services/followup.service';
import { getMeetings } from '../services/meeting.service';
import { getUserNotifications } from '../services/notification.service';
import { getDailyAttendance, getEmployees, getLeaveRequests, getTargetsAndCommissions, getJobOpenings, getCandidates } from '../services/hr.service';
import { getPerformanceReport } from '../services/report.service';
import { checkAndEscalateSlaBreaches } from '../services/sla.service';
import { UserSession } from '../types';

interface BenchmarkResult {
  route: string;
  category: string;
  durationMs: number;
  status: string;
  recordsCount?: number;
}

async function runPerformanceBenchmark() {
  console.log('===============================================================');
  console.log('  ORVION ENTERPRISE CRM — SPEED & LATENCY BENCHMARK SUITE     ');
  console.log('===============================================================\n');

  const adminUser = await prisma.user.findUnique({ where: { email: 'nehra@orvion.com' } });
  const hrUser = await prisma.user.findUnique({ where: { email: 'meera@orvion.com' } });
  const execUser = await prisma.user.findUnique({ where: { email: 'shubham@orvion.com' } });

  if (!adminUser || !hrUser || !execUser) {
    throw new Error('Core users not found in database');
  }

  const adminSession: UserSession = {
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role as any,
  };
  const execSession: UserSession = {
    id: execUser.id,
    name: execUser.name,
    email: execUser.email,
    role: execUser.role as any,
  };
  const hrSession: UserSession = {
    id: hrUser.id,
    name: hrUser.name,
    email: hrUser.email,
    role: hrUser.role as any,
  };

  const results: BenchmarkResult[] = [];

  async function bench(name: string, category: string, fn: () => Promise<any>) {
    // Warmup
    await fn();
    // Measured run
    const start = performance.now();
    const data = await fn();
    const end = performance.now();
    const duration = parseFloat((end - start).toFixed(2));
    
    let count: number | undefined;
    if (Array.isArray(data)) count = data.length;
    else if (data && typeof data === 'object') {
      if (Array.isArray(data.leads)) count = data.leads.length;
      else if (Array.isArray(data.tasks)) count = data.tasks.length;
      else if (Array.isArray(data.teams)) count = data.teams.length;
      else if (Array.isArray(data.users)) count = data.users.length;
      else if (Array.isArray(data.meetings)) count = data.meetings.length;
      else if (Array.isArray(data.employees)) count = data.employees.length;
      else if (Array.isArray(data.leaves)) count = data.leaves.length;
      else if (Array.isArray(data.candidates)) count = data.candidates.length;
      else if (Array.isArray(data.notifications)) count = data.notifications.length;
      else if (typeof data.total === 'number') count = data.total;
    }

    results.push({
      route: name,
      category,
      durationMs: duration,
      status: duration < 50 ? '⚡ ULTRA-FAST (<50ms)' : duration < 150 ? 'FAST (<150ms)' : 'ACCEPTABLE',
      recordsCount: count,
    });
  }

  // -------------------------------------------------------------
  // 1. ADMIN DASHBOARD & CORE METRICS DATA LOADERS
  // -------------------------------------------------------------
  console.log('Benchmarking Admin Data Loaders...');
  await bench('Admin Attention Metrics (Zero Hardcoding)', 'Admin Overview', async () => {
    return await getAdminAttentionMetrics();
  });

  await bench('Admin SLA Engine Check', 'Admin Overview', async () => {
    return await checkAndEscalateSlaBreaches();
  });

  await bench('Admin Master Leads Directory (Page 1, 25 items)', 'Leads Pipeline', async () => {
    return await getLeads({ session: adminSession, page: 1, pageSize: 25 });
  });

  await bench('Interested Leads Filtered View', 'Leads Pipeline', async () => {
    return await getLeads({ session: adminSession, status: 'INTERESTED', page: 1, pageSize: 25 });
  });

  await bench('Not Answering Triage Queue', 'Queues & Triage', async () => {
    return await getLeads({ session: adminSession, category: 'NOT_ANSWERING', page: 1, pageSize: 25 });
  });

  await bench('Not Interested Archived Queue', 'Queues & Triage', async () => {
    return await getLeads({ session: adminSession, category: 'NOT_INTERESTED', page: 1, pageSize: 25 });
  });

  await bench('Channel Partners Leads List', 'Queues & Triage', async () => {
    return await getLeads({ session: adminSession, category: 'CHANNEL_PARTNER', page: 1, pageSize: 25 });
  });

  await bench('Other Category Leads List', 'Queues & Triage', async () => {
    return await getLeads({ session: adminSession, category: 'OTHER', page: 1, pageSize: 25 });
  });

  // -------------------------------------------------------------
  // 2. TELECALLING COMMAND CENTER & CALLING QUEUES
  // -------------------------------------------------------------
  console.log('Benchmarking Calling & Followup Loaders...');
  await bench('Calling Command Center (Overdue + Due Today + Matrix)', 'Telecalling', async () => {
    return await getCallingData(adminSession, {});
  });

  // -------------------------------------------------------------
  // 3. EXECUTIVE WORKSPACE & DAILY TASKS
  // -------------------------------------------------------------
  console.log('Benchmarking Executive Workspaces...');
  await bench('Executive Dashboard Today Calling', 'Executive Workspace', async () => {
    return await getCallingData(execSession, {});
  });

  await bench('Executive New-To-Me Inbound Leads', 'Executive Workspace', async () => {
    return await getLeads({ session: execSession, isNewToMe: true });
  });

  await bench('Executive Today Assigned Directives', 'Executive Workspace', async () => {
    return await prisma.executiveTask.findMany({
      where: { assigneeId: execUser.id },
      take: 20,
    });
  });

  // -------------------------------------------------------------
  // 4. MEETINGS & CALENDAR
  // -------------------------------------------------------------
  console.log('Benchmarking Meetings & Calendar...');
  await bench('All Upcoming Client Meetings', 'Meetings Management', async () => {
    return await getMeetings({ user: adminSession, timeframe: 'week' });
  });

  // -------------------------------------------------------------
  // 5. TEAMS & USER ACCESS DIRECTORY
  // -------------------------------------------------------------
  console.log('Benchmarking Teams & User Directory...');
  await bench('Team Structure & Member Roster', 'Management', async () => {
    return await prisma.team.findMany({
      include: {
        members: {
          select: { id: true, name: true, role: true, active: true },
        },
      },
    });
  });

  await bench('User Directory with Lead Counts', 'Management', async () => {
    return await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        team: { select: { name: true } },
        _count: {
          select: {
            ownedLeads: true,
            callLogs: true,
            createdMeetings: true,
          },
        },
      },
    });
  });

  // -------------------------------------------------------------
  // 6. HR & WORKFORCE MANAGEMENT (ZERO LEAD PRIVACY)
  // -------------------------------------------------------------
  console.log('Benchmarking HR Workforce Module...');
  await bench('HR Staff Directory', 'HR Management', async () => {
    return await getEmployees();
  });

  await bench('HR Attendance & Shift Roster', 'HR Management', async () => {
    return await getDailyAttendance();
  });

  await bench('HR Pending Leave Requests', 'HR Management', async () => {
    return await getLeaveRequests('PENDING');
  });

  await bench('HR Targets & Payroll Commission Calculator', 'HR Management', async () => {
    const period = new Date().toISOString().substring(0, 7);
    return await getTargetsAndCommissions(period);
  });

  await bench('HR Recruitment Job Openings', 'HR Management', async () => {
    return await getJobOpenings();
  });

  await bench('HR Active Candidate Applicants', 'HR Management', async () => {
    return await getCandidates();
  });

  // -------------------------------------------------------------
  // 7. REPORTS & NOTIFICATIONS
  // -------------------------------------------------------------
  console.log('Benchmarking Reports & Notifications...');
  await bench('Weekly Conversion Funnel Report', 'Reports & Analytics', async () => {
    return await getPerformanceReport({ user: adminSession, timeframe: 'weekly' });
  });

  await bench('User Real-Time Notifications', 'Notifications', async () => {
    return await getUserNotifications(adminUser.id);
  });

  await bench('Audit Trail Stream (Recent 20 logs)', 'Audit Logs', async () => {
    return await prisma.auditLog.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { name: true, role: true } } },
    });
  });

  // -------------------------------------------------------------
  // PRINT BENCHMARK REPORT TABLE
  // -------------------------------------------------------------
  console.log('\n========================================================================================');
  console.log('  PAGE / DATA-LOADER LATENCY BENCHMARK RESULTS                                         ');
  console.log('========================================================================================');
  console.log(
    'Route / Component Loader'.padEnd(52) +
    'Category'.padEnd(22) +
    'Latency'.padEnd(14) +
    'Status'
  );
  console.log('-'.repeat(105));

  let totalLatency = 0;
  for (const r of results) {
    totalLatency += r.durationMs;
    console.log(
      r.route.padEnd(52) +
      r.category.padEnd(22) +
      `${r.durationMs.toFixed(1)} ms`.padEnd(14) +
      r.status
    );
  }
  console.log('-'.repeat(105));
  const avgLatency = (totalLatency / results.length).toFixed(2);
  console.log(`Average Query & Page Data Loader Latency: ${avgLatency} ms across ${results.length} tested endpoints`);
  console.log('========================================================================================\n');
}

runPerformanceBenchmark()
  .catch((err) => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
