import * as React from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Select as SelectPrimitive } from 'radix-ui'
import { cn } from '@renderer/lib/utils'

function Select(props: React.ComponentProps<typeof SelectPrimitive.Root>): React.JSX.Element {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectValue(props: React.ComponentProps<typeof SelectPrimitive.Value>): React.JSX.Element {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>): React.JSX.Element {
  return <SelectPrimitive.Trigger
    data-slot="select-trigger"
    className={cn(
      'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-full border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-[12.5px] font-medium text-[var(--ink)] outline-none transition-[background-color,border-color,color] duration-150 hover:border-[var(--stone)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-deep)] focus-visible:ring-offset-2 data-[state=open]:border-[var(--ink)] data-[placeholder]:text-[var(--steel)] disabled:cursor-not-allowed disabled:opacity-50 [&_[data-slot=select-value]]:truncate',
      className
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild><ChevronDown className="size-3.5 shrink-0 text-[var(--steel)]" /></SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
}

function SelectContent({ className, children, position = 'popper', sideOffset = 5, ...props }: React.ComponentProps<typeof SelectPrimitive.Content>): React.JSX.Element {
  return <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      data-slot="select-content"
      position={position}
      sideOffset={sideOffset}
      className={cn(
        'z-[80] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-24px)] overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] p-1 text-[var(--ink)] shadow-[0_8px_24px_rgba(0,0,0,0.08)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-[var(--steel)]"><ChevronUp className="size-3.5" /></SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-0.5">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-[var(--steel)]"><ChevronDown className="size-3.5" /></SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>): React.JSX.Element {
  return <SelectPrimitive.Item
    data-slot="select-item"
    className={cn(
      'relative flex min-h-8 cursor-pointer select-none items-center gap-2 whitespace-nowrap rounded-[8px] py-1.5 pr-8 pl-2.5 text-[12.5px] outline-none transition-colors data-[highlighted]:bg-[var(--surface)] data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
      className
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2 flex size-4 items-center justify-center"><SelectPrimitive.ItemIndicator><Check className="size-3.5" /></SelectPrimitive.ItemIndicator></span>
  </SelectPrimitive.Item>
}

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem }
