import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseProxyCount, selectQuickProxies } from '../src/renderer/src/lib/proxy-quick-fill.ts'

const proxy = (id, ok, latency) => ({ id, label: id, url: `http://${id}:8080`, createdAt: '',
  lastTest: ok === undefined ? undefined : { ok, latency, at: '' } })
const items = [proxy('slow', true, 500), proxy('dead', false, 1), proxy('fresh'), proxy('fast', true, 10), proxy('medium', true, 100)]

test('chọn 1, 2, 3 hoặc nhiều hơn theo số lượng yêu cầu và ping', () => {
  for (const count of [1, 2, 3, 4, 10]) {
    assert.deepEqual(selectQuickProxies(items, [], undefined, count).map(p => p.id), ['fast', 'medium', 'slow', 'fresh'].slice(0, count))
  }
})

test('loại proxy chính/dự phòng của acc khác, cho phép dùng lại proxy của acc hiện tại', () => {
  const rows = [{ id: 'other', profile: { proxyId: 'fast', proxy: 'http://slow:8080', proxyFallbacks: ['http://medium:8080'] } },
    { id: 'current', profile: { proxyId: 'fresh' } }]
  assert.deepEqual(selectQuickProxies(items, rows, 'current', 3).map(p => p.id), ['fresh'])
})

test('không gán URL trùng, không gán proxy đã test lỗi khi kho thiếu', () => {
  assert.deepEqual(selectQuickProxies([...items, { ...items[3], id: 'duplicate' }], [], undefined, 99).map(p => p.id), ['fast', 'medium', 'slow', 'fresh'])
  assert.deepEqual(selectQuickProxies([proxy('dead', false, 1)], [], undefined, 1), [])
})

test('chỉ nhận số nguyên dương, giữ được lựa chọn 1/2 thay vì ép về 3', () => {
  assert.equal(parseProxyCount('1'), 1)
  assert.equal(parseProxyCount('2'), 2)
  assert.equal(parseProxyCount('12'), 12)
  for (const input of ['', ' ', '0', '-1', '1.5', 'NaN', 'Infinity']) assert.equal(parseProxyCount(input), null)
  for (const count of [0, -1, 1.5, NaN, Infinity]) assert.deepEqual(selectQuickProxies(items, [], undefined, count), [])
})
