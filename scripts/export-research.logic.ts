/**
 * Logic thuần (không import firebase-admin) chọn đúng các trường được phép xuất
 * từ một document `moodLogs` cho nghiên cứu — tách riêng để test được, và để
 * việc chọn trường là ALLOWLIST tường minh: nếu Firestore doc có thêm trường lạ
 * trong tương lai (kể cả `note`, `tags`), hàm này KHÔNG BAO GIỜ tự mang nó ra,
 * vì code chỉ đọc đúng những field được gọi tên ở đây — không spread, không
 * loop qua toàn bộ object rồi lọc bớt.
 */

type FirestoreTimestampLike = { toDate?: () => Date } | null | undefined;

export type MoodLogDocData = {
  moodScore?: unknown;
  context?: unknown;
  createdAt?: FirestoreTimestampLike;
  // note và tags CỐ TÌNH không khai báo ở đây — xem export-research.mts.
  [key: string]: unknown;
};

export type MoodExportRow = {
  participantId: string;
  moodScore: unknown;
  context: unknown;
  createdAt: string | null;
};

export function toMoodExportRow(participantId: string, data: MoodLogDocData): MoodExportRow {
  return {
    participantId,
    moodScore: data.moodScore,
    context: data.context,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
  };
}
