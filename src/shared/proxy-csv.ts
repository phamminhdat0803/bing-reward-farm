export type ImportedProxy = { url: string; label?: string; note?: string; status?: 'active' | 'unused' | 'blacklisted' }

/** RFC-style quoted fields, including commas, escaped quotes and newlines. */
export function parseProxyCsv(text: string): ImportedProxy[] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  text = text.replace(/^\uFEFF/, '')
  const delimiter = text.split(/\r?\n/, 1)[0].includes(';') && !text.split(/\r?\n/, 1)[0].includes(',') ? ';' : ','
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (!quoted && (ch === delimiter || ch === '\n')) {
      row.push(field.replace(/\r$/, '')); field = ''
      if (ch === '\n') { rows.push(row); row = [] }
    } else field += ch
  }
  if (quoted) throw new Error('CSV có dấu ngoặc kép chưa đóng.')
  row.push(field.replace(/\r$/, '')); rows.push(row)
  const nonempty = rows.filter(r => r.some(v => v.trim()))
  if (!nonempty.length) throw new Error('CSV trống.')
  const header = nonempty.shift()!.map(v => v.trim().toLowerCase())
  const urlIndex = header.findIndex(v => ['url', 'proxy', 'proxy_url'].includes(v))
  if (urlIndex < 0) throw new Error('CSV cần có cột url hoặc proxy.')
  const value = (r: string[], names: string[]): string => r[header.findIndex(v => names.includes(v))]?.trim() ?? ''
  return nonempty.map((r, i) => {
    const url = r[urlIndex]?.trim() ?? ''
    if (!/^(?:(?:https?|socks4|socks5):\/\/)?[^\s,;]+:\d+(?::[^\s]*)?\/?$/i.test(url)) throw new Error(`Dòng ${i + 2}: chuỗi proxy không hợp lệ.`)
    const status = value(r, ['status', 'trang_thai']) || 'active'
    if (!['active', 'unused', 'blacklisted'].includes(status)) throw new Error(`Dòng ${i + 2}: trạng thái không hợp lệ.`)
    return { url, label: value(r, ['ten', 'label', 'name']), note: value(r, ['note', 'ghi_chu']), status: status as ImportedProxy['status'] }
  })
}
