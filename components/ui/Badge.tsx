import React from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?:
    | 'default'
    | 'blue'
    | 'blue-solid'
    | 'emerald'
    | 'emerald-solid'
    | 'amber'
    | 'purple'
    | 'indigo'
    | 'orange'
    | 'violet'
    | 'rose'
    | 'red-solid'
    | 'teal'
    | 'bronze'
    | 'black'
    | 'white';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'blue',
  size = 'sm',
  className,
}) => {
  const variantStyles = {
    default: 'bg-[#F4F4F1] text-[#626560] border-[#E5E5E0] font-medium',
    blue: 'bg-[#F0F2F5] text-[#3B4C63] border-[#D9DFE8] font-medium',
    'blue-solid': 'bg-[#17191A] text-[#F4F2EC] border-[#252829] font-medium',
    emerald: 'bg-[#EDF5F0] text-[#2D5A3C] border-[#D3E5D9] font-medium',
    'emerald-solid': 'bg-[#1A2E20] text-[#D8EADB] border-[#294833] font-medium',
    amber: 'bg-[#FAF5EB] text-[#7A5B28] border-[#EFE3CA] font-medium',
    purple: 'bg-[#F3F0F7] text-[#553E73] border-[#E1D9EB] font-medium',
    indigo: 'bg-[#F1F3F7] text-[#3D4B66] border-[#D9DFEB] font-medium',
    orange: 'bg-[#F9F4EB] text-[#785429] border-[#EDE0CC] font-medium',
    violet: 'bg-[#F4F1F7] text-[#573F6F] border-[#E2DAEB] font-medium',
    rose: 'bg-[#F7EEED] text-[#753330] border-[#E8D1CF] font-medium',
    'red-solid': 'bg-[#291718] text-[#F0D5D4] border-[#442325] font-medium',
    teal: 'bg-[#EFF6F5] text-[#2B5652] border-[#D4E6E4] font-medium',
    bronze: 'bg-[#FAF6EE] text-[#7B6334] border-[#E8DDC3] font-medium',
    black: 'bg-[#111314] text-[#F4F2EC] border-[#252829] font-medium',
    white: 'bg-white text-[#171817] border-[#E5E5E0] font-medium shadow-2xs',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2.5 py-0.5 tracking-wide uppercase',
    md: 'text-xs px-3 py-1 font-medium',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border transition-colors select-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {children}
    </span>
  );
};

export function getStatusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'NEW':
      return 'blue';
    case 'INTERESTED':
      return 'emerald';
    case 'FOLLOW_UP':
      return 'amber';
    case 'CALL_BACK':
      return 'blue';
    case 'MEETING':
      return 'purple';
    case 'SITE_VISIT':
      return 'indigo';
    case 'QUOTATION':
      return 'orange';
    case 'NEGOTIATION':
      return 'bronze';
    case 'CLOSED_WON':
      return 'emerald-solid';
    case 'CLOSED_LOST':
      return 'rose';
    case 'NOT_ANSWERING':
      return 'amber';
    case 'NOT_INTERESTED':
      return 'rose';
    case 'CHANNEL_PARTNER':
      return 'teal';
    case 'OTHER':
    default:
      return 'default';
  }
}
