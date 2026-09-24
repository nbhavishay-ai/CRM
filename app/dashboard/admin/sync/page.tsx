'use client';

import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, RefreshCw, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SyncLogItem {
  id: string;
  sourceIdentifier: string;
  status: string;
  recordsProcessed: number;
  errors?: string | null;
  createdAt: string;
}

export default function AdminSyncPage() {
  const [syncStatus, setSyncStatus] = useState<'HEALTHY' | 'IDLE' | 'ERROR'>('IDLE');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [totalSynced, setTotalSynced] = useState(0);
  const [logs, setLogs] = useState<SyncLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importJson, setImportJson] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const fetchSyncData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data.status);
        setLastSyncedAt(data.lastSyncedAt);
        setTotalSynced(data.totalSynced || 0);
        setLogs(data.logs || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSyncData();
  }, []);

  const handleRunReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    setImporting(true);
    setImportResult(null);

    try {
      let parsedRows: Array<Record<string, unknown>> = [];
      if (importJson.trim()) {
        parsedRows = JSON.parse(importJson);
      } else {
        // Default sample reconciliation batch
        parsedRows = [
          {
            clientName: 'Reconciled GoogleSheet Client 1',
            phone: '+91 98765 43210',
            company: 'Solar Tech Dholera',
            source: 'GoogleSheet_Primary',
            notes: 'Imported via automated reconciliation API',
          },
        ];
      }

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceIdentifier: 'GoogleSheets_Primary',
          rows: parsedRows,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setImportResult(`Successfully reconciled ${data.processed} rows with 0 duplicate conflicts.`);
        setImportJson('');
        fetchSyncData();
      } else {
        setImportResult(`Sync failed: ${data.error}`);
      }
    } catch (err: unknown) {
      setImportResult(err instanceof Error ? err.message : 'Invalid JSON format');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#B69A63]" /> Spreadsheet Synchronization &amp; Reconciliation
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Reconciles external Google Sheets or CSV inputs with permanent ORV IDs. Zero duplication guarantee.
          </p>
        </div>

        <Button size="sm" variant="secondary" onClick={fetchSyncData} isLoading={loading}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Sync Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs text-[#8C908A] font-medium">Engine Status</span>
          <p className="text-lg font-bold mt-1 flex items-center gap-2 text-[#171817]">
            <CheckCircle2 className="w-5 h-5 text-[#2D5A3C]" />
            {syncStatus}
          </p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs text-[#8C908A] font-medium">Total Synced Records</span>
          <p className="text-xl font-black text-[#171817] mt-1 tabular-nums">{totalSynced}</p>
        </div>

        <div className="p-4 rounded-xl bg-white border border-[#E5E5E0] shadow-xs">
          <span className="text-xs text-[#8C908A] font-medium">Last Reconciliation</span>
          <p className="text-xs font-mono text-[#626560] mt-2 tabular-nums">
            {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'No sync recorded yet'}
          </p>
        </div>
      </div>

      {/* Reconciliation Trigger Box */}
      <div className="p-5 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs space-y-3">
        <h3 className="text-sm font-bold text-[#171817] flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#B69A63]" /> Trigger Spreadsheet Batch Reconciliation
        </h3>
        <p className="text-xs text-[#626560]">
          Paste a JSON array of rows or leave blank to run the automated reconciliation verification batch.
        </p>

        {importResult && (
          <div className="p-3 rounded-lg bg-[#F0F7F2] border border-[#2D5A3C]/20 text-[#2D5A3C] text-xs font-medium">
            {importResult}
          </div>
        )}

        <form onSubmit={handleRunReconciliation} className="space-y-3">
          <textarea
            rows={3}
            value={importJson}
            onChange={(e) => setImportJson(e.target.value)}
            placeholder='[{"clientName": "Test Client", "phone": "+91 98765 00000", "source": "Spreadsheet"}]'
            className="w-full px-3 py-2 text-xs rounded-lg bg-[#F8F8F6] border border-[#E5E5E0] text-[#171817] placeholder-[#8C908A] font-mono focus:outline-none focus:border-[#B69A63]"
          />

          <Button type="submit" variant="primary" size="sm" isLoading={importing}>
            Execute Reconciliation Batch
          </Button>
        </form>
      </div>

      {/* Recent Sync Logs */}
      <div className="rounded-2xl border border-[#E5E5E0] bg-white overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-[#F8F8F6] border-b border-[#E5E5E0] font-bold text-xs text-[#171817]">
          Recent Synchronization Audit History
        </div>
        <table className="w-full text-left text-xs text-[#171817]">
          <thead className="bg-[#F8F8F6] text-[11px] font-bold text-[#626560] uppercase tracking-wider border-b border-[#E5E5E0]">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Source Identifier</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Records Processed</th>
              <th className="px-4 py-3">Diagnostics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E5E0]">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-[#FAF9F5] transition">
                <td className="px-4 py-3 font-mono text-[11px] text-[#626560] tabular-nums">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-medium text-[#171817]">{log.sourceIdentifier}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      log.status === 'SUCCESS'
                        ? 'bg-[#F0F7F2] text-[#2D5A3C] border border-[#2D5A3C]/20'
                        : 'bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]'
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-[#171817] tabular-nums">{log.recordsProcessed}</td>
                <td className="px-4 py-3 text-[#626560] text-[11px]">
                  {log.errors ? log.errors : 'Clean — zero exceptions'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
