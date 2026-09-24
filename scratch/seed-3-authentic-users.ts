import { prisma } from '../lib/db';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('=== SEEDING 3 AUTHENTIC USERS PERMANENTLY ===');

  const passwordHash = await bcrypt.hash('Nehra@1228', 10);

  // 1. Nehra (ADMIN)
  const nehra = await prisma.user.upsert({
    where: { email: 'nehra@orvion.com' },
    update: {
      name: 'Nehra',
      email: 'nehra@orvion.com',
      role: 'ADMIN',
      passwordHash,
      active: true,
      routingAvailable: true,
      phone: '+91 99999 99999',
      designation: 'Managing Director / Administrator',
      department: 'Executive Leadership',
    },
    create: {
      name: 'Nehra',
      email: 'nehra@orvion.com',
      role: 'ADMIN',
      passwordHash,
      active: true,
      routingAvailable: true,
      phone: '+91 99999 99999',
      designation: 'Managing Director / Administrator',
      department: 'Executive Leadership',
    },
  });

  // 2. Meera (HR)
  const meera = await prisma.user.upsert({
    where: { email: 'meera@orvion.com' },
    update: {
      name: 'Meera',
      email: 'meera@orvion.com',
      role: 'HR',
      passwordHash,
      active: true,
      routingAvailable: false,
      phone: '+91 98888 88888',
      designation: 'HR Lead & People Operations',
      department: 'Human Resources',
    },
    create: {
      name: 'Meera',
      email: 'meera@orvion.com',
      role: 'HR',
      passwordHash,
      active: true,
      routingAvailable: false,
      phone: '+91 98888 88888',
      designation: 'HR Lead & People Operations',
      department: 'Human Resources',
    },
  });

  // 3. Shubham (EXECUTIVE)
  const shubham = await prisma.user.upsert({
    where: { email: 'shubham@orvion.com' },
    update: {
      name: 'Shubham',
      email: 'shubham@orvion.com',
      role: 'EXECUTIVE',
      passwordHash,
      active: true,
      routingAvailable: true,
      phone: '+91 97777 77777',
      designation: 'Senior Sales Executive',
      department: 'Sales',
    },
    create: {
      name: 'Shubham',
      email: 'shubham@orvion.com',
      role: 'EXECUTIVE',
      passwordHash,
      active: true,
      routingAvailable: true,
      phone: '+91 97777 77777',
      designation: 'Senior Sales Executive',
      department: 'Sales',
    },
  });

  // Remove any other stray test users
  const deleted = await prisma.user.deleteMany({
    where: {
      email: {
        notIn: ['nehra@orvion.com', 'meera@orvion.com', 'shubham@orvion.com'],
      },
    },
  });

  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, designation: true },
    orderBy: { name: 'asc' },
  });

  console.log(`Deleted ${deleted.count} stray users.`);
  console.log(`Total Active Users (${allUsers.length}):`);
  console.log(JSON.stringify(allUsers, null, 2));
}

main().finally(() => prisma.$disconnect());
