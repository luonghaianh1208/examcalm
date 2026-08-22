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
    // Admin không được tự bỏ quyền admin của chính mình: nếu hệ thống mất hết
    // admin, cách duy nhất khôi phục là chạy script local với service account
    // key — một việc không nên trở thành lối thoát bình thường.
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
  } catch (error) {
    // Ghi log để còn dấu vết TẠI SAO mirror lỗi (quyền, mất kết nối, quota...) —
    // chỉ có cờ mirrorWriteFailed trong audit log thì không đủ để điều tra sau này.
    console.error("setUserRole: ghi mirror users/{uid} thất bại", { targetUid, error });
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
    // Claim (nguồn sự thật cho rules) đã đổi thành công, refresh token đã bị
    // thu hồi, và audit log đã ghi — chỉ hồ sơ hiển thị users/{uid} chưa khớp.
    // Trả về thành công kèm cảnh báo thay vì báo lỗi, để không đánh lừa admin
    // rằng thao tác chưa xảy ra và khiến họ gọi lại nhiều lần không cần thiết.
    return { ok: true, role, mirrorWriteFailed: true };
  }

  return { ok: true, role };
});
