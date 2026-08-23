import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { canDelete, isAuthAlreadyDeleted } from "./deleteUserData.logic";
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

  const attempts = await deleteQueryInBatches(() =>
    db.collection("testAttempts").where("userId", "==", targetUid),
  );
  const moods = await deleteQueryInBatches(() =>
    db.collection("moodLogs").where("userId", "==", targetUid),
  );
  const favorites = await deleteQueryInBatches(() =>
    db.collection("users").doc(targetUid).collection("favorites"),
  );

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
    before: { attempts, moods, favorites },
    after: authDeleteFailed ? { authDeleteFailed: true } : null,
  });

  return authDeleteFailed
    ? { ok: true, deleted: { attempts, moods, favorites }, authDeleteFailed: true }
    : { ok: true, deleted: { attempts, moods, favorites } };
});
