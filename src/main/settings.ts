// Cai dat app (nho trong userData/settings.json)
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type Settings = {
  /** Sang ngay moi thi tu mo trinh duyet lay point (nguoi dung bat/tat) */
  autoRefreshOnNewDay: boolean
  /** So giay cho giua 2 profile khi cap nhat hang loat (chi de lech nhip khoi dong) */
  refreshGapMs: number
  /**
   * So tai khoan cap nhat point SONG SONG khi bam "Cap nhat trang thai".
   * Moi acc la 1 profile + 1 cua so rieng nen chay song song duoc; 1 = chay tuan tu.
   */
  refreshParallel: number
  /**
   * BAT = khi toan bo proxy deu chet thi DUNG profile, khong bao gio roi ve mang that (DIRECT).
   * TAT = cho phep chay truc tiep bang IP cua may khi het proxy (khong khuyen nghi).
   */
  noDirectFallback: boolean
  /** BAT = chay an (headless) khi automation; TAT = hien cua so trinh duyet (mac dinh) */
  runHeadless: boolean
  /**
   * Gioi han TONG so job song song (tuy chon). 0 = khong gioi han:
   * cac TAI KHOAN KHAC NHAU chay song song, con nhieu lenh tren CUNG mot acc thi xep hang doi rieng.
   */
  maxParallelRuns: number
  /**
   * Chu ky che do TU DONG (ms): cu moi chu ky chay lai cac task con thieu cho toi khi du diem.
   * 0 = tat · 60000 = moi phut · 3600000 = moi gio · 10800000 = moi 3 gio.
   */
  autoEveryMs: number
  /** Auto-cycle account workers: 1 = sequential; independent from refreshParallel. */
  autoParallelRuns: number
}

const DEFAULTS: Settings = {
  autoRefreshOnNewDay: true,
  refreshGapMs: 800,
  refreshParallel: 3,
  noDirectFallback: true,
  runHeadless: false,
  maxParallelRuns: 0,
  autoEveryMs: 0,
  autoParallelRuns: 1
}

const FILE = (): string => path.join(app.getPath('userData'), 'settings.json')
export const AUTO_INTERVALS = [0, 60000, 900000, 3600000, 10800000] as const

export function getSettings(): Settings {
  try {
    const s = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Partial<Settings>
    const settings = { ...DEFAULTS, ...s }
    if (!Number.isSafeInteger(settings.autoParallelRuns) || settings.autoParallelRuns < 1 || settings.autoParallelRuns > 10) settings.autoParallelRuns = 1
    if (!(AUTO_INTERVALS as readonly number[]).includes(settings.autoEveryMs)) settings.autoEveryMs = 0
    return settings
  } catch {
    return { ...DEFAULTS }
  }
}

export function setSettings(patch: Partial<Settings>): Settings {
  if (patch.autoParallelRuns !== undefined && (!Number.isSafeInteger(patch.autoParallelRuns) || patch.autoParallelRuns < 1 || patch.autoParallelRuns > 10)) throw new Error('Điều phối tự động phải từ 1 đến 10 tài khoản.')
  if (patch.autoEveryMs !== undefined && !(AUTO_INTERVALS as readonly number[]).includes(patch.autoEveryMs)) throw new Error('Chu kỳ tự động không hợp lệ')
  const next = { ...getSettings(), ...patch }
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.writeFileSync(FILE(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  } catch {
    throw new Error('Không lưu được cài đặt ứng dụng; vui lòng kiểm tra quyền ghi thư mục dữ liệu')
  }
  return next
}
