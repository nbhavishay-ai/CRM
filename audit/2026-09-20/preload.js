import { mock } from 'bun:test';
import { resolve } from 'node:path';
import { PrismaClient } from './node_modules/audit-client/index.js';

// This preload never imports the application's database client.
// All application database imports are redirected to disposable audit.db.
process.env.VAPID_PUBLIC_KEY = '';
process.env.VAPID_PRIVATE_KEY = '';
const filename = process.env.ORVION_AUDIT_RETEST === '1' ? 'retest.db' : 'audit.db';
const dbPath = resolve(import.meta.dir, filename).replaceAll('\\', '/');
const prisma = new PrismaClient({ datasources: { db: { url: `file:${dbPath}` } } });
mock.module(resolve(import.meta.dir, '../../lib/db.ts'), () => ({ prisma, default: prisma }));
mock.module('@/lib/db', () => ({ prisma, default: prisma }));
globalThis.__auditPrisma = prisma;
