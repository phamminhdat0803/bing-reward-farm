export type RunGuidance = { title: string; explanation: string; steps: string[]; destination?: 'settings' | 'proxies'; target?: number; remaining?: number; until?: string }

/** Interpret known app messages only; a log entry is historical evidence, not a live command. */
export function explainRunMessage(message: string): RunGuidance | null {
  let reason = message, target: number | undefined, remaining: number | undefined
  const policy = message.indexOf('[policy]')
  if (policy >= 0) {
    try {
      const parsed = JSON.parse(message.slice(policy + 8).trim())
      if (!parsed || typeof parsed.reason !== 'string') return null
      if (['ready', 'legacy'].includes(parsed.status)) return null
      reason = parsed.reason
      if (Number.isFinite(parsed.target) && parsed.target >= 0 && parsed.target <= 100) target = parsed.target
      if (Number.isFinite(parsed.remaining) && parsed.remaining >= 0) remaining = parsed.remaining
    } catch { return null }
  }
  const until = reason.match(/· đến (\d{1,2}:\d{2}(?::\d{2})?)/)?.[1]
  let guide: RunGuidance | null = null
  if (/visited-pending|chưa xác nhận hoàn thành|chưa xác nhận hoàn tất/i.test(reason)) guide = {
    title: /visited-pending/i.test(reason) ? 'Đã mở hoạt động, chưa xác nhận hoàn thành' : 'Nhiệm vụ chưa được xác nhận hoàn tất',
    explanation: /visited-pending/i.test(reason) ? 'App đã truy cập thẻ Daily set/Keep earning nhưng chưa xác nhận được điểm hoặc hoàn thành. Có thể dữ liệu cập nhật trễ hoặc hoạt động còn cần thao tác; đây chưa phải kết luận tài khoản bị lỗi.' : 'Nhiệm vụ trả về trạng thái chưa được app xác nhận hoàn tất. Có thể đã bị dừng hoặc còn yêu cầu trên trang; cần đối chiếu tiến độ thực tế trước khi thử lại.',
    steps: ['Nếu tài khoản còn thời gian nghỉ, chờ hết thời gian đó trước khi yêu cầu chạy lại.', 'Chọn đúng tài khoản → Cập nhật trạng thái để đọc lại điểm và tiến độ.', 'Nếu hoạt động vẫn chưa hoàn thành, mở browser của tài khoản, xem yêu cầu trên trang Rewards và xử lý thủ công.', 'Sau khi đã kiểm tra, vào Cài đặt → trạng thái tài khoản → “Đã kiểm tra, gỡ chờ lỗi” nếu cần. Nút này giữ nguyên lượt/phiên đã dùng; các quy tắc khác vẫn có thể chặn chạy.'], destination: 'settings'
  }
  else if (/xác minh|captcha|restricted|unusual traffic|temporarily restricted/i.test(reason)) guide = {
    title: 'Trang yêu cầu xác minh hoặc thông báo giới hạn', explanation: 'App đã dừng để người dùng kiểm tra. Không tự vượt CAPTCHA hoặc giới hạn của trang.',
    steps: ['Mở đúng browser/profile và đọc thông báo trên Bing/Rewards.', 'Tự xử lý xác minh nếu trang yêu cầu; nếu trang yêu cầu chờ thì chờ theo thông báo.', 'Cập nhật trạng thái. Chỉ gỡ chờ lỗi sau khi xác nhận tài khoản đã hoạt động bình thường.'], destination: 'settings'
  }
  else if (/proxy-failed|proxy.*(?:lỗi|chết|chet|loi|không|khong|failed|dead)|không còn proxy|CHAN BING|chặn bing|ERR_TUNNEL|ERR_SOCKS|ERR_CONNECTION/i.test(reason)) guide = {
    title: 'Kết nối proxy cần kiểm tra', explanation: 'Proxy có thể mất kết nối hoặc truy cập được Internet nhưng không vào được Bing. Chưa thể kết luận tài khoản đã mất đăng nhập.',
    steps: ['Vào tab Proxy, kiểm tra proxy chính và dự phòng của tài khoản; xem lỗi truy cập Bing và lịch sử test.', 'Chọn proxy hoạt động, không blacklist/không dùng và không thuộc tài khoản khác. Có thể dùng “Tự gán proxy tốt” sau khi đóng browser/dừng tài khoản.', 'Mở lại browser để nhận cấu hình proxy mới, rồi Cập nhật trạng thái.', 'Nếu vẫn còn chờ lỗi, kiểm tra xong mới dùng “Đã kiểm tra, gỡ chờ lỗi” trong Cài đặt.'], destination: 'proxies'
  }
  else if (/not-signed-in|(?:chưa|không|cần).*đăng nhập|check-failed|không đọc được điểm|khong doc duoc diem/i.test(reason)) guide = {
    title: 'Chưa xác nhận được đăng nhập hoặc dữ liệu điểm', explanation: 'App không đọc được dữ liệu cần thiết. Nguyên nhân có thể là trang chưa tải xong, proxy lỗi hoặc phiên đăng nhập hết hạn.',
    steps: ['Mở browser của đúng tài khoản và kiểm tra Bing/Rewards có tải được không.', 'Nếu trang không tải, kiểm tra proxy trước. Chỉ đăng nhập lại nếu trang thực sự yêu cầu.', 'Cập nhật trạng thái để lấy dữ liệu hôm nay; kiểm tra lại lý do chờ trong Cài đặt.'], destination: 'settings'
  }
  else if (/stalled|chưa thấy điểm tăng|không tăng|khong tang/i.test(reason)) guide = {
    title: 'Chưa thấy điểm tăng', explanation: 'App không thấy điểm tăng sau các lượt đã gửi. Điểm có thể cập nhật trễ, nhiệm vụ đã hết hạn mức hoặc trang đang giới hạn; chạy bù liên tục không xác nhận được nguyên nhân.',
    steps: ['Để tài khoản nghỉ theo cấu hình; không bấm chạy lại liên tục.', 'Cập nhật trạng thái và so sánh tiến độ desktop/mobile với hạn mức thực tế.', 'Mở trang Rewards kiểm tra đăng nhập, thông báo giới hạn và khả năng kết nối. Sau khi kiểm tra mới cân nhắc gỡ chờ lỗi.'], destination: 'settings'
  }
  else if (/giới hạn lỗi|số lỗi tối đa|Đạt giới hạn lỗi/i.test(reason)) guide = {
    title: 'Đã đạt giới hạn lỗi trong ngày', explanation: 'Số lần app ghi nhận sự cố đã đạt ngưỡng. Hết thời gian nghỉ chưa đủ để tài khoản được chạy lại.',
    steps: ['Xem các cảnh báo trước đó để xử lý nguyên nhân: kết nối, đăng nhập, xác minh hoặc nhiệm vụ chưa hoàn thành.', 'Chờ ngày mới, hoặc sau khi đã kiểm tra thì chọn “Đã kiểm tra, gỡ chờ lỗi”.', 'Gỡ chờ không cấp lại ngân sách lượt/phiên đã sử dụng.'], destination: 'settings'
  }
  else if (/Bot score|score đã cũ|score thiếu/i.test(reason)) guide = {
    title: 'Quy tắc Bot score đang chặn tài khoản', explanation: 'Đây là điều kiện do bạn cấu hình, không phải kết luận Microsoft đã khoá tài khoản. Score có thể thiếu, cũ hoặc đạt ngưỡng tạm dừng.',
    steps: ['Cập nhật trạng thái và xem giá trị cùng thời gian nguồn Bot score trong chi tiết tài khoản.', 'Vào Cài đặt kiểm tra ngưỡng, tuổi dữ liệu và cách xử lý score thiếu/cũ.', 'Đọc lại cùng một score cũ không làm mới thời gian nguồn. Gỡ chờ lỗi không bỏ qua quy tắc Bot score.'], destination: 'settings'
  }
  else if (/không đọc được.*(sổ từ khoá|lịch sử search)|sổ từ khoá.*lỗi/i.test(reason)) guide = {
    title: 'Không đọc được sổ theo dõi từ khoá', explanation: 'App dừng để tránh dùng lại từ khoá khi sổ theo dõi hoặc lịch sử cũ không đọc được. Nạp thêm từ khoá không xử lý được lỗi dữ liệu này.',
    steps: ['Dừng các lượt search để giữ nguyên bằng chứng lỗi.', 'Giữ lại file sổ từ khoá và lịch sử; không xoá hoặc đặt lại tuỳ tiện vì có thể làm mất dấu từ đã dùng.', 'Copy thông báo gốc và xuất log tài khoản để kiểm tra/khôi phục dữ liệu.']
  }
  else if (/keywords-exhausted|hết.*từ khoá|không còn.*từ khoá|cần.*(?:bổ sung|nạp).*từ khoá/i.test(reason)) guide = {
    title: 'Cần bổ sung từ khoá mới', explanation: 'Kho không còn từ được phép dùng hoặc các từ còn lại đã được tài khoản khác giữ chỗ/sử dụng.',
    steps: ['Mở tab Từ khoá, lọc “Chưa dùng” để kiểm tra số còn lại.', 'Dán danh sách mới hoặc tạo bằng AI, rồi Nạp thêm. Nạp lại các từ đã dùng không mở khoá chúng.', 'Bắt đầu lượt chạy mới sau khi có từ mới và còn ngân sách.']
  }
  else if (/khung giờ|khoảng cách|ngày.*chọn|tạm dừng đến/i.test(reason)) guide = {
    title: 'Đang chờ lịch hoặc mốc tạm dừng', explanation: 'Tài khoản chưa đến thời gian được phép chạy theo cấu hình.',
    steps: ['Kiểm tra khung giờ, ngày trong tuần, khoảng cách phiên và mốc “Tạm dừng đến”.', 'Chờ đúng thời điểm hoặc sửa cấu hình rồi Lưu nếu bạn muốn thay đổi lịch.', 'Được phép chạy không đồng nghĩa tự khởi chạy: cần bật lịch tự động hoặc yêu cầu chạy thủ công.'], destination: 'settings'
  }
  else if (/số phiên|ngân sách|đạt mục tiêu|không còn nhiệm vụ|Chỉ theo dõi/i.test(reason)) guide = {
    title: 'Đã đạt giới hạn hoặc không còn nhiệm vụ phù hợp', explanation: 'Đây có thể là trạng thái bình thường: đạt mục tiêu, hết lượt/phiên, chỉ theo dõi hoặc không còn nhiệm vụ được bật.',
    steps: ['Vào Cài đặt xem mục tiêu, ngân sách đã dùng và các nhiệm vụ đang bật.', 'Nếu đã đạt giới hạn ngày, chờ ngày mới. Chỉ sửa và Lưu cấu hình nếu đó là chủ ý của bạn.', '“Gỡ chờ lỗi” không xoá số lượt/phiên và không ép chạy qua giới hạn.'], destination: 'settings'
  }
  else if (/đang nghỉ|blockedUntil|thời gian nghỉ/i.test(reason) || until) guide = {
    title: 'Tài khoản đang trong thời gian nghỉ', explanation: 'Một sự cố trước đó đã kích hoạt thời gian nghỉ theo cấu hình.',
    steps: ['Xem các cảnh báo trước thông báo này để tìm nguyên nhân gốc.', 'Chờ hết thời gian nghỉ rồi Cập nhật trạng thái.', 'Nếu đã xử lý nguyên nhân và muốn thử sớm, vào Cài đặt để kiểm tra rồi gỡ chờ lỗi.'], destination: 'settings'
  }
  return guide ? { ...guide, target, remaining, until } : null
}
