export type AiMode = 'chat' | 'responses'
export type KeywordAiConfig = { baseURL: string; model: string; apiMode: AiMode; hasKey: boolean; encryptionAvailable: boolean }
export type KeywordAiConfigInput = { baseURL: string; model: string; apiMode: AiMode; apiKey?: string; clearKey?: boolean }
export type KeywordAiRequest = { count: number; language: string; topics: string; batchSize: number }
export type KeywordAiJob = {
  id: string; status: 'idle' | 'running' | 'completed' | 'stopped' | 'failed'
  requested: number; keywords: string[]; batches: number; tokens: number; error: string | null
  startedAt: string | null; updatedAt: string | null
}
export const emptyAiJob = (): KeywordAiJob => ({ id: '', status: 'idle', requested: 0, keywords: [], batches: 0, tokens: 0, error: null, startedAt: null, updatedAt: null })

export function validateAiConfig(input: KeywordAiConfigInput): Omit<KeywordAiConfigInput, 'apiKey' | 'clearKey'> {
  if (!input || typeof input.baseURL !== 'string' || typeof input.model !== 'string') throw new Error('Cấu hình AI không hợp lệ.')
  let url: URL
  try { url = new URL(input.baseURL.trim()) } catch { throw new Error('Base URL không hợp lệ.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('Endpoint cần HTTPS; HTTP chỉ dùng cho localhost.')
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL không được chứa tài khoản, query hoặc fragment.')
  if (/\/(chat\/completions|responses)\/?$/.test(url.pathname)) throw new Error('Nhập Base URL (ví dụ https://api.openai.com/v1), không kèm /chat/completions hoặc /responses.')
  const model = input.model.trim()
  if (!model || model.length > 200 || /[\r\n]/.test(model)) throw new Error('Nhập tên model hợp lệ (tối đa 200 ký tự).')
  if (!['chat', 'responses'].includes(input.apiMode)) throw new Error('Chọn Chat Completions hoặc Responses.')
  return { baseURL: url.toString().replace(/\/+$/, ''), model, apiMode: input.apiMode }
}

export function validateAiRequest(input: KeywordAiRequest): KeywordAiRequest {
  if (!input || !Number.isSafeInteger(input.count) || input.count < 1 || input.count > 10000) throw new Error('Mỗi lượt AI tạo từ 1 đến 10.000 từ khoá.')
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 10 || input.batchSize > 300) throw new Error('Mỗi đợt từ 10 đến 300 từ khoá.')
  if (typeof input.language !== 'string' || !input.language.trim() || input.language.length > 80 || typeof input.topics !== 'string' || input.topics.length > 4000) throw new Error('Ngôn ngữ hoặc chủ đề không hợp lệ.')
  return { count: input.count, batchSize: input.batchSize, language: input.language.trim(), topics: input.topics.trim() }
}
