import React from 'react';
import { UploadCloud } from 'lucide-react';

export default function BulkUploadLoading() {
  return (
    <div className="space-y-6 animate-pulse select-none">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <UploadCloud className="w-6 h-6 text-[#B69A63]/50 animate-pulse" />
            <div className="h-6 w-72 bg-[#E5E5E0] rounded-lg"></div>
          </div>
          <div className="h-3.5 w-96 bg-[#EBEBE6] rounded-md"></div>
        </div>
        <div className="h-9 w-52 bg-[#E5E5E0] rounded-xl"></div>
      </div>

      {/* Tabs Skeleton */}
      <div className="flex items-center gap-3 border-b border-[#E5E5E0] pb-2">
        <div className="h-8 w-64 bg-[#E5E5E0] rounded-xl"></div>
        <div className="h-8 w-64 bg-[#EBEBE6] rounded-xl"></div>
      </div>

      {/* Banner Skeleton */}
      <div className="h-16 w-full bg-[#F8F8F6] border border-[#E5E5E0] rounded-xl"></div>

      {/* Form Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-44 border-2 border-dashed border-[#E5E5E0] bg-white rounded-2xl"></div>
          <div className="h-36 bg-white border border-[#E5E5E0] rounded-xl"></div>
        </div>
        <div className="space-y-4">
          <div className="h-96 bg-white border border-[#E5E5E0] rounded-2xl"></div>
        </div>
      </div>
    </div>
  );
}
