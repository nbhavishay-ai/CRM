'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Archive, PhoneCall, RefreshCw, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { emitCrmSync } from '@/lib/sync-event';

interface ExecutiveOption {
  id: string;
  name: string;
  email: string;
  team?: { name: string } | null;
  callingDataCount: number;
}

export function StoredCallingAssignmentCard() {
  const [poolCount, setPoolCount] = useState(0);
  const [executives, setExecutives] = useState<ExecutiveOption[]>([]);
  const [selectedExecutive, setSelectedExecutive] = useState('');
  const [count, setCount] = useState('');
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calling/assign?_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load stored calling data');
      setPoolCount(data.poolCount || 0);
      setExecutives(data.executives || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stored calling data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const assign = async () => {
    const requested = Number(count);
    setError('');
    setMessage('');
    if (!selectedExecutive) return setError('Select an executive or team lead.');
    if (!Number.isInteger(requested) || requested < 1 || requested > poolCount) {
      return setError(`Enter a whole number from 1 to ${poolCount}.`);
    }

    setAssigning(true);
    try {
      const res = await fetch('/api/calling/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: requested, newOwnerId: selectedExecutive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign calling data');
      setCount('');
      setMessage(`${data.assignedCount} stored calling records assigned successfully.`);
      emitCrmSync('calling');
      emitCrmSync('leads');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign calling data');
    } finally {
      setAssigning(false);
    }
  };

  const removeUnremarked = async () => {
    if (!selectedExecutive) return setError('Select an executive or team lead.');
    if (!window.confirm('Remove all unremarked Calling Data assigned to this user from the active queue? The permanent Lead records and history will be preserved.')) return;
    setRemoving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/calling/assign?ownerId=${encodeURIComponent(selectedExecutive)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove calling data');
      setMessage(`${data.removedCount} unremarked calling records removed from the active queue for ${data.ownerName}. Lead history was preserved.`);
      emitCrmSync('calling');
      emitCrmSync('leads');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove calling data');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#E5E5E0] bg-white p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#171817]">
            <PhoneCall className="h-4 w-4 text-[#B69A63]" /> Assign stored calling data
          </h2>
          <p className="mt-1 text-xs text-[#626560]">
            Assign or clean unremarked records from the existing calling store. Customer phone numbers are not shown here.
          </p>
        </div>
        <div className="rounded-xl border border-[#E8DCBE] bg-[#FAF5EB] px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#7A5B28]">Stored pool</p>
          <p className="text-xl font-black tabular-nums text-[#171817]">{loading ? '...' : poolCount}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]">
        <select
          value={selectedExecutive}
          onChange={(event) => setSelectedExecutive(event.target.value)}
          className="rounded-xl border border-[#E5E5E0] bg-white px-3 py-2 text-xs font-semibold text-[#171817] outline-none focus:border-[#B69A63]"
        >
          <option value="">Select executive or team lead</option>
          {executives.map((executive) => (
            <option key={executive.id} value={executive.id}>
              {executive.name}{executive.team?.name ? ` • ${executive.team.name}` : ''}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={poolCount}
          value={count}
          onChange={(event) => setCount(event.target.value)}
          placeholder="Quantity"
          className="rounded-xl border border-[#E5E5E0] px-3 py-2 text-xs font-semibold text-[#171817] outline-none focus:border-[#B69A63]"
        />
        <Button type="button" variant="primary" isLoading={assigning} disabled={poolCount === 0} onClick={assign}>
          <UserCheck className="mr-1.5 h-3.5 w-3.5" /> Assign data
        </Button>
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="danger" isLoading={removing} disabled={!selectedExecutive} onClick={removeUnremarked}>
          <Archive className="mr-1.5 h-3.5 w-3.5" /> Remove from active queue
        </Button>
      </div>
      <div className="mt-5 border-t border-[#E5E5E0] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#171817]">Calling Data by Executive</h3>
            <p className="mt-1 text-[11px] text-[#626560]">Available active Calling Data only. Lead Upload records are excluded.</p>
          </div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8C908A]">Count only</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {executives.map((executive) => (
            <div key={executive.id} className="flex items-center justify-between rounded-xl border border-[#E5E5E0] bg-[#F8F8F6] px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-[#171817]">{executive.name}</p>
                <p className="truncate text-[10px] text-[#8C908A]">{executive.team?.name || 'No team'}</p>
              </div>
              <p className="ml-3 text-xl font-black tabular-nums text-[#7A5B28]">{loading ? '...' : executive.callingDataCount}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {error || message ? (
          <p className={`text-[11px] font-semibold ${error ? 'text-[#8C332E]' : 'text-[#2D5A3C]'}`}>{error || message}</p>
        ) : <span />}
        <button type="button" onClick={load} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#626560] hover:text-[#171817]">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </section>
  );
}
