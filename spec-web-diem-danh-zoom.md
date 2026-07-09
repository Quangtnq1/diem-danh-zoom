# Spec thiết kế Web Điểm Danh Zoom (gửi cho Google AI Studio / Gemini Pro để code)

## 0. Bối cảnh & mục tiêu

Giáo viên cần biết nhanh học sinh nào **đang có mặt** / **còn thiếu** trong 1 lớp Zoom, để gọi bổ sung. Bản demo trước đã chạy thử bằng n8n (file `Flow.txt`) theo cơ chế: Zoom tự đẩy webhook mỗi khi có người vào/rời cuộc họp → ghi log vào DB. Bản web này thay n8n bằng kiến trúc serverless (Netlify Functions + Firestore), giữ nguyên toàn bộ logic nhận sự kiện đã kiểm chứng từ `Flow.txt`.

**Không dùng Zoom Dashboard/Metrics API** (endpoint `/metrics/meetings/.../participants`) vì tài khoản Zoom đang ở gói Pro, API đó yêu cầu gói Business trở lên. Toàn bộ dữ liệu "ai đang trong phòng" phải suy ra từ log sự kiện join/left, không polling Zoom.

---

## 1. Kiến trúc tổng thể

```
Zoom (Server-to-Server OAuth App, Event Subscription)
   │  webhook POST (meeting.participant_joined / meeting.participant_left / endpoint.url_validation)
   ▼
Netlify Function: zoom-webhook.js
   │  - Xử lý CRC validation (endpoint.url_validation)
   │  - Verify chữ ký x-zm-signature bằng Secret Token
   │  - Ghi 1 document vào Firestore collection "attendance_events"
   ▼
Firestore (Spark/free tier)
   ├─ attendance_events   (log thô, append-only)
   └─ student_groups      (nhóm học sinh do giáo viên tạo)
   ▲
   │  Firestore Client SDK (realtime onSnapshot) + Cloud Firestore REST qua Admin SDK khi cần ghi có kiểm soát
   │
Netlify Hosting: Web frontend (React/Next hoặc Vite — Gemini tự chọn)
   - Toàn bộ 3 màn hình UI mô tả ở mục 4
```

Lý do chọn Netlify Functions thay vì Firebase Cloud Functions: Firestore ở gói Spark (miễn phí, không cần thẻ tín dụng), còn Firebase Cloud Functions bắt buộc gói Blaze (cần khai báo thẻ). Netlify Functions không có ràng buộc này, và Netlify đã host frontend sẵn nên gộp 1 chỗ.

---

## 2. Zoom App cần chuẩn bị (đã làm ở bản demo n8n, tái sử dụng nguyên)

- Loại app: **Server-to-Server OAuth App** (hoặc Webhook Only App) trên `marketplace.zoom.us`, tạo trên tài khoản `zoom3.amura@gmail.com` (role: Owner).
- Event Subscription bật cho: `meeting.participant_joined`, `meeting.participant_left`.
- Event notification endpoint URL = URL của Netlify Function `zoom-webhook` sau khi deploy (dạng `https://<site>.netlify.app/.netlify/functions/zoom-webhook`).
- **Secret Token** của app: lưu vào biến môi trường Netlify, tên gợi ý `ZOOM_WEBHOOK_SECRET_TOKEN`. Dùng để: (a) trả lời CRC validation, (b) verify chữ ký mỗi request thật gửi tới sau này (nên làm chặt hơn bản n8n — bản n8n mới chỉ làm CRC, chưa verify chữ ký từng request).
- Không cần account_id/client_id/client_secret — vì web này chỉ **nhận** webhook, không gọi ngược API nào của Zoom.

### Payload cần bóc tách (giữ đúng field như trong `Flow.txt`)

```
body.event                                    // "meeting.participant_joined" | "meeting.participant_left" | "endpoint.url_validation"
body.payload.plainToken                       // chỉ có khi event = endpoint.url_validation
body.payload.object.id                        // meeting_id
body.payload.object.participant.id            // zoom_user_id — ID định danh Zoom (có thể rỗng nếu participant vào bằng tên, không đăng nhập)
body.payload.object.participant.user_id       // participant session id (khác id ở trên, luôn có)
body.payload.object.participant.user_name     // tên hiển thị hiện tại trên Zoom
body.payload.object.participant.email         // email (chỉ có nếu participant đăng nhập Zoom khi vào)
body.payload.object.participant.join_time     // có khi event = participant_joined
body.payload.object.participant.leave_time    // có khi event = participant_left
```

### Logic xử lý CRC validation (copy nguyên từ `Flow.txt`, viết lại bằng Node.js — không bị giới hạn sandbox như n8n nên dùng thẳng module `crypto` built-in)

```js
const crypto = require('crypto');

function handleUrlValidation(plainToken, secretToken) {
  const hash = crypto.createHmac('sha256', secretToken)
                      .update(plainToken)
                      .digest('hex');
  return { plainToken, encryptedToken: hash };
}
```

### Verify chữ ký cho mỗi event thật (nâng cấp so với bản n8n — nên làm luôn trong bản web)

Zoom gửi kèm header `x-zm-signature` dạng `v0=<hash>` và header `x-zm-request-timestamp`. Cách verify:

```js
const message = `v0:${timestamp}:${rawRequestBody}`;
const hash = crypto.createHmac('sha256', secretToken).update(message).digest('hex');
const expectedSignature = `v0=${hash}`;
// So sánh expectedSignature với header x-zm-signature, không khớp thì trả 401, không ghi DB.
```

---

## 3. Firestore Data Model

### Collection `attendance_events` (append-only, tương ứng bảng "Test" bên n8n)

| Field | Kiểu | Ghi chú |
|---|---|---|
| `meeting_id` | string | ID lớp Zoom |
| `zoom_user_id` | string \| null | `participant.id` — có thể rỗng nếu vào không đăng nhập |
| `zoom_session_id` | string | `participant.user_id`, luôn có, dùng làm khoá phụ để phân biệt 2 lượt vào khác nhau của cùng 1 người |
| `ten` | string | `user_name` tại thời điểm event |
| `email` | string \| null | |
| `trang_thai` | string | `"joined"` \| `"left"` |
| `thoi_gian` | Timestamp | `join_time` hoặc `leave_time`, convert sang Firestore Timestamp |
| `created_at` | Timestamp | server timestamp lúc Function ghi (dùng `FieldValue.serverTimestamp()`) |
| `expire_at` | Timestamp | = `thoi_gian` (hoặc `created_at`) **+ 2 tiếng** — dùng cho TTL tự xoá, xem mục 3a |

Document ID: để Firestore tự sinh (auto-ID) — tránh hotspot, không tự đặt ID tuần tự.

### 3a. Tự động xoá `attendance_events` sau 2 tiếng (per-document TTL)

Dữ liệu điểm danh thô (`attendance_events`) chỉ có giá trị trong lúc lớp đang diễn ra — sau khi giáo viên đã dùng nút "Lưu nhanh" để chốt vào `student_groups` (lưu lâu dài), log thô không còn cần nữa. Mỗi **document sự kiện** (từng lượt join hoặc left của từng học sinh) tự xoá **2 tiếng sau thời điểm sự kiện đó xảy ra** — không phải xoá theo cả buổi/theo meeting_id cùng lúc, mà tính riêng theo từng document.

Cách làm (native, không cần code cron riêng):
1. Trong Function `zoom-webhook.js`, khi ghi document mới vào `attendance_events`, set thêm field `expire_at = thoi_gian + 2 giờ` (dùng `admin.firestore.Timestamp.fromMillis(thoiGianMs + 2 * 60 * 60 * 1000)`).
2. Trong Firebase Console → Firestore → tab **TTL**, tạo 1 **TTL policy** trên collection `attendance_events`, field `expire_at`. Firestore sẽ tự động xoá các document đã quá hạn field này (chạy nền, có thể trễ vài giờ so với mốc chính xác — không tốn chi phí, không cần Cloud Function riêng để dọn dẹp).
3. **Lưu ý quan trọng:** vì TTL của Firestore chạy nền và có thể xoá trễ (không tức thời đúng phút thứ 120), nên **không dựa vào việc "document đã bị xoá" để suy ra logic nghiệp vụ** — TTL chỉ để dọn rác, không phải cơ chế tính "còn hiệu lực hay không". Khi tính danh sách đang có mặt (mục 3), nếu muốn chắc chắn không hiện dữ liệu quá cũ (lớp học từ nhiều tiếng trước), nên tự lọc thêm ở tầng query: chỉ lấy các `attendance_events` có `thoi_gian` trong vòng vài tiếng gần nhất, không phụ thuộc TTL đã chạy xong hay chưa.
4. Collection `student_groups` **không có TTL** — lưu vĩnh viễn cho tới khi giáo viên chủ động xoá.

### Collection `student_groups` (nhóm học sinh do giáo viên quản lý)

```
student_groups (collection)
  {groupId} (document, auto-ID)
    ten_nhom: string                // "Lớp Toán 10A", "Lớp Anh văn B2"...
    created_at: Timestamp
    updated_at: Timestamp
    hoc_sinh: [                     // mảng object, lưu trực tiếp trong document (số lượng học sinh nhỏ, không cần sub-collection)
      {
        zoom_id: string | null,     // participant.id đã lưu lần gần nhất nhìn thấy, có thể null nếu chưa từng join
        ten: string,                // tên hiển thị lưu lại (dùng để fallback match + hiển thị)
        email: string | null
      },
      ...
    ]
```

### Truy vấn danh sách học sinh của lớp X (tính từ `attendance_events`, KHÔNG lưu bảng riêng để tránh lệch dữ liệu)

Thuật toán (chạy ở frontend hoặc 1 Function riêng `get-current-roster`):
1. Query tất cả `attendance_events` where `meeting_id == X`, order by `thoi_gian` (hoặc `created_at`) tăng dần.
2. Group theo khoá định danh: ưu tiên `zoom_user_id` nếu có, nếu không có thì dùng `zoom_session_id` (KHÔNG dùng `ten` để group vì cùng 1 người có thể đổi tên giữa 2 lần join — session_id ổn định hơn cho việc group trong 1 buổi học).
3. Với mỗi nhóm (mỗi học sinh từng xuất hiện trong buổi), lấy bản ghi có `thoi_gian` mới nhất → gắn `trang_thai_hien_tai` = `"joined"` hoặc `"left"` theo bản ghi đó.
4. Kết quả trả về **2 danh sách khác nhau, dùng cho 2 mục đích khác nhau**:
   - **`danh_sach_toan_bo`**: TẤT CẢ học sinh từng join buổi này (bất kể hiện đang joined hay đã left) — dùng để vẽ lưới ở Màn hình 3 và cho nút "Lưu nhanh học sinh".
   - **`danh_sach_dang_co_mat`**: chỉ những học sinh có `trang_thai_hien_tai == "joined"` (subset của danh sách trên) — dùng riêng cho "Điểm danh nhanh".

**Quy tắc bắt buộc cho "Điểm danh nhanh":** chỉ học sinh có bản ghi mới nhất là `"joined"` (chưa left) mới được tính là **đang có mặt**. Học sinh đã `"left"` (dù trước đó có join) hoặc chưa từng join đều bị tính là **thiếu** khi so với nhóm đã lưu — xem chi tiết mục "Điểm danh nhanh" bên dưới.

**Khuyến nghị hiệu năng:** dùng Firestore realtime listener (`onSnapshot`) trên query này thay vì nút "Làm mới" gọi lại — dữ liệu tự cập nhật ngay khi có event mới, mượt hơn polling. Vẫn giữ nút "Làm mới" theo yêu cầu UI, nhưng có thể hiểu là nút "force refetch" cho yên tâm — không bắt buộc phải dùng nếu đã có realtime listener.

---

## 4. Đặc tả UI/UX — 3 màn hình chính

### Màn hình 1 — Chọn tài khoản Zoom

- Hiện danh sách tài khoản Zoom đã xác thực. Hiện tại chỉ có 1: `zoom3.amura@gmail.com` (mặc định chọn sẵn, có thể chỉ hiện dạng thẻ thông tin, không cần dropdown vì chỉ có 1 lựa chọn).
- Thiết kế **chừa sẵn chỗ** để mở rộng nhiều tài khoản sau này (mỗi tài khoản Zoom khác nhau sẽ có `secret_token` + Event Subscription riêng) — nhưng **không cần code multi-account ngay bây giờ**, chỉ cần không hardcode cứng ở tầng UI khiến sau này khó thêm.
- Bấm "Tiếp tục" → Màn hình 2.

### Màn hình 2 — Menu chính

2 nút lớn:
1. **"Xem lớp học"** → mở ô nhập ID lớp (Meeting ID) → Enter/Xác nhận → chuyển sang Màn hình 3 (Lớp học).
2. **"Quản lý nhóm học sinh"** → Màn hình 4 (CRUD nhóm học sinh).

Sau khi thao tác xong ở Màn hình 4, có nút quay lại Màn hình 2, từ đó vào lại Màn hình 3 bình thường.

### Màn hình 3 — Lớp học (theo Meeting ID đã nhập)

- Lưới (grid) các ô học sinh, lấy từ `danh_sach_toan_bo` (mục 3) — **hiển thị ô cho MỌI học sinh từng join buổi này**, kể cả những người đã rời:
  - Học sinh **chưa từng join** buổi này → không có ô (không xuất hiện trên lưới).
  - Học sinh **đang `joined`** (chưa left) → ô màu **xanh** (chấm/viền xanh) — đang có mặt.
  - Học sinh **đã join rồi left** → ô vẫn còn, đổi màu **đỏ** — từng có mặt nhưng đã rời. Giữ lại ô này (không xoá khỏi lưới) vì cần dùng cho nút "Lưu nhanh học sinh" bên dưới.
  - Mỗi ô hiển thị: tên hiện tại trên Zoom (`ten`, lấy từ event mới nhất) + Zoom ID (`zoom_user_id`; nếu rỗng thì ghi "Không có ID — vào bằng khách").
- Góc màn hình: nút **"Làm mới"** — refetch lại danh sách đang có mặt (hoặc chỉ cần đảm bảo realtime listener luôn chạy, nút này chủ yếu để người dùng yên tâm/chủ động).
- Góc trái màn hình: 2 nút:
  - **"Điểm danh nhanh"**
  - **"Lưu nhanh học sinh"**

#### Nút "Lưu nhanh học sinh"

1. Lấy **`danh_sach_toan_bo`** (mục 3) — tức là TẤT CẢ ô đang hiện trên lưới, gồm cả ô xanh (đang có mặt) và ô đỏ (đã join rồi left). Mục đích: chụp lại toàn bộ danh sách học sinh từng tham gia buổi học, không chỉ những người còn ở lại tới lúc bấm nút.
2. Hỏi người dùng: **"Lưu thành nhóm mới"** hay **"Ghi đè lên 1 nhóm đã có"** (dropdown chọn nhóm có sẵn trong `student_groups`).
3. Nếu tạo mới: hỏi tên nhóm → tạo document mới trong `student_groups`, `hoc_sinh` = `danh_sach_toan_bo` (mỗi phần tử lấy `zoom_id`, `ten`, `email` từ event mới nhất của người đó — không lưu `trang_thai_hien_tai` vào nhóm, vì nhóm là danh sách tĩnh dùng cho các buổi sau).
4. Nếu ghi đè: **thay thế toàn bộ** mảng `hoc_sinh` của nhóm đã chọn bằng `danh_sach_toan_bo` (update `updated_at`).

#### Nút "Điểm danh nhanh"

1. Hiện danh sách các nhóm học sinh đã tạo (từ `student_groups`) → người dùng chọn 1 nhóm.
2. So sánh **`danh_sach_dang_co_mat`** (mục 3 — chỉ những học sinh **đang xanh**, tức đã join và **chưa left**) với `hoc_sinh` của nhóm đã chọn:
   - **Ưu tiên so khớp theo `zoom_id`** (nếu cả 2 bên đều có `zoom_id`).
   - Nếu học sinh trong nhóm **không có `zoom_id`** (chưa từng ghi nhận lúc lưu nhóm, hoặc thêm tay thủ công) → so khớp theo `ten` (so sánh chuỗi, nên chuẩn hoá: bỏ khoảng trắng thừa, không phân biệt hoa/thường, có thể thêm so khớp gần đúng/fuzzy nếu Gemini thấy cần).
3. Học sinh nào trong nhóm mà **không tìm thấy trong `danh_sach_dang_co_mat`** → liệt kê vào danh sách **"Học sinh còn thiếu"**, hiển thị nổi bật (banner đỏ/cảnh báo) kèm tên để giáo viên gọi. Lưu ý: học sinh đang có ô **đỏ** trên lưới (đã join rồi left) **vẫn tính là thiếu** ở bước này, vì tại thời điểm điểm danh họ không còn trong lớp — dù ô của họ vẫn hiện trên lưới cho mục đích lưu trữ ở bước 1.
4. Học sinh nào đang có mặt nhưng **không có trong nhóm đã chọn** → có thể hiện thêm mục phụ "Có mặt nhưng không thuộc nhóm này" (thông tin thêm, không bắt buộc nhưng hữu ích).

### Màn hình 4 — Quản lý nhóm học sinh

- Danh sách các nhóm đã tạo (tên nhóm, số lượng học sinh, ngày cập nhật gần nhất).
- Vào 1 nhóm: xem/thêm/xoá/sửa từng học sinh (`ten`, `email` tuỳ chọn, `zoom_id` tuỳ chọn — cho phép thêm tay học sinh chưa từng vào Zoom lần nào, lúc đó `zoom_id = null`, hệ thống sẽ tự so theo tên ở bước điểm danh).
- Đặt/đổi tên nhóm.
- Nút **"Xuất Excel"**: xuất `hoc_sinh` của nhóm đang xem ra file `.xlsx` (cột: Tên, Email, Zoom ID) — dùng thư viện `xlsx` (SheetJS) phía client, không cần qua Function riêng.
- Xoá nhóm (có xác nhận trước khi xoá).

---

## 5. Danh sách Netlify Functions cần code

| Function | Method | Việc làm |
|---|---|---|
| `zoom-webhook` | POST | Nhận event Zoom, xử lý CRC + verify signature, ghi `attendance_events` |
| `get-current-roster` *(tuỳ chọn — có thể làm hoàn toàn ở client qua Firestore SDK thay vì cần Function riêng)* | GET | Nhận `meeting_id`, trả về danh sách đang có mặt (dùng nếu không muốn expose Firestore client SDK trực tiếp ra frontend) |

Ghi chú: nếu dùng Firestore client SDK trực tiếp ở frontend (khuyến nghị, để có realtime listener), cần cấu hình **Firestore Security Rules** hợp lý: cho phép đọc (`read`) rộng rãi (hoặc theo auth đơn giản), nhưng **chặn ghi trực tiếp vào `attendance_events` từ client** (chỉ Function với Admin SDK mới được ghi collection này, vì đây là nguồn dữ liệu điểm danh, không được để client tự sửa). Collection `student_groups` thì client được phép đọc/ghi (vì đây là do giáo viên tự quản lý qua UI).

---

## 6. Biến môi trường cần cấu hình trên Netlify

```
ZOOM_WEBHOOK_SECRET_TOKEN=...          # Secret Token của Zoom app
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...              # từ Service Account key (dùng cho Admin SDK trong Function)
FIREBASE_PRIVATE_KEY=...               # từ Service Account key
FIREBASE_WEB_API_KEY=...               # config Firebase cho frontend (client SDK)
```

---

## 7. Việc cần làm khi giao cho Gemini Pro / AI Studio

1. Dựng project Firebase mới (hoặc dùng project có sẵn), bật Firestore ở chế độ Native mode, gói Spark.
2. Tạo Service Account key, cấu hình Netlify env vars ở mục 6.
3. Code Netlify