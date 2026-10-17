import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, safeStorage } from 'electron'
import OpenAI from 'openai'
import { normalizeKeywords, keywordPrompt } from '../shared/keywords'
import { emptyAiJob, validateAiConfig, validateAiRequest, type KeywordAiConfig, type KeywordAiConfigInput, type KeywordAiJob, type KeywordAiRequest } from '../shared/keyword-ai'
import { getKeywords } from './keywords'

type StoredConfig = { baseURL: string; model: string; apiMode: 'chat' | 'responses'; encryptedKey?: string }
const configFile = (): string => path.join(app.getPath('userData'), 'keyword-ai.json')
const jobFile = (): string => path.join(app.getPath('userData'), 'keyword-ai-draft.json')
function readConfig(): StoredConfig {
  try { return JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { baseURL: 'https://api.openai.com/v1', model: '', apiMode: 'chat' }; throw new Error('Không đọc được cấu hình AI.') }
}
function writeAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data), { encoding: 'utf8', mode: 0o600 })
  fs.renameSync(`${file}.tmp`, file)
}
export function getKeywordAiConfig(): KeywordAiConfig {
  const config = readConfig()
  return { baseURL: config.baseURL, model: config.model, apiMode: config.apiMode, hasKey: !!config.encryptedKey, encryptionAvailable: safeStorage.isEncryptionAvailable() }
}
export function saveKeywordAiConfig(input: KeywordAiConfigInput): KeywordAiConfig {
  if (controller || testing) throw new Error('Dừng tạo từ khoá trước khi đổi cấu hình AI.')
  const checked = validateAiConfig(input)
  const previous = readConfig()
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 8192 || /[\r\n]/.test(input.apiKey))) throw new Error('API key không hợp lệ.')
  const key = input.apiKey?.trim()
  let encryptedKey = previous.encryptedKey
  if (input.clearKey) encryptedKey = undefined
  else if (key) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Máy chưa hỗ trợ lưu key mã hoá. Không lưu key dạng văn bản.')
    encryptedKey = safeStorage.encryptString(key).toString('base64')
  } else if (previous.baseURL !== checked.baseURL && encryptedKey) {
    throw new Error('Đổi endpoint cần nhập lại API key cho endpoint mới hoặc xoá key đã lưu.')
  }
  writeAtomic(configFile(), { ...checked, encryptedKey })
  return getKeywordAiConfig()
}

// Do not follow endpoint redirects with the user's key. Bound provider responses.
const boundedFetch: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: 'error' })
  const reader = response.body?.getReader()
  if (!reader) return response
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 2_000_000) throw new Error('Provider response too large')
      chunks.push(chunk.value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  const headers = new Headers(response.headers)
  headers.delete('content-encoding'); headers.delete('content-length')
  return new Response(Buffer.concat(chunks), { status: response.status, statusText: response.statusText, headers })
}
function client(): { sdk: OpenAI; config: StoredConfig } {
  const config = readConfig()
  validateAiConfig(config)
  if (!config.encryptedKey) throw new Error('Chưa lưu API key trong Cấu hình AI.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Không thể mở key đã mã hoá trên máy này.')
  let apiKey: string
  try { apiKey = safeStorage.decryptString(Buffer.from(config.encryptedKey, 'base64')) }
  catch { throw new Error('Không giải mã được API key. Vui lòng nhập và lưu lại key.') }
  return { config, sdk: new OpenAI({ apiKey, baseURL: config.baseURL, organization: null, project: null, maxRetries: 0, timeout: 90000, logLevel: 'off', fetch: boundedFetch }) }
}
function safeError(error: unknown): string {
  const status = (error as { status?: number })?.status
  if (status === 401 || status === 403) return `AI từ chối xác thực (HTTP ${status}). Kiểm tra API key/quyền model.`
  if (status === 429) return 'AI giới hạn lượt gọi hoặc hết quota (HTTP 429).'
  if (status === 404) return 'Không tìm thấy endpoint hoặc model (HTTP 404). Kiểm tra Base URL và kiểu API.'
  if (typeof status === 'number') return `AI trả HTTP ${status}. Kiểm tra endpoint, model và kiểu API.`
  return 'Không nhận được kết quả AI hợp lệ. Kiểm tra kết nối, endpoint hoặc giới hạn đầu ra; không tự gọi lại.'
}
async function complete(sdk: OpenAI, config: StoredConfig, prompt: string, tokens: number, signal: AbortSignal): Promise<{ text: string; tokens: number }> {
  if (config.apiMode === 'responses') {
    const result = await sdk.responses.create({ model: config.model, input: prompt, max_output_tokens: tokens, store: false }, { signal })
    const text = result.output_text || result.output?.flatMap(item => item.type === 'message' ? item.content.filter(c => c.type === 'output_text').map(c => c.text) : []).join('\n') || ''
    if (result.status !== 'completed' && result.status !== 'incomplete') throw new Error('Invalid response')
    return { text: result.status === 'incomplete' ? text.split('\n').slice(0, -1).join('\n') : text, tokens: result.usage?.total_tokens ?? 0 }
  }
  const result = await sdk.chat.completions.create({ model: config.model, messages: [{ role: 'user', content: prompt }], max_completion_tokens: tokens }, { signal })
  const choice = result.choices?.[0]
  const text = choice?.message?.content ?? ''
  return { text: choice?.finish_reason === 'length' ? text.split('\n').slice(0, -1).join('\n') : text, tokens: result.usage?.total_tokens ?? 0 }
}
let testing = false
let controller: AbortController | null = null
let current: KeywordAiJob | null = null
export function getKeywordAiJob(): KeywordAiJob {
  if (!current) {
    try {
      current = JSON.parse(fs.readFileSync(jobFile(), 'utf8')) as KeywordAiJob
      current.keywords = normalizeKeywords(current.keywords.join('\n'))
      if (current.status === 'running') current = { ...current, status: 'stopped', error: 'Ứng dụng đã khởi động lại. Kết quả các đợt đã hoàn tất được giữ lại.' }
    } catch { current = emptyAiJob() }
  }
  return { ...current, keywords: [...current.keywords] }
}
function persist(): void {
  if (!current) return
  current.updatedAt = new Date().toISOString()
  writeAtomic(jobFile(), current)
}
export function stopKeywordAi(): KeywordAiJob {
  controller?.abort()
  return getKeywordAiJob()
}
export async function testKeywordAi(): Promise<{ ok: boolean; error?: string }> {
  if (controller || testing) return { ok: false, error: 'Đang có lượt AI chạy.' }
  testing = true
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 30000)
  try {
    const { sdk, config } = client()
    const response = await complete(sdk, config, 'Reply with exactly OK.', 64, abort.signal)
    return response.text.trim() ? { ok: true } : { ok: false, error: 'Model không trả nội dung. Kiểm tra cấu hình hoặc giới hạn đầu ra.' }
  } catch (e) { return { ok: false, error: safeError(e) } }
  finally { clearTimeout(timer); testing = false }
}
export function startKeywordAi(input: KeywordAiRequest): KeywordAiJob {
  if (controller || testing) throw new Error('Đang có lượt tạo từ khoá chạy. Dừng trước khi tạo lượt mới.')
  const request = validateAiRequest(input)
  const { sdk, config } = client()
  const excluded = new Set(getKeywords().keywords.map(k => k.toLocaleLowerCase('en-US')))
  const abort = new AbortController()
  controller = abort
  current = { ...emptyAiJob(), id: randomUUID(), status: 'running', requested: request.count, startedAt: new Date().toISOString() }
  try { persist() } catch { controller = null; throw new Error('Không lưu được bản nháp AI.') }
  void (async () => {
    let stalled = 0
    try {
      const maxBatches = Math.ceil(request.count / request.batchSize) + 3
      while (!abort.signal.aborted && current!.keywords.length < request.count && current!.batches < maxBatches && stalled < 3) {
        const amount = Math.min(request.batchSize, request.count - current!.keywords.length)
        const prompt = keywordPrompt(amount, request.topics, request.language) + `\nUse this language for every query: ${request.language}.\nThis is batch ${current!.batches + 1}. Return at most ${amount} complete queries.\nAvoid these recent queries: ${JSON.stringify(current!.keywords.slice(-200))}`
        const result = await complete(sdk, config, prompt, Math.max(2048, Math.min(16000, amount * 40)), abort.signal)
        if (abort.signal.aborted) break
        const incoming = normalizeKeywords(result.text)
        const before = current!.keywords.length
        for (const keyword of incoming) {
          const key = keyword.toLocaleLowerCase('en-US')
          if (excluded.has(key)) continue
          excluded.add(key); current!.keywords.push(keyword)
          if (current!.keywords.length === request.count) break
        }
        current!.batches++; current!.tokens += result.tokens
        stalled = current!.keywords.length === before ? stalled + 1 : 0
        persist()
      }
      current!.status = abort.signal.aborted ? 'stopped' : current!.keywords.length >= request.count ? 'completed' : 'failed'
      if (current!.status === 'failed') current!.error = 'AI chưa tạo đủ từ mới trong giới hạn số đợt. Có thể dùng phần đã tạo hoặc tạo lượt khác.'
    } catch (e) {
      current!.status = abort.signal.aborted ? 'stopped' : 'failed'
      current!.error = abort.signal.aborted ? null : safeError(e)
    } finally {
      try { persist() } catch { current!.status = 'failed'; current!.error = 'Không lưu được bản nháp AI.' }
      controller = null
    }
  })()
  return getKeywordAiJob()
}
