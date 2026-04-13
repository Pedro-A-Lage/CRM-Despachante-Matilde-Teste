import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-pill border-transparent px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-focus focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-badge-bg text-badge-text",
        secondary: "bg-[rgba(0,0,0,0.05)] dark:bg-[rgba(255,255,255,0.08)] text-text-secondary",
        destructive: "bg-[rgba(239,68,68,0.12)] text-[#EF4444]",
        outline: "border border-border text-text",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
