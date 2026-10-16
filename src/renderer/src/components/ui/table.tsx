import * as React from 'react'
import { cn } from '@renderer/lib/utils'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'

// MiniMax data-table: canvas + hairline, header nền surface chữ steel (caption-bold),
// hàng body padding 16px, divider hairline-soft.
function Table({
  className,
  containerClassName,
  horizontalScroll = true,
  ...props
}: React.ComponentProps<'table'> & { containerClassName?: string; horizontalScroll?: boolean }): React.JSX.Element {
  return (
    // Dung ScrollArea (thanh cuon tu ve) thay cho cuon native
    <ScrollArea data-slot="table-container" className={cn('relative min-h-0 w-full flex-1', containerClassName)}>
      {/* border-separate: BAT BUOC de thead sticky chay duoc tren Chrome
          (border-collapse lam position:sticky tren <thead>/<th> bi vo hieu) */}
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-separate border-spacing-0 text-sm', className)}
        {...props}
      />
      {horizontalScroll ? <ScrollBar orientation="horizontal" /> : null}
    </ScrollArea>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>): React.JSX.Element {
  return (
    <thead
      data-slot="table-header"
      className={cn('sticky top-0 z-20 bg-[var(--surface)] shadow-[0_1px_0_0_var(--hairline)]', className)}
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
        // border-collapse da tat -> ke duong ke bang border tren tung o
        'transition-colors hover:bg-[var(--surface)] data-[state=selected]:bg-[var(--surface)] [&>td]:border-b [&>td]:border-[var(--hairline-soft)] [&>th]:border-b [&>th]:border-[var(--hairline-soft)] [&:last-child>td]:border-b-0',
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
