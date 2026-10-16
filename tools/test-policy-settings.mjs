import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { build } from 'esbuild'

const output = await build({ entryPoints: ['src/main/settings.ts'], bundle: true, platform: 'node', format: 'esm', write: false, plugins: [{ name: 'settings-test', setup(build) {
  build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
  build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const app={getPath:()=>process.env.BRF_SETTINGS_TEST_DIR}', loader: 'js' }))
} }] })
const settings = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`)
test('chu kỳ lưu/đọc có whitelist; lỗi ghi không báo lưu thành công', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-settings-test-'))
  process.env.BRF_SETTINGS_TEST_DIR = dir
  try {
    assert.equal(settings.setSettings({ autoEveryMs: 900000 }).autoEveryMs, 900000)
    assert.throws(() => settings.setSettings({ autoEveryMs: 1 }))
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ autoEveryMs: 1 }))
    assert.equal(settings.getSettings().autoEveryMs, 0)
    fs.writeFileSync(path.join(dir, 'not-a-directory'), 'x')
    process.env.BRF_SETTINGS_TEST_DIR = path.join(dir, 'not-a-directory')
    assert.throws(() => settings.setSettings({ autoEveryMs: 0 }), /Không lưu được/)
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir())); assert.match(path.basename(dir), /^brf-settings-test-/)
    fs.rmSync(dir, { recursive: true, force: true }); delete process.env.BRF_SETTINGS_TEST_DIR
  }
})
