import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { DEFAULT_PRIVACY_SETTINGS } from "@/lib/types/user";

/** Lấy phần trước @ của email làm biệt danh tạm — đây là dữ liệu THẬT (một phần email
 *  của chính người dùng), khác với gradeLevel/school là bịa hoàn toàn nếu đoán. */
function nicknameFromEmail(email: string | null, uid: string): string {
  const local = email?.split("@")[0]?.trim();
  return local && local.length > 0 ? local : `chua-dat-ten-${uid.slice(0, 6)}`;
}

/**
 * Vá hồ sơ `users/{uid}` bị THIẾU cho tài khoản không được tạo qua signUp() của
 * app — vd: bootstrap qua Firebase Console/CLI, cách duy nhất để tạo tài khoản
 * admin trong dự án này (xem docs/superpowers/notes/2026-08-25-profile-repair.md).
 * Thiếu hồ sơ, mọi updateDoc() vào users/{uid} (AiConsentSection, ResearchConsentForm)
 * ném lỗi "not-found" — tài khoản admin bootstrap qua CLI vì vậy không bao giờ bật
 * được AI consent để tự test app với vai trò học sinh.
 *
 * Gọi ở đây (session.ts, ngay sau khi xác minh idToken) vì đây là nơi có sẵn Admin
 * SDK — bỏ qua Security Rules, điều BẮT BUỘC vì hồ sơ admin phải ghi role="admin",
 * mà rule `create` của users/{uid} chỉ cho phép role="student" (ngăn học sinh tự
 * phong admin qua client SDK).
 *
 * TUYỆT ĐỐI không ghi đè hồ sơ đã tồn tại: kiểm tra tồn tại trước, rồi dùng
 * ref.create() (không phải set()) — create() tự ném lỗi ALREADY_EXISTS nếu hồ sơ
 * vừa được tạo bởi một request khác giữa lúc get() và lúc ghi, nên hồ sơ thật của
 * học sinh không bao giờ bị đường vá này chạm vào dù có race.
 *
 * Lỗi ở đây KHÔNG được chặn đăng nhập — bắt lỗi, log, để session vẫn được tạo:
 * người dùng chỉ gặp lại đúng vấn đề hiện tại (updateDoc not-found), không tệ hơn.
 *
 * KHÔNG ghi `gradeLevel`/`school`: không có nguồn dữ liệu thật nào cho hai field này
 * ở bước đăng nhập, và một giá trị bịa (vd gradeLevel="10") ĐỌC NHƯ DỮ LIỆU THẬT trên
 * `/admin/nguoi-dung` và trang cảnh báo khủng hoảng — một giáo viên bootstrap qua CLI
 * sẽ thấy chính mình "Lớp 10", sai sự thật. `userProfileSchema` chưa từng được
 * `.parse()` lên document Firestore thật (chỉ dùng làm nguồn type) nên bỏ trống hai
 * field này ở đây là an toàn — hai nơi hiển thị (CrisisAlertList.tsx, UserRoleManager.tsx)
 * tự xử lý giá trị rỗng, cùng chữ "Không rõ" mà mail cảnh báo khủng hoảng
 * (onCrisisAlertCreated.ts) đã dùng cho đúng tình huống này.
 */
export async function ensureUserProfile(
  uid: string,
  role: "student" | "admin",
  email: string | null,
): Promise<void> {
  try {
    const ref = adminDb().collection("users").doc(uid);
    const snap = await ref.get();
    if (snap.exists) return;

    await ref.create({
      uid,
      role,
      nickname: nicknameFromEmail(email, uid),
      examGoals: [],
      // Điểm quan trọng nhất: tài khoản này CHƯA TỪNG đồng ý gì — phải là mặc định,
      // không được ngầm coi như đã đồng ý.
      privacySettings: { ...DEFAULT_PRIVACY_SETTINGS },
      researchConsent: null,
      deletionRequestedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("ensureUserProfile: không vá được hồ sơ users/" + uid, err);
  }
}
