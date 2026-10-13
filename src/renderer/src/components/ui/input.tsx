import * as React from 'react'
import { cn } from '@renderer/lib/utils'

// MiniMax text-input: canvas + hairline, radius 8px, cao 40px; focus = vien 2px brand-blue-deep.
function Input({ className, type, ...props }: React.ComponentProps<'input'>): React.JSX.Element {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none transition-[border-color,box-shadow]',
        'placeholder:text-[var(--stone)] selection:bg-[var(--brand-blue-200)] selection:text-[var(--brand-blue-deep)]',
        'focus-visible:border-[2px] focus-visible:border-[var(--brand-blue-deep)]',
        'disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted-ink)]',
        className
      )}
      {...props}
    />
  )
}

export { Input }
