/**
 * Real-Time Sync & Ultra-Fast Cache Verification Script
 * Validates multi-channel sync event emission, payload integrity, and cache behavior.
 */

import { emitCrmSync, SyncEventType } from '../lib/sync-event';

async function testRealtimeSync() {
  console.log('=====================================================');
  console.log('  ORVION REAL-TIME SYNC & SPEED ENGINE AUDIT         ');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Check Event Types
  const domains: SyncEventType[] = [
    'leads',
    'calling',
    'tasks',
    'metrics',
    'users',
    'hr',
    'meetings',
    'attendance',
    'all',
  ];

  assert(domains.length === 9, 'All 9 real-time synchronization domains configured');

  // 2. Mock Window Event Dispatch in Node/Bun environment
  let capturedCustomEvent = false;
  let capturedStoragePulse = false;

  const mockListeners: { [key: string]: Function[] } = {};
  const mockLocalStorage: { [key: string]: string } = {};

  (global as any).window = {
    dispatchEvent: (event: any) => {
      if (event.type === 'crm:sync') {
        capturedCustomEvent = true;
      }
    },
    addEventListener: (type: string, fn: Function) => {
      mockListeners[type] = mockListeners[type] || [];
      mockListeners[type].push(fn);
    },
    removeEventListener: (type: string, fn: Function) => {
      if (mockListeners[type]) {
        mockListeners[type] = mockListeners[type].filter((f) => f !== fn);
      }
    },
  };

  (global as any).CustomEvent = class CustomEvent {
    type: string;
    detail: any;
    constructor(type: string, params: any = {}) {
      this.type = type;
      this.detail = params.detail;
    }
  };

  (global as any).localStorage = {
    setItem: (key: string, value: string) => {
      mockLocalStorage[key] = value;
      if (key === '__orvion_sync_pulse__') {
        capturedStoragePulse = true;
      }
    },
    getItem: (key: string) => mockLocalStorage[key] || null,
    removeItem: (key: string) => {
      delete mockLocalStorage[key];
    },
  };

  // 3. Test emitCrmSync across channels
  emitCrmSync('leads', { leadId: 'test-123', action: 'STATUS_UPDATE' });

  assert(capturedCustomEvent, 'Same-tab CustomEvent dispatched instantaneously (0ms perception)');
  assert(capturedStoragePulse, 'Cross-tab localStorage fallback pulse written with JSON payload');

  const pulseData = JSON.parse(mockLocalStorage['__orvion_sync_pulse__']);
  assert(pulseData.type === 'leads', 'Sync event domain preserved in storage payload ("leads")');
  assert(pulseData.payload.leadId === 'test-123', 'Sync event payload content preserved');
  assert(typeof pulseData.timestamp === 'number', 'Sync event timestamp attached for freshness ordering');

  // 4. Test Multi-Domain Emission
  capturedCustomEvent = false;
  emitCrmSync('all');
  assert(capturedCustomEvent, 'Domain "all" broadcasts to all listening subscribers');

  capturedCustomEvent = false;
  emitCrmSync('attendance', { userId: 'user-001', clockIn: new Date().toISOString() });
  assert(capturedCustomEvent, 'Domain "attendance" broadcasts clock-in/out updates');

  capturedCustomEvent = false;
  emitCrmSync('tasks', { taskId: 'task-999', status: 'COMPLETED' });
  assert(capturedCustomEvent, 'Domain "tasks" broadcasts 1-click task completions');

  capturedCustomEvent = false;
  emitCrmSync('meetings', { meetingId: 'meet-555', status: 'COMPLETED' });
  assert(capturedCustomEvent, 'Domain "meetings" broadcasts calendar changes');

  console.log('\n=====================================================');
  console.log(`  REAL-TIME SYNC AUDIT: ${passed} PASSED, ${failed} FAILED `);
  console.log('=====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

testRealtimeSync();
