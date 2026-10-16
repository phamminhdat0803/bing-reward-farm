import { join } from 'node:path'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { addProfile, getProfile, loadStore, removeProfile, updateProfile } from './profiles'
import { browserState, closeBrowser, openBrowser, verifyRunningBrowsers } from './browsers'
import {
  clearQueue,
  debugPushPending,
  openLoginWindow,
  queueView,
  refreshMany,
  resetProfile,
  runState,
  runStateAll,
  signOut,
  snapshot,
  startRun,
  stopRun,
  watchdogQueues
} from './runner'
import { listHistory } from './history'
import * as cache from './cache'
import { detectBrowsers } from './browser-detect'
import { detectPhoneApps, getPhoneSnapshot } from './phone-apps'
import {
  autoStatus,
  listEscalations,
  pendingTasks,
  pickCleanProxies,
  runAutoCycle,
  setAutoEvery,
  setAutoNotifier,
  startAutoLoop,
  stopAutoNow,
  writeEscalation
} from './auto'
import {
  autoCheckInAll,
  checkInCurrentBingAccount,
  launchBing,
  readAccountPage,
  readCurrentBingAccount,
  readSignedInAccount,
  signOutBing,
  startSignIn,
  switchToAccount
} from './phone'
import { testProxy } from './proxy-test'
import { addProxy, addProxyBulk, cancelTestAll, getHealthById, listProxies, removeProxy, removeProxies, setHealthNotifier, startHealthLoop, testAll, testAndSave, updateProxy } from './proxies'
import { getSettings, setSettings } from './settings'
import type { LogLine } from './core/types'
import type { RowState } from '../shared/types'

let mainWindow: BrowserWindow | null = null

function broadcast(channel: string, payload?: unknown): void {
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
    // Ban build khong co query string -> mo tab chi dinh bang cach bam nut nav
    if (process.env.BRF_TAB) {
      const tabKey = String(process.env.BRF_TAB)
      const label = tabKey === 'phone' ? 'Điện thoại' : tabKey === 'proxies' ? 'Proxy' : tabKey === 'history' ? 'Lịch sử' : 'Tài khoản'
      mainWindow.webContents.once('did-finish-load', () => {
        setTimeout(() => {
          void mainWindow?.webContents
            .executeJavaScript(
              `(() => { const b = [...document.querySelectorAll('nav button')].find((x) => (x.textContent||'').includes(${JSON.stringify(label)})); if (b) { b.click(); return 'ok' } return 'khong thay nut' })()`
            )
            .then((r) => console.log(`[tab] ${r}`))
            .catch(() => {})
        }, 2500)
      })
    }
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

  // Tien ich dev: BRF_PHONE_AUTO=1 -> kiem thu chuyen acc + diem danh that (BRF_PHONE_TARGET=<email>)
  if (process.env.BRF_PHONE_AUTO) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const serial = getPhoneSnapshot().devices[0]?.serial ?? ''
          if (!serial) {
            console.log('[phone-auto] khong co serial')
            return
          }
          const page = await readAccountPage(serial)
          console.log(`[phone-auto] trang tai khoan: signedIn=${page.signedInEmail} coMay=${page.accounts.length} acc=[${page.accounts.map((a) => a.email).join(', ')}]`)
          const target = process.env.BRF_PHONE_TARGET ?? ''
          if (target) {
            const sw = await switchToAccount(serial, target)
            console.log(`[phone-auto] chuyen sang ${target}: ${JSON.stringify(sw)}`)
            const res = await checkInCurrentBingAccount(serial, 0)
            console.log(`[phone-auto] diem danh: ${JSON.stringify(res)}`)
          } else {
            const targets = page.accounts.map((a) => ({ email: a.email, name: a.name }))
            const out = await autoCheckInAll(serial, targets, (row, i, total) =>
              console.log(`[phone-auto] ${i}/${total} ${row.email}: switched=${row.switched} ok=${row.ok} gained=${row.gained} already=${row.alreadyDone} err=${row.error ?? '-'}`)
            )
            console.log(`[phone-auto] TONG: ${out.reduce((s, r) => s + r.gained, 0)} diem`)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 8000))
    })
  }

  // Tien ich dev: BRF_PHONE_FLOW=1 -> kiem thu flow moi: doc acc dang dang nhap (roi dang xuat + dien email neu co BRF_PHONE_SIGNIN)
  if (process.env.BRF_PHONE_FLOW) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const serial = getPhoneSnapshot().devices[0]?.serial ?? ''
          if (!serial) {
            console.log('[phone-flow] khong co serial')
            return
          }
          const acct = await readSignedInAccount(serial, 0)
          console.log(`[phone-flow] acc dang dang nhap: ${JSON.stringify(acct)}`)

          const email = process.env.BRF_PHONE_SIGNIN
          if (email && email !== '1') {
            const out = await signOutBing(serial)
            console.log(`[phone-flow] dang xuat: ${JSON.stringify(out)}`)
            const si = await startSignIn(serial, email)
            console.log(`[phone-flow] mo form dang nhap + dien email: ${JSON.stringify(si)}`)
            const wc = mainWindow?.webContents
            if (wc) {
              const img = await wc.capturePage()
              const dir = join(process.cwd(), 'docs')
              mkdirSync(dir, { recursive: true })
              const file = join(dir, `shot-phone-flow-${Date.now()}.png`)
              writeFileSync(file, img.toPNG())
              console.log(`[phone-flow] anh (man hinh app): ${file}`)
            }
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 8000))
    })
  }

  // Tien ich dev: BRF_PHONE_CHECKIN=<serial|1> -> chay diem danh that qua app (khong can bam UI)
  if (process.env.BRF_PHONE_CHECKIN) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const want = String(process.env.BRF_PHONE_CHECKIN)
          const serial = want === '1' ? (getPhoneSnapshot().devices[0]?.serial ?? '') : want
          if (!serial) {
            console.log('[phone-checkin] khong co serial')
            return
          }
          console.log(`[phone-checkin] bat dau tren ${serial} …`)
          const r = await checkInCurrentBingAccount(serial, 0)
          console.log(`[phone-checkin] ket qua: ${JSON.stringify(r)}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 8000))
    })
  }

  // Tien ich dev: BRF_PHONE_ASSIGN=1 -> kiem thu tab Dien thoai: thead sticky + gan truc tiep (tu hoan tac)
  if (process.env.BRF_PHONE_ASSIGN) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          try {
            // 1. thead co sticky khong (cuon dung viewport cua ScrollArea roi do vi tri)
            const sticky = await wc.executeJavaScript(`(async () => {
              const wrap = document.querySelector('[data-slot="table-container"]')
              const vp = wrap?.querySelector('[data-slot="scroll-area-viewport"]') || wrap
              const thead = document.querySelector('[data-slot="table-container"] thead')
              if (!vp || !thead) return { error: 'khong thay bang' }
              const before = Math.round(thead.getBoundingClientRect().top)
              vp.scrollTop = 400
              await new Promise((r) => setTimeout(r, 500))
              const after = Math.round(thead.getBoundingClientRect().top)
              return {
                truoc: before,
                sau: after,
                position: getComputedStyle(thead).position,
                scrollTop: Math.round(vp.scrollTop),
                scrollHeight: vp.scrollHeight,
                clientHeight: vp.clientHeight,
                stickyOk: Math.abs(after - before) < 40 && vp.scrollTop > 0
              }
            })()`)
            console.log(`[phone-assign] thead: ${JSON.stringify(sticky)}`)

            // 2. gan truc tiep: Radix mo menu bang pointerdown -> phai ban PointerEvent that
            const assign = await wc.executeJavaScript(`(async () => {
              const fire = (el, type) => {
                const r = el.getBoundingClientRect()
                const opts = { bubbles: true, cancelable: true, composed: true, pointerType: 'mouse', button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
                el.dispatchEvent(new PointerEvent(type, opts))
                if (type === 'pointerup') el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: opts.clientX, clientY: opts.clientY }))
              }
              const rows = [...document.querySelectorAll('tbody tr')]
              const row = rows.find((r) => /Bing clone/i.test(r.textContent || '')) || rows.find((r) => /com\\.microsoft\\.bing/.test(r.textContent || ''))
              if (!row) return { error: 'khong thay dong app' }
              const btn = [...row.querySelectorAll('button')].find((b) => /Gán acc|thêm acc/.test(b.textContent || ''))
              if (!btn) return { error: 'khong thay nut Gan acc' }
              fire(btn, 'pointerdown')
              fire(btn, 'pointerup')
              await new Promise((r) => setTimeout(r, 1000))
              const items = [...document.querySelectorAll('[role="menuitemcheckbox"]')]
              if (!items.length) return { error: 'menu khong mo', soRole: document.querySelectorAll('[role]').length }
              const label = (items[0].textContent || '').trim().slice(0, 60)
              items[0].click()
              await new Promise((r) => setTimeout(r, 2000))
              const profiles = await window.api.listProfiles()
              return {
                clicked: label,
                mapped: profiles.filter((p) => p.devicePackage).map((p) => ({ name: p.name, pkg: p.devicePackage, user: p.deviceUser }))
              }
            })()`)
            console.log(`[phone-assign] gan: ${JSON.stringify(assign)}`)

            await new Promise((r) => setTimeout(r, 1000))
            // 3. hoan tac: bo gan lai
            const undo = await wc.executeJavaScript(`(async () => {
              const profiles = await window.api.listProfiles()
              const mapped = profiles.filter((p) => p.devicePackage)
              for (const p of mapped) {
                await window.api.updateProfile(p.id, { deviceSerial: null, deviceUser: null, devicePackage: null })
              }
              const after = await window.api.listProfiles()
              return { cleared: mapped.map((p) => p.name), conLai: after.filter((p) => p.devicePackage).length }
            })()`)
            console.log(`[phone-assign] hoan tac: ${JSON.stringify(undo)}`)

            const img = await wc.capturePage()
            const dir = join(process.cwd(), 'docs')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, `shot-phone-${Date.now()}.png`)
            writeFileSync(file, img.toPNG())
            console.log(`[phone-assign] anh: ${file}`)
          } catch (e) {
            console.error('[phone-assign] loi', e)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 7000))
    })
  }

  // Tien ich dev: BRF_DIALOG_PHONE=1 -> mo hop "Them tai khoan", cuon toi muc "Dien thoai" va chup anh
  if (process.env.BRF_DIALOG_PHONE) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          try {
            const r = await wc.executeJavaScript(`(async () => {
              const btn = [...document.querySelectorAll('button')].find((b) => /Thêm tài khoản/.test(b.textContent || ''))
              if (!btn) return { error: 'khong thay nut Them tai khoan' }
              btn.click()
              await new Promise((res) => setTimeout(res, 1500))
              const dlg = document.querySelector('[role="dialog"]')
              const sels = dlg ? [...dlg.querySelectorAll('select')] : []
              const info = sels.map((s) => ({
                opts: s.options.length,
                sample: [...s.options].slice(0, 4).map((o) => (o.textContent || '').slice(0, 80))
              }))
              const heading = dlg ? /Điện thoại — bản Bing app/.test(dlg.textContent || '') : false
              const sc = dlg?.querySelector('[data-slot="scroll-area-viewport"]') || dlg
              if (sc) sc.scrollTop = sc.scrollHeight
              return { selectCount: sels.length, info, heading, scrollTop: sc ? Math.round(sc.scrollTop) : null }
            })()`)
            console.log(`[dialog-phone] ${JSON.stringify(r)}`)
            await new Promise((res) => setTimeout(res, 1500))
            const img = await wc.capturePage()
            const dir = join(process.cwd(), 'docs')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, `shot-dialog-phone-${Date.now()}.png`)
            writeFileSync(file, img.toPNG())
            console.log(`[dialog-phone] anh: ${file}`)
          } catch (e) {
            console.error('[dialog-phone] loi', e)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 6000))
    })
  }

  // Tien ich dev: BRF_HIST_EXPAND=1 -> mo tab Lich su, bam mo 1 dong chi tiet roi chup anh
  if (process.env.BRF_HIST_EXPAND) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          const r = await wc.executeJavaScript(`(async () => {
            const btnNav = [...document.querySelectorAll('nav button')].find((b) => /Lịch sử/.test(b.textContent || ''))
            if (btnNav) btnNav.click()
            await new Promise((res) => setTimeout(res, 2500))
            const btns = [...document.querySelectorAll('tbody button')].filter((b) => /lượt/.test(b.textContent || ''))
            if (!btns.length) return { error: 'khong thay nut luot' }
            btns[0].click()
            await new Promise((res) => setTimeout(res, 1200))
            const opened = document.querySelectorAll('tbody tr').length
            return { mo: true, soDong: opened, text: (document.body.innerText.match(/Các lượt chạy trong ngày[\\s\\S]{0,120}/) || [''])[0].replace(/\\n/g, ' | ').slice(0, 160) }
          })()`)
          console.log(`[hist-expand] ${JSON.stringify(r)}`)
          await new Promise((res) => setTimeout(res, 1200))
          const img = await wc.capturePage()
          const dir = join(process.cwd(), 'docs')
          mkdirSync(dir, { recursive: true })
          const file = join(dir, `shot-history-detail-${Date.now()}.png`)
          writeFileSync(file, img.toPNG())
          console.log(`[hist-expand] anh: ${file}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 7000))
    })
  }

  // Tien ich dev: BRF_QUEUE_TEST=1 -> kiem thu watchdog hang doi (lenh cho treo phai bi bo, lenh cho moi phai duoc chay)
  if (process.env.BRF_QUEUE_TEST) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const profs = loadStore().profiles
          if (profs.length < 2) {
            console.log('[queue-test] can >= 2 acc')
            return
          }
          debugPushPending(profs[0].id, 20 * 60 * 1000) // lenh cho 20 phut -> phai bi BO
          debugPushPending(profs[1].id, 0, []) // lenh cho moi, kinds rong -> phai duoc CHAY tiep
          console.log(`[queue-test] sau khi bom: ${JSON.stringify(queueView().items)}`)
          await new Promise((r) => setTimeout(r, 36_000))
          console.log(`[queue-test] sau 36s (watchdog da chay): ${JSON.stringify(queueView().items)}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 7000))
    })
  }

  // Tien ich dev: BRF_BAR_JITTER=1 -> do do on dinh cua thanh tren (bug badge nhay len xuong 2026-10-16)
  if (process.env.BRF_BAR_JITTER) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          const measure = async (): Promise<{ h: number; top: number; left: number; right: number } | null> =>
            (await wc.executeJavaScript(`(() => {
              const bar = document.querySelector('[data-slot="promo-bar"]') || document.querySelector('div.bg-\\\\[var\\\\(--primary\\\\)\\\\]')
              if (!bar) return null
              const kids = [...bar.children]
              const mid = kids[1]
              const r = bar.getBoundingClientRect()
              const m = mid ? mid.getBoundingClientRect() : r
              return { h: Math.round(r.height), top: Math.round(m.top), left: Math.round(m.left), right: Math.round(m.right) }
            })()`)) as { h: number; top: number; left: number; right: number } | null

          const sample = async (label: string, times = 8): Promise<void> => {
            const rows: { h: number; top: number; left: number; right: number }[] = []
            for (let i = 0; i < times; i += 1) {
              const m = await measure()
              if (m) rows.push(m)
              await new Promise((r) => setTimeout(r, 260))
            }
            if (!rows.length) {
              console.log(`[bar] ${label}: khong do duoc`)
              return
            }
            const span = (k: 'h' | 'top' | 'left' | 'right'): number =>
              Math.max(...rows.map((r) => r[k])) - Math.min(...rows.map((r) => r[k]))
            console.log(
              `[bar] ${label}: cao lech ${span('h')}px · top lech ${span('top')}px · left lech ${span('left')}px · right lech ${span('right')}px` +
                ` => ${span('h') + span('top') + span('left') + span('right') === 0 ? 'ON DINH' : 'CO DICH CHUYEN'}`
            )
          }

          await sample('truoc khi bat tu dong')
          setAutoEvery(3_600_000)
          await new Promise((r) => setTimeout(r, 900))
          await sample('sau khi bat tu dong 1 gio')
          // gia lap dang chay -> chu tren chip doi
          await wc.executeJavaScript(`window.dispatchEvent(new Event('focus'))`)
          const p0 = loadStore().profiles[0]
          writeEscalation(p0, 'desktop', {
            tries: 3,
            escalated: true,
            lastProgress: '0/90',
            attempts: []
          })
          try {
            broadcast('auto:changed', autoStatus() as never)
          } catch {
            /* bo qua */
          }
          await new Promise((r) => setTimeout(r, 900))
          await sample('sau khi hien badge can phan tich')
          setAutoEvery(0)
          console.log('[bar] da tra tu dong ve TAT')
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 7000))
    })
  }

  // Tien ich dev: BRF_AUTO_TEST=1 -> kiem thu che do tu dong (lich chay, task thieu, proxy sach, ho so escalation)
  if (process.env.BRF_AUTO_TEST) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          const before = autoStatus()
          console.log(`[auto-test] truoc: enabled=${before.enabled} everyMs=${before.everyMs} cycles=${before.cycles}`)

          const on = setAutoEvery(60_000)
          console.log(`[auto-test] bat chu ky 1 phut: enabled=${on.enabled} nextAt=${on.nextAt}`)

          for (const p of loadStore().profiles) {
            console.log(`[auto-test] task thieu ${p.name} (${p.id}): ${pendingTasks(p).join(', ') || 'du diem'}`)
          }
          const clean = pickCleanProxies(3)
          console.log(
            `[auto-test] 3 proxy sach: ${clean.map((c) => `${c.label}${c.latency != null ? ` ${c.latency}ms` : ''}`).join(' | ') || 'khong co'}`
          )

          if (process.env.BRF_AUTO_FAKE_FAIL) {
            const p = loadStore().profiles[0]
            const ts = {
              tries: 3,
              escalated: true,
              lastProgress: '0/90',
              attempts: [
                {
                  at: new Date().toISOString(),
                  task: 'desktop' as const,
                  pointsBefore: 1000,
                  pointsAfter: 1000,
                  gained: 0,
                  taskProgressBefore: '0/90',
                  taskProgressAfter: '0/90',
                  proxy: 'socks5://116.104.251.199:1081',
                  error: 'mau thu nghiem (dev hook)'
                }
              ]
            }
            const file = writeEscalation(p, 'desktop', ts)
            console.log(`[auto-test] da ghi ho so mau: ${file}`)
            console.log(`[auto-test] danh sach ho so: ${listEscalations().length}`)
          }

          setAutoEvery(Number(process.env.BRF_AUTO_EVERY ?? 0))
          console.log(`[auto-test] tra chu ky ve ${autoStatus().everyMs} ms`)

          await new Promise((r) => setTimeout(r, 2500))
          const img = await wc.capturePage()
          const dir = join(process.cwd(), 'docs')
          mkdirSync(dir, { recursive: true })
          const out = join(dir, `shot-auto-${Date.now()}.png`)
          writeFileSync(out, img.toPNG())
          console.log(`[auto-test] anh: ${out}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 7000))
    })
  }

  // Tien ich dev: BRF_FAB_HOVER=1 -> do do "giat" cua popover FAB proxy khi hover (bug UI 2026-10-16)
  if (process.env.BRF_FAB_HOVER) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          // bat mot lan kiem tra proxy de FAB xuat hien
          void testAll(15, undefined, (p) => broadcast('proxies:testProgress', p))
          await new Promise((r) => setTimeout(r, 8000))

          const rect = await wc.executeJavaScript(`(() => {
            const b = document.querySelector('[data-slot="proxy-test-fab"]')
            if (!b) return null
            const r = b.getBoundingClientRect()
            return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }
          })()`)
          console.log(`[fab-hover] FAB: ${JSON.stringify(rect)}`)
          if (!rect) return

          // mo popover bang pointer event (Radix mo bang pointerdown)
          await wc.executeJavaScript(`(() => {
            const b = document.querySelector('[data-slot="proxy-test-fab"]')
            if (!b) return 'khong thay FAB'
            const r = b.getBoundingClientRect()
            const o = { bubbles: true, cancelable: true, composed: true, pointerType: 'mouse', button: 0, buttons: 1, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }
            b.dispatchEvent(new PointerEvent('pointerdown', o))
            b.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }))
            b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: o.clientX, clientY: o.clientY }))
            return 'da mo'
          })()`)
          await new Promise((r) => setTimeout(r, 900))

          // hover that bang chuot + do vi tri popover 12 lan
          const samples: { top: number; left: number; w: number; h: number; fabW: number }[] = []
          for (let i = 0; i < 12; i += 1) {
            wc.sendInputEvent({ type: 'mouseMove', x: rect.x, y: rect.y })
            await new Promise((r) => setTimeout(r, 120))
            const s = await wc.executeJavaScript(`(() => {
              const m = document.querySelector('[role="menu"]')
              const b = document.querySelector('[data-slot="proxy-test-fab"]')
              if (!m || !b) return null
              const r = m.getBoundingClientRect()
              return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), fabW: Math.round(b.getBoundingClientRect().width) }
            })()`)
            if (s) samples.push(s)
          }
          if (!samples.length) {
            console.log('[fab-hover] khong thay [role=menu] — popover khong mo?')
            return
          }
          const span = (k: 'top' | 'left' | 'w' | 'h' | 'fabW'): number => {
            const v = samples.map((s) => s[k])
            return Math.max(...v) - Math.min(...v)
          }
          console.log(
            `[fab-hover] ${samples.length} mau | popover top lech ${span('top')}px, left lech ${span('left')}px, w lech ${span('w')}px | FAB w lech ${span('fabW')}px => ${span('top') + span('left') + span('w') === 0 ? 'KHONG GIAT' : 'VAN GIAT'}`
          )
          const img = await wc.capturePage()
          const dir = join(process.cwd(), 'docs')
          mkdirSync(dir, { recursive: true })
          const file = join(dir, `shot-fab-hover-${Date.now()}.png`)
          writeFileSync(file, img.toPNG())
          console.log(`[fab-hover] anh: ${file}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 7000))
    })
  }

  // Tien ich dev: BRF_TEST_PROXYFAB=1 -> chay kiem tra toan bo proxy, chup anh luc dang chay
  // (tab Proxy), roi CHUYEN SANG TAB TAI KHOAN va chup lai de chung minh cuc tron tien do khong mat.
  if (process.env.BRF_TEST_PROXYFAB) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const wc = mainWindow?.webContents
          if (!wc) return
          const n = listProxies().length
          console.log(`[proxyfab] bat dau kiem tra ${n} proxy`)
          void testAll(15, undefined, (p) => broadcast('proxies:testProgress', p))

          await new Promise((r) => setTimeout(r, 9000))
          const shot = async (name: string): Promise<void> => {
            const img = await wc.capturePage()
            const dir = join(process.cwd(), 'docs')
            mkdirSync(dir, { recursive: true })
            const file = join(dir, `shot-${name}-${Date.now()}.png`)
            writeFileSync(file, img.toPNG())
            console.log(`[proxyfab] anh ${name}: ${file}`)
          }
          await shot('proxy-tab')

          // Chuyen sang tab Tai khoan giua luc dang kiem tra
          const clicked = await wc.executeJavaScript(`(() => {
            const b = [...document.querySelectorAll('button, span')].find((el) => (el.textContent || '').trim() === 'Tài khoản')
            if (!b) return false
            b.click()
            return true
          })()`)
          console.log(`[proxyfab] da bam tab Tai khoan: ${clicked}`)
          await new Promise((r) => setTimeout(r, 1200))
          await shot('accounts-tab')

          const fab = await wc.executeJavaScript(`(() => {
            const el = document.querySelector('[data-slot="proxy-test-fab"]')
            if (!el) return { found: false }
            const r = el.getBoundingClientRect()
            const app = document.querySelector('[data-slot="run-fab"]')
            const ar = app ? app.getBoundingClientRect() : null
            return {
              found: true,
              x: Math.round(r.x), y: Math.round(r.y),
              runFab: ar ? { x: Math.round(ar.x), y: Math.round(ar.y) } : null,
              title: el.getAttribute('title')
            }
          })()`)
          console.log(`[proxyfab] FAB sau khi doi tab: ${JSON.stringify(fab)}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 6000))
    })
  }

  // Tien ich dev: BRF_CLOSETEST=<id|1> -> thu dong trinh duyet (kiem thu nut "Dong" khi app vua restart,
  // tuc la map `running` rong va khong biet pid)
  if (process.env.BRF_CLOSETEST) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const want = String(process.env.BRF_CLOSETEST)
          const list = loadStore().profiles
          const target = want === '1' ? list[0] : (list.find((p) => p.id === want) ?? list[0])
          if (!target) return
          const st = await browserState(target)
          console.log(`[closetest] truoc khi dong: ${target.id} running=${st.running} pid=${st.pid} port=${st.port}`)
          const r = await closeBrowser(target.id)
          console.log(`[closetest] closeBrowser -> ${JSON.stringify(r)}`)
          await new Promise((res) => setTimeout(res, 2500))
          const after = await browserState(target)
          console.log(`[closetest] sau khi dong: running=${after.running} port=${after.port}`)
          const left = (
            await import('node:child_process')
          ).execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true })
          const stillUp = String(left)
            .split(/\r?\n/)
            .some((l) => new RegExp(`:${target.cdpPort}\\s`).test(l) && /LISTENING/i.test(l))
          console.log(`[closetest] cong ${target.cdpPort} con listen: ${stillUp}`)
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 6000))
    })
  }

  // Tien ich dev: BRF_PHONE_APPS=1 -> do danh sach thiet bi + cac ban Bing app tren dien thoai
  if (process.env.BRF_PHONE_APPS) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void (async () => {
          const snap = await detectPhoneApps()
          console.log(`[phone] adb=${snap.adbAvailable} devices=${snap.devices.length} apps=${snap.apps.length} err=${snap.error ?? '-'}`)
          for (const d of snap.devices) {
            console.log(`[phone] MAY ${d.serial} ${d.model} android=${d.android} pin=${d.batteryPct}% sac=${d.charging} status=${d.status}`)
          }
          for (const a of snap.apps) {
            console.log(`[phone] APP ${a.online ? 'online ' : 'OFFLINE'} user=${a.user} pkg=${a.pkg} kind=${a.kind} vc=${a.version} — ${a.hint}`)
          }
        })()
      }, Number(process.env.BRF_TEST_DELAY ?? 6000))
    })
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
          try {
            await refreshMany(profiles, {
              onLine: (line: LogLine) => broadcast('log:line', line),
              onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
              onProgress: (done, total, profileId) => broadcast('refresh:progress', { done, total, profileId })
            })
          } finally {
            broadcast('refresh:done')
          }
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


// ---------- Che do TU DONG: khoi dong lai vong hen gio theo cai dat da luu ----------
setAutoNotifier(
  (msg) => {
    try {
      broadcast('log:line', { at: new Date().toISOString(), level: 'info', msg: `[tu dong] ${msg}` } as never)
    } catch {
      /* bo qua */
    }
  },
  () => {
    try {
      broadcast('auto:changed', autoStatus() as never)
    } catch {
      /* bo qua */
    }
  }
)
startAutoLoop()
// Nguoi dung bam X dong cua so trinh duyet -> phat hien trong ~8s va cap nhat lai bang

// Watchdog hang doi: 1 acc co lenh cho ma khong co job nao chay -> chay tiep; treo qua 15 phut -> bo va ghi log
setTimeout(() => watchdogQueues(), 20_000)
setInterval(() => {
  try {
    const r = watchdogQueues()
    if (r.pumped.length || r.dropped.length) {
      console.log(`[queue] watchdog: chay tiep ${r.pumped.length}, bo lenh treo ${r.dropped.length}${r.dropped.length ? ` (${r.dropped.join('; ')})` : ''}`)
    }
  } catch (e) {
    console.error('[queue] watchdog loi', e)
  }
}, 30_000)
setInterval(() => {
  void verifyRunningBrowsers(loadStore().profiles)
    .then((closed) => {
      for (const c of closed) {
        console.log('[browser] ' + c.name + ' da dong (cong CDP tat) -> cap nhat trang thai')
        broadcast('browser:state', { profileId: c.id, running: false })
      }
    })
    .catch(() => {})
}, 8000)

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
  ipcMain.handle('run:clearQueue', (_e, profileId?: string) => clearQueue(profileId))
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
    try {
      const s = getSettings()
      const res = await refreshMany(profiles, {
        onLine: (line: LogLine) => broadcast('log:line', line),
        onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
        onProgress: (done, total, profileId) =>
          broadcast('refresh:progress', { done, total, profileId, parallel: s.refreshParallel }),
        gapMs: s.refreshGapMs,
        parallel: s.refreshParallel
      })
      return { ok: true, count: res.length }
    } finally {
      broadcast('refresh:done')
    }
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set', (_e, patch) => setSettings(patch ?? {}))

  // ---------- IPC: che do TU DONG ----------
  ipcMain.handle('auto:status', () => autoStatus())
  ipcMain.handle('auto:setEvery', (_e, ms: number) => setAutoEvery(Number(ms) || 0))
  ipcMain.handle('auto:runNow', () => runAutoCycle('chạy ngay từ UI'))
  ipcMain.handle('auto:stop', () => {
    stopAutoNow()
    return autoStatus()
  })
  ipcMain.handle('auto:escalations', () => listEscalations())
  ipcMain.handle('auto:pending', () => {
    const out: Record<string, string[]> = {}
    for (const p of loadStore().profiles) out[p.id] = pendingTasks(p)
    return out
  })
  ipcMain.handle('auto:pickClean', (_e, n?: number) => pickCleanProxies(n ?? 3))

  // ---------- IPC: LICH SU (doc state/<id>.json) ----------
  ipcMain.handle('history:list', (_e, opts?: { profileId?: string; days?: number }) => listHistory(opts ?? {}))

  // ---------- IPC: dien thoai (adb) ----------
  ipcMain.handle('phone:list', async (_e, force?: boolean) => (force ? detectPhoneApps() : getPhoneSnapshot()))
  ipcMain.handle('phone:detect', () => detectPhoneApps())
  /** Diem danh cho acc DANG dang nhap trong Bing app tren dien thoai */
  ipcMain.handle('phone:checkin', (_e, { serial, user }: { serial: string; user?: number }) =>
    checkInCurrentBingAccount(serial, user ?? 0)
  )
  /** Chi doc trang thai (diem, streak, con diem danh duoc khong) */
  ipcMain.handle('phone:read', (_e, { serial, user }: { serial: string; user?: number }) =>
    readCurrentBingAccount(serial, user ?? 0)
  )
  /** Mo Bing app tren dien thoai (de nguoi dung dang nhap acc can diem danh) */
  ipcMain.handle('phone:openBing', (_e, { serial, user }: { serial: string; user?: number }) =>
    launchBing(serial, user ?? 0)
  )
  /** Doc acc DANG dang nhap trong Bing app (ten + email + diem + chuoi) */
  ipcMain.handle('phone:account', (_e, { serial, user }: { serial: string; user?: number }) =>
    readSignedInAccount(serial, user ?? 0)
  )
  /** Dang xuat acc hien tai tren Bing app */
  ipcMain.handle('phone:signout', (_e, { serial }: { serial: string }) => signOutBing(serial))
  /** Mo form dang nhap Microsoft, dien san email acc ke tiep */
  ipcMain.handle('phone:signin', (_e, { serial, email }: { serial: string; email?: string | null }) =>
    startSignIn(serial, email ?? null)
  )
  /** Doc trang tai khoan Bing app: acc dang dang nhap + danh sach acc da luu tren may */
  ipcMain.handle('phone:accounts', (_e, { serial }: { serial: string }) => readAccountPage(serial))
  /** Chuyen acc tren dien thoai (chon tu danh sach da luu — khong can mat khau) */
  ipcMain.handle('phone:switch', (_e, { serial, email }: { serial: string; email: string }) =>
    switchToAccount(serial, email)
  )
  /** Chay ca danh sach: chuyen acc -> diem danh tung acc, phat su kien tien do */
  ipcMain.handle(
    'phone:autoCheckin',
    async (e, { serial, targets }: { serial: string; targets: { email: string; name?: string }[] }) => {
      const rows = await autoCheckInAll(serial, targets, (row, index, total) => {
        e.sender.send('phone:autoProgress', { row, index, total })
      })
      return rows
    }
  )

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
  ipcMain.handle('proxies:testAll', (_e, filterIds?: string[]) =>
    testAll(15, filterIds, (p) => broadcast('proxies:testProgress', p))
  )
  ipcMain.handle('proxies:cancelTestAll', () => {
    cancelTestAll()
    return { ok: true }
  })
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
      try {
        await refreshMany(stale, {
          onLine: (line) => broadcast('log:line', line),
          onSnapshot: (snap) => broadcast('rewards:snapshot', snap),
          onProgress: (done, total, profileId) => broadcast('refresh:progress', { done, total, profileId })
        })
      } finally {
        broadcast('refresh:done')
      }
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
  ghiCrashLog('window-all-closed', new Error('tat ca cua so da dong -> app.quit() (day la nguyen nhan pho bien khien phien dev ket thuc)'))
  if (process.platform !== 'darwin') app.quit()
})

// ---------- Chan doan crash: ghi lai MOI duong thoat de biet app chet vi cai gi ----------
// Truoc 2026-10-16: app "tu crash" nhung crash.log KHONG co dong nao, WER cung khong co
// => process bi ket thuc tu ben ngoai (dong cua so / bi kill / phien dev chet), khong phai loi code.
app.on('child-process-gone', (_e, details) => {
  ghiCrashLog('child-process-gone', new Error(JSON.stringify(details)))
})
app.on('render-process-gone', (_e, _wc, details) => {
  ghiCrashLog('render-process-gone', new Error(JSON.stringify(details)))
})
app.on('before-quit', () => {
  ghiCrashLog('before-quit', new Error('ung dung dang thoat (nguoi dung dong cua so / Ctrl+C / app.quit)'))
})
process.on('exit', (code) => {
  ghiCrashLog('exit', new Error(`process thoat voi code=${code}`))
})

// Nhip tim: ghi de 1 file moi 2 phut. App chet dot ngot thi file nay dung truoc dong log cuoi.
function nhipTim(): void {
  try {
    const m = process.memoryUsage()
    const line =
      `${new Date().toISOString()} pid=${process.pid} rss=${Math.round(m.rss / 1048576)}MB ` +
      `heap=${Math.round(m.heapUsed / 1048576)}MB uptime=${Math.round(process.uptime() / 60)}ph\n`
    writeFileSync(join(app.getPath('userData'), 'heartbeat.txt'), line, 'utf8')
  } catch {
    /* bo qua */
  }
}
nhipTim()
setInterval(nhipTim, 2 * 60 * 1000)
