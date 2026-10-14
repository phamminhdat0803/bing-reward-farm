import { join } from 'node:path'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { addProfile, getProfile, loadStore, removeProfile, updateProfile } from './profiles'
import { browserState, closeBrowser, openBrowser } from './browsers'
import { openLoginWindow, queueView, refreshMany, resetProfile, runState, runStateAll, signOut, snapshot, startRun, stopRun } from './runner'
import * as cache from './cache'
import { detectBrowsers } from './browser-detect'
import { testProxy } from './proxy-test'
import { addProxy, addProxyBulk, getHealthById, listProxies, removeProxy, removeProxies, setHealthNotifier, startHealthLoop, testAll, testAndSave, updateProxy } from './proxies'
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

            // Do kha nang cuon cua dialog (ScrollArea trong DialogContent)
            const scroll = await wc.executeJavaScript(`(() => {
              const dlg = document.querySelector('[role="dialog"]')
              const vp = dlg && dlg.querySelector('[data-slot="scroll-area-viewport"]')
              if (!dlg) return { error: 'khong thay dialog' }
              const bar = dlg.querySelector('[data-slot="scroll-area-scrollbar"]')
              return {
                dialogH: Math.round(dlg.getBoundingClientRect().height),
                dialogOverflow: getComputedStyle(dlg).overflow,
                coViewport: !!vp,
                viewportH: vp ? Math.round(vp.getBoundingClientRect().height) : 0,
                noiDungCao: vp ? vp.scrollHeight : 0,
                cuonDuoc: vp ? vp.scrollHeight > vp.clientHeight + 4 : false,
                thanhCuon: bar ? bar.getAttribute('data-state') : null
              }
            })()`)
            console.log(`[test-account] cuon: ${JSON.stringify(scroll)}`)

            // Mo hop chon proxy tu dialog tai khoan roi do kha nang cuon
            const picker = await wc.executeJavaScript(`(async () => {
              const btns = Array.from(document.querySelectorAll('button'))
              const card = btns.find((b) => /Chọn proxy/.test(b.textContent || ''))
              if (!card) return { error: 'khong thay card Chon proxy' }
              card.click()
              await new Promise((r) => setTimeout(r, 900))
              const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).pop()
              const vp = dlg && dlg.querySelector('[data-slot="scroll-area-viewport"]')
              const bar = dlg && dlg.querySelector('[data-slot="scroll-area-scrollbar"]')
              const cs = dlg ? getComputedStyle(dlg) : null
              const vpCs = vp ? getComputedStyle(vp) : null
              return {
                soDialog: document.querySelectorAll('[role="dialog"]').length,
                display: cs ? cs.display : null,
                dialogH: dlg ? Math.round(dlg.getBoundingClientRect().height) : 0,
                coViewport: !!vp,
                viewportH: vp ? Math.round(vp.getBoundingClientRect().height) : 0,
                viewportOverflow: vpCs ? vpCs.overflow : null,
                noiDungCao: vp ? vp.scrollHeight : 0,
                cuonDuoc: vp ? vp.scrollHeight > vp.clientHeight + 4 : false,
                thanhCuon: bar ? bar.getAttribute('data-state') : null
              }
            })()`)
            console.log(`[test-account] picker: ${JSON.stringify(picker)}`)

            // Thu lan chuot that (wheel) tren danh sach proxy xem co cuon khong
            const wheel = await wc.executeJavaScript(`(async () => {
              const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).pop()
              const vp = dlg && dlg.querySelector('[data-slot="scroll-area-viewport"]')
              if (!vp) return { error: 'khong thay viewport' }
              const item = vp.querySelector('button') || vp
              const r = item.getBoundingClientRect()
              const before = vp.scrollTop
              const ev = new WheelEvent('wheel', {
                deltaY: 400, deltaMode: 0, bubbles: true, cancelable: true,
                clientX: Math.round(r.left + 20), clientY: Math.round(r.top + 10)
              })
              item.dispatchEvent(ev)
              await new Promise((r2) => setTimeout(r2, 500))
              const afterEv = vp.scrollTop
              vp.scrollTop = 300
              await new Promise((r2) => setTimeout(r2, 200))
              return { before, sauWheel: afterEv, sauKhiGanScrollTop: vp.scrollTop, wheelBiChan: afterEv === before }
            })()`)
            console.log(`[test-account] wheel: ${JSON.stringify(wheel)}`)

            // Lan chuot THAT (Electron sendInputEvent) tai toa do danh sach proxy
            const box = await wc.executeJavaScript(`(() => {
              const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).pop()
              const vp = dlg && dlg.querySelector('[data-slot="scroll-area-viewport"]')
              if (!vp) return null
              const r = dlg.getBoundingClientRect()
              vp.scrollTop = 0
              // tro vao VUNG HEADER (khong phai danh sach) de kiem tra co forward wheel khong
              return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 22), before: vp.scrollTop }
            })()`)
            if (box) {
              for (let i = 0; i < 6; i += 1) {
                wc.sendInputEvent({ type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -120 })
                await new Promise((r) => setTimeout(r, 120))
              }
              await new Promise((r) => setTimeout(r, 400))
              const after = await wc.executeJavaScript(`(() => {
                const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).pop()
                const vp = dlg && dlg.querySelector('[data-slot="scroll-area-viewport"]')
                return vp ? vp.scrollTop : -1
              })()`)
              console.log(`[test-account] wheel that: truoc=${box.before} sau=${after} => ${after !== box.before ? 'CUON DUOC' : 'BI CHAN'}`)
            }
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
        
  // BRF_TEST_PROXY=<proxyId> -> test 1 proxy qua dung luong "Kiem tra", roi in trang thai health
  // (chung minh cham mau tren bang lay dung ket qua vua test)
  if (process.env.BRF_TEST_PROXY) {
    setTimeout(() => {
      void (async () => {
          const id = String(process.env.BRF_TEST_PROXY)
          const res = await testAndSave(id)
          const h = getHealthById()[id]
          console.log('[brf-test-proxy] id=', id, '| testAndSave.ok=', res.ok, '| error=', res.error ?? '-')
          console.log('[brf-test-proxy] health cho UI =', JSON.stringify(h ?? null))
      })()
    }, 14000)
  }
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

  // BRF_WINDOW_SIZE=1186x921 -> dat kich thuoc cua so (tai hien man hep khi kiem tra UI)
  if (process.env.BRF_WINDOW_SIZE) {
    const m = String(process.env.BRF_WINDOW_SIZE).match(/^(\\d+)x(\\d+)$/)
    if (m) {
      mainWindow.setSize(Number(m[1]), Number(m[2]))
      console.log('[window] size ->', m[1] + 'x' + m[2])
    }
  }

  // BRF_THROW=1 -> nem loi khong bat (kiem chung luoi an toan: app phai KHONG hien dialog va van song)
  if (process.env.BRF_THROW) {
    setTimeout(() => {
      // loi mo phong dung kieu loi mang/TLS lam chet main process truoc day
      const e = new Error('Client network socket disconnected before secure TLS connection was established')
      e.stack = 'Error: ' + e.message + '\n    at TLSSocket.onConnectEnd (node:_tls_wrap:1750:19)'
      throw e
    }, 9000)
  }

  // Tien ich dev: BRF_OPEN_MENU=<selector> -> tu bam 1 nut de mo menu/popover (kiem tra nhan khong bi xuong dong)
  if (process.env.BRF_OPEN_MENU) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          try {
            const r = await wc.executeJavaScript(`(async () => {
              const el = document.querySelector(${JSON.stringify(process.env.BRF_OPEN_MENU)})
              if (!el) return 'khong thay nut'
              // Radix mo menu bang pointerdown, .click() khong du
              el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }))
              el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1 }))
              el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0 }))
              el.click()
              await new Promise((r) => setTimeout(r, 1200))
              const items = Array.from(document.querySelectorAll('[role="menuitem"], [role="menu"] [data-slot$="-item"]'))
              return items.map((i) => ({
                text: (i.textContent || '').trim().slice(0, 60),
                h: Math.round(i.getBoundingClientRect().height),
                lines: Math.round(i.getBoundingClientRect().height / 30)
              }))
            })()`)
            console.log(`[open-menu] ${JSON.stringify(r)}`)
          } catch (e) {
            console.error('[open-menu] loi', e)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 8000))
    })
  }

  // Tien ich dev: BRF_TEST_STICKY=1 -> cuon bang roi do xem thead co dinh khong
  if (process.env.BRF_TEST_STICKY) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          try {
            const r = await wc.executeJavaScript(`(() => {
              const root = document.querySelector('[data-slot="table-container"]')
              const dump = (el, d = 0) => {
                if (!el || d > 2) return []
                return Array.from(el.children).map((c) => ({
                  t: c.tagName.toLowerCase(),
                  slot: c.getAttribute('data-slot'),
                  state: c.getAttribute('data-state'),
                  style: (c.getAttribute('style') || '').slice(0, 80),
                  kids: dump(c, d + 1)
                }))
              }
              return { rootTag: root ? root.tagName.toLowerCase() : null, tree: dump(root) }
            })()`)
            console.log(`[test-sticky] ${JSON.stringify(r)}`)
          } catch (e) {
            console.error('[test-sticky] loi', e)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 9000))
    })
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
              const vp = d.querySelector('[data-slot="scroll-area-viewport"]')
              const wrap = vp ? vp.firstElementChild : null
              const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : 0)
              return (
                'MO: ' + (t ? t.textContent.trim() : '?') +
                ' | drawer=' + w(d) +
                ' | viewport=' + w(vp) + '/' + (vp ? vp.clientWidth : 0) +
                ' | content=' + w(wrap) +
                ' | scrollW=' + (vp ? vp.scrollWidth : 0) +
                (vp && vp.scrollWidth > vp.clientWidth + 1 ? '  <-- TRAN NGANG' : '  (ok)')
              )
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
      }, Number(process.env.BRF_OPEN_MENU_DELAY ?? 6000))
    })
  }

  // Tien ich dev: BRF_AUTORUN=daily,desktop -> tu chay 1 run sau khi cua so load (kiem thu luong IPC -> runner)
  if (process.env.BRF_AUTORUN) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const list = loadStore().profiles
        // BRF_AUTORUN_PROFILE co the la danh sach: "default,thap-vu" -> chay song song de kiem thu UI
        const wantIds = String(process.env.BRF_AUTORUN_PROFILE ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const targets = (
          wantIds.length ? wantIds.map((id) => list.find((p) => p.id === id)) : [list[0]]
        ).filter((p): p is (typeof list)[number] => Boolean(p))
        if (targets.length === 0) return
        const kinds = String(process.env.BRF_AUTORUN)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const hooks = (): {
          onLine: (line: LogLine) => void
          onStatusChange?: (profileId: string, running: boolean) => void
          onQueue?: (items: { profileId: string; name: string; position: number }[]) => void
          onSnapshot: (snap: never) => void
          onProgress: (pr: never) => void
        } => ({
          onLine: (line: LogLine) => broadcast('log:line', line),
          onStatusChange: (profileId: string, running: boolean) => broadcast('run:status', { profileId, running }),
          onQueue: () => broadcast('run:queue', queueView()),
          onSnapshot: (snap) => broadcast('rewards:snapshot', snap as never),
          onProgress: (pr) => {
            broadcast('run:progress', pr as never)
            if (process.env.BRF_AUTORUN) console.log('[run:progress]', JSON.stringify(pr))
          }
        })
        for (const target of targets) void startRun(target, kinds, hooks() as never)
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

setHealthNotifier(() => broadcast('proxies:healthChanged', {}))
// ---------------------------------------------------------------------------
// Luoi an toan cho MAIN PROCESS.
// Loi mang kieu "Client network socket disconnected before secure TLS connection
// was established" (undici/Node socket) truoc day lam Electron hien dialog
// "A JavaScript error occurred in the main process" roi tat app.
// Tu day: ghi log + day len Log dock de nguoi dung thay, app VAN CHAY tiep.
// ---------------------------------------------------------------------------
function moTa(e: unknown): string {
  if (e instanceof Error) return `${e.message}\n${e.stack ?? ''}`.slice(0, 800)
  return String(e).slice(0, 800)
}

function ghiCrashLog(kind: string, e: unknown): void {
  const line = `[${new Date().toISOString()}] [${kind}] ${moTa(e)}\n`
  try {
    const dir = app.getPath('userData')
    mkdirSync(dir, { recursive: true })
    appendFileSync(join(dir, 'crash.log'), line, 'utf8')
  } catch {
    /* bo qua */
  }
  console.error(`[${kind}]`, moTa(e))
  try {
    broadcast('log:line', {
      at: new Date().toISOString(),
      level: 'error',
      msg: `[loi main] ${kind}: ${String((e as Error)?.message ?? e).slice(0, 200)}`
    } as never)
  } catch {
    /* bo qua */
  }
}

process.on('uncaughtException', (err) => ghiCrashLog('uncaughtException', err))
process.on('unhandledRejection', (reason) => ghiCrashLog('unhandledRejection', reason))

startHealthLoop({ everyMs: 45000, concurrency: 4 })

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
      onProgress: (pr) => {
        broadcast('run:progress', pr)
        if (process.env.BRF_AUTORUN) console.log('[run:progress]', JSON.stringify(pr))
      },
      onStatusChange: (profileId, running) => broadcast('run:status', { profileId, running }),
      onQueue: () => broadcast('run:queue', queueView())
    })
  })
  ipcMain.handle('run:stop', (_e, id) => {
    const res = stopRun(id)
    broadcast('run:status', { profileId: id, running: false })
    return res
  })
  ipcMain.handle('run:state', (_e, id) => runState(id))
  ipcMain.handle('run:queue', () => runStateAll())

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
  ipcMain.handle('proxies:health', () => getHealthById())

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
