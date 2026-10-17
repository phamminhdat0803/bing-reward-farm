import { loadStore, updateProfile } from './profiles'
import { browserState } from './browsers'
import { runState } from './runner'
import { withProfileLock } from './lock'
import { listProxies, testAndSave, clearActiveChain } from './proxies'
import { proxyStats } from './proxy-history'
import { rankedReliableProxies, validateProxyFill, type ProxyFillOptions, type ProxyFillState, type ProxyFillRow } from '../shared/proxy-auto-fill'
import { randomUUID } from 'node:crypto'
import { accountProxyCandidates, profileProxyUrls, proxyFillRunning, validateAccountProxyFill, type AccountProxyFillJob, type AccountProxyFillRequest, type AccountProxyAttempt } from '../shared/account-proxy-fill'

let state: ProxyFillState = { running: false, done: 0, total: 0, rows: [] }
let accountJob: AccountProxyFillJob | null = null
export function proxyFillState(): ProxyFillState { return { ...state, rows: state.rows.map(row => ({ ...row, proxies: [...row.proxies] })) } }
export function startProxyFill(input: ProxyFillOptions): ProxyFillState {
  if (state.running || proxyFillRunning(accountJob)) throw new Error('Đang có lượt tự gán proxy chạy.')
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

export function accountProxyFillState(): AccountProxyFillJob | null {
  return accountJob ? { ...accountJob, attempts: accountJob.attempts.map(item => ({ ...item })), assigned: accountJob.assigned.map(item => ({ ...item })) } : null
}

export function cancelAccountProxyFill(jobId: string): AccountProxyFillJob | null {
  if (accountJob?.id === jobId && accountJob.status === 'checking') {
    accountJob.status = 'stopping'
    accountJob.message = 'Đang dừng; chờ các phép kiểm tra hiện tại kết thúc. Chưa đổi proxy tài khoản.'
  }
  return accountProxyFillState()
}

/** A manual, account-scoped replacement. Do not touch the profile until all N proxies pass. */
export function startAccountProxyFill(input: AccountProxyFillRequest): AccountProxyFillJob {
  const options = validateAccountProxyFill(input)
  if (state.running || proxyFillRunning(accountJob)) throw new Error('Đang có lượt chọn/gán proxy khác. Chờ hoàn tất hoặc dừng lượt đó trước.')
  const initial = loadStore().profiles.find(profile => profile.id === options.profileId)
  if (!initial) throw new Error('Tài khoản không còn trong danh sách.')
  const job: AccountProxyFillJob = { id: randomUUID(), profileId: initial.id, name: initial.name, count: options.count, status: 'checking', total: 0, checked: 0, attempts: [], assigned: [], message: 'Đang kiểm tra trạng thái tài khoản…' }
  accountJob = job
  const signature = (profile: typeof initial): string => JSON.stringify([profile?.proxyId ?? null, profile?.proxy ?? null, profile?.proxyFallbacks ?? [], profile?.lastGoodProxy ?? null])
  const expected = signature(initial)
  const cancelled = (): boolean => job.status === 'stopping'
  void withProfileLock(initial.id, async () => {
    const current = loadStore().profiles.find(profile => profile.id === initial.id)
    if (!current) throw new Error('Tài khoản không còn trong danh sách.')
    if (runState(current.id).running || runState(current.id).queued || (await browserState(current)).running) throw new Error('Dừng lượt chạy/lệnh chờ và đóng browser của tài khoản trước khi đổi proxy.')
    if (signature(current) !== expected) throw new Error('Proxy tài khoản vừa được sửa ở nơi khác. Mở lại hộp thoại để kiểm tra.')
    const items = listProxies()
    const candidates = accountProxyCandidates(items, proxyStats(items), loadStore().profiles, current.id)
    job.total = candidates.length
    if (candidates.length < options.count) throw new Error(`Chỉ có ${candidates.length}/${options.count} proxy khác đủ điều kiện trong kho. Chưa đổi cấu hình; bổ sung proxy hoạt động hoặc giảm số lượng.`)
    const verified: { proxy: typeof candidates[number]; result: AccountProxyAttempt }[] = []
    let cursor = 0
    job.message = 'Đang kiểm tra truy cập Bing qua từng proxy…'
    while (cursor < candidates.length && verified.length < options.count && !cancelled()) {
      const batch = candidates.slice(cursor, cursor + Math.min(4, options.count - verified.length))
      cursor += batch.length
      await Promise.all(batch.map(async proxy => {
        const latestItems = listProxies(), latest = latestItems.find(item => item.id === proxy.id)
        const inUse = loadStore().profiles.some(profile => profile.id !== current.id && profileProxyUrls(profile, latestItems).has(proxy.url))
        if (!latest || latest.url !== proxy.url || (latest.status && latest.status !== 'active') || inUse || latestItems.some(item => item.url === proxy.url && item.status && item.status !== 'active')) return
        const tested = await testAndSave(proxy.id).catch(() => ({ ok: false }))
        const result: AccountProxyAttempt = { proxyId: proxy.id, label: proxy.label.replace(/((?:https?|socks[45]):\/\/)[^@\s]+@/gi, '$1***@'), ok: tested.ok, latency: 'latency' in tested ? tested.latency : undefined, ip: 'ip' in tested ? tested.ip : undefined, country: 'country' in tested ? tested.country : undefined, checkedAt: new Date().toISOString() }
        job.attempts.push(result); job.checked++
        if (result.ok) verified.push({ proxy, result })
      }))
    }
    if (cancelled()) { job.status = 'cancelled'; job.message = 'Đã dừng kiểm tra. Giữ nguyên proxy tài khoản.'; return }
    if (verified.length < options.count) throw new Error(`Chỉ tìm được ${verified.length}/${options.count} proxy truy cập được Bing sau ${job.checked} lần kiểm tra. Giữ nguyên proxy cũ.`)
    if ((await browserState(current)).running || runState(current.id).running || runState(current.id).queued) throw new Error('Tài khoản vừa hoạt động hoặc nhận lệnh chờ. Giữ nguyên proxy cũ; dừng/đóng browser rồi thử lại.')
    if (cancelled()) { job.status = 'cancelled'; job.message = 'Đã dừng kiểm tra. Giữ nguyên proxy tài khoản.'; return }
    // Re-read after every await: manual edits, disabled proxies and ownership changes must win.
    const store = loadStore(), latest = store.profiles.find(profile => profile.id === current.id), latestItems = listProxies()
    if (!latest || signature(latest) !== expected) throw new Error('Cấu hình tài khoản vừa thay đổi. Giữ chỉnh sửa mới, không ghi đè.')
    for (const pick of verified) {
      if (!latestItems.some(item => item.id === pick.proxy.id && item.url === pick.proxy.url) || latestItems.some(item => item.url === pick.proxy.url && item.status && item.status !== 'active') || store.profiles.some(profile => profile.id !== current.id && profileProxyUrls(profile, latestItems).has(pick.proxy.url))) throw new Error('Proxy vừa bị sửa, tạm ngưng hoặc được tài khoản khác sử dụng. Giữ nguyên cấu hình; kiểm tra lại kho proxy.')
    }
    const picks = verified.sort((a, b) => (a.result.latency ?? Infinity) - (b.result.latency ?? Infinity))
    updateProfile(current.id, { proxyId: picks[0].proxy.id, proxy: null, proxyFallbacks: picks.slice(1).map(pick => pick.proxy.url), lastGoodProxy: null })
    clearActiveChain(current.id)
    job.assigned = picks.map(pick => pick.result)
    job.status = 'completed'
    job.message = `Đã gán ${picks.length} proxy khác: 1 chính${picks.length > 1 ? ` + ${picks.length - 1} dự phòng` : ''}. Tất cả vừa truy cập Bing thành công.`
  }).catch(error => {
    if (cancelled()) { job.status = 'cancelled'; job.message = 'Đã dừng kiểm tra. Giữ nguyên proxy tài khoản.' }
    else { job.status = 'failed'; job.message = error instanceof Error ? error.message : 'Không hoàn tất kiểm tra. Giữ nguyên proxy tài khoản.' }
  })
  return accountProxyFillState()!
}
