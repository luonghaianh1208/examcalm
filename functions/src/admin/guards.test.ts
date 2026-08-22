import { describe, it, expect } from "vitest";
import { assertCallerIsAdmin, setUserRoleInputSchema, PermissionDeniedError } from "./guards";

describe("assertCallerIsAdmin", () => {
  it("cho phép khi custom claim role là admin", () => {
    expect(() => assertCallerIsAdmin({ uid: "a1", token: { role: "admin" } })).not.toThrow();
  });

  it("từ chối khi chưa đăng nhập", () => {
    expect(() => assertCallerIsAdmin(undefined)).toThrow(PermissionDeniedError);
  });

  it("từ chối student", () => {
    expect(() => assertCallerIsAdmin({ uid: "u1", token: { role: "student" } })).toThrow(PermissionDeniedError);
  });

  it("từ chối khi thiếu claim role", () => {
    expect(() => assertCallerIsAdmin({ uid: "u1", token: {} })).toThrow(PermissionDeniedError);
  });

  it("từ chối khi role là chuỗi gần giống", () => {
    expect(() => assertCallerIsAdmin({ uid: "u1", token: { role: "Admin" } })).toThrow(PermissionDeniedError);
    expect(() => assertCallerIsAdmin({ uid: "u1", token: { role: "admin " } })).toThrow(PermissionDeniedError);
  });
});

describe("setUserRoleInputSchema", () => {
  it("chấp nhận role hợp lệ", () => {
    expect(setUserRoleInputSchema.safeParse({ targetUid: "u1", role: "admin" }).success).toBe(true);
    expect(setUserRoleInputSchema.safeParse({ targetUid: "u1", role: "student" }).success).toBe(true);
  });

  it("từ chối role không nằm trong danh sách", () => {
    expect(setUserRoleInputSchema.safeParse({ targetUid: "u1", role: "superadmin" }).success).toBe(false);
  });

  it("từ chối targetUid rỗng", () => {
    expect(setUserRoleInputSchema.safeParse({ targetUid: "", role: "admin" }).success).toBe(false);
  });
});
