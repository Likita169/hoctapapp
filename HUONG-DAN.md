# Ôn Tập — Hướng dẫn cài đặt như một app thật

## Cấu trúc file

```
srs-app/
├── index.html         khung trang, chỉ chứa cấu trúc HTML gốc
├── style.css           toàn bộ giao diện (màu sắc, layout, font)
├── app.js               toàn bộ logic (thuật toán ôn tập, lưu dữ liệu, thông báo...)
├── version.js           CHỈ chứa số phiên bản — sửa duy nhất file này khi deploy bản mới
├── manifest.json     cấu hình để cài lên màn hình chính
├── service-worker.js  cho phép chạy offline + tự cập nhật
├── icon-192.png, icon-512.png    icon app
├── sync-server/          worker.js + schema.sql — máy chủ tài khoản & đồng bộ (tuỳ chọn)
├── push-server/          worker.js — máy chủ nhắc đúng giờ (tuỳ chọn, xem mục bên dưới)
└── HUONG-DAN.md        file này
```

Tách riêng 3 file này để dễ chỉnh sửa:
- Muốn đổi màu, font, khoảng cách → sửa `style.css`
- Muốn đổi thuật toán ôn tập, thêm tính năng, sửa câu chữ → sửa `app.js`
- Muốn đổi cấu trúc khung (thêm thẻ HTML mới, đổi tiêu đề trang) → sửa `index.html`

Đây là bộ file đầy đủ của một Progressive Web App (PWA). Khi được host lên
một địa chỉ web thật (không phải mở file trực tiếp), nó sẽ:

- Lưu dữ liệu bằng IndexedDB ngay trên điện thoại — không giới hạn 5MB nữa,
  giới hạn thực tế chỉ là dung lượng trống trên máy bạn (hàng trăm MB tới vài GB).
- Cài được vào màn hình chính với icon riêng, mở lên chạy toàn màn hình
  như app thật, không thấy thanh địa chỉ trình duyệt.
- Hoạt động cả khi không có mạng (offline) sau lần mở đầu tiên.

## Cách deploy miễn phí (mất khoảng 2 phút, không cần biết code)

**Cách nhanh nhất — Netlify Drop:**
1. Vào https://app.netlify.com/drop bằng máy tính
2. Kéo cả thư mục `srs-app` (chứa index.html, style.css, app.js, manifest.json,
   service-worker.js, icon-192.png, icon-512.png) vào trang đó
3. Netlify sẽ cho bạn một đường link dạng `https://ten-ngau-nhien.netlify.app`
4. Mở link đó trên điện thoại → làm theo bước "Thêm vào màn hình chính" bên dưới

**Cách khác — GitHub Pages** (nếu bạn có tài khoản GitHu b):
1. Tạo repo mới, upload các file trong thư mục này
2. Vào Settings → Pages → chọn nhánh main → Save
3. Sau vài phút sẽ có link dạng `https://ten-ban.github.io/ten-repo`

## Thêm vào màn hình chính (sau khi có link web)

**iPhone (Safari):** Mở link → nhấn nút Chia sẻ (hình vuông có mũi tên lên) →
"Thêm vào MH chính"

**Android (Chrome):** Mở link → nhấn menu 3 chấm → "Cài đặt ứng dụng" hoặc
"Thêm vào Màn hình chính"

Từ giờ icon sẽ nằm trên màn hình chính, mở lên chạy full màn hình như app thật,
dữ liệu lưu ngay trên máy, không cần mạng.

## Tài khoản & đồng bộ nhiều máy

Mặc định dữ liệu chỉ nằm trên từng máy (IndexedDB), không tự đồng bộ. Nếu
muốn dùng chung một tài khoản (email + mật khẩu) trên nhiều điện thoại/máy
tính và dữ liệu tự khớp nhau, cần cài thêm một máy chủ nhỏ miễn phí
(Cloudflare Worker + D1 — D1 là cơ sở dữ liệu SQL miễn phí của Cloudflare).
Làm theo phần dưới đây **một lần duy nhất**.

**Cách hoạt động:** mỗi tài khoản lưu đúng 1 bản dữ liệu mới nhất trên máy
chủ. Mỗi khi bạn thêm/sửa/xoá thẻ, app tự đẩy bản mới lên sau khoảng 1.5
giây. Mỗi khi mở lại app, app tự kiểm tra và tải bản mới nhất nếu máy chủ
có bản mới hơn máy đang dùng. Có nút "Đồng bộ ngay" trong Cài đặt để làm
thủ công. Nếu đăng nhập trên một máy đã có sẵn dữ liệu, trong khi tài khoản
đó cũng đã có dữ liệu trên máy chủ, app sẽ hỏi bạn muốn giữ bên nào (không
tự động ghi đè).

**Bước 1 — Tạo cơ sở dữ liệu D1:**
1. Vào https://dash.cloudflare.com → **Workers & Pages** → **D1** →
   **Create database**
2. Đặt tên, ví dụ `on-tap-db` → **Create**
3. Mở database vừa tạo → tab **Console** → dán nội dung file
   `sync-server/schema.sql` vào ô lệnh → **Execute** (chỉ cần chạy đúng 1 lần)

> **Nếu bạn đã tạo database này từ trước** (đã dùng app một thời gian): mở
> `schema.sql` mới, chỉ chạy dòng `ALTER TABLE users ADD COLUMN role ...` ở
> cuối file trong tab Console — không chạy lại `CREATE TABLE` vì bảng đã có
> rồi. Cột này cần thiết để lưu vai trò Học sinh/Giáo viên bên dưới.

**Bước 2 — Tạo Worker:**
1. **Workers & Pages** → **Create** → **Create Worker**
2. Đặt tên, ví dụ `on-tap-sync` → **Deploy** (deploy bản mặc định trước)
3. **Edit code** → xoá hết code mặc định → dán toàn bộ nội dung file
   `sync-server/worker.js` → **Deploy**

**Bước 3 — Gắn D1 database vào Worker:**
1. Vào lại Worker `on-tap-sync` → tab **Settings** → **Bindings** →
   **Add binding** → chọn **D1 Database**
2. Variable name: `DB` (đúng chữ hoa, vì code dùng `env.DB`) → chọn database
   `on-tap-db` vừa tạo → **Save**

**Bước 4 — Thêm khoá bí mật để ký phiên đăng nhập (JWT_SECRET):**
1. Vẫn ở tab **Settings** → **Variables and Secrets** → **Add**
2. Tên biến: `JWT_SECRET`, kiểu **Secret**, giá trị: một chuỗi ký tự ngẫu
   nhiên, dài, tự nghĩ ra (ví dụ 40 ký tự bất kỳ, gõ lung tung tay cũng
   được) — đây là khoá giữ an toàn cho phiên đăng nhập của mọi người dùng
   app này, không chia sẻ cho ai → **Save and deploy**

**Bước 5 — Lấy URL của Worker và dán vào app:**
1. Ở trang chính của Worker sẽ có URL dạng
   `https://on-tap-sync.<tên-của-bạn>.workers.dev`
2. Mở file `app.js`, tìm dòng:
   ```
   const SYNC_SERVER_URL = 'https://on-tap-sync.YOUR-SUBDOMAIN.workers.dev';
   ```
   → thay bằng URL thật ở bước trên
3. Mở `version.js`, tăng số `APP_VERSION` lên 1 bậc
4. Deploy lại toàn bộ `srs-app` (kéo thả lại vào Netlify, hoặc git push)

Xong — vào app, tab Thống kê → nút ⚙ → mục "Tài khoản & đồng bộ", tạo tài
khoản bằng email + mật khẩu. Đăng nhập tài khoản đó trên máy khác để dữ
liệu tự khớp nhau.

Khi tạo tài khoản mới, màn hình đăng ký có thêm 1 bước chọn **"Học sinh"**
hay **"Giáo viên"** — vai trò này được lưu lại trên tài khoản (không đổi
được sau khi tạo qua giao diện hiện tại). Đây là bước chuẩn bị cho các
tính năng sắp tới: giáo viên giao bài kiểm tra/câu hỏi cho học sinh và xem
điểm — các tính năng đó chưa được xây trong bản này, mới chỉ có phần chọn
vai trò lúc đăng ký.

**Lưu ý bảo mật:** mật khẩu được băm (hash) bằng PBKDF2 trước khi lưu, máy
chủ không bao giờ lưu mật khẩu gốc. Tuy vậy đây là một Worker tự triển khai,
không có xác minh email hay khôi phục mật khẩu — nếu quên mật khẩu sẽ cần
tự xoá dòng tài khoản đó trong D1 (tab Console → `DELETE FROM users WHERE
email = '...';`) rồi đăng ký lại.

## Cập nhật app sau khi đã cài

Mỗi khi bạn sửa code (hoặc mình sửa giúp) và deploy lại:
1. Mở file `version.js`, tăng số ở dòng `APP_VERSION = '1.0.0'` lên (1.0.1, 1.0.2...) —
   chỉ cần sửa đúng dòng này, cả số hiện ở tab Thống kê lẫn việc làm mới cache
   đều tự lấy theo.
2. Deploy lại (kéo thả lại vào Netlify, hoặc git push nếu dùng GitHub Pages)
3. Lần tới bạn mở app trên điện thoại (cần có mạng), app sẽ **tự động tải và
   áp dụng bản mới, rồi tự khởi động lại** — không cần bấm gì cả. Nếu đúng lúc
   đó bạn đang gõ dở (ví dụ đang thêm thẻ mới), app sẽ đợi đến khi bạn rời
   khỏi ô nhập rồi mới tự cập nhật, tránh mất nội dung đang gõ.

## Thông báo nhắc ôn tập

App có 1 kiểu nhắc, bật ở Cài đặt (nút ⚙): **"Nhắc đúng giờ mỗi ngày"** —
nhắc đúng giờ bạn chọn, **kể cả khi app đã tắt hẳn**, giống Duolingo nhắc
lúc 8h tối mỗi ngày. Kiểu này cần một máy chủ nhỏ miễn phí (Cloudflare
Worker) đứng ra gửi thông báo đúng giờ — làm theo phần dưới đây **một lần
duy nhất** để bật tính năng này.

## Cài máy chủ nhắc đúng giờ (Cloudflare Worker) — làm 1 lần

Thư mục `push-server/` chứa sẵn file `worker.js` — chỉ cần dán vào, không
cần biết code hay cài gì trên máy.

**Bước 1 — Tạo Worker:**
1. Vào https://dash.cloudflare.com → chọn **Workers & Pages** → **Create** →
   **Create Worker**
2. Đặt tên (ví dụ `on-tap-push`) → **Deploy** (deploy bản mặc định trước, sửa sau)
3. Bấm **Edit code** → xoá hết code mặc định → dán toàn bộ nội dung file
   `push-server/worker.js` vào → **Deploy**

**Bước 2 — Tạo kho lưu trữ (KV) để nhớ giờ nhắc của bạn:**
1. Trong Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create namespace**
   → đặt tên `REMINDERS` → **Add**
2. Vào lại Worker `on-tap-push` → tab **Settings** → **Bindings** → **Add binding**
   → chọn **KV Namespace** → Variable name: `REMINDERS`, chọn namespace `REMINDERS`
   vừa tạo → **Save**

**Bước 3 — Thêm 3 khoá bí mật (VAPID) để máy chủ được phép gửi thông báo:**

Vẫn ở tab **Settings** → **Variables and Secrets** → **Add** ba biến sau,
mỗi biến chọn kiểu **Secret**:

| Tên biến | Giá trị |
|---|---|
| `VAPID_PUBLIC_KEY` | `BPTfhHDnTkkm_keVeAamCIJvDxXbzomtGaqYnAEnOWvtlkgk3bvzB4wSbjLuzlY9Lnz56jC-hHTCJ1VSguad6OU` |
| `VAPID_PRIVATE_KEY` | `Hpx93K_ysrxcdVxiOPmEBt7WDUSWVqnrCeYQRYEZR5o` |
| `VAPID_SUBJECT` | `mailto:ten-ban@gmail.com` (email bất kỳ của bạn) |

→ **Save and deploy**

**Bước 4 — Đặt lịch chạy kiểm tra mỗi phút (Cron Trigger):**
1. Vẫn trong Worker đó → tab **Settings** → **Trigger events** (hoặc
   **Triggers**) → **Cron Triggers** → **Add Cron Trigger**
2. Nhập lịch: `* * * * *` (nghĩa là chạy mỗi phút để kiểm tra có ai đến
   giờ nhắc chưa) → **Add**

**Bước 5 — Lấy URL của Worker và dán vào app:**
1. Ở trang chính của Worker sẽ có URL dạng
   `https://on-tap-push.<tên-của-bạn>.workers.dev`
2. Mở file `app.js`, tìm dòng:
   ```
   const PUSH_SERVER_URL = 'https://on-tap-push.YOUR-SUBDOMAIN.workers.dev';
   ```
   → thay bằng URL thật ở bước trên
3. Mở `version.js`, tăng số `APP_VERSION` lên 1 bậc (service-worker.js tự lấy
   theo số này để làm mới cache, không cần sửa gì trong service-worker.js)
4. Deploy lại toàn bộ `srs-app` (git push nếu dùng GitHub Pages)

Xong — vào app, nút ⚙ (Cài đặt), bật "Nhắc đúng giờ mỗi ngày", chọn giờ, cho
phép quyền thông báo khi trình duyệt hỏi. Từ giờ app sẽ nhắc đúng giờ đó
mỗi ngày dù bạn không mở app.

**Lưu ý về iPhone:** chỉ hoạt động nếu app đã được **thêm vào màn hình
chính** (theo hướng dẫn bên dưới) và máy chạy **iOS 16.4 trở lên**. Mở
thẳng bằng Safari (chưa thêm ra màn hình chính) sẽ không nhận được thông
báo kiểu này.

**Lưu ý bảo mật:** cặp khoá VAPID ở trên chỉ dùng cho riêng app của bạn,
không chia sẻ cho ai khác dùng chung Worker này.