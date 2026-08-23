"use client";

import {
  addDoc, collection, deleteDoc, doc, getDocs,
  limit as fbLimit, orderBy, query, serverTimestamp, Timestamp, where,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { moodLogSchema, type MoodContext, type MoodIcon } from "@/lib/types/mood";

export type MoodInput = {
  moodScore: number;
  moodIcon: MoodIcon;
  note: string;
  tags: string[];
  context: MoodContext;
  linkedActivityRef: string | null;
};

export type MoodRecord = MoodInput & { id: string; createdAt: Date | null };

export async function saveMoodLog(uid: string, input: MoodInput): Promise<string> {
  await ensureAuthReady();
  const payload = moodLogSchema.parse({ ...input, userId: uid, imageUrl: null });
  const ref = await addDoc(collection(getDb(), "moodLogs"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listMyMoodLogs(uid: string, max = 100): Promise<MoodRecord[]> {
  // Đóng race giống saveMoodLog ở trên — xem giải thích ensureAuthReady() ở
  // client.ts. Thiếu bước này, học sinh vừa đăng nhập xong (vd: được điều
  // hướng thẳng tới /tien-trinh) sẽ luôn bị Firestore từ chối đọc vì
  // request.auth chưa kịp khôi phục.
  await ensureAuthReady();
  const snap = await getDocs(
    query(
      collection(getDb(), "moodLogs"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      fbLimit(max),
    ),
  );

  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt;
    return {
      id: d.id,
      moodScore: data.moodScore as number,
      moodIcon: data.moodIcon as MoodIcon,
      note: data.note as string,
      tags: (data.tags ?? []) as string[],
      context: data.context as MoodContext,
      linkedActivityRef: (data.linkedActivityRef ?? null) as string | null,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}

export async function deleteMoodLog(logId: string): Promise<void> {
  // Đóng race giống saveMoodLog/listMyMoodLogs ở trên — xem giải thích
  // ensureAuthReady() ở client.ts. Thiếu bước này, học sinh vừa đăng nhập xong
  // xóa ngay một mục nhật ký sẽ bị Firestore từ chối vì request.auth chưa kịp khôi phục.
  await ensureAuthReady();
  await deleteDoc(doc(getDb(), "moodLogs", logId));
}
