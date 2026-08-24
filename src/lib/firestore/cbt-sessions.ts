"use client";

import {
  collection, doc, getDocs, limit as fbLimit, orderBy, query,
  serverTimestamp, setDoc, Timestamp, where,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { cbtSessionSchema } from "@/lib/types/cbt";

export type CbtSessionInput = {
  moduleId: string;
  moduleVersion: number;
  answers: Record<string, string>;
  summary: string;
};

export type CbtSessionRecord = CbtSessionInput & { id: string; createdAt: Date | null };

/**
 * Sinh id TRƯỚC khi ghi. Cảm xúc "trước" cần trỏ vào session chưa tồn tại,
 * nên phải biết id từ đầu — xem design spec §5.
 */
export function newSessionRef(): { id: string; path: string } {
  const ref = doc(collection(getDb(), "cbtSessions"));
  return { id: ref.id, path: `cbtSessions/${ref.id}` };
}

export async function saveCbtSession(
  uid: string,
  sessionId: string,
  input: CbtSessionInput,
): Promise<void> {
  await ensureAuthReady();
  const payload = cbtSessionSchema.parse({ ...input, userId: uid });
  await setDoc(doc(getDb(), "cbtSessions", sessionId), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export async function listMyCbtSessions(uid: string, max = 50): Promise<CbtSessionRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(
      collection(getDb(), "cbtSessions"),
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
      moduleId: data.moduleId as string,
      moduleVersion: data.moduleVersion as number,
      answers: (data.answers ?? {}) as Record<string, string>,
      summary: (data.summary ?? "") as string,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}
