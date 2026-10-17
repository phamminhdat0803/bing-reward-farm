import { loadStore, updateProfile } from './profiles'
import { browserState } from './browsers'
import { runState } from './runner'
import { withProfileLock } from './lock'
import { listProxies, testAndSave, clearActiveChain } from './proxies'
import { proxyStats } from './proxy-history'
import { rankedReliableProxies, validateProxyFill, type ProxyFillOptions, type ProxyFillState, type ProxyFillRow } from '../shared/proxy-auto-fill'

let state: ProxyFillState = { running: false, done: 0, total: 0, rows: [] }
export function proxyFillState(): ProxyFillState { return { ...state, rows: state.rows.map(row => ({ ...row, proxies: [...row.proxies] })) } }
export function startProxyFill(input: ProxyFillOptions): ProxyFillState {
  if (state.running) throw new Error('Đang có lượt tự gán proxy chạy.')
  const options = validateProxyFill(input)
  const profiles = loadStore().profiles
  state = { running: true, done: 0, total: profiles.length, rows: [] }
  void (async () => {
    try {
      for (const initial of profiles) {
        let row: ProxyFillRow = { profileId: initial.id, name: initial.name, status: 'failed', message: '', proxies: [] }
        try {
          const busy = runState(initial.id)
          if (busy.running || busy.queued || (await browserState(initial)).running) {
            row.status = 'skipped'; row.message = 'Đang chạy/chờ hoặc browser đang mở; giữ nguyên proxy.'
          } else await withProfileLock(initial.id, async () => {
            const store = loadStore(), profile = store.profiles.find(p => p.id === initial.id)
            if (!profile) { row.status = 'skipped'; row.message = 'Tài khoản không còn trong danh sách.'; return }
            const live = runState(profile.id)
            if (live.running || live.queued || (await browserState(profile)).running) { row.status = 'skipped'; row.message = 'Tài khoản vừa bắt đầu hoạt động; giữ nguyên proxy.'; return }
            const items = listProxies(), byId = new Map(items.map(p => [p.id, p.url]))
            const occupied = new Set<string>()
            for (const other of store.profiles) {
              if (other.id === profile.id) continue
              if (other.proxyId && byId.has(other.proxyId)) occupied.add(byId.get(other.proxyId)!)
              if (other.proxy) occupied.add(other.proxy)
              if (other.lastGoodProxy) occupied.add(other.lastGoodProxy)
              for (const proxy of other.proxyFallbacks ?? []) occupied.add(byId.get(proxy) ?? proxy)
            }
            const candidates = rankedReliableProxies(items, proxyStats(items), options, occupied)
            const picks = candidates.slice(0, options.count)
            if (picks.length < options.count) { row.message = `Chỉ có ${picks.length}/${options.count} proxy đủ tiêu chí và chưa bị tài khoản khác giữ; không đổi cấu hình.`; return }
            const previous = { proxyId: profile.proxyId, proxy: profile.proxy, proxyFallbacks: profile.proxyFallbacks, lastGoodProxy: profile.lastGoodProxy }
            // Provisional assignment reserves these URLs while the Bing check is in flight.
            const assigned = { proxyId: picks[0].id, proxy: null, proxyFallbacks: picks.slice(1).map(p => p.url), lastGoodProxy: null }
            updateProfile(profile.id, assigned)
            const stillAssigned = (): boolean => {
              const latest = loadStore().profiles.find(p => p.id === profile.id)
              return !!latest && latest.proxyId === assigned.proxyId && !latest.proxy && JSON.stringify(latest.proxyFallbacks) === JSON.stringify(assigned.proxyFallbacks) && !latest.lastGoodProxy
            }
            clearActiveChain(profile.id)
            try {
              for (const pick of picks) {
                const latestProxy = listProxies().find(p => p.id === pick.id)
                if (!latestProxy || latestProxy.url !== pick.url || (latestProxy.status && latestProxy.status !== 'active')) throw new Error('Proxy vừa được sửa hoặc tạm ngưng.')
                const result = await testAndSave(pick.id) // force=true: fresh bing.com access check, not cached ping.
                if (!result.ok) throw new Error('Có proxy không truy cập được Bing sau khi gán.')
              }
              if (!stillAssigned()) throw new Error('Cấu hình proxy vừa được chỉnh ở nơi khác.')
              const currentRun = runState(profile.id)
              if (currentRun.running || currentRun.queued) throw new Error('Tài khoản vừa nhận lệnh chạy; khôi phục proxy cũ để tránh đổi phiên.')
              row.status = 'ok'; row.proxies = picks.map(p => p.label)
              row.message = `Đã gán ${picks.length} proxy và xác nhận truy cập Bing thành công.`
            } catch {
              if (stillAssigned()) {
                updateProfile(profile.id, previous)
                clearActiveChain(profile.id)
                row.message = 'Kiểm tra Bing thất bại hoặc tài khoản vừa nhận lệnh chạy; đã khôi phục proxy cũ.'
              } else row.message = 'Cấu hình proxy vừa được chỉnh ở nơi khác; giữ chỉnh sửa mới, không ghi đè.'
            }
          })
        } catch { row.message = 'Không hoàn tất gán/kiểm tra proxy. Kiểm tra trạng thái tài khoản trước khi thử lại.' }
        state.rows.push(row); state.done++
      }
    } catch { state.error = 'Không hoàn tất tự gán proxy.' }
    finally { state.running = false }
  })()
  return proxyFillState()
}
