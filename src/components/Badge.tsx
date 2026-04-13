import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center whitespace-nowrap font-bold uppercase tracking-[0.04em]',
  {
    variants: {
      variant: {
        default: 'bg-badge-bg text-badge-text',
        success: 'bg-[rgba(16,185,129,0.12)] text-[#10B981]',
        warning: 'bg-[rgba(245,158,11,0.12)] text-[#F59E0B]',
        danger: 'bg-[rgba(239,68,68,0.12)] text-[#EF4444]',
        info: 'bg-[rgba(59,130,246,0.12)] text-[#3B82F6]',
        neutral: 'bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] text-text-secondary',
        primary: 'bg-[rgba(0,117,222,0.12)] text-blue',
        secondary: 'bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] text-text-secondary',
      },
      size: {
        sm: 'text-[9px] px-1.5 py-0.5 rounded-micro gap-1',
        md: 'text-[11px] px-2.5 py-[3px] rounded-subtle gap-[5px]',
      },
    },
    defaultVariants: { variant: 'neutral', size: 'md' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

export function Badge({ className, variant, size, dot = false, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span className="w-[5px] h-[5px] rounded-full bg-current shrink-0" />
      )}
      {children}
    </span>
  );
}

export { badgeVariants };
