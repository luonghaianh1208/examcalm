import type { CallerAuth } from "./guards";

/**
 * Thứ tự xóa. `users/{uid}` phải nằm CUỐI: các bước trước còn cần doc đó tồn tại
 * để đối chiếu, và nếu dừng giữa chừng thì doc user còn lại là dấu hiệu cần chạy lại.
 */
export function collectDeletionTargets(): string[] {
  return ["testAttempts", "moodLogs", "users/{uid}/favorites", "users/{uid}"];
}

export function canDelete(auth: CallerAuth, targetUid: string): boolean {
  if (!auth) return false;
  return auth.uid === targetUid || auth.token.role === "admin";
}
