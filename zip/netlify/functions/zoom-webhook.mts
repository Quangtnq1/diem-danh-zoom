// Netlify Function nhận webhook từ Zoom.
// URL sau khi deploy: https://<site>.netlify.app/.netlify/functions/zoom-webhook
//
// Nhiệm vụ:
//  1. Trả lời CRC validation (endpoint.url_validation) để Zoom xác thực URL.
//  2. Với mỗi event join/left, ghi 1 document vào Firestore collection "attendance_events".
//
// Ghi chú: dùng Firebase *client SDK* (không phải Admin SDK) cho gọn — vì hệ thống này
// không đặt nặng bảo mật, ai cũng đọc/ghi được. Rule Firestore để mở (allow read, write).

import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import crypto from 'node:crypto';
import firebaseConfig from '../../firebase-applet-config.json';

// Khởi tạo Firebase 1 lần cho mỗi container (tránh khởi tạo lại mỗi request).
const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: firebaseConfig.projectId,
      appId: firebaseConfig.appId,
      apiKey: firebaseConfig.apiKey,
      authDomain: firebaseConfig.authDomain,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
    });

const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const SECRET = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || '';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const raw = await req.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const event: string = body?.event;

  // 1) Zoom xác thực URL (CRC) — bắt buộc để "Validate" trên trang Zoom App.
  if (event === 'endpoint.url_validation') {
    const plainToken: string = body?.payload?.plainToken ?? '';
    const encryptedToken = crypto
      .createHmac('sha256', SECRET)
      .update(plainToken)
      .digest('hex');
    return Response.json({ plainToken, encryptedToken });
  }

  // 2) Event thật: học sinh vào / rời phòng.
  if (event === 'meeting.participant_joined' || event === 'meeting.participant_left') {
    const object = body?.payload?.object ?? {};
    const participant = object.participant ?? {};

    const trang_thai = event === 'meeting.participant_joined' ? 'joined' : 'left';
    const timeStr =
      trang_thai === 'joined' ? participant.join_time : participant.leave_time;
    const timeMs = timeStr ? new Date(timeStr).getTime() : Date.now();
    const expireAtMs = timeMs + 2 * 60 * 60 * 1000; // TTL: tự xoá sau 2 giờ

    try {
      await addDoc(collection(db, 'attendance_events'), {
        meeting_id: String(object.id ?? ''),
        zoom_user_id: participant.id || null,
        zoom_session_id: participant.user_id || '',
        ten: participant.user_name || '(không tên)',
        email: participant.email || null,
        trang_thai,
        thoi_gian: Timestamp.fromMillis(timeMs),
        created_at: serverTimestamp(),
        expire_at: Timestamp.fromMillis(expireAtMs),
      });
    } catch (err) {
      // Vẫn trả 200 để Zoom không retry dồn dập; chỉ log lại lỗi.
      console.error('Lỗi ghi Firestore:', err);
    }
  }

  return new Response('OK', { status: 200 });
};
