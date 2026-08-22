import { z } from "zod";

export class PermissionDeniedError extends Error {
  constructor(message = "Chỉ quản trị viên mới thực hiện được thao tác này.") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export type CallerAuth = { uid: string; token: Record<string, unknown> } | undefined;

/** Nguồn sự thật duy nhất là custom claim, khớp chính xác chuỗi "admin". */
export function assertCallerIsAdmin(auth: CallerAuth): void {
  if (!auth) throw new PermissionDeniedError("Bạn cần đăng nhập.");
  if (auth.token.role !== "admin") throw new PermissionDeniedError();
}

export const setUserRoleInputSchema = z.object({
  targetUid: z.string().min(1),
  role: z.enum(["student", "admin"]),
});

export type SetUserRoleInput = z.infer<typeof setUserRoleInputSchema>;
