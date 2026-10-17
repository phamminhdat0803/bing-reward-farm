export type KeywordUsage = { keyword: string; profileId: string; profileName: string; kind: 'desktop' | 'mobile' | 'history'; status: 'reserved' | 'used'; at: string }
export type KeywordLibrary = { version: 1; keywords: string[]; updatedAt: string | null; usage?: KeywordUsage[] }

export function keywordKey(keyword: string): string {
  return keyword.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')
}

export function normalizeKeywords(text: string): string[] {
  if (typeof text !== 'string' || text.length > 20_000_000) throw new Error('Danh sách quá lớn (tối đa 20 MB văn bản).')
  const seen = new Set<string>()
  const result: string[] = []
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const keyword = line.trim().replace(/^\d+[.)]\s+|^[-*•]\s+/, '').replace(/\s+/g, ' ').normalize('NFC')
    if (!keyword || keyword.startsWith('#') || keyword.startsWith('```')) continue
    if (keyword.length > 300) throw new Error('Mỗi từ khoá tối đa 300 ký tự.')
    const key = keyword.toLocaleLowerCase('en-US')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(keyword)
  }
  if (result.length > 100_000) throw new Error('Mỗi kho tối đa 100.000 từ khoá.')
  return result
}

export function keywordPrompt(count: number, topics: string, language = 'English'): string {
  if (!Number.isSafeInteger(count) || count < 1 || count > 100_000) throw new Error('Số lượng từ 1 đến 100.000.')
  return `Generate ${count} distinct, useful ${language} search queries for a personal search keyword library.
Topics of interest: ${topics.trim() || 'science, nature, cooking, technology, history, language learning, travel, arts, home and hobbies'}.
Use clear, meaningful queries with specific information needs. Mix short phrases and complete questions, beginner and advanced topics. Avoid duplicates, near-duplicates, unrelated word combinations, random numbers, repetitive templates, and keyword stuffing. Use dates only when relevant; do not invent current events.
Output plain text only: one query per line, no numbering, bullets, headings, explanations or code fences. If the full list exceeds the response limit, produce complete lines in batches and wait for me to ask you to continue. Do not repeat queries from earlier batches.`
}
