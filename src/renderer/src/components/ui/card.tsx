import * as React from 'react'
import { cn } from '@renderer/lib/utils'

// MiniMax: card-base = canvas + 1px hairline + radius 16px, KHÔNG đổ bóng.
function Card({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col rounded-[16px] border border-[var(--hairline)] bg-[var(--canvas)] text-[var(--ink)]',
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-header" className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-title"
      className={cn('text-[20px] font-semibold leading-[1.4]', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div
      data-slot="card-description"
      className={cn('text-[13px] leading-[1.7] text-[var(--steel)]', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-content" className={cn('p-4 pt-0', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>): React.JSX.Element {
  return <div data-slot="card-footer" className={cn('flex items-center gap-2 p-4 pt-0', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
