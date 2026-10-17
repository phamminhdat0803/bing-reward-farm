import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectAccount, toggleVisibleAccounts } from '../src/renderer/src/lib/account-selection.ts'

test('row, modifier and range selection have independent, predictable targets', () => {
  const visible = ['a', 'b', 'c', 'd']
  assert.deepEqual(selectAccount(['b', 'c'], visible, 'a', 'c'), { ids: ['a'], anchor: 'a' })
  assert.deepEqual(selectAccount(['a'], visible, 'b', 'a', { toggle: true }), { ids: ['a', 'b'], anchor: 'b' })
  assert.deepEqual(selectAccount(['a', 'b'], visible, 'a', 'b', { toggle: true }).ids, ['b'])
  assert.deepEqual(selectAccount(['d'], visible, 'c', 'a', { range: true }), { ids: ['a', 'b', 'c'], anchor: 'a' })
  assert.deepEqual(selectAccount(['d'], visible, 'a', 'c', { range: true, toggle: true }), { ids: ['d', 'a', 'b', 'c'], anchor: 'c' })
  assert.deepEqual(selectAccount(['d'], visible, 'b', 'hidden', { range: true }), { ids: ['b'], anchor: 'b' })
})

test('filtered select-all preserves hidden selections and toggles only visible accounts', () => {
  assert.deepEqual(toggleVisibleAccounts(['hidden', 'a'], ['a', 'b']), ['hidden', 'a', 'b'])
  assert.deepEqual(toggleVisibleAccounts(['hidden', 'a', 'b'], ['a', 'b']), ['hidden'])
  // Equal counts do not imply that the visible rows are checked.
  assert.deepEqual(toggleVisibleAccounts(['hidden', 'a'], ['b', 'c']), ['hidden', 'a', 'b', 'c'])
  assert.deepEqual(toggleVisibleAccounts(['hidden'], []), ['hidden'])
})
