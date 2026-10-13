import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('vi-VN')
}

export function pct(progress: number | null | undefined, max: number | null | undefined): number {
  if (!progress || !max) return 0
  return Math.min(100, Math.round((progress / max) * 100))
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'chưa chạy'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'vừa xong'
  if (m < 60) return `${m} phút trước`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} giờ trước`
  return `${Math.floor(h / 24)} ngày trước`
}
