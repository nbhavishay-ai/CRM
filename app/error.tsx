'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#F4F4F1] flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden">
      <div className="relative z-10 max-w-md w-full bg-white/90 backdrop-blur-xl border border-red-200 rounded-3xl p-8 shadow-xl space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shadow-lg shadow-red-500/10">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold text-red-700 tracking-widest uppercase bg-red-50 px-3 py-1 rounded-full border border-red-200">
            System Fault Intercepted
          </span>
          <h1 className="text-2xl font-black text-[#171817] tracking-tight">
            Unexpected Exception
          </h1>
          <p className="text-xs text-[#626560] leading-relaxed">
            An unexpected error occurred while rendering this view. Our self-healing engine has isolated the failure.
          </p>
          {error.digest && (
            <p className="text-[10px] text-zinc-400 font-mono">Digest: {error.digest}</p>
          )}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="primary"
            onClick={() => reset()}
            className="flex-1 justify-center"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Try Again
          </Button>

          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#F8F8F6] text-[#626560] font-semibold text-xs border border-[#E5E5E0] hover:bg-[#FAF9F5] hover:text-[#171817] transition-all cursor-pointer"
          >
            <Home className="w-4 h-4" /> Home
          </Link>
        </div>
      </div>
    </div>
  );
}
