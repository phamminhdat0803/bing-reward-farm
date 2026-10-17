// Run with node_modules/.bin/electron; synthetic key only, isolated userData, no window/network.
const { app, safeStorage } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brf-ai-encryption-'))
app.setPath('userData', dir)
app.whenReady().then(() => {
  let exitCode = 0
  try {
    assert.equal(safeStorage.isEncryptionAvailable(), true)
    const syntheticKey = 'synthetic-only-no-provider-access'
    const encrypted = safeStorage.encryptString(syntheticKey)
    fs.writeFileSync(path.join(dir, 'encrypted.bin'), encrypted)
    const saved = fs.readFileSync(path.join(dir, 'encrypted.bin'))
    assert.equal(saved.includes(Buffer.from(syntheticKey)), false)
    assert.equal(safeStorage.decryptString(saved), syntheticKey)
    console.log('PASS: Electron safeStorage encrypts/decrypts on this machine; synthetic key absent from disk bytes.')
  } catch (e) { console.error('FAIL: Electron safeStorage check failed:', e.code ?? e.name); exitCode = 1 }
  finally {
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()))
  assert.match(path.basename(dir), /^brf-ai-encryption-/)
    fs.rmSync(dir, { recursive: true, force: true })
    app.exit(exitCode)
  }
})
