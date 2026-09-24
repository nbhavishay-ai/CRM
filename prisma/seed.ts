import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing ORVION enterprise CRM production database...');

  const passwordHash = await bcrypt.hash('Nehra@1228', 10);

  // Seed is intentionally additive. Never delete users, teams, leads, or history
  // during deployment; administrators control deletion from the CRM.

  // 1. Upsert Admin User (Nehra)
  await prisma.user.upsert({
    where: { email: 'nehra@orvion.com' },
    update: {},
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
      teamId: null,
    },
  });

  // 2. Upsert HR User (Meera)
  await prisma.user.upsert({
    where: { email: 'meera@orvion.com' },
    update: {},
    create: {
      name: 'Meera',
      email: 'meera@orvion.com',
      role: 'HR',
      passwordHash,
      phone: '+91 98888 88888',
      designation: 'HR Lead & People Operations',
      department: 'Human Resources',
      active: true,
      routingAvailable: false,
      teamId: null,
    },
  });

  // 3. Upsert Sales Executive (Shubham)
  await prisma.user.upsert({
    where: { email: 'shubham@orvion.com' },
    update: {},
    create: {
      name: 'Shubham',
      email: 'shubham@orvion.com',
      role: 'EXECUTIVE',
      passwordHash,
      phone: '+91 97777 77777',
      designation: 'Senior Sales Executive',
      department: 'Sales',
      active: true,
      routingAvailable: true,
      teamId: null,
    },
  });

  const finalUsers = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, designation: true },
    orderBy: { name: 'asc' },
  });

  console.log('ORVION database seeded successfully with exactly 3 authentic users:');
  console.log(JSON.stringify(finalUsers, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
