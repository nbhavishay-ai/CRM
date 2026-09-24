'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, RefreshCw, Filter } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AuditItem {
  id: string;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: string | null;
  createdAt: string;
  actor?: {
    name: string;
    email: string;
    role: string;
  } | null;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (actionFilter) params.set('action', actionFilter);
    if (entityFilter) params.set('entity', entityFilter);
    params.set('limit', '100');

    try {
      const res = await fetch(`/api/audit?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#B69A63]" /> Immutable Company Audit Logs
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Permanent, tamper-evident audit record tracking every assignment, update, transition, and login.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={fetchLogs} isLoading={loading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-white border border-[#E5E5E0] shadow-xs">
        <Filter className="w-4 h-4 text-[#8C908A]" />
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
        >
          <option value="">All Entities</option>
          <option value="LEAD">Lead Events</option>
          <option value="USER">User Events</option>
          <option value="TEAM">Team Events</option>
          <option value="MEETING">Meeting Events</option>
          <option value="AUTH">Authentication Events</option>
          <option value="SYNC">Synchronization Events</option>
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63]"
        >
          <option value="">All Actions</option>
          <option value="LOGIN">Login</option>
          <option value="CREATE_LEAD">Create Lead</option>
          <option value="REASSIGN_LEAD">Reassign Lead</option>
          <option value="UPDATE_LEAD">Update Lead</option>
          <option value="COMPLETE_FOLLOWUP">Complete Followup</option>
          <option value="CREATE_MEETING">Create Meeting</option>
          <option value="CREATE_USER">Create User</option>
          <option value="UPDATE_USER">Update User</option>
        </select>
      </div>

      {/* Audit Log Table */}
      <div className="rounded-2xl border border-[#E5E5E0] bg-white overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs text-[#171817]">
          <thead className="bg-[#F8F8F6] text-[11px] font-bold text-[#626560] uppercase tracking-wider border-b border-[#E5E5E0]">
            <tr>
              <th className="px-4 py-3.5">Timestamp</th>
              <th className="px-4 py-3.5">Actor</th>
              <th className="px-4 py-3.5">Action</th>
              <th className="px-4 py-3.5">Entity</th>
              <th className="px-4 py-3.5">Audit Details &amp; Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E0]">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-[#FAF9F5] transition">
                <td className="px-4 py-3.5 whitespace-nowrap text-[#626560] font-mono text-[11px] tabular-nums">
                  {new Date(log.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  })}{' '}
                  •{' '}
                  {new Date(log.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  {log.actor ? (
                    <div>
                      <p className="font-semibold text-[#171817]">{log.actor.name}</p>
                      <p className="text-[10px] text-[#8C908A]">{log.actor.role}</p>
                    </div>
                  ) : (
                    <span className="text-[#8C908A] italic">System Process</span>
                  )}
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded font-bold font-mono text-[11px] bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]">
                    {log.action}
                  </span>
                </td>
                <td className="px-4 py-3.5 whitespace-nowrap font-medium text-[#171817]">
                  {log.entity}
                </td>
                <td className="px-4 py-3.5 text-[#626560] max-w-md truncate font-mono text-[11px]">
                  {log.metadata ? log.metadata : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
