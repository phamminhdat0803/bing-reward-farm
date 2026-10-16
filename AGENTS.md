# AGENTS.md — bing-reward-farm

App Electron quản lý nhiều profile trình duyệt + automation Microsoft Rewards.
Electron 39 + electron-vite 5 + React 19 + Tailwind v4 + shadcn. Lõi automation port từ
`D:\Workspace\NodeJS\bing-reward`.

## Lệnh

```powershell
npm install
npm run dev        # electron-vite dev (HMR renderer, tự build main/preload)
npm run build      # build ra out/
npm run typecheck  # tsc 2 project (tuỳ chọn, có thể còn lỗi kiểu ở core port)
BRF_CAPTURE=1 BRF_CAPTURE_DELAY=50000 npm run dev   # chụp UI ra docs/screenshot-*.png
```

## Bản đồ file

| File | Việc |
|---|---|
| `src/main/index.ts` | cửa sổ + toàn bộ `ipcMain.handle` (`profiles:*`, `browser:*`, `rewards:*`, `run:*`, `state:list`, `settings:*`) + `dayWatcher()` |
| `src/main/profiles.ts` | registry JSON ở `%APPDATA%\bing-reward-farm\profiles.json`, cấp cổng CDP 9400–9500 |
| `src/main/browsers.ts` | mở Edge kèm `--remote-debugging-port`, dò CDP sống, `taskkill /T /F` khi đóng |
| `src/main/cache.ts` | cache điểm theo profile (`cache.json`), `needsNewDayRefresh()` — **nguồn dữ liệu của bảng** |
| `src/main/browser-detect.ts` | dò trình duyệt đã cài (registry App Paths + đường dẫn quen thuộc + version), `exeFor(id)`, `exeForCached(id)` |
| `src/main/settings.ts` | `settings.json`: `autoRefreshOnNewDay`, `refreshGapMs` |
| `src/main/runner.ts` | `snapshot()` (MỞ trình duyệt đọc điểm), `refresh()/refreshMany()` (đọc + ghi cache), `startRun()` |
| `src/main/core/` | `rewards.ts` (điểm + drawer), `search.ts`, `daily.ts`, `earn.ts` (**Keep earning**), `browser.ts`, `queries.ts`, `state.ts` |
| `src/renderer/src/App.tsx` | layout MiniMax: banner + topnav + StatStrip + AppToolbar + **AccountsTable full-width** + **AccountDrawer** + LogPanel |
| `src/renderer/src/components/` | `AppToolbar` (kiểu GPMLogin), `AccountsTable` (12 cột), `AccountDrawer` (Sheet chi tiết), `AccountDialog`, `StatStrip`, `LogPanel`, `ui/*` (shadcn đã chỉnh theo MiniMax) |

## Sửa lỗi + tính năng 2026-10-14

- **Chọn proxy kiểu mới**: `AccountDialog` chỉ còn **1 card** "Proxy" (hiện proxy đang chọn + badge độ trễ).
  Bấm card → `ProxyPickerDialog` (`z-[70]`): **tìm kiếm** (tên/url/IP/quốc gia), **sắp xếp** (độ trễ tăng/giảm,
  tên A→Z, chưa gắn trước), lọc **"Chỉ proxy chưa gắn"**, và mỗi dòng hiện **badge tài khoản đang dùng proxy đó**
  (lấy từ `rows` truyền vào `AccountDialog`) + nút "Không dùng proxy".
- **Hộp thoại thêm/sửa tài khoản bỏ 3 tab** → 1 form duy nhất cuộn được (`ScrollArea`, các mục *Cơ bản → Hạn mức →
  Nâng cao* xếp dọc) — không phải click qua lại giữa các tab.

- **Nhãn menu/popover bị xuống dòng** (vd "Chỉ Kiếm thêm (Keep earning)" thành 2 hàng khi mở):
  `ui/dropdown-menu.tsx` + `ui/context-menu.tsx` thiếu `whitespace-nowrap`, và các menu đặt **width cứng**
  (`w-48/52/56/60/64`) nên nhãn dài bị bẻ dòng. Sửa: thêm `whitespace-nowrap` cho Item/Checkbox/Radio/SubTrigger/Label
  (đồng thời style theo token MiniMax) và đổi width cứng → `min-w-[...]` để menu tự giãn.
  Kiểm chứng (`BRF_OPEN_MENU='button[title="Tuỳ chọn chức năng chạy"]'`): cả 5 mục đều `h=32px`, 1 hàng.

- **Dùng `ScrollArea` (shadcn/Radix) thay cuộn native**: `ui/table.tsx` render bảng trong `ScrollArea` +
  `ScrollBar orientation="horizontal"`; `LogDock`, `AccountDrawer` (thân + log) cũng chuyển sang ScrollArea.
  - Radix mặc định `type="hover"` ⇒ thanh cuộn **chỉ hiện khi rê chuột** (thậm chí không render). Đặt
    `type="always"` trong `ui/scroll-area.tsx` để luôn hiện; thumb màu `--hairline` → hover `--stone`.
  - Radix bọc children trong `div display: table` (inline style) — **không** ép `block` được bằng class
    (`!block` là cú pháp Tailwind v3; v4 phải `block!`), nhưng **không cần**: đã đo `thead` sticky vẫn lệch 0px
    trong `[data-slot="scroll-area-viewport"]`.
  - Kiểm chứng DOM: `[data-slot="scroll-area-scrollbar"][data-state="visible"]` cho cả dọc và ngang + thumb.

- **Sticky header bảng**: `ui/table.tsx` để `border-collapse` ⇒ Chrome **vô hiệu hoá `position: sticky`** trên
  `<thead>/<th>`. Sửa thành `border-separate border-spacing-0` (đường kẻ chuyển sang `[&>td]:border-b`).
  Đồng thời `ProxyPanel` bỏ lớp `div.overflow-auto` bọc ngoài `<Table>` (2 lớp cuộn ⇒ sticky không dính).
  Kiểm chứng (`BRF_TEST_STICKY=1` trên tab Proxy): cuộn `scrollTop=500` (nội dung 2987px, khung 720px),
  header lệch **0px** so với đỉnh khung.
- **Sort proxy theo độ trễ (reply delay)**: `ProxyPanel` có state `sortBy` + dropdown **Sắp xếp**:
  *Mặc định · Độ trễ tăng dần · Độ trễ giảm dần · Tên A→Z · Vừa test gần đây*; proxy lỗi/chưa test luôn xếp cuối
  khi sort theo độ trễ. Trạng thái sort hiện ở dòng đáy bảng.

- **Chip "proxy đã xoá" sai (3 acc đang gán proxy thật)**: bản pull về làm `App.tsx` chỉ `setProxyCount(...)` mà
  **quên `setProxies(...)`** ⇒ `proxyLabels` rỗng ⇒ chip nào cũng hiện "proxy đã xoá". Sửa: set cả hai.
  (Kiểm tra nhanh: `profiles.json.profile.proxyId` phải khớp `proxies.json.items[].id`.)
- **Bug "bấm dòng 1 mở drawer, dòng 2 tắt, dòng 3 mở"**: Sheet để `modal={false}` nên Radix vẫn dismiss khi
  pointerdown ra ngoài ⇒ cú bấm sang dòng khác vừa đóng vừa mở. Sửa: `onInteractOutside`/`onFocusOutside` →
  `preventDefault()` trong `AccountDrawer`. Kiểm chứng tự động (`BRF_TEST_DRAWER=1`):
  `bấm dòng 0→MO Tài khoản chính · 1→Tháp Vu · 2→Tiến Đạt Dương · 1→Tháp Vu · 0→Tài khoản chính`.
- **Menu chuột phải**: thêm `ui/context-menu.tsx` (shadcn). Dòng tài khoản: Xem chi tiết · Sửa · Mở/Đóng trình duyệt ·
  Cập nhật trạng thái · Chạy full (nhãn "Chạy N tài khoản (full)" khi chọn nhiều) · Search desktop/mobile · Daily set ·
  Kiếm thêm · Đăng xuất · Xoá khỏi danh sách. Dòng proxy: Kiểm tra · Copy chuỗi · Sửa · Xoá.
  Chuột phải vào dòng chưa chọn ⇒ tự chọn dòng đó.
- ⚠ **Proxy chết ⇒ tài khoản hiện "chưa đăng nhập" + dấu `—`** (không phải mất login!). Đo 2026-10-14:
  `socks4://116.104.251.199:1088` (gán cho Tháp Vu) **Timeout** ⇒ acc đó không vào được Bing;
  `socks4://116.101.14.169:1100` vẫn OK 729ms. Proxy free chết rất nhanh — test lại trước khi chạy.

## Tab "Proxy" (kho proxy dùng chung) — 2026-10-13

- **Bulk add**: nút **Dán hàng loạt** (`BulkProxyDialog.tsx`) — dán mỗi dòng 1 proxy, hiện số dòng + đếm theo giao thức,
  tự bỏ dòng trống / dòng `#` / dòng trùng. Main: `addProxyBulk(lines)` + IPC `proxies:addBulk`.
- **`socks4://` ĐÃ được hỗ trợ** (trước đây `parseProxy` chỉ nhận http/https/socks5 nên `socks4://...` bị parse thành
  `http://socks4` — sai). Đã sửa regex thành `/^(https?|socks4|socks5):\/\//i`.
- **Đo thật 2026-10-13 16:33** với 72 proxy người dùng dán (bulk add 72/72, test song song 6 luồng mất 99s):
  **19/72 chạy được** — `socks4 14/31`, `socks5 5/23`, `http 0/18`. Nhanh nhất ~177ms (`socks4://171.248.212.149:1080` → Hà Nội).
- ⚠ **Chỉ chạy 1 instance app**: 2 cửa sổ cùng mở sẽ cùng ghi `proxies.json` (mỗi lần test ghi cả file) ⇒ danh sách bị
  ghi đè chồng nhau (đã gặp: 72 → 18). Test all giờ gom kết quả rồi ghi 1 lần/item nhưng vẫn phải 1 instance.
- Kho ở `%APPDATA%\bing-reward-farm\proxies.json` (`src/main/proxies.ts`): `{id, label, url, note, lastTest, createdAt}`.
- IPC: `proxies:list/add/update/remove/test/testAll`; preload: `listProxies/addProxy/updateProxy/removeProxy/testSavedProxy/testAllProxies`.
- UI: `ProxyPanel.tsx` (bảng Tên · Chuỗi proxy · Kết quả test gần nhất · Tài khoản đang dùng · Thao tác) + `ProxyDialog.tsx` (có nút **Kiểm tra ngay**).
- **Tài khoản chỉ chọn proxy**: `AccountDialog` tab *Nâng cao* liệt kê proxy trong kho (không gõ chuỗi nữa) → lưu `profile.proxyId`.
  `resolveProxyUrl(profile)` ưu tiên `proxyId` → fallback chuỗi `profile.proxy` cũ; `coreConfig()` dùng hàm này nên launch automation tự có proxy.
- Xoá proxy đang được gắn ⇒ UI chặn và báo phải đổi proxy cho các acc đó trước.
- Đo thật: seed 2 proxy giả `127.0.0.1:8888` / `socks5://127.0.0.1:1080` → test trả
  `Không thể kết nối đến máy chủ proxy (Connection refused)`, kết quả lưu vào `lastTest` và hiện badge **LỖI** (đường test chạy đúng).

## Cột "Keep earning" — tài khoản nào có mục này

- `parseBreakdownText` và `readBreakdown` giờ đọc thêm `Keep earning x/y` từ **thân trang** `/earn` (không nằm trong drawer) → `snapshot.earn`.
- Bảng có cột **Keep earning** (giữa *Search mobile* và *Offers*): `x/y` + thanh tiến độ; `0/0` = khu vực không có mục; `không có` = cache cũ chưa đọc lại.
- Đo thật 2026-10-13 16:18 (refresh 4 acc): chính `45/45` · Tháp Vu (Đài Loan) `0/0` · Tiến Đạt Dương `0/65` · Kẻ Đào (cache cũ) `không có`
  ⇒ **nhìn cột là biết acc nào còn điểm chưa lấy** (2 acc còn 65đ).

## Kịch bản "Keep earning" (`kind: 'earn'`) — đo thật 2026-10-13

Trang `https://rewards.bing.com/earn` có mục **Keep earning x/y**; các thẻ *daily offer* ở đó **click là được cộng điểm ngay**.

| Bằng chứng đo được (acc chính, 13/10 15:12) | Kết quả |
|---|---|
| `Salt water fish — Learn all about the clownfish +15` (search `clownfish&form=ML2W4J`) | 126 → 144 |
| `Leaning a little — Leaning Tower of Pisa +15` (`form=ML2W4J`) | 144 → 162 |
| `Do you know the answer? +5` (`form=ML2BF1`, q=Bing Homepage quiz) | 162 → 167 |
| `Complete this puzzle +5` (`/spotlight/imagepuzzle?form=ML2BF0`) | 167 → 172 |
| `Turn referrals into Rewards` (7.500đ, `/refer`) | 172 → 172 — **KHÔNG cộng**, phải bỏ qua |

**Tổng +46 điểm trong ~1 phút.** Sau khi click hết, mục này chuyển `45/45` và lần chạy sau trả `status: nothing-to-do` (đã kiểm chứng bằng `BRF_AUTORUN=earn` trên acc chính: `Keep earning 45/45 | 0 the`).

Quy tắc nhận diện (`src/main/core/earn.ts → readOfferCards`):
1. Ưu tiên `a[href*="PUBL=RewardsDO"]` — thẻ daily offer chuẩn (VN/US).
2. Nếu không có thẻ nào, fallback: `a[href]` trỏ `bing.com/(search|spotlight)` **và** chữ có `+N` (cho khu vực khác, vd Đài Loan).
3. **Bỏ qua**: `/refer`, `referandearn`, `/quest/` (punchcard) và thẻ có chữ `Completed`/`đã hoàn thành`.
4. Mỗi thẻ: **click thật** trong trang `/earn` (mở tab mới) → chờ 5–9 s (`cfg.earn.waitAfterClickMs`) → đóng tab; nếu không mở tab mới thì `goto` thẳng URL offer.
5. Chạy được như một `kind` riêng: menu **Chạy tất cả ▾ → Chỉ Kiếm thêm (Keep earning)**; cũng nằm trong **Chạy tất cả** (`['desktop','daily','earn','mobile']`).

## Menu "Lịch sử" (2026-10-16)

Nguồn dữ liệu: `%APPDATA%\bing-reward-farm\state\<profileId>.json` → `days[<YYYY-MM-DD>]`, mỗi ngày có:
`desktop|mobile: {searches, pointsBefore, pointsAfter}` · `daily|earn: {items[] (label/href/visited/reward|points), pointsBefore, pointsAfter}`
· `runs: [{at, summary:{<kind>:{kind, searches, status, pointsBefore, pointsAfter, counterBefore/After}}}]` · `usedQueries`.

- `src/main/history.ts` → `listHistory({profileId?, days?})`: gom theo ngày, tính `gained` = điểm cuối − điểm đầu ghi nhận được
  (min `pointsBefore` / max `pointsAfter` từ runs + các mục task), `warnings` = run có status khác `done|credited`.
  **Không parse log** (log chỉ dùng khi cần soi chi tiết).
- IPC `history:list` + preload `listHistory`; type dùng chung ở `src/shared/types.ts` (`HistoryDay/HistoryTask/HistoryRun/HistoryItem/HistoryData`).
- UI `HistoryPanel.tsx` (tab **Lịch sử**):
  - Lọc: **7 / 14 / 30 ngày / Tất cả** · chọn tài khoản · ô tìm kiếm (ngày / tên / email / lỗi) · chỉ ngày có cảnh báo · Làm mới · **Xuất CSV** (copy clipboard).
  - KPI: điểm kiếm được · số ngày có dữ liệu · TB/ngày · lượt chạy · số cảnh báo.
  - **Biểu đồ SVG** cột theo ngày, xếp chồng theo tài khoản (màu riêng), trục tung + tooltip hover; **không dùng thư viện ngoài**.
  - **Bảng**: Ngày · Tài khoản · Search desktop · Search mobile · Daily set · Keep earning · Điểm trong ngày (kèm before→after) ·
    Lượt chạy · Chi tiết. Mở rộng từng dòng: **các lượt chạy** (giờ, kind, số search, điểm, status) + **link daily set / keep earning đã bấm** (✓/○, +điểm) + nút **Copy JSON ngày này** (gửi agent khi cần).
- Kiểm chứng 2026-10-16 (dữ liệu thật 4 ngày × 5 acc): KPI `+1329 điểm · 4 ngày · TB +332 · 80 lượt · 23 cảnh báo`;
  mở rộng dòng 16/10 Đạt Phạm: `09:22 desktop 8 search 3788→3812 (+24) done`, `10:42 mobile (+24) done`,
  `13:21 daily 3869→3899 (+30) credited`, daily set `3/3 · 30 điểm` với 3 link ✓.
  Dev hook: `BRF_TAB=history` (mở tab) · `BRF_HIST_EXPAND=1` (mở 1 dòng chi tiết + chụp ảnh).

## Quy ước UI
### Quy uoc UI chong "giat/nhay" (bat buoc — 2026-10-16)
Hai bug nguoi dung bao trong ngay 16/10, deu thuoc nhom "layout khong on dinh":

1. **Khong dung `hover:scale-*` (hay bat ky transform doi hinh hoc) tren phan tu dang neo popover/dropdown.**
   FAB proxy tung dung `hover:scale-[1.06]` lam floating-ui tinh lai vi tri moi frame -> popover nhay -> mat hover ->
   lap vo tan. Hover phai doi thu KHONG doi kich thuoc: vien + bong (`transition-[box-shadow,border-color]`).
   Do lai: hook `BRF_FAB_HOVER` lay 12 mau khi hover -> lech 0px moi truc.
2. **Thanh trang thai / chip phai CO DINH chieu cao va khong day nhau**: dung
   `grid h-8 grid-cols-[1fr_auto_1fr]` + `leading-none` + `overflow-hidden`, chip o cot phai co `min-w` va
   **so dang `mm-tabular`** — neu de `flex justify-center` thi moi lan chip xuat hien / doi noi dung
   ("dang chay" <-> "toi HH:MM") la ca dong nhay ngang va lech line-height lam thanh tren cao/thap nhay nhay.
   Do lai: hook `BRF_BAR_JITTER` do 3 trang thai (tat / bat 1 gio / co badge can phan tich) -> lech 0px.


- **Góc phải dưới = nơi báo tiến độ** (người dùng yêu cầu 2026-10-15): KHÔNG dùng banner ngang trong nội dung.
  Hai cục tròn `size-12` xếp trong 1 cột `fixed bottom-[64px] right-5 z-40` (wrapper `pointer-events-none`,
  con `pointer-events-auto`):
  1. `ProxyTestFab` (`data-slot="proxy-test-fab"`) — **vòng tiến độ SVG** + `%` ở giữa (không dùng icon xoay),
     bấm ra popover: số hoạt động / lỗi / còn lại + nút **Dừng kiểm tra**.
  2. FAB acc đang chạy (`data-slot="run-fab"`, icon `Loader2` + badge đỏ) — giữ nguyên như trước.
- **State tiến độ phải nằm ở `App`** (`proxyTest`), KHÔNG để trong `ProxyPanel`: đổi tab làm `ProxyPanel`
  unmount nên state cục bộ sẽ mất, cục tròn biến mất. `ProxyPanel` chỉ nhận props
  `testProgress / onTestAll / onTestSelected` và vẫn tự subscribe `onTestProgress` để nhảy màu từng dòng.
- Kiểm chứng (`BRF_TEST_PROXYFAB=1` + `BRF_TAB=proxies`): chụp ảnh lúc đang test ở tab Proxy, bấm sang tab
  Tài khoản rồi chụp lại — `[proxyfab] FAB sau khi doi tab: {"found":true,...,"title":"Đang kiểm tra proxy 22/251 (9%)"}`.

- **Bảng dùng `colgroup`** (`AccountsTable.tsx`): 12 cột khai báo `<col style={{ width }}>` + `Table className="min-w-[1360px]"`;
  KHÔNG đặt `min-w-*`/`w-*` trên `<TableHead>` nữa — cột không nhảy khi dữ liệu đổi.
  Cột **Tài khoản = 330px** (tên/email/meta `Edge · :9400` đều `truncate` + `whitespace-nowrap`, không xuống dòng);
  cột **Trạng thái = 225px** để badge nằm 1 hàng. (Ảnh chụp UI **không** đẩy lên git: `docs/*.png` đã vào
  `.gitignore` vì ảnh bảng lộ email tài khoản — repo public.)
- **Hộp thoại tài khoản dùng `Tabs`** (`AccountDialog.tsx`): 3 tab *Cơ bản / Hạn mức / Nâng cao*;
  `DialogContent` = `flex max-h-[86vh] flex-col overflow-hidden`, thân tab `overflow-auto` → không dài quá màn hình.
- **Thông báo dùng `sonner`** (`ui/sonner.tsx`, `toast.success/error/info`) — không dựng banner trong layout.
- **Mật độ gọn** (người dùng yêu cầu 2026-10-13): nút `h-9/h-7` (icon `size-8/size-7`), card `p-4`,
  input `h-9`, dialog `p-5 gap-3 radius 16px`, ô bảng `px-2.5 py-1.5` + header `h-9`, main `p-2.5 gap-2`,
  StatStrip `px-3.5 py-2` số 24px, dock log `h-[170px]`.

- **Bảng full width + full height**: `AccountsTable` là `flex min-h-0 flex-1` với vùng cuộn trong
  (`overflow-auto`) và `thead` **sticky**; đáy bảng có dòng tổng (số tài khoản, tổng điểm, hôm nay).
- Chi tiết nằm trong **drawer** (`ui/sheet.tsx`, `side="right"`, 520px) — mở khi bấm vào dòng hoặc nút “…”.
  Drawer có thêm mục **“Log của tài khoản này”**.
- **Log**: không chiếm chỗ của bảng — dùng **`LogDock`** ở đáy cửa sổ, mặc định thu gọn 1 dòng
  (trạng thái + dòng log cuối + số dòng + nút “Mở log”), mở ra cao 200px; có chip lọc
  “tài khoản đang chọn / tất cả”.
- Trang KHÔNG cuộn toàn cục (`main` là `flex min-h-0 flex-1`) — chỉ bảng và drawer cuộn.

## Quy tắc UI (theo DESIGN.md của người dùng)

- Nút **luôn** pill (`rounded-full`), 2 tầng: `default` = nền đen, `secondary` = viền đen, `tertiary` = viền hairline.
- Card trắng + `1px hairline` + radius 16px, **không đổ bóng**; bảng dùng header nền `surface`, chữ `steel` 13px đậm.
- DM Sans (đóng gói qua `@fontsource/dm-sans`), không dùng font thứ hai; brand color chỉ dùng cho badge/điểm nhấn.
- Không có dark mode.

## Bẫy đã gặp (đừng vấp lại)

| Bẫy | Xử lý |
|---|---|
| **Edge tự gắn tài khoản Microsoft của Windows vào profile MỚI** (implicit sign-in) — tạo profile `acc-2` mà vẫn đăng nhập `gaaral***005@gmail.com`. Bằng chứng: `Local State → profile.info_cache.Default.email` và `Default/Preferences → account_info` | Cờ `--disable-features=msImplicitSignin,msaImplicitSignin,msEdgeIdentityFeature` **KHÔNG** đủ với Edge 155. Dùng **Chrome cho tài khoản phụ**: `profile.channel='chrome'` — Chrome tạo profile sạch, `info_cache.email` rỗng (đã đo). Kèm 2 nút: **Đăng xuất** (xoá cookie) và **Xoá dữ liệu profile** (xoá thư mục, làm lại từ đầu) |
| Dev server giữ file ⇒ sửa `.tsx` báo `ReplaceFileW EIO (Win32 32)` | Tắt Electron (`Stop-Process electron`) trước khi sửa/build |
| **Nhiều lớp phủ Radix cùng lúc** (drawer + dialog) ⇒ focus bị khoá, không gõ được vào input | Chỉ mở 1 lớp phủ: mở hộp tài khoản thì tự đóng drawer/trình duyệt và ngược lại (`openAccountDialog/openDrawer/openBrowsers` trong `App.tsx`). Drawer để **`modal={false}` + không overlay** (z-40, bảng vẫn dùng được); dialog `z-[60]`; confirm `z-[70]`. Input đầu có `autoFocus` |
| Refactor `runner.ts` làm `cfg` **khai báo trong callback `withSession` nhưng dùng ở ngoài** ⇒ mọi run lỗi `run loi: cfg is not defined` (log 2026-10-13 15:06) | `const cfg = coreConfig(profile)` phải nằm ở **scope của job** (cùng chỗ `cached`/`per`/`target`), không nằm trong callback. Muốn bắt sớm: chạy `npx tsc --noEmit -p tsconfig.node.json` — `npm run build` (esbuild) **không** typecheck nên vẫn xanh |

| Bẫy | Xử lý |
|---|---|
| `shadcn init` báo *“could not detect a supported framework”* với electron-vite | Tạo tay `components.json` + khai báo `paths` trong **tsconfig.json gốc** (không chỉ tsconfig.web) rồi `npx shadcn@latest add ...` |
| `npm create @quick-start/electron@latest` **cần TTY thật** (prompt chọn framework) — pipe stdin không qua | Dựng scaffold electron-vite bằng tay (package.json, electron.vite.config.ts, tsconfig*, src/*) |
| Sửa file `.tsx` bằng `Get-Content -Raw ... | Set-Content -Encoding utf8` (PS 5.1) ⇒ **hỏng tiếng Việt** (đọc ANSI, ghi UTF-8) | Chỉ sửa file có tiếng Việt bằng tool `write`/`edit`; đã phải viết lại DailySetCard/StreakCard/LogPanel |
| `launchPersistentContext` khi profile đang mở ⇒ *“Opening in existing browser session”* | Ưu tiên **mở Edge kèm CDP rồi attach**; nếu không thì báo lỗi tiếng Việt rõ ràng cho người dùng |
| `connectOverCDP` + `browser.close()` sẽ **tắt Chrome/Edge của người dùng** | Trong `attachCdp` trả `close: async () => {}` |
| Rewards báo số trễ 1–2 phút (có lúc ~10 phút) | `snapshot` đọc thẳng `availablePoints` + drawer, đừng suy luận theo số vừa cộng |
| `snapshot` (mở Edge tạm) và `run` chạy song song ⇒ **giành profile** | `src/main/lock.ts` — `withProfileLock(profileId, fn)` bọc cả `snapshot`, `startRun` và `openBrowser`; bên trong run gọi `snapshotUnlocked` để không tự khoá nhau |
| `cdpAlive()` timeout 1.2 s ⇒ tưởng browser đã tắt rồi mở lại ⇒ đụng profile | timeout 3 s + thử 2 lần; `withSession` thử lại 3 vòng, mỗi vòng kiểm tra lại CDP trước khi mở mới |
| `BRF_AUTORUN` chạy 8 s sau khi load, trùng với snapshot đầu ⇒ lỗi | Đã có lock nên chỉ xếp hàng, không lỗi |
| Chạy `npm run dev` bằng **background job của agent** ⇒ job bị dọn/kết thúc (`exit code 1`) và app chết theo | Chạy **tách rời**: `Start-Process cmd.exe -ArgumentList '/c', 'cd /d <repo> && npm run dev > "%TEMP%\brf-dev.log" 2>&1' -WindowStyle Hidden` — app sống độc lập, log vẫn đọc được ở `%TEMP%\brf-dev.log` |
| Người dùng **tự mở Edge trên profile của app** (không có CDP) ⇒ `snapshot loi: Profile đang được mở bởi cửa sổ Edge khác` | Đúng thiết kế (không giành profile): bảo người dùng đóng cửa sổ đó hoặc dùng nút **Mở trình duyệt** để app mở kèm CDP rồi automation attach |
| Người dùng **tắt cửa sổ trình duyệt giữa lúc chạy** ⇒ `browserContext.newPage: Target page, context or browser has been closed` | Đã bắt trong `catch` của `startRun`: log `run dung giua chung: cua so trinh duyet da bi dong…` thay vì `run loi` |

## Dev hooks (chỉ dùng khi kiểm thử)

| Env | Việc |
|---|---|
| `BRF_CAPTURE=1`, `BRF_CAPTURE_DELAY=ms` | chụp `webContents.capturePage()` ra `docs/screenshot-*.png` (không phụ thuộc cửa sổ đang nổi) |
| `BRF_REFRESH=1` | tự bấm “Cập nhật trạng thái” (mở trình duyệt lấy điểm + ghi cache) |
| `BRF_DRAWER=1` | mở app với drawer chi tiết đang mở sẵn (để chụp ảnh kiểm tra) |
| `BRF_DOCK=1` | mở app với dock log đang mở sẵn |
| `BRF_BROWSERS=1` | mở app với hộp “Trình duyệt trên máy” đang mở sẵn |
| `BRF_TEST_ACCOUNT=1` | tự bấm “Thêm tài khoản”, chẩn đoán `elementFromPoint` + mô phỏng gõ phím thật rồi in `KET QUA: GO DUOC / KHONG GO DUOC` |
| `BRF_DEBUG=<port>` | bật remote debugging cho Electron (dùng với `tools/test-add-account.mjs`) |
| `BRF_AUTOOPEN=1` | tự bấm “Mở trình duyệt” (kiểm thử đường CDP) |
| `BRF_AUTORUN=daily,desktop` | tự chạy 1 run qua đúng luồng IPC → runner → core |
| `BRF_AUTORUN_PROFILE=<id>` | chọn profile cho `BRF_AUTORUN` (mặc định profile đầu tiên) |
| `BRF_TAB=proxies` | mở app ở thẳng tab Proxy |
| `BRF_BULK_FILE=<path>` | nạp danh sách proxy từ file qua đúng đường bulk add |
| `BRF_TEST_ALL=1` | (đi với `BRF_BULK_FILE`) test toàn bộ proxy sau khi nạp, in tổng kết ra console |
| `BRF_SEED_PROXY=1` | thêm 2 proxy mẫu vào kho để thử tab Proxy |
| `BRF_TEST_DRAWER=1` (+ `BRF_TEST_DELAY=ms`) | tự bấm lần lượt các dòng trong bảng, in trạng thái drawer (kiểm chứng lỗi toggle drawer) |

## Đã kiểm chứng

- 2026-10-13: scaffold electron-vite tay + `npm install` (163 gói) + `npm run build` **exit 0**
  (main 48 kB, preload 1.7 kB, renderer ~957 kB).
- 2026-10-13: `npx shadcn@latest add button card badge progress tabs input label separator switch dialog
  scroll-area -y` → 11 component trong `src/renderer/src/components/ui/`.
- 2026-10-13: app chạy `npm run dev`, cửa sổ **Bing Reward Farm** hiện trên desktop (session 8),
  log: `snapshot OK: dang-nhap=true diem=3267 hom-nay=114 desktop=72/90 mobile=18/60 offers=24
  dailySet=3/3 links=3`.
- 2026-10-13: UI hiển thị đúng các số trên (ảnh `docs/screenshot-*.png`, chụp bằng
  `webContents.capturePage()` — không phụ thuộc cửa sổ nào đang nổi).
- 2026-10-13: `BRF_AUTORUN=daily` chạy hết luồng IPC → runner → core, log stream lên UI
  (`[daily] diem=3267 Activity=3/3`, `ket thuc run: {"daily":{"status":"visited-pending",...}}`).
- 2026-10-13: `BRF_AUTOOPEN=1` → `[autoopen] {"pid":16072,"cdpUrl":"http://127.0.0.1:9400","port":9400,
  "managed":true,...}`; kiểm tra độc lập `http://127.0.0.1:9400/json/version` trả `Edg/155.0.4283.45`,
  cửa sổ Edge mở ở `rewards.bing.com/earn`.
- 2026-10-13 (refactor MiniMax + bảng + cache): mở app với cache rỗng ⇒ **không** tiến trình Edge nào
  (`edge = 0`), không sinh `cache.json` — đúng yêu cầu “đừng tự mở trình duyệt”.
- 2026-10-13: `BRF_REFRESH=1` ⇒ cache ghi `points=3267 todayPoints=114 desktop=72/90 mobile=18/60
  offers=24 signedIn=true date=2026-10-13`, Edge tự đóng sau khi đọc.
- 2026-10-13: ảnh `docs/screenshot-1791862877364.png` — bảng hiển thị dòng “Tài khoản chính / Đạt Phạm /
  CDP :9400”, toolbar pill kiểu GPMLogin, panel chi tiết, không tràn ngang.
- 2026-10-13 (đổi sang drawer): bảng full width 12 cột; chi tiết trong `ui/sheet.tsx`;
  ảnh `docs/screenshot-1791863692070.png` (mở bằng `BRF_DRAWER=1`) — drawer 520px bên phải, có overlay.
- 2026-10-13 (profile 2 sai tài khoản): nguyên nhân là Edge gắn MSA Windows; đã thêm `channel` per-profile
  (Edge/Chrome), `signOut()` và `resetProfile()`. Kiểm chứng: CDP 9401 trả `Chrome/154.0.8037.98` và
  `acc-2\Local State → info_cache.Default.email = ''` (sạch, không dính tài khoản).
- 2026-10-13 (sonner + thanh toolbar gọn có dropdown):
  + Cài đặt `sonner` shadcn (`components/ui/sonner.tsx`), bỏ hẳn banner tĩnh đẩy layout, thông báo góc phải trên (`toast.success`, `toast.error`, `toast.info`).
  + Rút gọn thanh toolbar từ 12 nút tràn thành 5 nhóm nút nằm trên đúng 1 dòng (MiniMax pill):
    `[+ Thêm tài khoản]`, `[🔄 Cập nhật trạng thái]`, `[▶ Chạy tất cả ▾]` (menu Search desktop/mobile/daily), `[🌐 Mở trình duyệt ▾]` (menu Mở/Đăng nhập/Đóng), `[••• Thao tác khác ▾]` (menu Sửa/Nạp lại/Xoá).
  + Ảnh kiểm chứng: `docs/screenshot-1791876986737.png`.
- 2026-10-13 (tính năng Proxy cho browser):
  + File `src/main/proxy-test.ts` kiểm tra proxy thời gian thực bằng Playwright request context (lấy IP ngoài, quốc gia, độ trễ ms hoặc lỗi).
  + Parser `parseProxy` hỗ trợ mọi định dạng: `host:port`, `host:port:user:pass`, `protocol://user:pass@host:port`.
  + Gắn proxy vào browser: CLI launch thêm `--proxy-server`, nếu có auth thì tự động chứng thực `setHTTPCredentials` qua CDP khi mở trình duyệt; Playwright persistent context tự động nhận `opts.proxy`.
  + Form Thêm/Sửa và Drawer hiển thị nút "Kiểm tra proxy" trực tiếp; bảng tài khoản hiển thị tag proxy `🌐 host:port`.
- 2026-10-15 (Nâng cấp tính năng Proxy & Chọn nhanh 3 proxy sạch):
  + Kiểm tra theo lô (Batch concurrency 15): timeout Bing 8s, chỉ gọi ip-api khi Bing OK (giảm thời gian test proxy chết từ 27s xuống 8s). Ghi file đệm định kỳ.
  + Stream tiến độ kiểm tra realtime qua IPC `proxies:testProgress` -> thanh `Progress` trực quan `{done}/{total}` ({ok} hoạt động, {error} lỗi) kèm nút "Dừng kiểm tra". Bảng cập nhật trạng thái xanh/đỏ thời gian thực từng dòng.
  + Nút `⚡ Gán nhanh 3 proxy sạch (ping thấp)` trong `AccountDialog` và `ProxyPickerDialog`: tự động quét toàn bộ kho, lọc các proxy chưa từng được tài khoản nào dùng (cả main lẫn fallback), đã test OK, sắp xếp latency tăng dần -> gán proxy 1 làm chính, proxy 2 & 3 làm dự phòng chỉ với 1 click.
  + Hiển thị rõ ràng trạng thái "được sài chưa": `✓ Chưa tài khoản nào dùng (Sạch)` hoặc `⚠️ Đang dùng bởi {N} tài khoản khác` trong thẻ Proxy chính, danh sách Proxy dự phòng và trong hộp thoại `ProxyPickerDialog`. Tự động đồng bộ URL proxy cũ sang kho proxy.
- Bẫy: dev server giữ file ⇒ sửa `App.tsx` có thể báo `ReplaceFileW EIO (Win32 32)`; phải tắt Electron
  (`Stop-Process electron`) rồi sửa lại.

## Fallback proxy (P2-P4) — verified 2026-10-14

Da lam xong va do that:
- Chain: `--proxy-server="p1,p2,…"` khi profile co >= 2 proxy (khong auth). Do tren Edge 155:
  chain `chet,song` -> IP ra = IP proxy (fallback that); chi proxy chet -> ERR_PROXY_CONNECTION_FAILED, KHONG tu DIRECT.
- Preflight `preflightChain()` chay truoc khi launch: loc proxy chet, promote proxy song dau tien len lam chinh,
  ghi lai profile (`proxyId=null, proxy=live[0], proxyFallbacks=live.slice(1)`), log `doi proxy chinh: A -> B`.
- Het sach proxy -> `[proxy] DUNG profile ... KHONG fallback DIRECT` + onStatusChange(false), khong mo browser.
- Co `settings.noDirectFallback` (mac dinh true) + cong tac tren header; TAT -> chay bang IP may (co canh bao).
- Health check: **Bing la kiem tra quyet dinh** (<400 live / 403,429 blocks-bing / loi ket noi dead);
  ip-api chi de hien IP — ip-api rate-limit 429 KHONG duoc coi la proxy chet (loi da tung gap, da sua).
  Ket qua fail bi cooldown 5 phut (khop cua so bad-proxy cua Chromium) -> khong ping-pong A<->B.
- UI: chon thu tu proxy du phong trong Sua tai khoan; cham mau trang thai + tooltip IP ra tren bang.
- Tools: `node tools/find-live-proxy.mjs [n]` (tim proxy vua song vua qua Bing), `node tools/set-chain.mjs set|restore`.

Chua lay duoc 1 bang chung: dong `[desktop] IP dau ra thuc te: <ip>` trong luc chay that.
Ly do (do that, khong phai loi code):
- Proxy free trong kho flap rat nhanh: cung 1 proxy qua Bing luc 10:23 nhung 10:22/10:26/10:34 da bi chan/chet.
- Acc dang nhap bang IP nha (`default`), khi doi sang proxy la -> Bing tra ve `not-signed-in`
  => pass dung som truoc buoc do IP. Muon co bang chung: dang nhap acc qua dung proxy do
  (Mo trinh duyet -> dang nhap) roi chay lai, hoac dung proxy tra phi on dinh.

## Che do TU DONG + leo thang cho agent (2026-10-16)

Nguoi dung yeu cau: menu chon chu ky (1 phut / 1 gio / 3 gio) tu chay lai den khi DU DIEM; acc gap loi proxy
thi TU kiem tra toan bo proxy -> TU gan lai 3 proxy sach -> chay tiep; point nao sau **3 lan retry khong len**
thi ghi HO SO de agent phan tich (agent chay lai demo tim huong sua, khong duoc thi nguoi dung ho tro).

- `src/main/auto.ts`:
  - `pendingTasks(profile)` — task con thieu theo so lieu da luu (`cache.get`), KHONG mo trinh duyet:
    desktop < min(desktopMax, max thuc te) · mobile < mobileMax · dailySet < max · offers < 1.
  - `runAutoCycle(reason)` — 1 vong cho tat ca acc: kiem tra `resolveProxyChain` + `preflightChain`; neu **ca chain deu chet**
    thi `remediateProxies()`: `testAll(15)` → `pickCleanProxies(3)` (lastTest.ok, ping thap, **chua acc nao dung**) →
    `updateProfile({proxyId, proxyFallbacks})` → chay tiep. Sau khi run xong cho **90 giay** (diem bao cao tre) roi doc lai cache.
  - Tang `tries` khi tien do task **khong doi**; `tries >= 3` ⇒ `writeEscalation()` ghi
    `%APPDATA%\bing-reward-farm\escalations\<ngay>-<acc>-<task>.json` (summary tieng Viet + `goiYChoAgent` + toàn bộ attempts:
    diem truoc/sau, tien do truoc/sau, proxy, loi). Task da leo thang thi **khong chay lai** trong ngay.
  - `setAutoEvery(ms)` luu `settings.autoEveryMs`; `startAutoLoop()` hen gio lai; state luu `auto-state.json` (reset theo ngay).
- IPC/preload: `auto:status`, `auto:setEvery`, `auto:runNow`, `auto:stop`, `auto:escalations`, `auto:pending`, `auto:pickClean`,
  su kien `auto:changed` + log `[tu dong] ...` day len khung Log.
- UI: menu **Cài đặt chạy → “⏱ Tự động chạy”** (Tắt / Mỗi 1 phút / Mỗi 1 giờ / Mỗi 3 giờ). Khi bat, thanh tren hien chip
  `⏱ tự động 1 giờ · tới HH:MM · N vòng`. Co ho so thi hien nut do **“⚠ N điểm cần phân tích”** → bam se copy đường dẫn các file
  JSON để đưa cho agent.
- Kiem chung 2026-10-16 (`BRF_AUTO_TEST=1 BRF_AUTO_FAKE_FAIL=1`): bat chu ky 1 phut -> `enabled=true nextAt=...`;
  `pendingTasks` dung voi du lieu that (`mobile, dailySet, offers` — desktop da 90/90); `pickCleanProxies(3)` ra
  3 proxy sach (231/291/316ms); ghi va liet ke ho so OK; UI hien badge `⚠ 1 điểm cần phân tích`; tra chu ky ve 0 sau test.

### 2 BUG cua che do tu dong, tim ra tu chinh 6 ho so leo thang (2026-10-16)

Nguoi dung dan 6 file escalation. Doc `attempts` + doi chieu log profile ⇒ **ca 6 deu la bao dong SAI**:

1. **SAI KIND (nang nhat)**: auto truyen `['mobile','dailySet','offers']` nhung runner chi hieu
   `kinds.includes('desktop'|'mobile'|'daily'|'earn')`. `'dailySet'`/`'offers'` **khong duoc nhan ra**
   ⇒ auto **chua bao gio chay daily set**, sau 3 vong lai ghi ho so "daily set khong len diem".
   Log chung minh: `[run] Tat ca cac task yeu cau (mobile, dailySet, offers) deu da hoan thanh!`.
   ⇒ Doi `AutoTask = 'desktop' | 'mobile' | 'daily' | 'earn'` (trung kind runner) + `normalizeTask()` cho ten cu.
2. **SAI MAX MOBILE**: truoc day lay `profile.mobileMax ?? 60` nen acc **khong co diem mobile** (Level 1 / Taiwan,
   snapshot `mobile max = 0`) van bi xep lich mobile 3 lan ⇒ 4 ho so sai. Nay chi xep khi `cached.mobile.max > 0`.
3. **Proxy chet giua run** bi tinh la "task khong len diem": log co `DUNG profile: ca 3 proxy deu chet`.
   Nay `runLog` chua cau do ⇒ **khong tang tries**, thay bang remediate proxy roi chay lai.
4. **Het proxy sach** ⇒ ghi ho so rieng `<ngay>-<acc>-proxy.json` de **nguoi dung bo sung proxy** (dung luong
   "khong sua duoc thi nguoi ho tro"). `attempts` nay kem `error` = 6 dong log cuoi cua run + `context`
   (level, desktop/mobile/dailySet/earn, setLinks) cho agent phan tich tiep.
   Sau khi sua, `pendingTasks` that te tra ve: `default: earn`, `thap-vu: du diem`, `datkenhtg: daily, earn` (hop ly).

### Bug "treo 1 lenh cho mai" (2026-10-16)

Trieu chung: badge `Lệnh chờ của cùng acc (1) — Đạt Phạm — 1 lệnh chờ` dung mai, khong chay cung khong mat.
Nguyen nhan: `pumpProfile()` trong `runner.ts` lay lenh ra va chay tiep nhung **khong goi `notifyQueue()`**
⇒ renderer khong bao gio duoc cap nhat ⇒ badge treo vinh vien (du hang doi thuc te da rong).

Da sua + chan tai phat:
- `pumpProfile()` goi `notifyQueue()` o moi nhanh; `startRunNow` xong cung notify.
- `PendingRun.queuedAt` + **watchdog** moi 30s (`watchdogQueues`): acc co lenh cho ma **khong co job nao chay** ⇒ chay tiep;
  lenh cho **qua 15 phut** ⇒ bo + ghi log `[queue] BO N lenh cho treo cua <acc>`.
- `clearQueue(profileId?)` + IPC `run:clearQueue`: UI co nut **Xoá** tung acc va **Xoá hết** trong popover lệnh chờ,
  kem tuoi lenh (`oldestWaitMs` → "3 phút").
- Kiem chung `BRF_QUEUE_TEST=1`: bom 1 lenh cho 20 phut + 1 lenh moi ⇒ log `BO 1 lenh cho treo cua Đạt Phạm`,
  `Tháp Vu: chay lenh ke tiep cua cung acc`, sau 36s `queueView().items = []`.

## App "tự crash" — chẩn đoán 2026-10-16 (KHÔNG phải lỗi code)

Hiện tượng: sáng 2026-10-16 ~08:29, app đang chạy desktop pass thì `yarn dev` kết thúc
`error Command failed with exit code 4294967295` (= -1).

Bằng chứng thu được:
- `%APPDATA%\bing-reward-farm\crash.log` **không có dòng nào của ngày 16/10** (dòng cuối là 2026-10-15T03:26Z).
  Tức `uncaughtException`/`unhandledRejection` **không hề bắn**.
- **Windows Event Log** (Application, 14h gần nhất) không có WER/Application Error cho `electron`/`node.exe`.
- Log profile `logs\default\2026-10-16.log` dừng giữa pass desktop (`sau 20 search`) — không có dòng lỗi.

⇒ Kết luận: process **bị kết thúc từ bên ngoài** (đóng cửa sổ app → `window-all-closed` → `app.quit()`,
hoặc bị kill / phiên dev bị dừng), **không phải crash do code**. Xem thêm mục "Loi mang lam chet app" bên dưới
(crash.log toàn bộ 747 dòng là lỗi TLS `Client network socket disconnected...` — handler đã bắt, không chết app).

Đã thêm bộ chẩn đoán (để lần sau biết chắc trong 1 phút):
- `app.on('child-process-gone' | 'render-process-gone')` → ghi `crash.log`.
- `app.on('before-quit')`, `window-all-closed`, `process.on('exit')` → ghi `crash.log` kèm mã thoát.
- **Nhịp tim**: `%APPDATA%\bing-reward-farm\heartbeat.txt` ghi đè mỗi 2 phút (pid, rss, heap, uptime).
  App chết đột ngột ⇒ file này đứng trước dòng log cuối.

**Chạy ổn định (khuyến nghị)**: dùng `chay-farm.cmd` (build rồi `npx electron .`) thay cho `yarn dev`:
bản build không có vite watcher nên không chết theo phiên dev. Log: `%TEMP%\brf-app.log`.
- Kiểm chứng 2026-10-16: chạy build → app lên, bảng 5 acc, (3 trình duyệt), heartbeat ghi `rss=102MB`.
- Bản build **không có query string** nên hook `BRF_TAB` phải bấm nút nav (đã sửa trong `main/index.ts`).

### Trạng thái khi điện thoại KHÔNG cắm (kiểm chứng 2026-10-16)
- Mở app: badge nav **không** hiện số cũ (App gọi `detectPhoneApps()` thật khi khởi động; tab Điện thoại cũng dò thật khi mở).
- Tab Điện thoại: chip thiết bị `⚠ mất kết nối` + dải cảnh báo `khong thay thiet bi nao qua adb (...) · lần dò gần nhất: ...`.
- `phone-apps.json`: thiết bị và 16 app cũ **vẫn còn** nhưng `online:false` — không mất dữ liệu.

## Tab "Điện thoại" — ĐIỂM DANH rồi ĐỔI ACC trên điện thoại (chốt 2026-10-15)

Kịch bản người dùng chốt sau khi hướng clone/bind **thất bại**: **1 bản Bing app** trên điện thoại,
mở app → **điểm danh** → **đổi sang acc khác trên điện thoại** → điểm danh tiếp. **KHÔNG bind app vào acc nào**
(đã gỡ toàn bộ UI gán app↔acc: mục trong AccountDialog, chip 📱 trên bảng tài khoản, bảng app trong tab).

- `src/main/phone.ts`: `checkInCurrentBingAccount(serial, user)` = mở Bing app → tap thẻ **Rewards** → dò
  `@webview_devtools_remote_<pid>` → `adb forward` → CDP vào mini-app → đọc điểm → bấm
  `div.daily-set .streak-card-wrapper.active` → đọc lại điểm. Trả `{ok, pointsBefore, pointsAfter, gained,
  alreadyDone, todayPoints, streak}`. `readCurrentBingAccount()` chỉ đọc, không bấm. `launchBing()` để mở app.
- IPC: `phone:checkin`, `phone:read`, `phone:openBing` (+ preload `checkInPhone`, `readPhone`, `openPhoneBing`).
- UI tab **Điện thoại (N)** (N = số thiết bị online): hàng 1 = **Dò lại thiết bị** + **Mở Bing app trên điện thoại**
  + card thiết bị (model, serial, Android, pin, online/mất kết nối) + tổng “Điểm danh được: X acc · tổng +Y điểm”.
  Hàng 2 = hướng dẫn 2 bước. Bảng (thead sticky): **Bước · Tài khoản · Trạng thái điểm danh · Điểm trên app ·
  Streak · Hành động**; mỗi dòng có **Điểm danh & sang acc kế** (chạy xong tự nhảy dòng kế + nhắc đổi acc trên
  điện thoại) và **Chỉ điểm danh** (không nhảy dòng). Dòng đang thao tác được tô nền + badge “đang thao tác”.
- Chạy lại acc đã điểm danh là **an toàn** (idempotent): app báo `alreadyDone` vì ô điểm danh không còn class
  `active`, không bấm trùng.
- **Bẫy sticky**: `ui/table.tsx` đã để `TableHeader` là `position: sticky` và `Table` bọc trong `ScrollArea`.
  Bọc thêm `<div className="overflow-auto">` quanh `<Table>` là **mất sticky** (2 vùng cuộn lồng nhau) — phải để
  wrapper `overflow-hidden` + `flex min-h-0 flex-1`.
- **Bẫy test tự động**: menu Radix mở bằng **pointerdown**, `element.click()` không mở — phải bắn
  `PointerEvent('pointerdown'/'pointerup')` hoặc `sendInputEvent` chuột thật.
- Kiểm chứng thật (2026-10-15): `BRF_PHONE_CHECKIN=1` → `{"ok":true,"pointsBefore":815,"pointsAfter":815,
  "gained":0,"alreadyDone":true,"todayPoints":"45/45","streak":"3 day"}` (acc Tháp Vu đã điểm danh hôm đó).
  `BRF_TAB=phone` để mở thẳng tab; `BRF_PHONE_APPS=1` in danh sách thiết bị/app adb dò được.
- Còn giữ `src/main/phone-apps.ts` (`detectPhoneApps`) để lấy **thông tin thiết bị**; danh sách app `dkapp.*`
  vẫn dò được nhưng không còn dùng để bind.
- Vì sao không tự đổi acc: đổi tài khoản Microsoft trong Bing app cần **mật khẩu + 2FA** — người dùng tự đổi
  trên điện thoại, app chỉ điểm danh cho acc đang đăng nhập.
## Clone app bằng app cloner bên thứ 3 (khảo sát 2026-10-15)

Máy đang có **`com.py.cloneapp.huawei`** ("Clone App" v3.4.5, targetSdk 28) — người dùng đã dùng để clone Telegram.

- Cách nó hoạt động: **tạo APK thật rồi cài như app bình thường**, tên gói bị obfuscate dạng `dkapp.xxx.yyy`.
  Trên máy đã có **13 gói `dkapp.*`** = 13 bản Telegram clone ⇒ cơ chế "N clone = N APK trên 1 máy" **chạy được**.
- Có chế độ **Batch clone** (tạo nhiều bản một lúc) trong màn hình cấu hình clone.
- App gốc **không bị đụng**: Bing gốc vẫn `versionName=34.2.441001006`, `lastUpdateTime=2026-10-13` sau khi thử.

**Nhưng clone Bing thì TẮC**: bản `dkapp.dpf.arq` treo ở `InstallInstalling` > 11 phút, không cài xong
(Play Protect đã verify `ALLOW` lúc 11:03:56, dung lượng trống 33 GB ⇒ không phải do thiếu chỗ).
Nghi ngờ chính: **Bing là split APK** (`base.apk` + `split_config.arm64_v8a.apk` + `split_config.xxhdpi.apk`),
còn Telegram là APK đơn ⇒ cloner patch/merge split không nổi.

⚠️ **Chưa kiểm chứng được**: APK đã patch + ký lại (đổi package name ⇒ đổi signature hash) thì **login Microsoft
có chạy không** — MSAL redirect URI gắn với package + chữ ký. Phải cài xong mới thử được.

Đường **đã** kiểm chứng cho nhiều acc/máy: **work profile** (xem mục trên) — 2 bản Bing/máy, chữ ký nguyên,
login OK, mỗi bản một socket WebView CDP riêng.

### Đánh giá cloner cho use case farm Rewards (không nên)

Đo trên máy: cài từ **sideload** (`installerPackageName=com.google.android.packageinstaller`), cài **2024-05-15**,
**targetSdk 28** (Android 9, chạy compatibility trên Android 12), **21 quyền** gồm `REQUEST_INSTALL_PACKAGES`,
`SYSTEM_ALERT_WINDOW`, `ACCESS_FINE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`, `READ_PHONE_STATE`,
`READ/WRITE_EXTERNAL_STORAGE`. Nó **patch rồi ký lại APK** của app khác.

⇒ Với app đơn giản (Telegram) thì tiện và đã chạy 13 bản. Với **Bing + tài khoản Microsoft** thì:
tắc ở bước cài (split APK), rủi ro login do đổi chữ ký, chưa chắc lộ socket CDP để tự động hoá,
mỗi lần Bing update phải clone lại, và phải đặt session Microsoft vào APK do tool bên thứ ba ký lại.
**Khuyến nghị: dùng work profile (2 bản/máy) hoặc thêm máy; nếu vẫn thử cloner thì chỉ thử bằng acc rác.**

## Clone app Bing trên điện thoại — ĐÃ TEST CHẠY ĐƯỢC (2026-10-15)

Mục tiêu: nhiều tài khoản Microsoft trên **1 điện thoại**, mỗi acc 1 bản Bing app riêng.
Thiết bị thử: Samsung Galaxy A31 (SM-A315G), Android 12, **không root**.

### Cách chạy được (đã kiểm chứng từng bước)

```bash
# 1. Tạo work profile (managed profile) — ĐƯỢC, dù user thường bị chặn
adb shell pm create-user --profileOf 0 --managed clone1     # -> Success: created user id 10
adb shell am start-user 10                                   # -> Success: user started

# 2. Cài Bing app sang user 10 KHÔNG cần copy APK (giữ nguyên chữ ký -> login Microsoft vẫn chạy)
adb shell pm install-existing --user 10 com.microsoft.bing    # -> Package ... installed for user: 10

# 3. Mở app ở user 10 — PHẢI dùng LauncherAlias, KHÔNG dùng MainSapphireActivity
adb shell am start --user 10 -a android.intent.action.MAIN \
  -c android.intent.category.LAUNCHER \
  -n com.microsoft.bing/com.microsoft.sapphire.app.main.LauncherAlias
# -> mResumedActivity: u10 com.microsoft.bing/...BingAppGlobalFreActivity  (first-run, bản sạch)

# 4. Mỗi bản có WebView devtools RIÊNG -> điều khiển độc lập bằng CDP
adb shell cat /proc/net/unix | grep webview_devtools_remote
#   @webview_devtools_remote_7687   <- user 0
#   @webview_devtools_remote_31383  <- user 10
adb -s <serial> forward tcp:9412 localabstract:webview_devtools_remote_7687
adb -s <serial> forward tcp:9414 localabstract:webview_devtools_remote_31383
```

### Kết quả đo được

| Hạng mục | Kết quả |
|---|---|
| Số bản Bing / máy | **2** (user 0 + user 10). Tạo managed profile thứ 2 ⇒ `Error: couldn't create User.` (Samsung giới hạn user) |
| `pm install-existing --user 10` | ✅ `installed for user: 10` — không cần APK, chữ ký nguyên vẹn |
| Mở app ở user 10 | ✅ hiện **first-run experience** ("Giới thiệu Tìm kiếm Copilot trong Bing") = bản sạch, chưa login |
| WebView CDP của bản clone | ✅ forward 9414 → target `MSN`; tách hoàn toàn với bản user 0 |
| Secure Folder (user 150) | ❌ `SecurityException: Shell does not have permission to access user 150` (Knox chặn adb) |
| `am switch-user 10` | ❌ `Failed to switch to user 10` — **không cần**, activity của profile vẫn hiện trên màn hình |
| `am create-user` (user thường) | ❌ `Maximum user limit is reached` |

### Bẫy

- `am start -n ...MainSapphireActivity` ⇒ `SecurityException: ... not exported`. **Luôn dùng `LauncherAlias` + MAIN/LAUNCHER.**
- Muốn N acc ⇒ cần `ceil(N/2)` điện thoại (1 máy = 2 acc), hoặc dùng app cloner bên thứ 3 cho nhiều hơn.
- Bản clone **phải login Microsoft thủ công 1 lần** (mở Bing app → Đăng nhập) rồi mới tự động được.
- Ảnh chụp màn hình: dùng `adb shell screencap -p /sdcard/s.png` + `adb pull` (KHÔNG dùng `exec-out ... > file.png` trong PowerShell).

## Điểm danh Bing app qua ADB + WebView CDP (đo thật 2026-10-15)

Thiết bị thử: **Samsung Galaxy A31 (SM-A315G), Android 12**, serial `RF8R2104JHN`, màn 1080x2400.
adb: `C:\platform-tools\adb.exe` (v37). Bing app `com.microsoft.bing` v34.2.441001006.

### Kịch bản (đã chạy thật, +5 điểm)

```
1. adb -s <serial> shell am start -n com.microsoft.bing/com.microsoft.sapphire.app.main.MainSapphireActivity
2. chờ ~6 s cho UI idle
3. uiautomator dump -> tìm node text="Rewards" (thẻ Rewards ở trang chủ) -> input tap toạ độ giữa
   (deep link `bing://rewards` KHÔNG mở được trang Rewards — đã thử, app chỉ về trang chủ)
4. poll `cat /proc/net/unix` tìm `@webview_devtools_remote_<pid>`
   => PID ĐỔI mỗi lần app restart nên phải dò động, không hardcode
5. adb forward tcp:<port> localabstract:webview_devtools_remote_<pid>
6. CDP GET http://127.0.0.1:<port>/json/list -> target title "Rewards",
   url `file:///data/user/0/com.microsoft.bing/files/miniapps/<hash>/<ver>/index.html#/homePage`
7. đọc trạng thái từ `document.body.innerText` (regex `(\d[\d.,]*)\s*điểm`), thấy "Điểm hôm nay 45/45",
   "Chuỗi liên tiếp 3 day", "0 / 12" (phiếu)
8. ĐIỂM DANH: `document.querySelector('.streak-card-wrapper.active')` -> click giữa ô
   => 810 -> 815 điểm, class đổi `active` -> `checked`
9. Idempotent: đã điểm danh thì KHÔNG còn `.active` -> lần chạy sau tự bỏ qua (đã kiểm chứng)
```

### DOM của mini-app Rewards (dùng để code, đừng đoán)

- Ô điểm danh: `div.daily-set > div.check-in-card > div.streak-card-wrapper`
  - `.streak-card-wrapper.active` = **hôm nay, bấm được** (điểm danh)
  - `.streak-card-wrapper.checked` = đã nhận
  - `.streak-card-wrapper.inActive` = chưa tới ngày
- Chu kỳ 7 ngày: 5, 5, 10, 10, 15, 15, 50 (ngày 7 kèm phiếu)
- Trang có NHIỀU carousel dùng chung class đó (daily set: 3/3/3/100 và 30/30/30/100)
  ⇒ phải chọn đúng carousel có header "Đăng ký vào", không thì bấm nhầm ô.
- Trang Rewards trong app là **WebView (mini-app HTML)** — `uiautomator dump` KHÔNG thấy nội dung
  (chỉ thấy thanh native), nên bắt buộc đi đường CDP.

### Bẫy đã gặp khi làm ADB

| Bẫy | Thực tế đo được |
|---|---|
| Chrome không phải trình duyệt mặc định (Opera mới là) | `am start -a VIEW -d <url>` mở **Opera**; phải `am start -n com.android.chrome/com.google.android.apps.chrome.Main -d <url>`; socket devtools của Opera tên khác: `@com.opera.browser.devtools` |
| Port 9222 không forward được | `cannot bind ... (10013)`; đổi sang 9411/9413. Kiểm tra dải bị giữ: `netsh interface ipv4 show excludedportrange protocol=tcp` |
| Chrome chưa chạy ⇒ không có socket | Phải mở Chrome trước rồi mới kiểm tra `/proc/net/unix` có `@chrome_devtools_remote` |
| `pm create-user` để clone app | **BỊ CHẶN trên Samsung**: `Error: couldn't create User.` ⇒ không clone được kiểu nhiều user Android |
| Secure Folder (user 150) | Có sẵn nhưng **rỗng**; Knox chặn adb đọc app bên trong ⇒ khó tự động |
| Muốn nhiều acc/1 máy | Phải dùng **app cloner** (Dual Space/Parallel Space) — giữ nguyên chữ ký nên Microsoft login vẫn chạy |
| Ảnh chụp màn hình bằng `adb exec-out screencap -p > file.png` trong PowerShell | Hỏng file (PS chuyển binary thành text) → dùng `adb shell screencap -p /sdcard/s.png` + `adb pull` |
| `uiautomator dump` thỉnh thoảng rỗng | UI đang animate → phải retry 3–5 lần cho tới khi XML > 600 ký tự |

### Chrome trên điện thoại cũng điều khiển được (bonus, đã kiểm chứng)

`adb forward tcp:9411 localabstract:chrome_devtools_remote` → `connectOverCDP` → `Chrome/153.0.8010.53`,
UA `... Android 10; K ... Chrome/153.0.0.0 Mobile Safari/537.36`, 6 tab sẵn có (có cả `rewards.bing.com/redeem/orderhistory`).

**Lưu ý IP**: điện thoại đang nối WiFi (`172.16.2.147`) ⇒ **IP công cộng giống PC**. Muốn khác IP thật
phải cho điện thoại dùng 4G (tắt WiFi). Pin lúc thử: 26% — nhớ cắm sạc khi chạy pass dài.

## Cập nhật point SONG SONG (2026-10-15)

`refreshMany()` trong `src/main/runner.ts` chạy **pool song song** thay vì for-await tuần tự:

- `settings.refreshParallel` (mặc định **3**, chọn trong menu Cài đặt: Tuần tự / 2 / 3 / 4 / 5 / 6 / 8 acc).
  Mỗi acc là 1 `user-data-dir` + 1 cửa sổ riêng nên song song an toàn; `withProfileLock` chỉ khoá theo từng profile.
- `settings.refreshGapMs` (mặc định 800ms) giờ chỉ là **độ lệch nhịp khởi động** giữa các worker: worker slot `k`
  chờ `gapMs × k` trước khi mở trình duyệt ⇒ không mở nhiều cửa sổ cùng 1 giây.
- Tiến độ đẩy lên UI kèm `parallel` ⇒ nút bấm hiện `Đang cập nhật 3/5 · 3 song song`.

**Bẫy quan trọng đã sửa:** `cache.put()` là read-modify-write trên `cache.json`; khi nhiều acc ghi cùng lúc thì
lần ghi sau **xoá mất** kết quả của acc trước. `cache.ts` giờ giữ 1 bản trong bộ nhớ + ghi file theo **hàng đợi**
(`writeChain`) nên không mất dữ liệu.

Đo thật 2026-10-15 09:30 (5 tài khoản, song song 3): 4 acc đầu xong trong **18 giây**
(09:30:58 / 09:31:00 / 09:31:08 / 09:31:15), acc cuối 09:31:58 (1 lần retry `Execution context was destroyed`
do trang Bing tự điều hướng). `cache.json` có đủ **5/5** acc với số liệu riêng ⇒ không mất ghi.
Tuần tự như trước (gap 2s + mở từng trình duyệt) tốn ~90–120 giây cho cùng 5 acc.

## Nút "Đóng trình duyệt" không làm gì (fixed 2026-10-15)

Triệu chứng: bấm **Đóng** mà cửa sổ vẫn mở, UI vẫn báo "Đã đóng trình duyệt".

Nguyên nhân: `closeBrowser()` cũ chỉ chạy `taskkill` khi **có pid trong map `running`**:
```ts
const mem = running.get(profileId); if (!mem?.pid) return { ok: false }   // ← thoát luôn
```
Map này rỗng sau khi app khởi động lại, và browser do người dùng mở tay cũng chỉ được `browserState()`
đánh dấu `pid: null`. Cả 2 trường hợp phổ biến nhất đều rơi vào nhánh `return { ok:false }`.
UI lại bỏ qua kết quả trả về và luôn `toast.info('Đã đóng trình duyệt.')`.

Fix (`src/main/browsers.ts` + `App.tsx`):
1. Biết pid → `taskkill /PID <pid> /T /F` (như cũ).
2. Không biết pid → `pidListeningOn(port)`: đọc `netstat -ano -p tcp`, tìm PID đang LISTENING trên cổng CDP
   của profile rồi `taskkill` cả cây.
3. Vẫn không thấy → nối CDP (`chromium.connectOverCDP`) và gọi `browser.close()`.
4. Hết cách → trả `{ok:false, error}`; UI giờ `throw` để hiện `toast.error` thay vì báo thành công giả.

Kiểm chứng thật (`BRF_CLOSETEST=thap-vu`, browser đang mở ở cổng 9401 nhưng map rỗng):
```
[closetest] truoc khi dong: thap-vu running=true pid=null port=9401
[closetest] closeBrowser -> {"ok":true}
[closetest] cong 9401 con listen: false        → msedge còn lại: 0
```

## Loi mang lam chet app (fixed 2026-10-14)

Trieu chung: dialog "A JavaScript error occurred in the main process" voi
`Error: Client network socket disconnected before secure TLS connection was established`
tai `TLSSocket.onConnectEnd` -> Electron hien dialog va tat app.

Nguyen nhan: main process khong co handler cho `uncaughtException`/`unhandledRejection`;
mot loi socket/TLS (undici fetch hoac Playwright khi lam viec voi proxy) nem ra ngoai => Electron fatal dialog.

Fix (src/main/index.ts): luoi an toan o dau main process
- `process.on('uncaughtException')` + `process.on('unhandledRejection')` -> ghi `%APPDATA%\bing-reward-farm\crash.log`
  + day 1 dong vao Log dock, APP VAN CHAY (khong con dialog).
- `src/main/core/browser.ts`: fetch CDP `/json/version` duoc `.catch(() => null)`.
- Dev hook `BRF_THROW=1` de tai hien loi nay khi kiem thu.
Da kiem chung: BRF_THROW nem dung loi TLS tren -> crash.log ghi lai, app van song (1 cua so, anh UI binh thuong).
