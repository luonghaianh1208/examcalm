"use client";

import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { MAX_CONFESSION_LENGTH, type ConfessionStatus } from "@/lib/types/confession";

export type MyConfession = {
  id: string;
  textContent: string;
  status: ConfessionStatus;
  moderationReason: string;
  createdAt: Date | null;
};

/**
 * Gửi một bài mới.
 *
 * Luôn ghi `status: "pending"` — Security Rules cũng bắt buộc đúng giá trị này
 * (xem firestore.rules). Client không tự đặt trạng thái đã duyệt cho bài của
 * mình được; Cloud Function onConfessionCreated mới là nơi quyết định.
 */
export async function submitConfession(uid: string, text: string): Promise<string> {
  await ensureAuthReady();
  const ref = await addDoc(collection(getDb(), "confessions"), {
    authorUid: uid,
    textContent: text.slice(0, MAX_CONFESSION_LENGTH),
    status: "pending",
    moderationReason: "",
    handledBy: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Bài của CHÍNH mình, kèm trạng thái duyệt.
 *
 * Học sinh cần thấy bài mình gửi đang ở đâu — gửi xong rồi im lặng hoàn toàn
 * là cách nhanh nhất khiến các em nghĩ hệ thống nuốt mất bài.
 */
export async function listMyConfessions(uid: string, max = 20): Promise<MyConfession[]> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(
      collection(getDb(), "confessions"),
      where("authorUid", "==", uid),
      orderBy("createdAt", "desc"),
      limit(max),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      textContent: typeof data.textContent === "string" ? data.textContent : "",
      status: data.status as ConfessionStatus,
      moderationReason: typeof data.moderationReason === "string" ? data.moderationReason : "",
      createdAt: data.createdAt?.toDate?.() ?? null,
    };
  });
}
