import React from 'react';

export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse select-none">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5E5E0]">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-[#E5E5E0] rounded-lg"></div>
          <div className="h-3.5 w-72 bg-[#EBEBE6] rounded-md"></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-[#E5E5E0] rounded-xl"></div>
          <div className="h-9 w-32 bg-[#E5E5E0] rounded-xl"></div>
        </div>
      </div>

      {/* Metrics Row Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 bg-white border border-[#E5E5E0] rounded-2xl space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 bg-[#EBEBE6] rounded"></div>
              <div className="h-6 w-6 bg-[#E5E5E0] rounded-lg"></div>
            </div>
            <div className="h-7 w-16 bg-[#E5E5E0] rounded-lg"></div>
            <div className="h-2.5 w-28 bg-[#F0F0ED] rounded"></div>
          </div>
        ))}
      </div>

      {/* Main Surface Skeleton */}
      <div className="bg-white border border-[#E5E5E0] rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#F4F4F1] pb-4">
          <div className="h-5 w-40 bg-[#E5E5E0] rounded-md"></div>
          <div className="h-8 w-24 bg-[#EBEBE6] rounded-lg"></div>
        </div>
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-12 bg-[#F8F8F6] rounded-xl border border-[#EFEFEA] w-full"></div>
          ))}
        </div>
      </div>
    </div>
  );
}
