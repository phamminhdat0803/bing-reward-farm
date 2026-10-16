/** Chỉ nhận số ngay sau nhãn; không lấy nhầm bonus hoặc tiến độ streak bên dưới. */
function labeledNumber(text: string, label: string): number | null {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const match = normalized.match(new RegExp(`\\b${label}\\s*:?\\s*(\\d[\\d.,]*)(?![\\d.,])\\b`, 'i'))
  if (!match) return null
  const value = Number(match[1].replace(/[.,]/g, ''))
  return Number.isSafeInteger(value) ? value : null
}

export function parseDailyStreak(text: string): number | null {
  return labeledNumber(text, 'Daily streak')
}

export function parseReadyToClaim(text: string): number | null {
  return labeledNumber(text, 'Ready to claim')
}

/** Hai vị trí được quan sát trong JSON thật; không quét nhầm trường score khác. */
export function parseSerpBotScore(payload: unknown): { value: number; updatedAt: string | null } | null {
  const object = (v: unknown): Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
  const root = object(payload)
  const attributes = [
    object(object(object(root.dashboard).userProfile).attributes),
    object(object(root.profile).attributes)
  ]
  for (const attrs of attributes) {
    const raw = attrs.serpbotscore
    if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) continue
    const value = Number(raw)
    if (!Number.isFinite(value) || value < 0 || value > 1) continue
    const updated = attrs.serpbotscore_upd
    const updatedAt = typeof updated === 'string' && Number.isFinite(Date.parse(updated))
      ? new Date(updated).toISOString()
      : null
    return { value, updatedAt }
  }
  return null
}
