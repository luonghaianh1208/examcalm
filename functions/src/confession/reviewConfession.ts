/**
 * Người duyệt quyết định một bài đang `hold`.
 *
 * Là Cloud Function chứ không phải ghi thẳng từ client, vì việc duyệt phải ghi
 * sang `confessionsPublic` — collection mà Security Rules cấm MỌI client ghi,
 * kể cả admin. Đó là chỗ duy nhất bảo đảm nội dung công khai chỉ đến từ một
 * đường có kiểm soát.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

const inputSchema = z.object({
  confessionId: z.string().min(1),
  approve: z.boolean(),
});

export type ReviewConfessionCallerAuth = { uid: string; role: string } | undefined;
export type ReviewConfessionDeps = { db?: Firestore };
export type ReviewConfessionResult = { status: "auto_approved" | "rejected" };

export async function runReviewConfession(
  rawData: unknown,
  auth: ReviewConfessionCallerAuth,
  deps: ReviewConfessionDeps = {},
): Promise<ReviewConfessionResult> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Bạn cần đăng nhập.");
  if (auth.role !== "admin") {
    throw new HttpsError("permission-denied", "Chỉ quản trị viên mới duyệt được bài.");
  }

  const parsed = inputSchema.safeParse(rawData);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Thiếu thông tin bài cần duyệt.");

  const db = deps.db ?? getFirestore();
  const ref = db.collection("confessions").doc(parsed.data.confessionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Không tìm thấy bài này.");

  const data = snap.data() as { textContent?: unknown };
  if (typeof data.textContent !== "string") {
    throw new HttpsError("failed-precondition", "Bài này không có nội dung hợp lệ.");
  }

  const status = parsed.data.approve ? "auto_approved" : "rejected";

  await ref.update({
    status,
    handledBy: auth.uid,
    handledAt: FieldValue.serverTimestamp(),
    moderationReason: parsed.data.approve
      ? "Người duyệt cho đăng."
      : "Người duyệt không cho đăng.",
  });

  if (parsed.data.approve) {
    // CHỈ ba field. Không bao giờ authorUid — xem moderateConfession.ts.
    await db.collection("confessionsPublic").doc(parsed.data.confessionId).set({
      textContent: data.textContent,
      reportCount: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    // Gỡ bản công khai nếu bài từng được đăng rồi mới bị gỡ xuống. delete()
    // trên document không tồn tại là no-op, nên không cần kiểm tra trước.
    await db.collection("confessionsPublic").doc(parsed.data.confessionId).delete();
  }

  return { status };
}

export const reviewConfession = onCall({ region: "asia-southeast1" }, async (request) =>
  runReviewConfession(
    request.data,
    request.auth
      ? { uid: request.auth.uid, role: String(request.auth.token.role ?? "") }
      : undefined,
  ),
);
