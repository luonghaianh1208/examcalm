import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { canDelete, isAuthAlreadyDeleted, collectDeletionTargets } from "./deleteUserData.logic";
import { writeAuditLog } from "../audit/writeAuditLog";

const inputSchema = z.object({ targetUid: z.string().min(1) });
const BATCH_SIZE = 300;

async function deleteQueryInBatches(
  build: () => FirebaseFirestore.Query,
): Promise<number> {
  const db = getFirestore();
  let deleted = 0;

  for (;;) {
    const snap = await build().limit(BATCH_SIZE).get();
    if (snap.empty) return deleted;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < BATCH_SIZE) return deleted;
  }
}

/**
 * Khớp từng mục trong collectDeletionTargets() (trừ "users/{uid}", xử lý riêng
 * bên dưới vì đó là xóa một doc, không phải một query) với truy vấn xóa thật
 * và tên field trả về cho caller. Đây là nơi DUY NHẤT ánh xạ tên collection —
 * nếu ai thêm mục mới vào collectDeletionTargets() mà quên thêm handler ở đây,
 * vòng lặp bên dưới sẽ throw ngay thay vì âm thầm bỏ sót dữ liệu (I3: trước đây
 * danh sách trong collectDeletionTargets() và cascade thực tế không liên kết
 * với nhau, nên test so khớp danh sách không đảm bảo được gì).
 */
const DELETION_TARGET_HANDLERS: Record<
  string,
  { resultKey: "attempts" | "answers" | "moods" | "favorites"; query: (targetUid: string) => FirebaseFirestore.Query }
> = {
  testAttempts: {
    resultKey: "attempts",
    query: (targetUid) => getFirestore().collection("testAttempts").where("userId", "==", targetUid),
  },
  testAnswers: {
    resultKey: "answers",
    query: (targetUid) => getFirestore().collection("testAnswers").where("userId", "==", targetUid),
  },
  moodLogs: {
    resultKey: "moods",
    query: (targetUid) => getFirestore().collection("moodLogs").where("userId", "==", targetUid),
  },
  "users/{uid}/favorites": {
    resultKey: "favorites",
    query: (targetUid) => getFirestore().collection("users").doc(targetUid).collection("favorites"),
  },
};

export const deleteUserData = onCall({ region: "asia-southeast1" }, async (request) => {
  const auth = request.auth
    ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> }
    : undefined;

  const parsed = inputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Thiếu targetUid.");

  const { targetUid } = parsed.data;
  if (!canDelete(auth, targetUid)) {
    throw new HttpsError("permission-denied", "Bạn không có quyền xóa dữ liệu này.");
  }

  const db = getFirestore();

  // Danh sách nơi cần xóa lấy trực tiếp từ collectDeletionTargets() — mục cuối
  // cùng LUÔN là "users/{uid}" (xem giải thích thứ tự ở deleteUserData.logic.ts),
  // xử lý riêng vì đó là xóa một document chứ không phải một query.
  const targets = collectDeletionTargets();
  const userDocTarget = targets[targets.length - 1];
  if (userDocTarget !== "users/{uid}") {
    throw new Error(
      `deleteUserData: mục cuối cùng của collectDeletionTargets() phải là "users/{uid}", nhận được "${userDocTarget}".`,
    );
  }

  const deleted: Record<string, number> = {};
  for (const target of targets.slice(0, -1)) {
    const handler = DELETION_TARGET_HANDLERS[target];
    if (!handler) {
      throw new Error(`deleteUserData: chưa có handler xóa dữ liệu cho "${target}".`);
    }
    deleted[handler.resultKey] = await deleteQueryInBatches(() => handler.query(targetUid));
  }
  const attempts = deleted.attempts ?? 0;
  const answers = deleted.answers ?? 0;
  const moods = deleted.moods ?? 0;
  const favorites = deleted.favorites ?? 0;

  await db.collection("users").doc(targetUid).delete();

  // Chỉ nuốt đúng lỗi "tài khoản Auth đã bị xóa từ trước" — mọi lỗi khác (thiếu
  // quyền, hết quota, mất kết nối...) phải được coi là THẤT BẠI thật sự. Dữ liệu
  // Firestore đã dọn xong ở bước trên, nên không rollback được nữa — nhưng cũng
  // không được ghi audit log và trả về như thể Auth cũng đã xóa xong, kẻo học
  // sinh tưởng nhầm tài khoản đăng nhập của mình đã biến mất trong khi vẫn còn.
  let authDeleteFailed = false;
  try {
    await getAuth().deleteUser(targetUid);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (!isAuthAlreadyDeleted(code)) {
      console.error("deleteUserData: xóa Auth thất bại, dữ liệu Firestore đã xóa xong", {
        targetUid, error,
      });
      authDeleteFailed = true;
    }
  }

  await writeAuditLog({
    actorUid: auth!.uid,
    action: "deleteUserData",
    targetType: "user",
    targetId: targetUid,
    before: { attempts, answers, moods, favorites },
    after: authDeleteFailed ? { authDeleteFailed: true } : null,
  });

  return authDeleteFailed
    ? { ok: true, deleted: { attempts, answers, moods, favorites }, authDeleteFailed: true }
    : { ok: true, deleted: { attempts, answers, moods, favorites } };
});
