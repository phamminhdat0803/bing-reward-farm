// Logger: ra console + file + callback (de stream len renderer qua IPC)
import fs from 'node:fs'
import path from 'node:path'
import type { Logger, LogLevel, LogLine } from './types'

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger(opts: {
  dir: string
  level?: LogLevel
  profileId?: string
  onLine?: (line: LogLine) => void
}): Logger {
  const { dir, level = 'info', profileId, onLine } = opts
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch {
    /* bo qua */
  }
  const min = LEVELS[level] ?? 20

  const stamp = (): string => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }

  const fileOf = (): string => {
    const d = new Date()
    const p = (n: number): string => String(n).padStart(2, '0')
    return path.join(dir, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`)
  }

  const emit = (lvl: LogLevel, msg: string): void => {
    if (LEVELS[lvl] < min) return
    const at = stamp()
    const line = `${at} [${lvl.toUpperCase().padEnd(5)}] ${msg}`
    try {
      fs.appendFileSync(fileOf(), `${line}\n`, 'utf8')
    } catch {
      /* bo qua */
    }
    if (lvl === 'error') console.error(line)
    else console.log(line)
    onLine?.({ at, level: lvl, msg, profileId })
  }

  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m)
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, Math.max(0, ms)))

/** Sleep co the bi huy lap tuc khi shouldStop() tra ve true (kiem tra moi 200ms). */
export function cancellableSleep(ms: number, shouldStop?: () => boolean): Promise<void> {
  if (ms <= 0 || shouldStop?.()) return Promise.resolve()
  const step = 200
  let elapsed = 0
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      elapsed += step
      if (elapsed >= ms || shouldStop?.()) {
        clearInterval(timer)
        resolve()
      }
    }, step)
  })
}

export const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
