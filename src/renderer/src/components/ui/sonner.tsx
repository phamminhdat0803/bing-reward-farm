import * as React from 'react'
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon
} from 'lucide-react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

const Toaster = ({ ...props }: ToasterProps): React.JSX.Element => {
  return (
    <Sonner
      theme="light"
      className="toaster group font-sans text-sm"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--success-text)]" />,
        info: <InfoIcon className="size-4 text-[var(--brand-blue-deep)]" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--warning)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--error)]" />,
        loading: <Loader2Icon className="size-4 animate-spin text-[var(--steel)]" />
      }}
      style={
        {
          '--normal-bg': 'var(--canvas)',
          '--normal-text': 'var(--ink)',
          '--normal-border': 'var(--hairline)',
          '--border-radius': '12px'
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
