import React from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'bronze';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#B69A63]/30 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer select-none';

  const variantStyles = {
    primary:
      'bg-[#111314] hover:bg-[#1E2021] active:bg-[#0B0C0D] text-[#F4F2EC] font-medium border border-[#252829] shadow-xs active:scale-[0.99]',
    bronze:
      'bg-[#B69A63] hover:bg-[#C6AD7A] active:bg-[#A88C55] text-[#111314] font-semibold border border-[#B69A63] shadow-xs active:scale-[0.99]',
    secondary:
      'bg-white hover:bg-[#F8F8F6] active:bg-[#F0F0EC] text-[#171817] border border-[#E5E5E0] shadow-xs hover:border-[#D5D5CF] active:scale-[0.99]',
    outline:
      'border border-[#E5E5E0] hover:border-[#B69A63] text-[#171817] bg-white shadow-xs hover:bg-[#FAF9F5] active:scale-[0.99]',
    danger:
      'bg-[#1C1213] hover:bg-[#2A1719] text-[#F7EEED] border border-[#3E2124] shadow-xs active:scale-[0.99]',
    ghost:
      'bg-transparent hover:bg-[#F8F8F6] text-[#626560] hover:text-[#171817] active:bg-[#EFEFEA]',
  };

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  return (
    <button
      className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      )}
      {children}
    </button>
  );
};
