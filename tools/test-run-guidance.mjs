import assert from 'node:assert/strict'
import { test } from 'node:test'
import { explainRunMessage } from '../src/shared/run-guidance.ts'

test('user policy example: pending earn explains waiting, target is not bot score, remaining is not scheduled work', () => {
  const message = '[policy] {"status":"waiting","reason":"earn: chưa xác nhận hoàn thành (visited-pending) · đến 11:28:56","kinds":[],"target":80,"remaining":26}'
  const guide=explainRunMessage(message)
  assert.match(guide.title,/Đã mở hoạt động/)
  assert.equal(guide.until,'11:28:56');assert.equal(guide.target,80);assert.equal(guide.remaining,26)
  assert.equal(guide.destination,'settings')
  assert.ok(guide.steps.some(step=>step.includes('Cập nhật trạng thái')))
  assert.ok(guide.steps.some(step=>step.includes('giữ nguyên lượt/phiên')))
})
test('known causes map to specific remedies without guessing unrelated log lines', () => {
  const cases=[['proxy-failed','proxy'],['not-signed-in','đăng nhập'],['stalled','điểm tăng'],['Đạt giới hạn lỗi trong ngày','giới hạn lỗi'],['Bot score đã cũ/không có thời gian nguồn','Bot score'],['Đã hết từ khoá chưa dùng trong kho chung','từ khoá'],['Ngoài khung giờ 08:00–22:00','lịch'],['Đủ số phiên tìm kiếm trong ngày','giới hạn']]
  for(const [message,expected]of cases)assert.ok(explainRunMessage(message).title.toLowerCase().includes(expected.toLowerCase()),message)
  assert.equal(explainRunMessage('Thông báo hoàn toàn khác'),null)
  assert.equal(explainRunMessage('Đã nạp 1500 từ khoá'),null)
  assert.equal(explainRunMessage('[proxy] chain 3/3 proxy song'),null)
  assert.equal(explainRunMessage('Đã đăng nhập thành công'),null)
  assert.equal(explainRunMessage('[policy] broken json'),null)
  assert.equal(explainRunMessage('[policy] {"reason":1}'),null)
  assert.equal(explainRunMessage('[policy] {"status":"ready","reason":"Sẵn sàng"}'),null)
})
test('corrupt keyword history is not treated as keyword exhaustion; stopped task does not claim it was visited',()=>{
  assert.match(explainRunMessage('Không đọc được sổ từ khoá đã dùng. Dừng search để tránh tái sử dụng.').title,/Không đọc được/)
  assert.match(explainRunMessage('earn: chưa xác nhận hoàn thành (stopped)').title,/Nhiệm vụ/)
})
