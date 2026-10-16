// Xuat "log tai khoan" dang text de nguoi dung doc / gui agent.
// Nguon: cache.json (so lieu hom nay), state/<id>.json (lich su ngay), logs/<id>/<ngay>.log (log tho),
//        escalations/*.json (diem khong len), proxies (chain cua acc), settings (che do chay).
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { get } from './cache'
import { loadStore } from './profiles'
import { getSettings } from './settings'
import { listProxies, resolveProxyChain } from './proxies'
import type { Profile } from '../shared/types'

const ROOT = (): string => app.getPath('userData')

function tail(file: string, lines: number): string[] {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-lines)
  } catch {
    return []
  }
}

function header(title: string): string {
  return `${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`
}

function profileBlock(p: Profile, logLines: number): string {
  const out: string[] = []
  const c = get(p.id)
  const chain = resolveProxyChain(p)
  const proxies = listProxies()
  const label = (id: string | null | undefined): string => {
    if (!id) return '(không có)'
    const it = proxies.find((x) => x.id === id)
    return it ? `${it.label} — ${it.url}` : `${id} (đã xoá khỏi kho)`
  }

  out.push('')
  out.push(`### ${p.name}  <${p.account || p.id}>`)
  out.push(`- id: ${p.id} · trình duyệt: ${p.channel === 'chrome' ? 'Chrome' : 'Edge'} · CDP: ${p.cdpPort ?? '?'}`)
  out.push(`- hạn mức cấu hình: desktop ${p.desktopMax ?? 'auto'} · mobile ${p.mobileMax ?? 'auto'}`)
  out.push(`- proxy chính: ${label(p.proxyId)}`)
  if ((p.proxyFallbacks ?? []).length) out.push(`- proxy dự phòng: ${(p.proxyFallbacks ?? []).map((f) => label(f)).join(' | ')}`)
  out.push(`- chuỗi thực tế khi chạy: ${chain.length ? chain.join(' -> ') : '(DIRECT — không dùng proxy)'}`)

  if (c) {
    out.push(
      `- số liệu đã lưu (${c.date} · cập nhật ${new Date(c.at).toLocaleString('vi-VN')}): ` +
        `đăng nhập=${c.signedIn} · điểm=${c.points ?? '?'} · hôm nay=${c.todayPoints ?? '?'} · level=${c.level ?? '?'}`
    )
    out.push(
      `- tiến độ: desktop ${c.desktop?.progress ?? 0}/${c.desktop?.max ?? '?'} · mobile ${c.mobile?.progress ?? 0}/${c.mobile?.max ?? '?'} · ` +
        `daily set ${c.dailySet?.progress ?? 0}/${c.dailySet?.max ?? '?'} · keep earning ${c.earn?.progress ?? 0}/${c.earn?.max ?? '?'} · offers ${c.offers ?? 0}`
    )
    out.push(`- Daily streak (Earn): ${c.dailyStreak == null ? 'chưa đọc được' : `${c.dailyStreak} ngày`} · Ready to claim (Dashboard): ${c.readyToClaim ?? 'chưa đọc được'}`)
    out.push(`- serpbotscore: ${c.serpBotScore?.value ?? 'chưa đọc được'} / 1 · nguồn cập nhật: ${c.serpBotScore?.updatedAt ?? '?'} · đọc lúc: ${c.serpBotScore?.checkedAt ?? '?'}${c.serpBotScore?.error ? ` · ${c.serpBotScore.error}` : ''}`)
    if (c.earn?.blocked?.length) out.push(`- mục bị khoá: ${c.earn.blocked.map((b) => `${b.label} (${b.reason})`).join(' | ')}`)
  } else {
    out.push('- số liệu: chưa có (chưa chạy lần nào)')
  }

  // lich su vai ngay gan nhat
  try {
    const st = JSON.parse(fs.readFileSync(path.join(ROOT(), 'state', `${p.id}.json`), 'utf8')) as {
      days?: Record<string, Record<string, { searches?: number; pointsBefore?: number; pointsAfter?: number }>>
    }
    const days = Object.keys(st.days ?? {})
      .sort()
      .slice(-5)
    if (days.length) {
      out.push('- lịch sử gần đây:')
      for (const d of days) {
        const day = st.days?.[d] ?? {}
        const part = (k: string): string => {
          const t = day[k]
          if (!t) return `${k} —`
          const gain = t.pointsBefore != null && t.pointsAfter != null ? t.pointsAfter - t.pointsBefore : null
          return `${k} ${t.searches ?? 0} search${gain != null ? ` (+${gain})` : ''}`
        }
        out.push(`  · ${d}: ${part('desktop')} · ${part('mobile')} · ${part('daily')} · ${part('earn')}`)
      }
    }
  } catch {
    /* bo qua */
  }

  // ho so leo thang
  try {
    const dir = path.join(ROOT(), 'escalations')
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.includes(`-${p.id}-`))
      .slice(-4)
    if (files.length) {
      out.push('- hồ sơ cần phân tích:')
      for (const f of files) {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { task?: string; summary?: string }
          out.push(`  · ${f} — ${j.summary ?? j.task ?? ''}`)
        } catch {
          out.push(`  · ${f}`)
        }
      }
    }
  } catch {
    /* bo qua */
  }

  // log tho
  const logFile = path.join(ROOT(), 'logs', p.id, `${new Date().toISOString().slice(0, 10)}.log`)
  const lines = tail(logFile, logLines)
  if (lines.length) {
    out.push(`- ${lines.length} dòng log gần nhất (${path.basename(logFile)}):`)
    for (const l of lines) out.push(`    ${l}`)
  }
  return out.join('\n')
}

/** Log tong hop tat ca tai khoan (hoac 1 tai khoan) — text de copy/luu file. */
export function buildAccountsLog(opts: { profileId?: string; logLines?: number } = {}): string {
  const st = loadStore()
  const s = getSettings()
  const profiles = st.profiles.filter((p) => !opts.profileId || p.id === opts.profileId)
  const out: string[] = []
  out.push(header('REWARD FARM — LOG TÀI KHOẢN'))
  out.push(`Xuất lúc: ${new Date().toLocaleString('vi-VN')}`)
  out.push(
    `Cài đặt: headless=${s.runHeadless} · chặn fallback DIRECT=${s.noDirectFallback} · cập nhật song song=${s.refreshParallel} · ` +
      `tự động=${s.autoEveryMs > 0 ? `mỗi ${Math.round(s.autoEveryMs / 60000)} phút` : 'tắt'}`
  )
  out.push(`Số tài khoản: ${profiles.length} · kho proxy: ${listProxies().length}`)
  for (const p of profiles) out.push(profileBlock(p, opts.logLines ?? 25))
  out.push('')
  out.push(header('HẾT'))
  return `${out.join('\n')}\n`
}
