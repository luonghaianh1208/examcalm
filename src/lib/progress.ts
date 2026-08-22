import type { MoodRecord } from "@/lib/firestore/moods";

export type MoodSummary = {
  count: number;
  average: number;
  latest: number;
  lowest: number;
  highest: number;
};

export type MoodPair = {
  activityRef: string;
  before: number;
  after: number;
  delta: number;
};

/** `logs` đã sắp xếp mới nhất trước. */
export function summarizeMood(logs: MoodRecord[]): MoodSummary | null {
  if (logs.length === 0) return null;
  const scores = logs.map((l) => l.moodScore);
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    count: scores.length,
    average: Math.round((sum / scores.length) * 10) / 10,
    latest: scores[0]!,
    lowest: Math.min(...scores),
    highest: Math.max(...scores),
  };
}

/**
 * Ghép cặp cảm xúc trước/sau cùng một hoạt động.
 * Đây là TƯƠNG QUAN, không phải bằng chứng hoạt động gây ra thay đổi (PRD 7.2.9).
 */
export function pairBeforeAfter(logs: MoodRecord[]): MoodPair[] {
  const before = new Map<string, number>();
  const after = new Map<string, number>();

  // logs đến theo thứ tự mới nhất trước, nên bản ghi đầu tiên gặp cho mỗi ref
  // chính là bản ghi mới nhất — đó là bản ghi ta muốn giữ. Không ghi đè nếu
  // ref đã từng thấy, để tránh bản cũ hơn (do Map.set ghi đè) thắng bản mới.
  for (const log of logs) {
    if (!log.linkedActivityRef) continue;
    if (log.context === "before" && !before.has(log.linkedActivityRef)) {
      before.set(log.linkedActivityRef, log.moodScore);
    }
    if (log.context === "after" && !after.has(log.linkedActivityRef)) {
      after.set(log.linkedActivityRef, log.moodScore);
    }
  }

  const pairs: MoodPair[] = [];
  for (const [ref, beforeScore] of before) {
    const afterScore = after.get(ref);
    if (afterScore === undefined) continue;
    pairs.push({ activityRef: ref, before: beforeScore, after: afterScore, delta: afterScore - beforeScore });
  }
  return pairs;
}
