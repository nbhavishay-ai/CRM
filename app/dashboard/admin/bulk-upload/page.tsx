'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  UploadCloud,
  FileSpreadsheet,
  Layers,
  PhoneCall,
  Download,
  CheckCircle2,
  AlertTriangle,
  Users,
  User,
  ArrowRight,
  RefreshCw,
  X,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { emitCrmSync } from '@/lib/sync-event';
import { invalidateFastCache } from '@/lib/fast-data';
import { useLiveUsers } from '@/lib/use-live-users';

// CSV Parsing Utility with BOM & Multiline Robustness
function parseCSV(text: string): Array<Record<string, string>> {
  if (!text || !text.trim()) return [];

  // Strip UTF-8 Byte Order Mark (BOM) if present
  const cleanText = text.replace(/^\uFEFF/, '');
  // Parse a CSV line taking double quotes and escaped quotes into account
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  // Split records only on newlines outside quoted fields, so notes or names
  // containing line breaks do not truncate or shift the remaining rows.
  const records: string[] = [];
  let record = '';
  let inQuotes = false;
  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    if (char === '"') {
      if (inQuotes && cleanText[i + 1] === '"') {
        record += '""';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      record += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (record.trim()) records.push(record);
      record = '';
      if (char === '\r' && cleanText[i + 1] === '\n') i++;
    } else {
      record += char;
    }
  }
  if (record.trim()) records.push(record);

  if (records.length < 2) return [];

  const headers = parseLine(records[0]).map((h) => h.replace(/^["']|["']$/g, '').trim());

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < records.length; i++) {
    const values = parseLine(records[i]);
    if (values.length === 0 || (values.length === 1 && values[0] === '')) continue;
    const rowObj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      rowObj[header] = values[idx] !== undefined ? values[idx].replace(/^["']|["']$/g, '').trim() : '';
    });
    rows.push(rowObj);
  }

  return rows;
}

export default function BulkUploadPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'leads' | 'calling'>('leads');

  // Input raw state
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Array<Record<string, string>>>([]);
  const [isDragging, setIsDragging] = useState(false);

  interface AssignableUser {
    id: string;
    name: string;
    email: string;
    role: string;
    team?: { name: string } | null;
  }

  // Metadata dropdowns
  const [executives, setExecutives] = useState<AssignableUser[]>([]);
  const { users: liveUsers } = useLiveUsers();
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(true);

  // Assignment configuration
  const [assignmentMode, setAssignmentMode] = useState<'UNASSIGNED' | 'SPECIFIC_USER' | 'ROUND_ROBIN_TEAM' | 'KEEP_OWNER'>('UNASSIGNED');
  const [targetUserId, setTargetUserId] = useState('');
  const [targetTeamId, setTargetTeamId] = useState('');
  const [duplicateStrategy, setDuplicateStrategy] = useState<'SKIP' | 'UPDATE'>('SKIP');

  // Calling specific configs
  const [campaignName, setCampaignName] = useState('Dholera Smart City Outreach');
  const [defaultCallDate, setDefaultCallDate] = useState(() => {
    try {
      return new Date().toISOString().split('T')[0];
    } catch {
      return '2026-09-14';
    }
  });
  const [defaultCallTime, setDefaultCallTime] = useState('11:00 AM');
  const [callingPool, setCallingPool] = useState<Array<{ leadNumber: string; clientName: string; phone: string }>>([]);
  const [callingPoolCount, setCallingPoolCount] = useState(0);
  const [poolAssignCount, setPoolAssignCount] = useState('');
  const [poolAssignOwnerId, setPoolAssignOwnerId] = useState('');
  const [poolAssigning, setPoolAssigning] = useState(false);
  const [poolAssignError, setPoolAssignError] = useState<string | null>(null);

  // Execution & Streaming Progress state
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    percent: number;
    current: number;
    total: number;
    chunkIndex: number;
    totalChunks: number;
    stage: string;
  } | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultData, setResultData] = useState<{
    totalRows?: number;
    createdCount?: number;
    updatedCount?: number;
    skippedCount?: number;
    scheduledCount?: number;
    assignedCount?: number;
    errors?: Array<{ row: number; error: string }>;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch executives & teams for assignment
  const loadMetadata = useCallback(async () => {
    setIsLoadingMeta(true);
    try {
      const [uRes, tRes] = await Promise.all([fetch('/api/users'), fetch('/api/teams')]);
      let assignableList: AssignableUser[] = [];
      let teamList: Array<{ id: string; name: string }> = [];

      if (uRes.ok) {
        const uData = await uRes.json();
        // Exclude HR and ADMIN roles (only Sales Executives & Team Leads receive uploaded leads)
        assignableList = (uData.users || []).filter(
          (u: { role: string; active?: boolean }) =>
            u.role !== 'HR' && u.role !== 'ADMIN' && u.active !== false
        );
        setExecutives(assignableList);
        if (assignableList.length > 0) {
          setTargetUserId(assignableList[0].id);
        }
      }

      if (tRes.ok) {
        const tData = await tRes.json();
        teamList = tData.teams || [];
        setTeams(teamList);
        if (teamList.length > 0) {
          setTargetTeamId(teamList[0].id);
        }
      }

      // Smart initial distribution method based on available structure
      if (teamList.length > 0) {
        setAssignmentMode('ROUND_ROBIN_TEAM');
      } else if (assignableList.length > 0) {
        setAssignmentMode('SPECIFIC_USER');
      } else {
        setAssignmentMode('UNASSIGNED');
      }
    } catch (e) {
      console.error('Failed to load bulk upload metadata:', e);
    } finally {
      setIsLoadingMeta(false);
    }
  }, []);

  useEffect(() => {
    const assignable = liveUsers.filter(
      (user) => user.role !== 'HR' && user.role !== 'ADMIN' && user.active !== false
    ) as AssignableUser[];
    setExecutives(assignable);
    setTargetUserId((current) => current && assignable.some((user) => user.id === current) ? current : assignable[0]?.id || '');
  }, [liveUsers]);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (activeTab !== 'calling') return;
    fetch(`/api/calling?_t=${Date.now()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setCallingPool((data.unassignedCallingPool || []).slice(0, 5));
        setCallingPoolCount(data.unassignedCallingPoolCount || 0);
      })
      .catch(() => {});
  }, [activeTab]);

  // Update parsed rows when csvText changes
  useEffect(() => {
    if (!csvText.trim()) {
      setParsedRows([]);
      return;
    }
    const rows = parseCSV(csvText);
    setParsedRows(rows);
  }, [csvText]);

  // Safe file loader helper for input and drag-and-drop
  const processFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content || '');
    };
    reader.onerror = () => {
      setResultMessage('Error reading uploaded file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Clear value so the user can re-upload the same file if needed
    if (e.target) {
      e.target.value = '';
    }
  };

  const handleClearFile = () => {
    setFileName(null);
    setCsvText('');
    setParsedRows([]);
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Safe non-blocking template downloader
  const handleDownloadTemplate = (type: 'leads' | 'calling') => {
    try {
      const a = document.createElement('a');
      a.href = `/api/import/template?type=${type}`;
      a.download = `orvion_${type}_sample_template.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(`/api/import/template?type=${type}`, '_blank');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedRows.length === 0) return;

    setSubmitting(true);
    setResultMessage(null);
    setResultData(null);

    const CHUNK_SIZE = 500;
    const totalRows = parsedRows.length;
    const totalChunks = Math.ceil(totalRows / CHUNK_SIZE);

    const aggregated = {
      totalRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      scheduledCount: 0,
      assignedCount: 0,
      errors: [] as Array<{ row: number; error: string }>,
    };

    try {
      const endpoint = activeTab === 'leads' ? '/api/import/leads' : '/api/import/calling';

      for (let i = 0; i < totalChunks; i++) {
        const chunkStart = i * CHUNK_SIZE;
        const chunkRows = parsedRows.slice(chunkStart, chunkStart + CHUNK_SIZE);

        setUploadProgress({
          percent: Math.round((i / totalChunks) * 100),
          current: chunkStart,
          total: totalRows,
          chunkIndex: i + 1,
          totalChunks,
          stage: `Streaming batch ${i + 1} of ${totalChunks} (${chunkStart} / ${totalRows} rows)...`,
        });

        const payload =
          activeTab === 'leads'
            ? {
                rows: chunkRows,
                assignmentMode,
                targetUserId: assignmentMode === 'SPECIFIC_USER' ? targetUserId : undefined,
                targetTeamId: assignmentMode === 'ROUND_ROBIN_TEAM' ? targetTeamId : undefined,
                duplicateStrategy,
              }
            : {
                rows: chunkRows,
                assignmentMode,
                targetUserId: assignmentMode === 'SPECIFIC_USER' ? targetUserId : undefined,
                targetTeamId: assignmentMode === 'ROUND_ROBIN_TEAM' ? targetTeamId : undefined,
                defaultCallDate,
                defaultCallTime,
                campaignName,
              };

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Failed on batch ${i + 1}`);
        }

        const r = data.result || {};
        aggregated.totalRows += r.totalRows || chunkRows.length;
        aggregated.createdCount += r.createdCount || 0;
        aggregated.updatedCount += r.updatedCount || 0;
        aggregated.skippedCount += r.skippedCount || 0;
        aggregated.scheduledCount += r.scheduledCount || 0;
        aggregated.assignedCount += r.assignedCount || 0;
        if (Array.isArray(r.errors)) {
          aggregated.errors.push(
            ...r.errors.map((errItem: { row: number; error: string }) => ({
              ...errItem,
              row: errItem.row + chunkStart,
            }))
          );
        }

        setUploadProgress({
          percent: Math.round(((i + 1) / totalChunks) * 100),
          current: Math.min((i + 1) * CHUNK_SIZE, totalRows),
          total: totalRows,
          chunkIndex: i + 1,
          totalChunks,
          stage: `Ingested ${Math.min((i + 1) * CHUNK_SIZE, totalRows)} of ${totalRows} rows...`,
        });
      }

      const actionSummary =
        activeTab === 'leads'
          ? assignmentMode === 'UNASSIGNED'
            ? `Processed ${aggregated.totalRows} leads: ${aggregated.createdCount} stored in Admin Lead Storage, ${aggregated.updatedCount} updated, ${aggregated.skippedCount} skipped.`
            : `Processed ${aggregated.totalRows} leads: ${aggregated.createdCount} created, ${aggregated.updatedCount} updated, ${aggregated.skippedCount} skipped.`
          : `Processed ${aggregated.totalRows} records: ${aggregated.createdCount} created, ${aggregated.updatedCount} updated, ${aggregated.skippedCount} skipped.`;

      setResultMessage(actionSummary);
      setResultData(aggregated);
      setCsvText('');
      setFileName(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      invalidateFastCache();
      emitCrmSync('leads');
      emitCrmSync('calling');
      emitCrmSync('all');
      if (activeTab === 'calling') {
        await refreshCallingPool();
      }
      try {
        router.refresh();
      } catch {
        // ignore
      }
    } catch (err: unknown) {
      setResultMessage(err instanceof Error ? err.message : 'Network error occurred during import');
    } finally {
      setSubmitting(false);
      setUploadProgress(null);
    }
  };

  const refreshCallingPool = async () => {
    const res = await fetch(`/api/calling?_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    setCallingPool((data.unassignedCallingPool || []).slice(0, 5));
    setCallingPoolCount(data.unassignedCallingPoolCount || 0);
  };

  const handleAssignStoredCalling = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    const count = Number(poolAssignCount);
    if (!Number.isInteger(count) || count < 1 || count > callingPoolCount) {
      setPoolAssignError(`Enter a whole number from 1 to ${callingPoolCount}.`);
      return;
    }
    if (!poolAssignOwnerId) {
      setPoolAssignError('Select an executive.');
      return;
    }

    setPoolAssigning(true);
    setPoolAssignError(null);
    try {
      const res = await fetch('/api/calling/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, newOwnerId: poolAssignOwnerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign stored calling data');
      setPoolAssignCount('');
      invalidateFastCache();
      emitCrmSync('calling');
      emitCrmSync('leads');
      await refreshCallingPool();
    } catch (error: unknown) {
      setPoolAssignError(error instanceof Error ? error.message : 'Failed to assign stored calling data');
    } finally {
      setPoolAssigning(false);
    }
  };

  const validRowCount = parsedRows.filter((r) => r.phone).length;
  const invalidRowCount = parsedRows.length - validRowCount;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div>
          <h2 className="text-xl font-bold text-[#171817] flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-[#B69A63]" /> Bulk Ingestion &amp; Telecalling Dispatch
          </h2>
          <p className="text-xs text-[#626560] mt-1">
            Import bulk client databases or launch prioritized calling batches with instant round-robin assignment.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDownloadTemplate(activeTab)}
            className="flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#B69A63]" />
            Download Sample {activeTab === 'leads' ? 'Leads' : 'Calling'} CSV
          </Button>
        </div>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex items-center space-x-3 border-b border-[#E5E5E0] pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('leads');
            setResultMessage(null);
            setResultData(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'leads'
              ? 'bg-[#111314] text-[#F4F2EC] shadow-xs'
              : 'text-[#626560] hover:text-[#171817] hover:bg-[#F4F4F1]'
          }`}
        >
          <Layers className="w-4 h-4" />
          1. Bulk Leads Onboarding (Master Intake)
        </button>

      </div>

      {/* Mode Description Banner */}
      <div className="p-4 rounded-xl border border-[#E5E5E0] bg-[#F8F8F6] text-xs leading-relaxed shadow-xs flex items-start gap-3 text-[#171817]">
        {activeTab === 'leads' ? (
          <>
            <FileSpreadsheet className="w-5 h-5 text-[#B69A63] flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#171817] font-bold">Bulk Leads Mode:</strong> Upload cold databases, property expo registers, and digital lead generation campaigns.
              The engine automatically assigns sequential <span className="font-mono font-bold text-[#171817]">ORV-XXXXXX</span> IDs, checks for phone duplicate collisions, creates permanent audit records, and distributes leads to your selected team or executive.
            </div>
          </>
        ) : (
          <>
            <PhoneCall className="w-5 h-5 text-[#B69A63] flex-shrink-0 mt-0.5" />
            <div>
              <strong className="text-[#171817] font-bold">Calling Batch Mode:</strong> Dispatch targeted calling campaigns directly into executive workspaces.
              Scheduled calls will immediately show up in each executive&apos;s <strong className="text-[#171817] font-semibold">Calling Data &amp; Schedule</strong> queue with script notes, priority ratings, and target calling hours.
            </div>
          </>
        )}
      </div>

      {/* Real-time Streaming Progress Bar */}
      {uploadProgress && (
        <div className="p-4 rounded-xl border border-[#B69A63]/30 bg-[#FAF9F5] shadow-xs space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs font-bold text-[#171817]">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#B69A63] animate-spin" />
              <span>{uploadProgress.stage}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-[#B69A63]">{uploadProgress.percent}%</span>
              <span className="text-[11px] text-[#626560]">({uploadProgress.current} / {uploadProgress.total} rows)</span>
            </div>
          </div>
          <div className="w-full bg-[#E5E5E0] h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#B69A63] via-[#D4AF37] to-[#2D5A3C] h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.max(uploadProgress.percent, 3)}%` }}
            />
          </div>
        </div>
      )}

      {/* Result Status Banner if available */}
      {resultMessage && (
        <div className={`p-4 rounded-xl border shadow-xs space-y-3 ${
          resultData?.errors && resultData.errors.length > 0
            ? 'bg-[#FDF2F2] border-[#8C3333]/20 text-[#8C3333]'
            : 'bg-[#F0F7F2] border-[#2D5A3C]/20 text-[#2D5A3C]'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#2D5A3C]" />
              <span className="font-bold text-sm">{resultMessage}</span>
            </div>
            <button type="button" onClick={() => setResultMessage(null)} className="text-[#8C908A] hover:text-[#171817] cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {resultData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs border-t border-[#E5E5E0]">
              <div className="p-2.5 bg-white rounded-lg border border-[#E5E5E0]">
                <span className="text-[#8C908A] text-[10px] uppercase font-bold">Processed</span>
                <p className="text-lg font-black text-[#171817] mt-0.5 tabular-nums">{resultData.totalRows || 0}</p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-[#E5E5E0]">
                <span className="text-[#8C908A] text-[10px] uppercase font-bold">Created New</span>
                <p className="text-lg font-black text-[#2D5A3C] mt-0.5 tabular-nums">{resultData.createdCount || 0}</p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-[#E5E5E0]">
                <span className="text-[#8C908A] text-[10px] uppercase font-bold">Reconciled / Updated</span>
                <p className="text-lg font-black text-[#B69A63] mt-0.5 tabular-nums">{resultData.updatedCount || 0}</p>
              </div>
              <div className="p-2.5 bg-white rounded-lg border border-[#E5E5E0]">
                <span className="text-[#8C908A] text-[10px] uppercase font-bold">Skipped Duplicates</span>
                <p className="text-lg font-black text-[#626560] mt-0.5 tabular-nums">{resultData.skippedCount || 0}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Link
              href="/dashboard/admin/leads"
              className="px-3 py-1.5 rounded-lg bg-[#111314] text-[#F4F2EC] text-xs font-bold inline-flex items-center gap-1 hover:bg-[#26282B] transition shadow-xs"
            >
              <Layers className="w-3.5 h-3.5" /> Open All Leads Directory <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/dashboard/admin/dashboard"
              className="px-3 py-1.5 rounded-lg bg-white border border-[#E5E5E0] text-[#171817] text-xs font-bold inline-flex items-center gap-1 hover:bg-[#F8F8F6] transition"
            >
              Admin Live Overview <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Upload Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {activeTab === 'calling' && (
          <div className="p-4 rounded-2xl bg-[#111314] border border-[#2A2D2E] text-[#F4F2EC] shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#D2BE91]">Stored Admin Calling Pool</h3>
                <p className="text-[11px] text-[#A9AAA5] mt-1">
                  {callingPoolCount} records waiting for assignment. Capacity: 10,000.
                </p>
              </div>
              <span className="text-[11px] font-bold text-[#D2BE91]">Random records are assigned and removed from storage</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] gap-2">
              <input
                type="number"
                min="1"
                max={Math.min(10000, callingPoolCount)}
                value={poolAssignCount}
                onChange={(event) => setPoolAssignCount(event.target.value)}
                placeholder="Number, e.g. 230"
                disabled={callingPoolCount === 0 || poolAssigning}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#1E2021] border border-[#3A3D3E] text-[#F4F2EC] placeholder-[#8E918B] focus:outline-none focus:border-[#B69A63]"
              />
              <select
                value={poolAssignOwnerId}
                onChange={(event) => setPoolAssignOwnerId(event.target.value)}
                disabled={callingPoolCount === 0 || poolAssigning}
                className="w-full px-3 py-2 text-xs rounded-xl bg-[#1E2021] border border-[#3A3D3E] text-[#F4F2EC] focus:outline-none focus:border-[#B69A63]"
              >
                <option value="">Select executive or team lead</option>
                {executives.map((exec) => (
                  <option key={exec.id} value={exec.id}>{exec.name}</option>
                ))}
              </select>
              <Button type="button" variant="primary" isLoading={poolAssigning} disabled={callingPoolCount === 0} onClick={handleAssignStoredCalling}>
                <User className="w-3.5 h-3.5 mr-1.5" /> Assign Stored Data
              </Button>
            </div>
            {poolAssignError && <p className="text-[11px] text-[#F2B8B5]">{poolAssignError}</p>}

            {callingPool.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                {callingPool.map((lead) => (
                  <div key={lead.leadNumber} className="px-3 py-2 rounded-xl bg-[#1E2021] border border-[#3A3D3E] text-[11px]">
                    <p className="font-bold text-[#F4F2EC] truncate">{lead.clientName}</p>
                    <p className="text-[#A9AAA5] mt-0.5">{lead.leadNumber} · {lead.phone}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#8E918B]">No records are currently stored in the admin pool.</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Cols: File Upload & Preview */}
          <div className="lg:col-span-2 space-y-4">
            {/* File Drop Area with full HTML5 Drag & Drop */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  processFile(file);
                }
              }}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition cursor-pointer space-y-3 group ${
                isDragging
                  ? 'border-[#B69A63] bg-[#FAF8F3] scale-[1.005]'
                  : 'border-[#E5E5E0] hover:border-[#B69A63] bg-white hover:bg-[#FAF9F5]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />

              <div className="w-12 h-12 rounded-full bg-[#F4F4F1] group-hover:bg-[#E5E5E0] text-[#171817] flex items-center justify-center mx-auto transition">
                <UploadCloud className="w-6 h-6 text-[#B69A63]" />
              </div>

              <div>
                <p className="text-sm font-bold text-[#171817]">
                  {fileName ? fileName : 'Click to browse or drag and drop a CSV file'}
                </p>
                <p className="text-xs text-[#626560] mt-1">
                  Supports standard comma-separated values (.csv) with headers. All rows are imported in streamed batches.
                </p>
              </div>

              {fileName && (
                <div className="flex items-center justify-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F0F7F2] text-[#2D5A3C] border border-[#2D5A3C]/20 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> File Loaded: {parsedRows.length} rows parsed
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFile();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FDF2F2] text-[#8C3333] border border-[#8C3333]/20 text-xs font-semibold hover:bg-[#FCE8E8] transition"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                </div>
              )}
            </div>

            {/* Table Live Preview (First 5 Rows) */}
            {parsedRows.length > 0 && (
              <div className="rounded-xl border border-[#E5E5E0] bg-white overflow-hidden shadow-xs space-y-0">
                <div className="px-4 py-3 bg-[#F8F8F6] border-b border-[#E5E5E0] flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-[#171817]">CSV Parsed Preview</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F4F4F1] text-[#171817] border border-[#E5E5E0]">
                      Showing first {Math.min(parsedRows.length, 5)} of {parsedRows.length} rows
                    </span>
                  </div>
                  {invalidRowCount > 0 && (
                    <span className="text-[11px] font-bold text-[#8C3333] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {invalidRowCount} rows missing phone number
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#171817]">
                    <thead className="bg-[#F8F8F6] text-[11px] font-bold text-[#626560] uppercase border-b border-[#E5E5E0]">
                      <tr>
                        <th className="px-3 py-2.5">#</th>
                        <th className="px-3 py-2.5">Client Name</th>
                        <th className="px-3 py-2.5">Phone (Required)</th>
                        <th className="px-3 py-2.5">{activeTab === 'leads' ? 'Company' : 'Campaign'}</th>
                        <th className="px-3 py-2.5">{activeTab === 'leads' ? 'Source' : 'Scheduled Time'}</th>
                        <th className="px-3 py-2.5">Notes / Script</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5E5E0]">
                      {parsedRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#FAF9F5]">
                          <td className="px-3 py-2 font-mono text-[11px] text-[#8C908A] tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-2 font-semibold text-[#171817]">
                            {row.clientName ? (
                              row.clientName
                            ) : (
                              <span className="text-[#90928E] font-normal italic">Unnamed Lead</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-[#626560]">{row.phone || '—'}</td>
                          <td className="px-3 py-2 text-[#626560]">
                            {activeTab === 'leads' ? row.company || '—' : row.campaign || campaignName}
                          </td>
                          <td className="px-3 py-2 text-[#626560]">
                            {activeTab === 'leads'
                              ? row.source || 'Bulk CSV'
                              : `${row.callDate || defaultCallDate} @ ${row.callTime || defaultCallTime}`}
                          </td>
                          <td className="px-3 py-2 text-[#626560] truncate max-w-[180px]">
                            {row.scriptNotes || row.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Col: Allocation & Ingestion Settings */}
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-white border border-[#E5E5E0] shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-[#171817] flex items-center justify-between border-b border-[#F4F4F1] pb-3">
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#B69A63]" /> Lead Storage &amp; Allocation
                </span>
                {isLoadingMeta && (
                  <RefreshCw className="w-3.5 h-3.5 text-[#B69A63] animate-spin" />
                )}
              </h3>

              {/* Assignment Mode */}
              <div>
                <label className="block text-xs font-semibold text-[#171817] mb-1.5">
                  Distribution Method
                </label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 text-xs text-[#171817] cursor-pointer">
                    <input
                      type="radio"
                      name="assignmentMode"
                      value="ROUND_ROBIN_TEAM"
                      checked={assignmentMode === 'ROUND_ROBIN_TEAM'}
                      onChange={() => setAssignmentMode('ROUND_ROBIN_TEAM')}
                      className="text-[#111314] focus:ring-[#B69A63] accent-[#111314]"
                    />
                    <span className="font-medium">Round-Robin Team Distribution (Equal share)</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-[#171817] cursor-pointer">
                    <input
                      type="radio"
                      name="assignmentMode"
                      value="SPECIFIC_USER"
                      checked={assignmentMode === 'SPECIFIC_USER'}
                      onChange={() => setAssignmentMode('SPECIFIC_USER')}
                      className="text-[#111314] focus:ring-[#B69A63] accent-[#111314]"
                    />
                    <span className="font-medium">Assign All to Specific Executive</span>
                  </label>

                  {activeTab === 'leads' ? (
                    <label className="flex items-center space-x-2 text-xs text-[#171817] cursor-pointer">
                      <input
                        type="radio"
                        name="assignmentMode"
                        value="UNASSIGNED"
                        checked={assignmentMode === 'UNASSIGNED'}
                        onChange={() => setAssignmentMode('UNASSIGNED')}
                        className="text-[#111314] focus:ring-[#B69A63] accent-[#111314]"
                      />
                      <span className="font-medium">Store in Admin Lead Storage</span>
                    </label>
                  ) : (
                    <label className="flex items-center space-x-2 text-xs text-[#171817] cursor-pointer">
                      <input
                        type="radio"
                        name="assignmentMode"
                        value="UNASSIGNED"
                        checked={assignmentMode === 'UNASSIGNED'}
                        onChange={() => setAssignmentMode('UNASSIGNED')}
                        className="text-[#111314] focus:ring-[#B69A63] accent-[#111314]"
                      />
                      <span className="font-medium">Store in Admin Calling Pool</span>
                    </label>
                  )}

                  {activeTab === 'calling' ? (
                    <label className="flex items-center space-x-2 text-xs text-[#171817] cursor-pointer">
                      <input
                        type="radio"
                        name="assignmentMode"
                        value="KEEP_OWNER"
                        checked={assignmentMode === 'KEEP_OWNER'}
                        onChange={() => setAssignmentMode('KEEP_OWNER')}
                        className="text-[#111314] focus:ring-[#B69A63] accent-[#111314]"
                      />
                      <span className="font-medium">Keep Current Lead Owner (if existing)</span>
                    </label>
                  ) : null}
                </div>
              </div>

              {/* Target Team Selector */}
              {assignmentMode === 'ROUND_ROBIN_TEAM' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#171817]">
                    Select Target Team <span className="text-[#B69A63]">*</span>
                  </label>
                  {isLoadingMeta ? (
                    <div className="h-9 w-full bg-[#F4F4F1] animate-pulse rounded-xl" />
                  ) : teams.length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#B69A63]/30 text-xs text-[#626560] space-y-1">
                      <p className="font-bold text-[#171817]">No teams found</p>
                      <p className="text-[11px]">
                        Create team pods in <Link href="/dashboard/admin/teams" className="text-[#B69A63] font-semibold underline">Team Structure</Link> first, or select <strong>Assign to Specific Staff</strong> / <strong>Leave in Unassigned Pool</strong>.
                      </p>
                    </div>
                  ) : (
                    <>
                      <select
                        value={targetTeamId}
                        onChange={(e) => setTargetTeamId(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] shadow-2xs"
                      >
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[#626560]">
                        Rows will be assigned sequentially across all active executives of this team.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* Target Executive / Staff Selector */}
              {assignmentMode === 'SPECIFIC_USER' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#171817]">
                    Select Assignee <span className="text-[#B69A63]">*</span>
                  </label>
                  {isLoadingMeta ? (
                    <div className="h-9 w-full bg-[#F4F4F1] animate-pulse rounded-xl" />
                  ) : executives.length === 0 ? (
                    <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#B69A63]/30 text-xs text-[#626560] space-y-1">
                      <p className="font-bold text-[#171817]">No active staff members found</p>
                      <p className="text-[11px]">
                        Create team members in <Link href="/dashboard/admin/users" className="text-[#B69A63] font-semibold underline">User Directory</Link> first, or select <strong>Leave in Unassigned Pool</strong>.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={targetUserId}
                      onChange={(e) => setTargetUserId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] shadow-2xs"
                    >
                      {executives.map((exec) => (
                        <option key={exec.id} value={exec.id}>
                          {exec.name} ({exec.role === 'TEAM_LEAD' ? 'Team Lead' : 'Sales Executive'} • {exec.email})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Leads Specific: Duplicate Strategy */}
              {activeTab === 'leads' && (
                <div className="pt-2 border-t border-[#F4F4F1] space-y-1.5">
                  <label className="block text-xs font-semibold text-[#171817]">
                    Phone Duplicate Collision Policy
                  </label>
                  <select
                    value={duplicateStrategy}
                    onChange={(e) => setDuplicateStrategy(e.target.value as 'SKIP' | 'UPDATE')}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] shadow-2xs"
                  >
                    <option value="SKIP">Skip duplicate (Keep existing lead)</option>
                    <option value="UPDATE">Update details (Refresh contact info)</option>
                  </select>
                </div>
              )}

              {/* Calling Specific: Default Schedule Configs */}
              {activeTab === 'calling' && (
                <div className="pt-2 border-t border-[#F4F4F1] space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#171817] mb-1">
                      Campaign Tag
                    </label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g. Q3 Expressway Outreach"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] shadow-2xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#171817] mb-1">
                        Default Call Date
                      </label>
                      <input
                        type="date"
                        value={defaultCallDate}
                        onChange={(e) => setDefaultCallDate(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#171817] mb-1">
                        Default Call Time
                      </label>
                      <input
                        type="text"
                        value={defaultCallTime}
                        onChange={(e) => setDefaultCallTime(e.target.value)}
                        placeholder="11:00 AM"
                        className="w-full px-2 py-1.5 text-xs rounded-xl bg-white border border-[#E5E5E0] text-[#171817] focus:outline-none focus:border-[#B69A63] shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Submit CTA */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full py-2.5 font-bold cursor-pointer"
                  disabled={
                    parsedRows.length === 0 ||
                    submitting ||
                    (assignmentMode === 'SPECIFIC_USER' && (!targetUserId || executives.length === 0)) ||
                    (assignmentMode === 'ROUND_ROBIN_TEAM' && (!targetTeamId || teams.length === 0))
                  }
                  isLoading={submitting}
                >
                  {parsedRows.length === 0 ? (
                    'Select a CSV file to ingest'
                  ) : activeTab === 'leads' ? (
                    <>
                      <Layers className="w-4 h-4 mr-1.5" /> Ingest {validRowCount} Leads
                    </>
                  ) : (
                    <>
                      <PhoneCall className="w-4 h-4 mr-1.5" /> Dispatch {validRowCount} Calling Tasks
                    </>
                  )}
                </Button>
                {parsedRows.length === 0 && (
                  <p className="text-[11px] text-[#8C908A] text-center mt-2">
                    Select a CSV file or paste rows on the left to activate ingestion.
                  </p>
                )}
              </div>
              {activeTab === 'leads' && assignmentMode === 'UNASSIGNED' && (
                <p className="mt-2 rounded-lg border border-[#B69A63]/25 bg-[#FAF8F5] px-3 py-2 text-[11px] leading-relaxed text-[#626560]">
                  Leads will be saved in the Admin Lead Storage without an owner. They will not appear in Today&apos;s Leads until Admin assigns them.
                </p>
              )}
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
