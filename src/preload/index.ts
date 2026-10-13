import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  AppSettings,
  DetectedBrowser,
  LogLine,
  Profile,
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
