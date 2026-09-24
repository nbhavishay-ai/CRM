import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('Cleaning database...');

  // 1. Delete all test leads and dependent records
  await prisma.leadUpdate.deleteMany();
  await prisma.leadStatusHistory.deleteMany();
  await prisma.leadFollowup.deleteMany();
  await prisma.leadAssignment.deleteMany();
  await prisma.callLog.deleteMany();
  await prisma.meeting.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.executiveTask.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.salesTarget.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.jobOpening.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.team.deleteMany();

  // 2. Delete all users except nehra@orvion.com, meera@orvion.com, shubham@orvion.com
  await prisma.user.deleteMany({
    where: {
      email: {
        notIn: ['nehra@orvion.com', 'meera@orvion.com', 'shubham@orvion.com']
      }
    }
  });

  // 3. Ensure the 3 core users exist and have clean default profiles
  const passwordHash = await bcrypt.hash('Nehra@1228', 10);

  // Upsert Nehra (Admin)
  await prisma.user.upsert({
    where: { email: 'nehra@orvion.com' },
    update: {
      name: 'Nehra',
      role: 'ADMIN',
      passwordHash,
      phone: '+91 99999 99999',
      designation: 'Managing Director / Administrator',
      department: 'Executive Leadership',
      active: true,
      routingAvailable: true,
      teamId: null,
    },
    create: {
      name: 'Nehra',
      email: 'nehra@orvion.com',
      passwordHash,
      role: 'ADMIN',
      phone: '+91 99999 99999',
      designation: 'Managing Director / Administrator',
      department: 'Executive Leadership',
      active: true,
      routingAvailable: true,
    }
  });

  // Upsert Meera (HR)
  await prisma.user.upsert({
    where: { email: 'meera@orvion.com' },
    update: {
      name: 'Meera',
      role: 'HR',
      passwordHash,
      phone: '+91 98888 88888',
      designation: 'HR Lead & People Operations',
      department: 'Human Resources',
      active: true,
      routingAvailable: false,
      teamId: null,
    },
    create: {
      name: 'Meera',
      email: 'meera@orvion.com',
      passwordHash,
      role: 'HR',
      phone: '+91 98888 88888',
      designation: 'HR Lead & People Operations',
      department: 'Human Resources',
      active: true,
      routingAvailable: false,
    }
  });

  // Upsert Shubham (Executive)
  await prisma.user.upsert({
    where: { email: 'shubham@orvion.com' },
    update: {
      name: 'Shubham',
      role: 'EXECUTIVE',
      passwordHash,
      phone: '+91 97777 77777',
      designation: 'Sales Executive / Closer',
      department: 'Sales',
      active: true,
      routingAvailable: true,
      teamId: null,
    },
    create: {
      name: 'Shubham',
      email: 'shubham@orvion.com',
      passwordHash,
      role: 'EXECUTIVE',
      phone: '+91 97777 77777',
      designation: 'Sales Executive / Closer',
      department: 'Sales',
      active: true,
      routingAvailable: true,
    }
  });

  const remainingUsers = await prisma.user.findMany({ select: { name: true, email: true, role: true } });
  console.log('Database cleaned successfully!');
  console.log('Remaining authentic users count:', remainingUsers.length);
  console.log(JSON.stringify(remainingUsers, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
