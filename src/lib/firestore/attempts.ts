"use client";

import {
  addDoc, collection, getDocs, limit as fbLimit,
  orderBy, query, serverTimestamp, where, Timestamp,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import type { TestAttempt } from "@/lib/types/test";
import type { CompletedTest } from "@/components/test/TestRunner";

export type AttemptRecord = TestAttempt & { id: string; createdAt: Date | null };

/**
 * Ghi lượt làm bài. Với offline persistence, promise này resolve ngay khi
 * dữ liệu vào IndexedDB — không đợi server.
 */
export async function saveTestAttempt(uid: string, completed: CompletedTest): Promise<string> {
  await ensureAuthReady();
  const ref = await addDoc(collection(getDb(), "testAttempts"), {
    userId: uid,
    testId: completed.testId,
    testVersion: completed.testVersion,
    answers: completed.answers,
    score: completed.score,
    level: completed.level,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listMyAttempts(uid: string, max = 50): Promise<AttemptRecord[]> {
  // Đóng race giống saveTestAttempt ở trên — xem giải thích ensureAuthReady()
  // ở client.ts. Thiếu bước này, học sinh vừa đăng nhập xong (vd: được điều
  // hướng thẳng tới /tien-trinh) sẽ luôn bị Firestore từ chối đọc vì
  // request.auth chưa kịp khôi phục.
  await ensureAuthReady();
  const snap = await getDocs(
    query(
      collection(getDb(), "testAttempts"),
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
      userId: data.userId as string,
      testId: data.testId as string,
      testVersion: data.testVersion as number,
      answers: data.answers as Record<string, number>,
      score: data.score as number,
      level: data.level as string,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}
