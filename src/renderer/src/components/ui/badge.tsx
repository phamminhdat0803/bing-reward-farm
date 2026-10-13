import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

// MiniMax badges: pill gọn — caption-bold 11.5px, padding 2px 7px (thu nhỏ 2026-10-13 theo yêu cầu)
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-[7px] py-[2px] text-[11.5px] font-semibold leading-[1.45]',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-white',
        secondary: 'bg-[var(--surface)] text-[var(--slate)]',
        outline: 'border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--slate)]',
        success: 'bg-[var(--success-bg)] text-[var(--success-text)]',
        coral: 'bg-[var(--brand-coral)] text-white',
        beta: 'bg-[var(--brand-blue-200)] text-[var(--brand-blue-deep)]',
        warning: 'bg-[#fff4e5] text-[#b45309]',
        destructive: 'bg-[#fdf2f2] text-[var(--error)]'
      }
    },
    defaultVariants: { variant: 'secondary' }
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot.Root : 'span'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
