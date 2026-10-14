import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  DetectedBrowser,
  LogLine,
  Profile,
  ProxyItem,
  ProxyTestResult,
  RefreshProgress,
  RowState,
  Snapshot
} from '../shared/types'

const api = {
  listProfiles: (): Promise<Profile[]> => ipcRenderer.invoke('profiles:list'),
  addProfile: (input: Partial<Profile>): Promise<Profile> => ipcRenderer.invoke('profiles:add', input),
  updateProfile: (id: string, patch: Partial<Profile>): Promise<Profile> =>
    ipcRenderer.invoke('profiles:update', { id, patch }),
  removeProfile: (id: string): Promise<boolean> => ipcRenderer.invoke('profiles:remove', id),

  openBrowser: (id: string): Promise<{ ok: boolean; cdpUrl?: string; pid?: number; error?: string }> =>
    ipcRenderer.invoke('browser:open', id),
  closeBrowser: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('browser:close', id),
  browserState: (id: string): Promise<{ running: boolean; pid: number | null; cdpUrl: string | null }> =>
    ipcRenderer.invoke('browser:state', id),
  signOut: (id: string): Promise<{ ok: boolean; cleared: number; error?: string }> =>
    ipcRenderer.invoke('browser:signout', id),
  resetProfile: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('profiles:reset', id),
  /** Kiem tra ket noi proxy (tra ve IP, vi tri, do tre ms) */
  testProxy: (proxyStr: string): Promise<ProxyTestResult> => ipcRenderer.invoke('proxy:test', proxyStr),

  // ---------- Kho proxy (tab "Proxy") ----------
  listProxies: (): Promise<ProxyItem[]> => ipcRenderer.invoke('proxies:list'),
  addProxy: (input: Partial<ProxyItem>): Promise<{ ok: boolean; item?: ProxyItem; error?: string }> =>
    ipcRenderer.invoke('proxies:add', input),
  /** Them nhieu proxy 1 luc (moi phan tu 1 dong proxy) */
  addProxyBulk: (
    lines: string[]
  ): Promise<{ ok: boolean; added?: number; skipped?: number; items?: ProxyItem[]; error?: string }> =>
    ipcRenderer.invoke('proxies:addBulk', lines),
  updateProxy: (
    id: string,
    patch: Partial<ProxyItem>
  ): Promise<{ ok: boolean; item?: ProxyItem; error?: string }> =>
    ipcRenderer.invoke('proxies:update', { id, patch }),
  removeProxy: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('proxies:remove', id),
  /** Xoá nhiều proxy 1 lúc */
  removeProxies: (ids: string[]): Promise<{ ok: boolean; removed?: number; error?: string }> =>
    ipcRenderer.invoke('proxies:removeBulk', ids),
  /** Test 1 proxy trong kho va luu ket qua */
  testSavedProxy: (id: string): Promise<ProxyTestResult> => ipcRenderer.invoke('proxies:test', id),
  testAllProxies: (filterIds?: string[]): Promise<Record<string, ProxyTestResult>> =>
    ipcRenderer.invoke('proxies:testAll', filterIds),
  /** Trang thai suc khoe proxy da do (key = proxyId) */
  proxyHealth: (): Promise<
    Record<string, { status: string; ip?: string; country?: string; latency?: number; error?: string; checkedAt: string }>
  > => ipcRenderer.invoke('proxies:health'),
  /** Dò các trình duyệt đang cài trên máy */
  detectBrowsers: (force = false): Promise<DetectedBrowser[]> => ipcRenderer.invoke('browsers:detect', force),

  snapshot: (id: string): Promise<Snapshot> => ipcRenderer.invoke('rewards:snapshot', id),
  openLoginWindow: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('rewards:login-window', id),

  /** Bang trang thai doc tu cache — KHONG mo trinh duyet */
  listState: (): Promise<RowState[]> => ipcRenderer.invoke('state:list'),
  /** Mo trinh duyet de lay point (chi khi nguoi dung bam) */
  refreshPoints: (ids: string[]): Promise<{ ok: boolean; count: number }> =>
    ipcRenderer.invoke('rewards:refresh', ids),
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke('settings:set', patch),
  onRefreshProgress: (cb: (p: RefreshProgress) => void): (() => void) => {
    const handler = (_e: unknown, p: RefreshProgress): void => cb(p)
    ipcRenderer.on('refresh:progress', handler)
    return () => ipcRenderer.removeListener('refresh:progress', handler)
  },

  startRun: (id: string, kinds: string[]): Promise<{ ok: boolean; runId?: string; error?: string }> =>
    ipcRenderer.invoke('run:start', { id, kinds }),
  stopRun: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('run:stop', id),
  runState: (id: string): Promise<{ running: boolean; kinds: string[]; log: LogLine[] }> =>
    ipcRenderer.invoke('run:state', id),

  onLog: (cb: (line: LogLine) => void): (() => void) => {
    const handler = (_e: unknown, line: LogLine): void => cb(line)
    ipcRenderer.on('log:line', handler)
    return () => ipcRenderer.removeListener('log:line', handler)
  },
  onRunStatus: (cb: (data: { profileId: string; running: boolean }) => void): (() => void) => {
    const handler = (_e: unknown, data: { profileId: string; running: boolean }): void => cb(data)
    ipcRenderer.on('run:status', handler)
    return () => ipcRenderer.removeListener('run:status', handler)
  },
  /** Tien do trong luc search (moi search 1 lan) */
  onRunProgress: (
    cb: (p: { profileId: string; kind: string; done: number; total: number; points: number | null; today: number | null; gained: number }) => void
  ): (() => void) => {
    const handler = (_e: unknown, p: never): void => cb(p)
    ipcRenderer.on('run:progress', handler)
    return () => ipcRenderer.removeListener('run:progress', handler)
  },
  onSnapshot: (cb: (snap: Snapshot) => void): (() => void) => {
    const handler = (_e: unknown, snap: Snapshot): void => cb(snap)
    ipcRenderer.on('rewards:snapshot', handler)
    return () => ipcRenderer.removeListener('rewards:snapshot', handler)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
