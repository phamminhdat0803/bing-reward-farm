import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

// Bundle đúng hàm production để kiểm tra các đường lỗi HTTP/JSON, không gọi mạng thật.
const bundled = await build({ entryPoints: ['src/main/core/rewards.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { readSerpBotScore } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)

function contextFor({ status = 200, payload, malformed = false, networkError = false, domPayload }) {
  let closed = false
  return {
    context: { newPage: async () => ({
      goto: async (url, options) => {
        assert.equal(url, 'https://rewards.bing.com/api/getuserinfo')
        assert.equal(options.timeout, 12000)
        if (networkError) throw new Error('private network details')
        return { ok: () => status >= 200 && status < 300, status: () => status, json: async () => {
          if (malformed) throw new SyntaxError('private HTML')
          return payload
        } }
      },
      close: async () => { closed = true },
      waitForFunction: async () => {},
      locator: () => ({ innerText: async () => domPayload === undefined ? '<html>sign in</html>' : JSON.stringify(domPayload) })
    }) },
    wasClosed: () => closed
  }
}

test('GET giữ số 0, thời gian nguồn và đóng tab phụ', async () => {
  const fake = contextFor({ payload: { profile: { attributes: { serpbotscore: '0', serpbotscore_upd: '2026-10-16T00:00:00Z' } } } })
  const result = await readSerpBotScore(fake.context)
  assert.equal(result.value, 0)
  assert.equal(result.updatedAt, '2026-10-16T00:00:00.000Z')
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)))
  assert.equal(fake.wasClosed(), true)
})

test('401 / HTML / mất mạng / thiếu trường không làm hỏng snapshot, không trả số 0', async () => {
  for (const options of [{ status: 401 }, { malformed: true }, { networkError: true }, { payload: {} }]) {
    const fake = contextFor(options)
    const result = await readSerpBotScore(fake.context)
    assert.equal(result.value, null)
    assert.ok(result.error)
    assert.ok(!result.error.includes('private'))
    assert.equal(fake.wasClosed(), true)
  }
})

test('Cốc Cốc: HTML bọc ngoài, JSON trong body vẫn được đọc đúng', async () => {
  const fake = contextFor({ malformed: true, domPayload: { profile: { attributes: { serpbotscore: '1' } } } })
  assert.equal((await readSerpBotScore(fake.context)).value, 1)
  assert.equal(fake.wasClosed(), true)
})
