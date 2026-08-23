import { describe, it, expect } from "vitest";
import { collectDeletionTargets, canDelete, isAuthAlreadyDeleted } from "./deleteUserData.logic";

describe("collectDeletionTargets", () => {
  it("liệt kê đủ mọi nơi chứa dữ liệu cá nhân", () => {
    expect(collectDeletionTargets()).toEqual([
      "testAttempts", "testAnswers", "moodLogs", "users/{uid}/favorites", "users/{uid}",
    ]);
  });

  it("xóa doc users SAU CÙNG để không mất mốc kiểm tra quyền giữa chừng", () => {
    const targets = collectDeletionTargets();
    expect(targets[targets.length - 1]).toBe("users/{uid}");
  });
});

describe("canDelete", () => {
  it("cho phép user tự xóa dữ liệu của mình", () => {
    expect(canDelete({ uid: "u1", token: { role: "student" } }, "u1")).toBe(true);
  });

  it("cho phép admin xóa dữ liệu người khác", () => {
    expect(canDelete({ uid: "a1", token: { role: "admin" } }, "u1")).toBe(true);
  });

  it("từ chối student xóa dữ liệu người khác", () => {
    expect(canDelete({ uid: "u2", token: { role: "student" } }, "u1")).toBe(false);
  });

  it("từ chối khi chưa đăng nhập", () => {
    expect(canDelete(undefined, "u1")).toBe(false);
  });
});

describe("isAuthAlreadyDeleted", () => {
  it("coi là đã xóa khi đúng mã lỗi auth/user-not-found", () => {
    expect(isAuthAlreadyDeleted("auth/user-not-found")).toBe(true);
  });

  it("KHÔNG coi là đã xóa với lỗi khác — quyền, quota, mất kết nối...", () => {
    expect(isAuthAlreadyDeleted("auth/insufficient-permission")).toBe(false);
    expect(isAuthAlreadyDeleted("auth/internal-error")).toBe(false);
    expect(isAuthAlreadyDeleted("auth/network-request-failed")).toBe(false);
  });

  it("KHÔNG coi là đã xóa khi không có mã lỗi", () => {
    expect(isAuthAlreadyDeleted(undefined)).toBe(false);
  });
});
