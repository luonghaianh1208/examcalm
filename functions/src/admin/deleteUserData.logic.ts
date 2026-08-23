import type { CallerAuth } from "./guards";

/**
 * Thứ tự xóa. `users/{uid}` phải nằm CUỐI: các bước trước còn cần doc đó tồn tại
 * để đối chiếu, và nếu dừng giữa chừng thì doc user còn lại là dấu hiệu cần chạy lại.
 */
export function collectDeletionTargets(): string[] {
  return ["testAttempts", "testAnswers", "moodLogs", "users/{uid}/favorites", "users/{uid}"];
}

export function canDelete(auth: CallerAuth, targetUid: string): boolean {
  if (!auth) return false;
  return auth.uid === targetUid || auth.token.role === "admin";
}

/**
 * Chỉ coi việc xóa Auth là "đã xong" khi đúng mã lỗi "không tìm thấy" — nghĩa là
 * tài khoản đã bị xóa từ trước. Mọi lỗi khác (thiếu quyền, hết quota, mất kết
 * nối...) KHÔNG được im lặng bỏ qua: dữ liệu Firestore đã xóa xong tại thời điểm
 * này, nhưng bản ghi đăng nhập vẫn còn — phải báo thật, không được báo thành công.
 */
export function isAuthAlreadyDeleted(errorCode: string | undefined): boolean {
  return errorCode === "auth/user-not-found";
}
