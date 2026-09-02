import { initializeApp, cert, applicationDefault, getApps, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Seed một bài nhạc đã đăng cho kho CHUNG, để tests/e2e/music.spec.ts có thứ
 * để bấm Lưu. Kho nhạc production cố ý không có bài mẫu nào (thầy cô tự thêm),
 * nên E2E phải tự dựng lấy.
 *
 * Cùng kiểu khởi tạo App admin với seed-ai.ts — không export dùng chung, mỗi
 * file trong support/ tự đủ (khớp phong cách hiện có của thư mục).
 */
function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    credential: raw ? cert(JSON.parse(raw) as Record<string, string>) : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "examcalm-dev",
  });
}

export const E2E_TRACK_TITLE = "Nhac nen E2E de tap trung";

export async function seedPublishedTrack(): Promise<void> {
  await getFirestore(adminApp()).collection("musicTracks").doc("e2e-track-1").set({
    title: E2E_TRACK_TITLE,
    artist: "Kenh mau",
    youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    mood: "tap-trung",
    rightsNote: "Kenh chinh thuc, cho phep nhung.",
    status: "published",
    order: 0,
    updatedBy: "admin-e2e",
  });
}
