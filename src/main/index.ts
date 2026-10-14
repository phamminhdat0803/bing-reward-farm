import { join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { addProfile, getProfile, loadStore, removeProfile, updateProfile } from './profiles'
import { browserState, closeBrowser, openBrowser } from './browsers'
import { openLoginWindow, refreshMany, resetProfile, runState, signOut, snapshot, startRun, stopRun } from './runner'
import * as cache from './cache'
import { detectBrowsers } from './browser-detect'
import { testProxy } from './proxy-test'
import { addProxy, addProxyBulk, listProxies, removeProxy, removeProxies, testAll, testAndSave, updateProxy } from './proxies'
import { getSettings, setSettings } from './settings'
import type { LogLine } from './core/types'
import type { RowState } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1680,
    height: 1000,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    title: 'Bing Reward Farm',
    backgroundColor: '#0b0f14',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL']
    const q = new URLSearchParams()
    if (process.env.BRF_DRAWER) q.set('drawer', '1')
    if (process.env.BRF_DOCK) q.set('dock', '1')
    if (process.env.BRF_BROWSERS) q.set('browsers', '1')
    if (process.env.BRF_TAB) q.set('tab', String(process.env.BRF_TAB))
    const qs = q.toString()
    mainWindow.loadURL(qs ? `${base}/?${qs}` : base)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.once('did-finish-load', () => {
    if (is.dev) console.log(`[renderer-url] ${mainWindow?.webContents.getURL()}`)
  })

  // Tien ich dev: BRF_TEST_ACCOUNT=1 -> tu mo hop "Them tai khoan", chan doan lop phu + thu go phim that
  if (process.env.BRF_TEST_ACCOUNT) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          try {
            const diag = await wc.executeJavaScript(`(async () => {
              const btn = [...document.querySelectorAll('button')].find((b) => /Thêm tài khoản/.test(b.textContent || ''))
              if (!btn) return { error: 'khong thay nut Them tai khoan' }
              btn.click()
              await new Promise((r) => setTimeout(r, 900))
              const input = document.querySelector('#a-name')
              if (!input) return { error: 'hop mo nhung khong thay #a-name' }
              const r = input.getBoundingClientRect()
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              const chain = (el) => { const o = []; let c = el; while (c && o.length < 5) { o.push(c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + (c.className ? '.' + String(c.className).split(' ').slice(0, 2).join('.') : '')); c = c.parentElement } return o }
              const dlg = document.querySelector('[role="dialog"]')
              const ov = document.querySelector('[data-slot="dialog-overlay"]')
              return {
                dialogVisible: dlg ? getComputedStyle(dlg).display !== 'none' : false,
                inputDisabled: input.disabled,
                inputReadOnly: input.readOnly,
                inputPointerEvents: getComputedStyle(input).pointerEvents,
                topElement: top ? chain(top) : null,
                isInputOnTop: top === input || (top && input.contains(top)),
                zIndex: { dialog: dlg ? getComputedStyle(dlg).zIndex : null, overlay: ov ? getComputedStyle(ov).zIndex : null },
                rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
              }
            })()`)
            console.log(`[test-account] chan doan: ${JSON.stringify(diag)}`)

            await wc.executeJavaScript(`document.querySelector('#a-name')?.focus(); document.activeElement?.id ?? ''`)
            const focused = await wc.executeJavaScript(`document.activeElement?.id ?? document.activeElement?.tagName ?? ''`)
            console.log(`[test-account] activeElement sau focus: ${focused}`)

            for (const ch of 'Acc003') {
              wc.sendInputEvent({ type: 'char', keyCode: ch })
              await new Promise((r) => setTimeout(r, 60))
            }
            await new Promise((r) => setTimeout(r, 300))
            const value = await wc.executeJavaScript(`document.querySelector('#a-name')?.value ?? '(khong co input)'`)
            console.log(`[test-account] gia tri input sau khi go: ${JSON.stringify(value)}`)
            console.log(`[test-account] KET QUA: ${value === 'Acc003' ? 'GO DUOC' : 'KHONG GO DUOC'}`)
          } catch (e) {
            console.error('[test-account] loi', e)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 6000))
    })
  }

  // Tien ich dev: BRF_BULK_FILE=<duong dan> -> nap danh sach proxy tu file qua dung duong bulk add
  // BRF_TEST_ALL=1 -> sau khi nap thi test tat ca (do luong that)
  if (process.env.BRF_BULK_FILE) {
    void (async () => {
      try {
        const fs = await import('node:fs')
        const lines = fs.readFileSync(String(process.env.BRF_BULK_FILE), 'utf8').split(/\r?\n/)
        const r = addProxyBulk(lines)
        console.log(`[bulk] them ${r.added.length} proxy, bo qua ${r.skipped} dong trung`)
        if (process.env.BRF_TEST_ALL) {
          const t0 = Date.now()
          const res = await testAll()
          const ok = Object.values(res).filter((x) => x.ok).length
          console.log(`[bulk] test tat ca: ${ok}/${Object.keys(res).length} chay duoc trong ${Math.round((Date.now() - t0) / 1000)}s`)
        }
      } catch (e) {
        console.error('[bulk] loi', e)
      }
    })()
  }

  // Tien ich dev: BRF_SEED_PROXY=1 -> them 2 proxy mau vao kho (de kiem thu tab Proxy)
  if (process.env.BRF_SEED_PROXY) {
    void (async () => {
      const cur = listProxies()
      if (cur.length === 0) {
        addProxy({ label: 'Demo HTTP (khong that)', url: 'http://127.0.0.1:8888', note: 'proxy mau de thu test' })
        addProxy({ label: 'Demo SOCKS5', url: 'socks5://127.0.0.1:1080', note: 'proxy mau' })
      }
      // test luon de thay cot ket qua (2 proxy mau nay se bao loi — dung de kiem thu duong test)
      await testAll()
    })()
  }

  // Tien ich dev: BRF_TEST_DRAWER=1 -> tu bam lan luot cac dong trong bang va bao trang thai drawer
  // (de kiem chung loi "bam dong 2 la tat drawer")
  if (process.env.BRF_TEST_DRAWER) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          const read = (): Promise<string> =>
            wc.executeJavaScript(`(() => {
              const d = document.querySelector('[data-slot="sheet-content"]')
              if (!d) return '(khong co drawer)'
              const t = d.querySelector('[data-slot="sheet-title"]')
              return 'MO: ' + (t ? t.textContent.trim() : '?')
            })()`)
          try {
            for (const i of [0, 1, 2, 1, 0]) {
              const clicked = await wc.executeJavaScript(`(() => {
                const rows = document.querySelectorAll('tbody tr')
                const r = rows[${i}]
                if (!r) return 'khong co dong ${i}'
                r.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
                r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
                r.click()
                return 'da bam dong ${i}'
              })()`)
              await new Promise((r) => setTimeout(r, 700))
              console.log(`[test-drawer] ${clicked} -> ${await read()}`)
            }
          } catch (e) {
            console.error('[test-drawer] loi', e)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 9000))
    })
  }

  // Tien ich dev: BRF_REFRESH=1 -> tu bam "Cap nhat trang thai" (mo trinh duyet lay point)
  if (process.env.BRF_REFRESH) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const profiles = loadStore().profiles
          console.log(`[autorefresh] cap nhat ${profiles.length} profile`)
          await refreshMany(profiles, {
            onLine: (line: LogLine) => broadcast('log:line', line),
            onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
            onProgress: (done, total, profileId) => broadcast('refresh:progress', { done, total, profileId })
          })
        })()
      }, Number(process.env.BRF_REFRESH_DELAY ?? 6000))
    })
  }

  // Tien ich dev: BRF_AUTOOPEN=<id|1> -> tu bam "Mo trinh duyet" cho profile do (kiem thu duong CDP)
  if (process.env.BRF_AUTOOPEN) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const list = loadStore().profiles
          const want = process.env.BRF_AUTOOPEN
          const target = want === '1' ? list[0] : (list.find((p) => p.id === want) ?? list[0])
          if (!target) return
          try {
            const st = await openBrowser(target)
            console.log(`[autoopen] ${target.id} ${JSON.stringify(st)}`)
          } catch (e) {
            console.error('[autoopen] loi', e)
          }
        })()
      }, 6000)
    })
  }

  // Tien ich dev: BRF_AUTORUN=daily,desktop -> tu chay 1 run sau khi cua so load (kiem thu luong IPC -> runner)
  if (process.env.BRF_AUTORUN) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const list = loadStore().profiles
        const wantId = process.env.BRF_AUTORUN_PROFILE
        const target = wantId ? list.find((p) => p.id === wantId) : list[0]
        if (!target) return
        const kinds = String(process.env.BRF_AUTORUN)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        void startRun(target, kinds, {
          onLine: (line: LogLine) => broadcast('log:line', line),
          onSnapshot: (snap) => broadcast('rewards:snapshot', snap)
        })
      }, 8000)
    })
  }

  // Tien ich dev: BRF_CAPTURE=1 -> chup anh cua so ra docs/ (khong phu thuoc cua so nao dang tren cung)
  if (process.env.BRF_CAPTURE) {
    mainWindow.webContents.once('did-finish-load', () => {
      const delay = Number(process.env.BRF_CAPTURE_DELAY ?? 30000)
      setTimeout(() => {
        void (async () => {
          try {
            const img = await mainWindow?.webContents.capturePage()
            if (!img) return
            const dir = join(process.cwd(), 'docs')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, `screenshot-${Date.now()}.png`)
            writeFileSync(file, img.toPNG())
            console.log(`[capture] saved ${file}`)
          } catch (e) {
            console.error('[capture] loi', e)
          }
        })()
      }, delay)
    })
  }
}

// Tien ich dev: BRF_DEBUG=<port> -> bat remote debugging cho chinh Electron (de test tu dong bang playwright-core)
if (process.env.BRF_DEBUG) {
  app.commandLine.appendSwitch('remote-debugging-port', String(process.env.BRF_DEBUG))
}

app.whenReady().then(() => {  electronApp.setAppUserModelId('com.dat.bingrewardfarm')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  // ---------- IPC: profiles ----------
  ipcMain.handle('profiles:list', () => loadStore().profiles)
  ipcMain.handle('profiles:add', (_e, input) => addProfile(input ?? {}))
  ipcMain.handle('profiles:update', (_e, { id, patch }) => updateProfile(id, patch ?? {}))
  ipcMain.handle('profiles:remove', (_e, id) => removeProfile(id))

  // ---------- IPC: browser ----------
  ipcMain.handle('browser:open', async (_e, id) => {
    const p = getProfile(id)
    if (!p) return { ok: false, error: 'khong thay profile' }
    try {
      const st = await openBrowser(p)
      return { ok: true, cdpUrl: st.cdpUrl, pid: st.pid }
    } catch (e) {
      return { ok: false, error: String((e as Error).message) }
    }
  })
  ipcMain.handle('browser:close', (_e, id) => closeBrowser(id))
  ipcMain.handle('browser:signout', async (_e, id) => {
    const p = getProfile(id)
    if (!p) return { ok: false, cleared: 0, error: 'khong thay profile' }
    return signOut(p, { onLine: (line: LogLine) => broadcast('log:line', line) })
  })
  ipcMain.handle('profiles:reset', async (_e, id) => {
    const p = getProfile(id)
    if (!p) return { ok: false, error: 'khong thay profile' }
    const res = await resetProfile(p)
    broadcast('log:line', {
      at: new Date().toISOString(),
      level: res.ok ? 'warn' : 'error',
      msg: res.ok
        ? `da xoa du lieu profile "${p.name}" — mo lai trinh duyet de dang nhap tai khoan khac`
        : `xoa du lieu profile loi: ${res.error}`,
      profileId: p.id
    })
    return res
  })
  ipcMain.handle('browser:state', async (_e, id) => {
    const p = getProfile(id)
    if (!p) return { running: false, pid: null, cdpUrl: null }
    const st = await browserState(p)
    return { running: st.running, pid: st.pid, cdpUrl: st.cdpUrl }
  })

  // ---------- IPC: rewards ----------
  ipcMain.handle('rewards:snapshot', async (_e, id) => {
    const p = getProfile(id)
    if (!p) throw new Error('khong thay profile')
    return snapshot(p)
  })
  ipcMain.handle('rewards:login-window', async (_e, id) => {
    const p = getProfile(id)
    if (!p) return { ok: false, error: 'khong thay profile' }
    return openLoginWindow(p)
  })

  // ---------- IPC: run ----------
  ipcMain.handle('run:start', async (_e, { id, kinds }) => {
    const p = getProfile(id)
    if (!p) return { ok: false, error: 'khong thay profile' }
    return startRun(p, kinds ?? ['desktop'], {
      onLine: (line: LogLine) => broadcast('log:line', line),
      onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
      onStatusChange: (profileId, running) => broadcast('run:status', { profileId, running })
    })
  })
  ipcMain.handle('run:stop', (_e, id) => {
    const res = stopRun(id)
    broadcast('run:status', { profileId: id, running: false })
    return res
  })
  ipcMain.handle('run:state', (_e, id) => runState(id))

  // ---------- IPC: bang trang thai (doc tu cache, KHONG mo trinh duyet) ----------
  ipcMain.handle('state:list', async (): Promise<RowState[]> => {
    const profiles = loadStore().profiles
    const caches = cache.getAll()
    return Promise.all(
      profiles.map(async (p) => {
        const bs = await browserState(p)
        return {
          id: p.id,
          profile: p,
          cache: caches[p.id] ?? null,
          browser: { running: bs.running, pid: bs.pid, cdpUrl: bs.cdpUrl },
          run: runState(p.id),
          needsRefresh: cache.needsNewDayRefresh(p.id),
          hasData: cache.hasData(p.id)
        }
      })
    )
  })

  // ---------- IPC: mo trinh duyet de lay point (chi khi nguoi dung bam) ----------
  ipcMain.handle('rewards:refresh', async (_e, ids) => {
    const idList: string[] = Array.isArray(ids) && ids.length ? ids : loadStore().profiles.map((p) => p.id)
    const profiles = idList.map((id) => getProfile(id)).filter((p): p is NonNullable<typeof p> => !!p)
    const res = await refreshMany(profiles, {
      onLine: (line: LogLine) => broadcast('log:line', line),
      onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
      onProgress: (done, total, profileId) => broadcast('refresh:progress', { done, total, profileId }),
      gapMs: getSettings().refreshGapMs
    })
    return { ok: true, count: res.length }
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch ?? {}))

  // ---------- IPC: do trinh duyet tren may ----------
  ipcMain.handle('browsers:detect', (_e, force) => detectBrowsers(!!force))
  void detectBrowsers().then((list) => console.log(`[browsers] tim thay ${list.length}: ${list.map((b) => `${b.name} ${b.version ?? '?'}`).join(' | ')}`))

  // ---------- IPC: test proxy ----------
  ipcMain.handle('proxy:test', (_e, proxyStr) => testProxy(proxyStr))

  // ---------- IPC: kho proxy (tab "Proxy") ----------
  ipcMain.handle('proxies:list', () => listProxies())
  ipcMain.handle('proxies:add', (_e, input) => {
    try {
      return { ok: true, item: addProxy(input) }
    } catch (e) {
      return { ok: false, error: String((e as Error).message) }
    }
  })
  ipcMain.handle('proxies:addBulk', (_e, lines: string[]) => {
    try {
      const r = addProxyBulk(Array.isArray(lines) ? lines : [])
      return { ok: true, added: r.added.length, skipped: r.skipped, items: r.added }
    } catch (e) {
      return { ok: false, error: String((e as Error).message) }
    }
  })
  ipcMain.handle('proxies:update', (_e, { id, patch }) => {
    try {
      return { ok: true, item: updateProxy(id, patch) }
    } catch (e) {
      return { ok: false, error: String((e as Error).message) }
    }
  })
  ipcMain.handle('proxies:remove', (_e, id) => {
    try {
      removeProxy(id)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: String((e as Error).message) }
    }
  })
  ipcMain.handle('proxies:removeBulk', (_e, ids: string[]) => {
    try {
      return { ok: true, ...removeProxies(ids) }
    } catch (e) {
      return { ok: false, error: String((e as Error).message) }
    }
  })
  ipcMain.handle('proxies:test', (_e, id) => testAndSave(id))
  ipcMain.handle('proxies:testAll', (_e, filterIds?: string[]) => testAll(6, filterIds))

  createWindow()

  /**
   * Sang NGAY MOI thi tu mo trinh duyet lay point cho cac profile da co du lieu.
   * Mo app trong cung ngay => khong mo trinh duyet (dung yeu cau nguoi dung).
   */
  const dayWatcher = (): void => {
    const check = async (): Promise<void> => {
      if (!getSettings().autoRefreshOnNewDay) return
      const stale = loadStore().profiles.filter((p) => cache.needsNewDayRefresh(p.id))
      if (!stale.length) return
      console.log(`[day-watch] sang ngay moi -> cap nhat ${stale.length} profile`)
      broadcast('log:line', {
        at: new Date().toISOString(),
        level: 'info',
        msg: `Sang ngay moi: dang mo trinh duyet lay point cho ${stale.length} tai khoan`
      })
      await refreshMany(stale, {
        onLine: (line) => broadcast('log:line', line),
        onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
        onProgress: (done, total, profileId) => broadcast('refresh:progress', { done, total, profileId })
      })
    }
    setTimeout(() => void check(), 5000)
    setInterval(() => void check(), 5 * 60 * 1000)
  }
  dayWatcher()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
