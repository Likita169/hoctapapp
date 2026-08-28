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
├── katex/                   thư viện vẽ công thức toán (katex.min.js/css, auto-render.min.js, fonts/)
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

## Bài kiểm tra (giáo viên) và làm bài (học sinh)

Khi tạo bài kiểm tra, giáo viên chọn 1 trong 2 loại — **không trộn chung
2 loại trong cùng 1 bài**:
- **Trắc nghiệm**: gồm câu trắc nghiệm 4 phương án, đúng/sai, trả lời ngắn
  — chấm điểm tự động 100% (so khớp không phân biệt hoa/thường).
- **Tự luận**: học sinh nộp ảnh chụp bài làm, giáo viên chấm tay Đạt/Chưa
  đạt (xem mục riêng bên dưới).

Dùng chung máy chủ `on-tap-sync` và database D1 ở trên — **không cần cài
thêm gì**. Ảnh được nén nhỏ lại ngay trên máy trước khi lưu (giảm kích
thước, giữ vừa đủ rõ để đọc) rồi lưu thẳng trong D1 cùng với câu hỏi,
không cần một dịch vụ lưu trữ file riêng (kiểu như Cloudflare R2 sẽ yêu
cầu khai báo thẻ ngân hàng dù dùng miễn phí, nên bản này tránh dùng tới
nó).

**Đề bài đính kèm:** ở cả 2 loại bài, giáo viên có thể tải lên 1 tệp đề
(ảnh/PDF/Word, tối đa khoảng 5MB) để học sinh xem/tải về. Với bài trắc
nghiệm, đây thường là đề để đọc trước khi làm phần trắc nghiệm bên dưới.
Với bài tự luận, đây chính là **đề bài chính** — học sinh xem đề này, làm
ra giấy, rồi chụp ảnh bài làm nộp lại ở từng câu.

**Giao bài:** bài kiểm tra mới tạo mặc định là **bản nháp** — chỉ giáo
viên thấy. Trong trang soạn bài, bật công tắc "Bản nháp / Đã giao bài" để
học sinh trong lớp bắt đầu thấy và làm được. Có thể chọn "Chỉ 1 lần" (nộp
xong khoá lại, không làm lại được) hoặc "Không giới hạn" (làm lại bao
nhiêu lần cũng được, mỗi lần nộp ghi đè điểm/bài làm bằng lần gần nhất).

**Học sinh:** bấm vào thẻ lớp trong tab Lớp học → thấy danh sách bài kiểm
tra đã được giao → làm bài → nộp. Với bài trắc nghiệm, thấy điểm tổng
ngay, bấm "Xem chi tiết" để biết câu nào đúng/sai và đáp án đúng là gì.
Với bài tự luận, thấy trạng thái "Đã nộp, chờ chấm" — vào "Xem lại bài
làm" để theo dõi từng câu đã được chấm Đạt/Chưa đạt hay chưa.

**Giáo viên xem điểm:** trong trang soạn bài, bấm "📊 Xem điểm học sinh"
để thấy danh sách học sinh đã nộp (bài trắc nghiệm hiện điểm số, bài tự
luận hiện số câu còn chờ chấm).

Chỉ cần chạy lại `schema.sql` mới nhất (thêm bảng `test_submissions`, cột
`published`/`max_attempts`/`test_type` cho bảng `tests`) rồi deploy
`worker.js` + `app.js` mới là dùng được ngay. Nếu D1 báo lỗi "duplicate
column name" khi chạy `schema.sql`, đó là vì cột đã có sẵn — bỏ qua lỗi
đó là được.

## Câu tự luận (nộp ảnh, giáo viên chấm bằng cách khoanh lên ảnh)

Trong 1 bài kiểm tra **loại Tự luận**, giáo viên **không bắt buộc** phải
thêm câu hỏi cụ thể nào — có thể để trống hoàn toàn (không đề bài, không
câu hỏi), học sinh vẫn thấy 1 khung nộp ảnh chung cho cả bài để chụp/tải
bài làm lên, giống nộp thẳng 1 bài làm kiểu Azota. Nếu giáo viên có thêm
từng câu hỏi riêng (mỗi câu kèm yêu cầu/rubric riêng), học sinh sẽ nộp
ảnh theo từng câu và được chấm Đạt/Chưa đạt riêng cho từng câu.

Học sinh chụp/tải lên nhiều ảnh bài làm (tối đa 6 ảnh mỗi câu/mỗi bài)
thay vì gõ đáp án — chạm vào 1 ảnh đã tải lên để xem to hơn, dùng 2 nút
‹ › cạnh ảnh để sắp xếp lại thứ tự trước khi nộp.

Bài tự luận **không có điểm số tự động** — kết quả từng câu hiển thị
dưới dạng **Đạt / Chưa đạt**, do giáo viên chấm tay.

Sau khi học sinh nộp bài, vào trang **Điểm số** của bài kiểm tra, chạm vào
tên một học sinh để xem toàn bộ bài làm của em đó. Với câu tự luận, bấm
**"Chấm bài này"** để mở màn chấm: chạm và kéo trực tiếp trên ảnh để
khoanh/vẽ chỗ sai (màu đỏ), chọn **Đạt** hoặc **Chưa đạt**, có thể ghi
thêm nhận xét, rồi bấm **Lưu kết quả chấm**. Ảnh đã khoanh + nhận xét sẽ
hiện ra khi học sinh vào xem lại bài làm của mình.

Cần chạy thêm phần cuối `schema.sql` (cột `test_type` + bảng
`essay_gradings`) rồi deploy `worker.js` + `app.js` mới — làm đúng như
hướng dẫn "Cập nhật app sau khi đã cài" bên dưới.

## Chuông thông báo 🔔 (bài mới / đã chấm xong)

Góc trên các tab Trang chủ, Lớp học, Thống kê có 1 biểu tượng chuông 🔔
(chỉ hiện khi đã đăng nhập), có chấm đỏ báo số thông báo chưa đọc. Bấm vào
mở ra danh sách thông báo, bấm vào 1 thông báo sẽ đánh dấu đã đọc và mở
đúng lớp/bài liên quan.

Hệ thống tự tạo thông báo trong 2 trường hợp:
- **Học sinh** được báo khi giáo viên **giao bài kiểm tra mới** (chuyển 1
  bài từ "bản nháp" sang "đã giao bài") — chỉ báo đúng 1 lần lúc giao,
  không báo lại mỗi lần giáo viên sửa bài đã giao rồi.
- **Học sinh** được báo khi giáo viên **chấm xong hết** các câu tự luận
  của bài làm của mình, kèm kết quả Đạt/Chưa đạt.

App tự tải lại thông báo mỗi 60 giây và mỗi khi quay lại app — không cần
làm mới thủ công. Cần chạy thêm phần cuối `schema.sql` (bảng
`notifications`) rồi deploy `worker.js` + `app.js` mới.

## Công thức toán học

Khi tạo thẻ mới, dưới mỗi ô "Mặt trước" / "Mặt sau" có một thanh công cụ
gọn, chia thành từng nhóm:
- Nhóm cấu trúc: `√` (căn bậc hai), `a/b` (phân số), `x²` (số mũ), `x₁`
  (chỉ số dưới) — bấm vào là **hiện ra đúng hình dạng thật** (dấu căn,
  vạch phân số, số nhỏ nâng lên/hạ xuống) ngay tại chỗ đang gõ, không
  phải mã LaTeX thô. Gõ trực tiếp vào phần trống của khối đó (vd số bên
  trong dấu căn, tử số/mẫu số của phân số) rồi bấm ra ngoài để gõ tiếp
  chữ bình thường.
- Nhóm chữ Hy Lạp: α β γ θ π Δ λ ω φ.
- Nhóm hàm số: sin cos tan log ln.
- Nhóm phép toán: ≤ ≥ ≠ ± × ÷ → ⇌ ∞ °.

Các ký hiệu ở 3 nhóm sau chỉ là chữ/ký tự thường, chèn vào là hiện đúng
luôn, không cần bọc gì thêm. Ví dụ gõ "sin", bấm `x²`, gõ "2", bấm ra
ngoài gõ tiếp "α" sẽ ra đúng "sin²α" với số 2 nhỏ nâng lên như sách giáo
khoa — không còn hiện mã `$...$` rối mắt khi đang soạn thẻ nữa.

Khi lưu thẻ, các khối căn/phân số/số mũ này được tự động chuyển thành
công thức LaTeX (đặt trong `$...$`) để lưu vào nội dung thẻ dưới dạng
văn bản thường — không cần thay đổi gì ở chỗ lưu trữ hay đồng bộ — và
tự hiển thị đúng ở mọi nơi thẻ xuất hiện sau đó (ôn tập, danh sách quản
lý, xem trước khi xoá...). Việc vẽ công thức dùng thư viện KaTeX chạy
hoàn toàn trên máy (không cần mạng), các file cần thiết nằm trong thư
mục `katex/` và đã được thêm vào danh sách cache offline trong
`service-worker.js`.

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