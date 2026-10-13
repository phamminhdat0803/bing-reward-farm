import * as React from 'react'
import { cn } from '@renderer/lib/utils'

// MiniMax data-table: canvas + hairline, header nền surface chữ steel (caption-bold),
// hàng body padding 16px, divider hairline-soft.
function Table({ className, ...props }: React.ComponentProps<'table'>): React.JSX.Element {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>): React.JSX.Element {
  return (
    <thead
      data-slot="table-header"
      className={cn('sticky top-0 z-10 bg-[var(--surface)] shadow-[0_1px_0_0_var(--hairline)]', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>): React.JSX.Element {
  return <tbody data-slot="table-body" className={cn('bg-[var(--canvas)]', className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>): React.JSX.Element {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t border-[var(--hairline)] bg-[var(--surface)] font-medium', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>): React.JSX.Element {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-[var(--hairline-soft)] transition-colors last:border-0 hover:bg-[var(--surface)] data-[state=selected]:bg-[var(--surface)]',
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>): React.JSX.Element {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-9 px-2.5 text-left align-middle text-[12.5px] font-semibold whitespace-nowrap text-[var(--steel)]',
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>): React.JSX.Element {
  return <td data-slot="table-cell" className={cn('px-2.5 py-1.5 align-middle text-[13.5px]', className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>): React.JSX.Element {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-[13px] text-[var(--steel)]', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
