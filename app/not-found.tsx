import React from 'react';
import Link from 'next/link';
import { Compass, Home, ArrowLeft } from 'lucide-react';

export default function GlobalNotFound() {
  return (
    <div className="min-h-screen bg-[#F4F4F1] flex flex-col items-center justify-center p-6 text-center select-none relative overflow-hidden">
      {/* Background Decorative Gradient Orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#B69A63]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-[#171817]/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-md w-full bg-white/80 backdrop-blur-xl border border-[#E5E5E0] rounded-3xl p-8 shadow-xl space-y-6">
        {/* Brand Icon */}
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[#171817] text-[#D2BE91] border border-[#B69A63]/40 flex items-center justify-center shadow-lg shadow-black/5">
          <Compass className="w-8 h-8 text-[#B69A63] animate-pulse" />
        </div>

        {/* Status Header */}
        <div className="space-y-2">
          <span className="text-[11px] font-bold text-[#B69A63] tracking-widest uppercase bg-[#FAF8F5] px-3 py-1 rounded-full border border-[#B69A63]/30">
            Error 404 • Resource Not Found
          </span>
          <h1 className="text-2xl font-black text-[#171817] tracking-tight">
            Page or Dossier Not Found
          </h1>
          <p className="text-xs text-[#626560] leading-relaxed">
            The page, lead record, or destination you requested does not exist, was moved, or requires elevated privileges.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href="/"
            className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#171817] text-[#F4F2EC] font-semibold text-xs hover:bg-[#2A2B2A] transition-all shadow-md shadow-black/10 cursor-pointer"
          >
            <Home className="w-4 h-4 text-[#D2BE91]" /> Return to Dashboard
          </Link>

          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#F8F8F6] text-[#626560] font-semibold text-xs border border-[#E5E5E0] hover:bg-[#FAF9F5] hover:text-[#171817] transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Sign In
          </Link>
        </div>
      </div>

      <div className="mt-8 text-[11px] text-[#AEB1AC] font-medium">
        ORVION Enterprise CRM • Automated Security & Isolation
      </div>
    </div>
  );
}
