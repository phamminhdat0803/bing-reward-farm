# Bing Reward Farm

App **Electron + Vite (React + Tailwind + shadcn)** quản lý nhiều **tài khoản/profile trình duyệt** để chạy
automation Microsoft Rewards: mỗi profile một **cổng CDP riêng**, bảng theo dõi điểm + tiến độ hôm nay,
chạy search desktop / mobile / daily set, xem log trực tiếp.

Giao diện theo **MiniMax** (`DESIGN.md`): canvas trắng, ink `#0a0a0a`, hairline `#e5e7eb`, DM Sans,
nút pill, badge pill, data-table header nền surface, banner đen trên cùng.

Phần lõi automation được **chuyển từ** `D:\Workspace\NodeJS\bing-reward` sang `src/main/core/`.

## Chạy

```powershell
cd D:\Workspace\ElectronJS\bing-reward-farm
npm install
npm run dev            # mở app (dev, hot reload)
npm run build          # build ra out/
npm start              # chạy bản đã build
```

## Chính sách mở trình duyệt (quan trọng)

- **Mở app KHÔNG mở trình duyệt** — bảng chỉ đọc **cache** (`%APPDATA%\bing-reward-farm\cache.json`).
- Chỉ mở trình duyệt để lấy điểm khi:
  1. **Sang ngày mới** (cache là của hôm qua) — có công tắc “Sang ngày mới tự lấy điểm”; hoặc
  2. Người dùng bấm **Cập nhật trạng thái**.
- Bảng tự nạp lại mỗi 60 giây nhưng chỉ đọc cache.

## Tính năng

| Nhóm | Chi tiết |
|---|---|
| **Dò trình duyệt** | Nút **Trình duyệt (N)** trên thanh trên: liệt kê mọi trình duyệt đã cài (tên, phiên bản, đường dẫn, nhân Chromium hay không). Tài khoản chính nên dùng **Edge** (bonus Edge); tài khoản phụ dùng **Chrome / Brave / Cốc Cốc** để không bị Windows tự gắn tài khoản Microsoft |
| **Proxy cho browser** | Cấu hình proxy riêng cho từng tài khoản (HTTP, HTTPS, SOCKS5). Hỗ trợ định dạng `host:port`, `host:port:user:pass`, `protocol://user:pass@host:port`. Có nút **Kiểm tra proxy** trực tiếp (trả về IP ngoại mạng, vị trí địa lý, độ trễ ms hoặc lỗi cụ thể) trong form Thêm/Sửa và Drawer |
| Bảng tài khoản | Mỗi dòng = 1 profile: điểm hiện có, điểm hôm nay, **Desktop x/trần**, **Mobile y/trần** (trần tự nhận diện: 15 / 30 / 90 điểm), **Daily set x/3**, trạng thái (đã đăng nhập / chưa có dữ liệu / số liệu hôm qua / browser mở / đang chạy), thời điểm cập nhật |
| **Kiếm thêm (Keep earning)** | Kịch bản mới: vào `rewards.bing.com/earn`, click các thẻ *daily offer* (clownfish +15, Pisa +15, quiz +5, imagepuzzle +5…) — **click là cộng điểm ngay**. Đo thật 13/10: **+46 điểm trong ~1 phút**. Thẻ referral bị bỏ qua (không cộng điểm). Chạy riêng hoặc nằm trong **Chạy tất cả** |
| **Cột Keep earning** | Bảng hiển thị `x/y` của mục *Keep earning* từng tài khoản (đọc từ trang `/earn`) — nhìn là biết acc nào còn điểm chưa lấy. `0/0` = khu vực không có mục này |
| **Tab Proxy** | Kho proxy dùng chung (`proxies.json`): thêm/sửa/xoá, **Dán hàng loạt** (mỗi dòng 1 proxy, tự bỏ dòng trùng), **kiểm tra trực tiếp** (IP, quốc gia, độ trễ) từng proxy hoặc **Kiểm tra tất cả** (song song 6 luồng — 72 proxy hết ~100s), và biết proxy nào đang được tài khoản nào dùng. Hỗ trợ `http(s)://`, **`socks4://`**, `socks5://`, `host:port:user:pass`. Khi tạo/sửa tài khoản chỉ cần **chọn proxy từ kho** — không phải gõ lại chuỗi proxy |
| Thanh menu (kiểu GPMLogin) | Thêm · **Cập nhật trạng thái** · **Chạy tất cả ▾** (Full / Search desktop / Search mobile / Daily set / **Kiếm thêm**) · **Mở trình duyệt ▾** (mở kèm CDP / cửa sổ đăng nhập / đóng) · **Thao tác khác ▾** (sửa / nạp lại / xoá) · tìm kiếm · chọn nhiều dòng |
| Panel chi tiết | Điểm, 6 thanh tiến độ (desktop/mobile/daily set/search streak/Edge minutes/App check-in), danh sách thẻ daily set, lịch sử tháng–năm–lifetime, CDP, đường dẫn profile (copy) |
| Profile | Thêm/sửa/xoá, mỗi profile một `user-data-dir` + **cổng CDP** (tự cấp 9400–9500) trong `profiles.json` |
| Trình duyệt | **Mở trình duyệt** = Edge thật với `--remote-debugging-port=<port>` (người dùng nhìn thấy); automation **attach qua CDP** nên không giành profile; **Đóng** = `taskkill /T /F` |
| Đăng nhập | Nút **Đăng nhập** mở Edge ở `rewards.bing.com/earn`, tự phát hiện qua cookie `_C_Auth/MSPAuth/MSPProf/WLSSC/.MSA.Auth` |
| Lịch sử chạy | `%APPDATA%\bing-reward-farm\state\<profile>.json` (số search, điểm trước/sau, query đã dùng theo ngày) |
| Log | `%APPDATA%\bing-reward-farm\logs\<profile>\YYYY-MM-DD.log` + panel “Log trực tiếp” |

## Nguồn số liệu (đã kiểm chứng 2026-10-13)

- Trần ngày nằm trong **drawer “Points breakdown”** ở `rewards.bing.com/earn` — **không có API** (bắt hết
  xhr/fetch chỉ thấy telemetry), nên app **click mở drawer rồi đọc DOM** `[role="dialog"]`.
- Đăng nhập xác định bằng **cookie**, không dùng `/api/getuserinfo` (endpoint này trả **401 kể cả khi đã
  đăng nhập**).
- Rewards **báo số trễ 1–2 phút** (có lúc ~10 phút) — app luôn đọc trần ở đầu run rồi tính số search cần.

Số đo thật hôm 2026-10-13: điểm 3.267 · hôm nay 114 · desktop 72/90 · mobile 18/60 · offers 24 ·
daily set 3/3 · 3 điểm/search cho cả desktop và mobile ⇒ trần ~180 điểm/ngày.

## Kiến trúc

```
src/main/index.ts        cửa sổ Electron + IPC (profiles/browser/rewards/run)
src/main/profiles.ts     registry profile + cấp cổng CDP + đường dẫn state/log
src/main/browsers.ts     mở/đóng Edge kèm CDP, dò CDP đang sống
src/main/runner.ts       snapshot số liệu + chạy các pass, stream log
src/main/core/*          lõi automation port từ bing-reward (rewards/search/daily/browser/queries/state)
src/preload/index.ts     contextBridge: window.api
src/renderer/src/        UI React + Tailwind v4 + shadcn (components/ui/*)
src/shared/types.ts      kiểu dùng chung 3 tầng
```

## Ghi chú vận hành

- Một `user-data-dir` chỉ mở được **một** tiến trình: nếu profile đang mở bởi cửa sổ Edge không CDP,
  app báo lỗi rõ ràng — hãy đóng cửa sổ đó rồi bấm **Mở trình duyệt** để app mở kèm CDP.
- Chạy ẩn: bật `headless` trong profile (dùng khi không cần nhìn cửa sổ).
- Tính năng dev: `BRF_CAPTURE=1` (và `BRF_CAPTURE_DELAY` ms) sẽ chụp cửa sổ app ra `docs/screenshot-*.png`.
