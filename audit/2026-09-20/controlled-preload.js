import './preload.js';
import { setSystemTime } from 'bun:test';
setSystemTime(new Date('2026-09-20T06:30:00Z')); // Sunday noon in India, within work hours.
const { ensureCoreUsers } = await import('@/lib/ensure-users');
await ensureCoreUsers(); // Synthetic records in isolated database only.
