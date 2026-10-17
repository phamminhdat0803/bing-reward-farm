import { keywordKey } from '../../shared/keywords'
// Kho query: cau co san + cau ghep tu dong, khong lap trong ngay (port tu bing-reward)
import fs from 'node:fs'
import { pick } from './logger'

const BASE = [
  'thời tiết hà nội hôm nay', 'giá vàng sjc hôm nay', 'tỷ giá usd vnd', 'tin tức công nghệ mới nhất',
  'cách nấu phở bò ngon', 'gà rán kfc khuyến mãi', 'cách làm bánh mì tại nhà', 'cách pha cà phê phin',
  'học javascript cơ bản', 'nodejs là gì', 'cách dùng git rebase', 'sql index hoạt động thế nào',
  'typescript generic ví dụ', 'docker compose mẫu', 'cách deploy lên vps', 'cách tối ưu seo website',
  'học tiếng anh giao tiếp', '500 từ vựng tiếng anh thông dụng', 'cách học ielts 7.0',
  'bài tập yoga giảm mỡ bụng', 'thực đơn eat clean 7 ngày', 'cách giảm cân an toàn', 'cách ngủ ngon hơn',
  'du lịch đà lạt tháng 10', 'kinh nghiệm du lịch sapa', 'khách sạn gần biển nha trang', 'ăn gì ở huế',
  'cách chăm sóc cây cảnh trong nhà', 'trồng rau sân thượng', 'cây lưỡi hổ để bàn',
  'lịch thi đấu bóng đá ngoại hạng anh', 'kết quả bóng đá việt nam', 'bảng xếp hạng v league',
  'phim hay trên netflix', 'nhạc lofi thư giãn', 'sách hay nên đọc', 'cách học đàn guitar',
  'mẹo vặt nhà bếp', 'cách tẩy vết ố quần áo', 'vệ sinh máy giặt đúng cách', 'cách tiết kiệm điện',
  'giá xe điện vinfast', 'kinh nghiệm mua xe cũ', 'bảo dưỡng xe máy định kỳ',
  'cách đầu tư chứng khoán cho người mới', 'lãi suất ngân hàng mới nhất', 'bitcoin là gì',
  'học lập trình python cho người mới', 'machine learning cơ bản', 'chatgpt dùng như thế nào',
  'cách viết cv xin việc', 'câu hỏi phỏng vấn thường gặp', 'cách tạo website miễn phí',
  'windows 11 mẹo hay', 'cách tăng tốc máy tính', 'excel hàm vlookup', 'cách dùng pivot table',
  'phương pháp pomodoro', 'cách quản lý thời gian hiệu quả', 'hệ mặt trời có bao nhiêu hành tinh',
  'lịch sử việt nam tóm tắt', 'biến đổi khí hậu nguyên nhân', 'cách chăm sóc chó con', 'thức ăn cho mèo'
]

const TOPICS = [
  'trí tuệ nhân tạo', 'xe điện', 'bất động sản', 'chứng khoán', 'giá xăng hôm nay', 'du lịch hè',
  'ẩm thực đường phố', 'phim việt nam', 'bóng đá việt nam', 'yoga tại nhà', 'eat clean', 'giảm cân',
  'lập trình web', 'python', 'javascript', 'docker', 'linux', 'điện toán đám mây', 'học máy',
  'an ninh mạng', 'thương mại điện tử', 'marketing online', 'seo', 'tiếng anh giao tiếp', 'ielts',
  'nhiếp ảnh', 'quay dựng video', 'guitar', 'vẽ tranh', 'đọc sách', 'cây cảnh', 'nuôi thú cưng',
  'nấu ăn tại nhà', 'bánh ngọt', 'cà phê', 'trà sữa', 'đà lạt', 'sapa', 'phú quốc', 'nha trang',
  'hội an', 'hà giang', 'hà nội', 'đà nẵng', 'huế', 'ô tô điện', 'xe máy điện', 'bảo hiểm xe',
  'đầu tư vàng', 'tiết kiệm', 'quản lý tài chính', 'thuế thu nhập cá nhân', 'máy tính xách tay',
  'điện thoại mới', 'tai nghe chống ồn', 'đồng hồ thông minh', 'nhà thông minh', 'robot hút bụi',
  'năng lượng mặt trời', 'thiên văn', 'vũ trụ', 'khủng long', 'đại dương', 'núi lửa', 'khí hậu',
  'lịch sử thế giới', 'triết học', 'tâm lý học', 'kinh tế học'
]

const TEMPLATES = [
  '{t}', '{t} là gì', '{t} mới nhất', '{t} hôm nay', 'cách chọn {t}', 'kinh nghiệm về {t}',
  '{t} có tốt không', 'so sánh {t} và {t2}', '{t} giá bao nhiêu', 'hướng dẫn {t}', 'review {t}',
  '{t} 2026', 'tin tức {t}', 'xu hướng {t}', '{t} cho người mới', 'lợi ích của {t}',
  'nhược điểm của {t}', '{t} ở việt nam', 'top 10 {t}', 'câu hỏi thường gặp về {t}'
]

export function buildPool(extraFile?: string): string[] {
  const pool = [...BASE]
  for (const tpl of TEMPLATES) {
    for (const t of TOPICS) {
      const t2 = pick(TOPICS.filter((x) => x !== t))
      pool.push(tpl.replaceAll('{t2}', t2).replaceAll('{t}', t))
    }
  }
  if (extraFile && fs.existsSync(extraFile)) {
    const extra = fs
      .readFileSync(extraFile, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith('#'))
    pool.push(...extra)
  }
  return [...new Set(pool)]
}

export function makeQueryPicker(pool: string[], used: Set<string>): () => string {
  const keys = new Set([...used].map(q => keywordKey(q)))
  const remaining = pool.filter(q => !keys.has(keywordKey(q)))
  return function nextQuery(): string {
    if (remaining.length === 0) return ''
    const i = Math.floor(Math.random() * remaining.length)
    const [q] = remaining.splice(i, 1)
    return q
  }
}
