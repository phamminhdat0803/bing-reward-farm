// Cai dat app (nho trong userData/settings.json)
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type Settings = {
  /** Sang ngay moi thi tu mo trinh duyet lay point (nguoi dung bat/tat) */
  autoRefreshOnNewDay: boolean
  /** So giay cho giua 2 profile khi cap nhat hang loat */
  refreshGapMs: number
}

const DEFAULTS: Settings = { autoRefreshOnNewDay: true, refreshGapMs: 2000 }

const FILE = (): string => path.join(app.getPath('userData'), 'settings.json')

export function getSettings(): Settings {
  try {
    const s = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Partial<Settings>
    return { ...DEFAULTS, ...s }
  } catch {
    return { ...DEFAULTS }
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.writeFileSync(FILE(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch {
    /* bo qua */
  }
  return next
}
