import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

// MiniMax DESIGN.md: mọi nút đều pill (rounded-full), 2 tầng chính:
// button-primary (nền đen) + button-secondary (viền đen) + button-tertiary (viền hairline).
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold outline-none transition-[background-color,border-color,color] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-deep)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-[var(--hairline)] disabled:text-[var(--muted-ink)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-white hover:bg-[var(--charcoal)]',
        secondary: 'border border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--surface)]',
        tertiary:
          'border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)] hover:bg-[var(--surface)]',
        ghost: 'bg-transparent text-[var(--ink)] hover:bg-[var(--surface)]',
        danger: 'border border-[var(--error)] bg-[var(--canvas)] text-[var(--error)] hover:bg-[#fdf2f2]',
        link: 'rounded-none text-[var(--ink)] underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-5 text-sm',
        sm: 'h-7 px-3 text-[12.5px]',
        lg: 'h-10 px-5 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }): React.JSX.Element {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
