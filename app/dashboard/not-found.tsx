import React from 'react';
import Link from 'next/link';
import { Compass, ArrowLeft, Layers } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <div className="max-w-md w-full bg-white border border-[#E5E5E0] rounded-3xl p-8 shadow-xs space-y-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#FAF8F5] text-[#B69A63] border border-[#B69A63]/30 flex items-center justify-center">
          <Compass className="w-7 h-7 animate-pulse" />
        </div>

        <div className="space-y-2">
          <span className="text-[11px] font-bold text-[#B69A63] tracking-wider uppercase bg-[#FAF8F5] px-2.5 py-0.5 rounded-full border border-[#B69A63]/25">
            404 • Not Found
          </span>
          <h2 className="text-xl font-bold text-[#171817]">
            Lead or Resource Not Found
          </h2>
          <p className="text-xs text-[#626560]">
            The requested lead dossier, member record, or queue could not be located. It may have been reassigned or deleted.
          </p>
        </div>

        <div className="pt-2 flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#171817] text-[#F4F2EC] font-semibold text-xs hover:bg-[#2A2B2A] transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
