# Web Điểm danh Zoom

Web hiển thị học sinh đang có mặt / còn thiếu trong 1 lớp Zoom, để trung tâm gọi bổ sung.

- **Frontend**: React + Vite + Tailwind, dùng Firestore realtime (`onSnapshot`).
- **Webhook**: 1 Netlify Function (`netlify/functions/zoom-webhook.mts`) nhận event join/left từ Zoom và ghi vào Firestore.
- **DB**: Firebase Firestore (gói Spark miễn phí).

## Chạy ở máy (chỉ frontend)

```bash
npm install
npm run dev      # http://localhost:5173
```

> Webhook chỉ chạy khi deploy lên Netlify (hoặc dùng `netlify dev`). Chạy `npm run dev` chỉ test được giao diện.

## Deploy lên Netlify

1. Đẩy code lên GitHub (hoặc kéo-thả thư mục `zip` vào Netlify).
2. Trên Netlify tạo site mới, **Base directory = `zip`** (nếu repo có nhiều thư mục).
   - Build command: `npm run build`
   - Publish directory: `dist`
   - `netlify.toml` đã cấu hình sẵn các mục này + thư mục functions.
3. **Environment variables** → thêm:
   - `ZOOM_WEBHOOK_SECRET_TOKEN` = Secret Token của Zoom App.
4. Deploy → URL webhook sẽ là:
   `https://<site>.netlify.app/.netlify/functions/zoom-webhook`
5. Dán URL đó vào Zoom App → Event Subscription → **Validate** (CRC).

## Firebase cần làm

- Bật Firestore (Native mode).
- Firestore Rules để mở (dự án này không đặt nặng bảo mật): xem `firestore.rules`.
- (Tuỳ chọn) Tạo TTL policy trên collection `attendance_events`, field `expire_at`, để tự dọn log sau 2 giờ.

Cấu hình Firebase nằm trong `firebase-applet-config.json` (web API key vốn công khai).
