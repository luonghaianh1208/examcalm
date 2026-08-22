import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertCallerIsAdmin, setUserRoleInputSchema, PermissionDeniedError } from "./guards";
import { writeAuditLog } from "../audit/writeAuditLog";

export const setUserRole = onCall({ region: "asia-southeast1" }, async (request) => {
  try {
    assertCallerIsAdmin(
      request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
    );
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new HttpsError("permission-denied", error.message);
    }
    throw error;
  }

  const parsed = setUserRoleInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Dữ liệu không hợp lệ.");
  }
  const { targetUid, role } = parsed.data;

  const actorUid = request.auth!.uid;
  if (targetUid === actorUid && role !== "admin") {
    // Chặn admin cuối cùng tự hạ quyền và khóa mình khỏi hệ thống.
    throw new HttpsError("failed-precondition", "Bạn không thể tự bỏ quyền quản trị của mình.");
  }

  const auth = getAuth();
  const targetUser = await auth.getUser(targetUid).catch(() => null);
  if (!targetUser) throw new HttpsError("not-found", "Không tìm thấy tài khoản.");

  const previousRole = (targetUser.customClaims?.role as string | undefined) ?? "student";

  await auth.setCustomUserClaims(targetUid, { ...targetUser.customClaims, role });
  // Thu hồi refresh token để claim mới có hiệu lực ngay ở phiên đang mở.
  await auth.revokeRefreshTokens(targetUid);

  // Claim đã là nguồn sự thật (rules đọc custom claim, không đọc field này của
  // Firestore) nên nếu bản mirror ghi thất bại thì KHÔNG rollback claim. Nhưng
  // audit log vẫn phải ghi lại việc đổi quyền đã xảy ra, kể cả khi mirror lỗi —
  // nếu không sẽ mất dấu vết của chính thay đổi quan trọng nhất.
  let mirrorWriteFailed = false;
  try {
    await getFirestore().collection("users").doc(targetUid).set(
      { role, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch {
    mirrorWriteFailed = true;
  }

  await writeAuditLog({
    actorUid,
    action: "setUserRole",
    targetType: "user",
    targetId: targetUid,
    before: { role: previousRole },
    after: mirrorWriteFailed ? { role, mirrorWriteFailed: true } : { role },
  });

  if (mirrorWriteFailed) {
    // Claim đã đổi thật, nhưng hồ sơ users/{uid} chưa khớp — báo lỗi để admin
    // biết và thử lại (an toàn vì thao tác này idempotent).
    throw new HttpsError(
      "internal",
      "Đã đổi quyền nhưng chưa cập nhật được hồ sơ người dùng. Vui lòng thử lại.",
    );
  }

  return { ok: true, role };
});
