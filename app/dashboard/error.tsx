'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard component error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md w-full bg-white border border-red-200 rounded-3xl p-8 shadow-xs space-y-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center">
          <AlertCircle className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold text-red-700 tracking-wider uppercase bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
            Workspace Fault Isolated
          </span>
          <h2 className="text-xl font-bold text-[#171817]">
            Unable to Load Workspace Data
          </h2>
          <p className="text-xs text-[#626560]">
            A transient error occurred while fetching your workspace records.
          </p>
        </div>

        <div className="pt-2 flex justify-center gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => reset()}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Reload Data
          </Button>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#F8F8F6] text-[#626560] font-semibold text-xs border border-[#E5E5E0] hover:bg-[#FAF9F5] transition cursor-pointer"
          >
            <LayoutDashboard className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
