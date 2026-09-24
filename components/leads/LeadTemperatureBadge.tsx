'use client';

import React from 'react';
import { Flame, Sun, Snowflake } from 'lucide-react';

interface LeadTemperatureBadgeProps {
  score?: number | null;
  temperature?: string | null;
  showScore?: boolean;
  size?: 'sm' | 'md';
}

export const LeadTemperatureBadge: React.FC<LeadTemperatureBadgeProps> = ({
  score = 50,
  temperature = 'WARM',
  showScore = true,
  size = 'sm',
}) => {
  const temp = (temperature || 'WARM').toUpperCase();
  const safeScore = score ?? 50;

  if (temp === 'HOT') {
    return (
      <span
        title={`Lead Quality Score: ${safeScore}/100 (Hot Prospect)`}
        className={`inline-flex items-center gap-1 font-bold rounded-full border shadow-2xs select-none transition-all ${
          size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
        } bg-[#FDF2F0] text-[#8C332E] border-[#F1C7C5]`}
      >
        <Flame className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-[#8C332E]`} />
        <span>HOT</span>
        {showScore && <span className="font-mono text-[#8C332E]/80 ml-0.5">({safeScore})</span>}
      </span>
    );
  }

  if (temp === 'COLD') {
    return (
      <span
        title={`Lead Quality Score: ${safeScore}/100 (Cold / Needs Nurturing)`}
        className={`inline-flex items-center gap-1 font-bold rounded-full border shadow-2xs select-none transition-all ${
          size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
        } bg-[#F4F4F1] text-[#626560] border-[#E5E5E0]`}
      >
        <Snowflake className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-[#626560]`} />
        <span>COLD</span>
        {showScore && <span className="font-mono text-[#626560]/80 ml-0.5">({safeScore})</span>}
      </span>
    );
  }

  // Default WARM
  return (
    <span
      title={`Lead Quality Score: ${safeScore}/100 (Warm Engagement)`}
      className={`inline-flex items-center gap-1 font-bold rounded-full border shadow-2xs select-none transition-all ${
        size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'
      } bg-[#FAF5EB] text-[#7A5B28] border-[#E8DCBE]`}
    >
      <Sun className={`${size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} text-[#B69A63]`} />
      <span>WARM</span>
      {showScore && <span className="font-mono text-[#7A5B28]/80 ml-0.5">({safeScore})</span>}
    </span>
  );
};
