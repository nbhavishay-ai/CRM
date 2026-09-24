import { PrismaClient } from '@prisma/client';

// Prefer the provider's non-pooled URL for Prisma transactions when it exists.
const rawDbUrl =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.STORAGE_DATABASE_URL ||
  process.env.TURSO_DATABASE_URL;

if (process.env.NODE_ENV === 'production' && (!rawDbUrl || !/^postgres(?:ql)?:\/\//.test(rawDbUrl))) {
  throw new Error('DATABASE_URL must be a PostgreSQL URL in production');
}

if (rawDbUrl) {
  process.env.DATABASE_URL = rawDbUrl;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: process.env.DATABASE_URL
      ? {
          db: {
            url: process.env.DATABASE_URL,
          },
        }
      : undefined,
  });

// High-Speed SQLite Tuning
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('file:')) {
  try {
    prisma.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`).catch(() => {});
    prisma.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`).catch(() => {});
    prisma.$queryRawUnsafe(`PRAGMA cache_size = -64000;`).catch(() => {});
    prisma.$queryRawUnsafe(`PRAGMA temp_store = MEMORY;`).catch(() => {});
    prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`).catch(() => {});
  } catch {
    // Ignore in non-sqlite environments
  }
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
