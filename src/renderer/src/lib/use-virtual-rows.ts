import { useLayoutEffect, useRef, useState } from 'react'

/** Fixed-height table rows inside the existing Radix viewport. */
export function useVirtualRows(count: number, resetKey: string, rowHeight = 56, headerHeight = 36) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 600 })
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let frame = 0
    const measure = (): void => {
      frame = 0
      setView(previous => {
        const next = { top: viewport.scrollTop, height: viewport.clientHeight }
        return previous.top === next.top && previous.height === next.height ? previous : next
      })
    }
    const onScroll = (): void => { if (!frame) frame = requestAnimationFrame(measure) }
    const observer = new ResizeObserver(onScroll)
    observer.observe(viewport)
    viewport.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      viewport.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollTop = 0
    setView(previous => ({ ...previous, top: 0 }))
  }, [resetKey])
  const visible = Math.max(1, Math.ceil(view.height / rowHeight))
  const first = Math.min(Math.max(0, count - visible), Math.max(0, Math.floor((view.top - headerHeight) / rowHeight)))
  const start = Math.max(0, first - 8)
  const end = Math.min(count, first + visible + 8)
  return { viewportRef, start, end, paddingTop: start * rowHeight, paddingBottom: (count - end) * rowHeight }
}
