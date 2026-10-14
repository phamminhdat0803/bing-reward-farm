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

## Quy ước UI

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
- Bẫy: dev server giữ file ⇒ sửa `App.tsx` có thể báo `ReplaceFileW EIO (Win32 32)`; phải tắt Electron
  (`Stop-Process electron`) rồi sửa lại.
