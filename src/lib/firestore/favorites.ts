"use client";

import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";

function favRef(uid: string, resourceId: string) {
  return doc(getDb(), "users", uid, "favorites", resourceId);
}

export async function isFavorited(uid: string, resourceId: string): Promise<boolean> {
  return (await getDoc(favRef(uid, resourceId))).exists();
}

/** Bật/tắt lưu. Trả về trạng thái SAU khi đổi. */
export async function toggleFavorite(uid: string, resourceId: string): Promise<boolean> {
  // Đóng race giống saveMoodLog/saveTestAttempt: học sinh có thể vừa đăng
  // nhập xong đã bấm lưu bài ngay trên trang chi tiết — xem giải thích
  // ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const ref = favRef(uid, resourceId);
  if ((await getDoc(ref)).exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { resourceId, savedAt: serverTimestamp(), usedAt: null });
  return true;
}

export async function listFavoriteIds(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(getDb(), "users", uid, "favorites"));
  return snap.docs.map((d) => d.id);
}

/** Đánh dấu "đã dùng" — chỉ ghi khi bài đã được lưu. */
export async function markUsed(uid: string, resourceId: string): Promise<void> {
  // Đóng race giống toggleFavorite ở trên — markUsed cũng có thể là lần ghi
  // đầu tiên của phiên một khi có nơi gọi tới nó.
  await ensureAuthReady();
  const ref = favRef(uid, resourceId);
  if (!(await getDoc(ref)).exists()) return;
  await updateDoc(ref, { usedAt: serverTimestamp() });
}
