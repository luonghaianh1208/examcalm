"use client";

import {
  collection, doc, getDocs, limit as fbLimit,
  orderBy, query, serverTimestamp, setDoc, where, Timestamp,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import type { TestAttempt } from "@/lib/types/test";
import type { CompletedTest } from "@/components/test/TestRunner";

export type AttemptRecord = TestAttempt & { id: string; createdAt: Date | null };

/**
 * Ghi lượt làm bài thành HAI document cùng id: testAttempts (điểm, mức độ —
 * chủ sở hữu hoặc admin đọc được) và testAnswers (đáp án từng câu — CHỈ chủ
 * sở hữu đọc được). Rules Firestore không kiểm soát được theo field trong
 * một document, nên "admin thấy điểm nhưng không thấy đáp án" chỉ làm được
 * bằng cách tách document (xem firestore.rules).
 *
 * Ghi testAnswers TRƯỚC testAttempts: nếu có lỗi giữa chừng (mất mạng, ứng
 * dụng bị đóng...), một dòng testAttempts không có testAnswers đi kèm chỉ là
 * bản ghi mồ côi vô hại; ngược lại — có đáp án nhưng chưa có kết quả — sẽ để
 * lại một lượt làm bài mà học sinh không thể tra cứu lại được.
 *
 * Với offline persistence, các promise dưới đây resolve ngay khi dữ liệu vào
 * IndexedDB — không đợi server.
 */
export async function saveTestAttempt(uid: string, completed: CompletedTest): Promise<string> {
  await ensureAuthReady();
  const ref = doc(collection(getDb(), "testAttempts"));

  await setDoc(doc(getDb(), "testAnswers", ref.id), {
    userId: uid,
    answers: completed.answers,
  });

  await setDoc(ref, {
    userId: uid,
    testId: completed.testId,
    testVersion: completed.testVersion,
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
      score: data.score as number,
      level: data.level as string,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}
