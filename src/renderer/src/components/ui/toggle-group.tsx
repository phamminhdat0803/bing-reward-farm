import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'
import { cn } from '@renderer/lib/utils'
import { buttonVariants } from './button'

function ToggleGroup({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root>): React.JSX.Element {
  return <ToggleGroupPrimitive.Root data-slot="toggle-group" className={cn('flex flex-wrap items-center gap-1.5', className)} {...props} />
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>): React.JSX.Element {
  return <ToggleGroupPrimitive.Item
    data-slot="toggle-group-item"
    className={cn(
      buttonVariants({ variant: 'tertiary', size: 'sm' }),
      'h-8 gap-1.5 data-[state=on]:border-[var(--primary)] data-[state=on]:bg-[var(--primary)] data-[state=on]:text-white data-[state=on]:hover:bg-[var(--charcoal)] disabled:opacity-50',
      className
    )}
    {...props}
  />
}

export { ToggleGroup, ToggleGroupItem }
