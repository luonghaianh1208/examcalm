import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { canDelete } from "./deleteUserData.logic";
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
  await getAuth().deleteUser(targetUid).catch(() => {
    // Tài khoản Auth có thể đã bị xóa trước đó — dữ liệu Firestore vẫn phải được dọn.
  });

  await writeAuditLog({
    actorUid: auth!.uid,
    action: "deleteUserData",
    targetType: "user",
    targetId: targetUid,
    before: { attempts, moods, favorites },
    after: null,
  });

  return { ok: true, deleted: { attempts, moods, favorites } };
});
