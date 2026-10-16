# Security review — cài đặt kịch bản (2026-10-16)

Phạm vi: bốn IPC `policy:get/save/preview/resume`, validator/planner, ngân sách ghi file,
hook gửi tìm kiếm và phần lịch tự động được thay đổi trong yêu cầu này.
Đây là kiểm tra mã nguồn và kiểm thử trong môi trường desktop cục bộ; không phải kiểm thử xâm nhập.

## Kết quả

Không phát hiện vấn đề bảo mật mức Cao/Nghiêm trọng trong phạm vi thay đổi sau kiểm tra.
Các đầu vào kiểm soát lịch, số lượt và cấu hình riêng được kiểm tra ở main process.
Không bổ sung HTTP endpoint, URL tuỳ ý, thực thi lệnh hay cơ chế vượt xác minh.

## Những trường hợp đã kiểm tra

- `src/main/index.ts:1391`: thao tác cài đặt chỉ đi qua IPC của ứng dụng; `resume` xác minh id là chuỗi
  và đối chiếu registry trước khi đổi dữ liệu. Không nhận đường dẫn file từ renderer.
- `src/shared/policy-engine.ts:13`: whitelist trường, giới hạn số/ngày/giờ/độ lớn override;
  từ chối id lạ và các key prototype. Render dùng React, không đưa chuỗi cấu hình vào HTML trực tiếp.
- `src/main/policy-service.ts:19`: tên file cố định trong userData, ghi file tạm rồi rename;
  lỗi file quota làm dừng thay vì tự đặt ngân sách về 0.
- `src/main/policy-service.ts:67`: giữ lượt trước khi gửi truy vấn; desktop/mobile cùng ngân sách.
  Khởi động lại và gỡ chờ lỗi không xoá lượt/phiên đã dùng.
- `src/main/core/search.ts:198`: kiểm tra giới hạn/xác minh trước khi gửi; không giải CAPTCHA.
- `src/main/settings.ts:46`: whitelist chu kỳ lịch ở cả ghi và đọc; dữ liệu không hợp lệ không tạo timer 1 ms.

Kiểm thử: 24 ca planner/service/core/scheduler/settings, gồm trường hợp IPC sai kiểu, prototype key,
file hỏng, restart, ngân sách dùng chung, xác minh, lỗi đọc điểm và lỗi ghi cài đặt.
Kiểm thử giao diện xác nhận xem trước không tự lưu, lưu/khôi phục cấu hình và không tràn ngang ở 1184/1680 px.

## Ngoài phạm vi

Cơ chế xác thực và chống lạm dụng của Microsoft, hiệu quả của lựa chọn hạn mức đối với Bot score,
các IPC quản lý profile/trình duyệt cũ và khả năng can thiệp file bởi người dùng Windows khác.
Không kiểm tra bằng việc chạy truy vấn kiếm điểm thật.
