import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { normalizeKeywords, type KeywordLibrary } from '../shared/keywords'
import { keywordUsage } from './keyword-usage'

const file = (): string => path.join(app.getPath('userData'), 'keywords.json')

export function getKeywords(): KeywordLibrary {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8')) as KeywordLibrary
    if (!Array.isArray(data.keywords) || !data.keywords.every(k => typeof k === 'string')) throw new Error('Kho từ khoá không hợp lệ.')
    const keywords = normalizeKeywords(data.keywords.join('\n'))
    return { version: 1, keywords, updatedAt: data.updatedAt ?? null, usage: keywordUsage(keywords) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, keywords: [], updatedAt: null, usage: [] }
    throw error
  }
}

export function saveKeywords(text: string, mode: 'append' | 'replace'): KeywordLibrary {
  if (mode !== 'append' && mode !== 'replace') throw new Error('Chế độ nạp không hợp lệ.')
  const incoming = normalizeKeywords(text)
  if (!incoming.length) throw new Error('Chưa có từ khoá hợp lệ để nạp.')
  const keywords = mode === 'append' ? normalizeKeywords([...getKeywords().keywords, ...incoming].join('\n')) : incoming
  const data: KeywordLibrary = { version: 1, keywords, updatedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(`${file()}.tmp`, JSON.stringify(data), 'utf8')
  fs.renameSync(`${file()}.tmp`, file())
  return { ...data, usage: keywordUsage(keywords) }
}
