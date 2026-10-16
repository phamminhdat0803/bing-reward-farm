import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDailyStreak, parseReadyToClaim, parseSerpBotScore } from '../src/main/core/rewards-summary.ts'

test('đọc đúng nội dung Earn thực tế, không lấy Search streak hoặc bonus', () => {
  assert.equal(parseDailyStreak('Daily streak\n\n4\nLearn more\nStreaks\nDaily streaks reset in 6h\n1,000 BONUS\nBing Search Streak\nDay 4 of 7 streak completed.'), 4)
  assert.equal(parseDailyStreak('Daily streak 0 Learn more'), 0)
  assert.equal(parseDailyStreak('Daily streak: 365 days'), 365)
  assert.equal(parseDailyStreak('Bing Search Streak Day 7 of 7 Daily Set Streak Day 4 of 7 Daily streaks reset in 6h'), null)
  assert.equal(parseDailyStreak('Daily streak Learn more 1,000 BONUS'), null)
})

test('đọc Ready to claim độc lập với Available points, giữ đúng số 0', () => {
  assert.equal(parseReadyToClaim('Available points 4,007 Redeem Ready to claim\n\n12\nClaim Your perks'), 12)
  assert.equal(parseReadyToClaim('Ready to claim 0 Claim'), 0)
  assert.equal(parseReadyToClaim('Ready to claim: 1,250 Claim'), 1250)
  assert.equal(parseReadyToClaim('Ready to claim 1.250 Claim'), 1250)
  assert.equal(parseReadyToClaim('Ready to claim Claim Your perks Up to 300 Points'), null)
})

test('trang lỗi / thiếu mục không trở thành 0', () => {
  for (const text of ['', 'Sign in', 'Access denied', 'Available points 4007']) {
    assert.equal(parseDailyStreak(text), null)
    assert.equal(parseReadyToClaim(text), null)
  }
})

test('serpbotscore: JSON thực tế có số dạng chuỗi và ngày cập nhật từ nguồn', () => {
  assert.deepEqual(parseSerpBotScore({ dashboard: { userProfile: { attributes: {
    serpbotscore: '0.95', serpbotscore_upd: '2026-07-04T00:19:44.4503194+00:00'
  } } } }), { value: 0.95, updatedAt: '2026-07-04T00:19:44.450Z' })
  assert.deepEqual(parseSerpBotScore({ profile: { attributes: { serpbotscore: 0 } } }), { value: 0, updatedAt: null })
  assert.deepEqual(parseSerpBotScore({ profile: { attributes: { serpbotscore: '1', serpbotscore_upd: 'invalid' } } }), { value: 1, updatedAt: null })
})

test('serpbotscore: thiếu/lỗi không biến thành 0 hay tự clamp số ngoài thang', () => {
  for (const value of [null, undefined, true, false, '', ' ', 'not a number', -0.1, 1.01, Infinity, NaN, [], {}]) {
    assert.equal(parseSerpBotScore({ profile: { attributes: { serpbotscore: value } } }), null)
  }
  for (const payload of [null, 'Sign in', {}, { serpbotscore: 0.5 }, { dashboard: { otherScore: 0.5 } }]) {
    assert.equal(parseSerpBotScore(payload), null)
  }
})
