import { prisma } from '../lib/db';

async function checkAllUsers() {
  const users = await prisma.user.findMany({
    include: {
      team: true,
      _count: {
        select: {
          ownedLeads: true,
          leadUpdates: true,
          callLogs: true,
          attendances: true,
          leaveRequests: true,
          assignedTasks: true,
        },
      },
    },
  });

  console.log(`Total Users in DB: ${users.length}`);
  for (const u of users) {
    console.log({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      team: u.team ? u.team.name : 'No Team',
      designation: u.designation,
      phone: u.phone,
      counts: u._count,
    });
  }
}

checkAllUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
