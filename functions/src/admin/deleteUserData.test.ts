import { describe, it, expect } from "vitest";
import { collectDeletionTargets, canDelete, isAuthAlreadyDeleted } from "./deleteUserData.logic";
import { DELETION_TARGET_HANDLERS } from "./deleteUserData";

describe("collectDeletionTargets", () => {
  // C1 (final whole-branch review): bản cũ của test này so khớp collectDeletionTargets() với
  // một MẢNG CHÉP TAY — tên là "liệt kê đủ mọi nơi chứa dữ liệu cá nhân" nhưng không kiểm tra
  // được điều đó: khi Spec #3 thêm aiJournalOutputs/aiUsage mà QUÊN cập nhật danh sách, mảng
  // chép tay chỉ cần chép SAI GIỐNG NHAU là test vẫn xanh. Test dưới đây so khớp với
  // DELETION_TARGET_HANDLERS — nơi deleteUserData.ts THẬT SỰ dùng để xóa dữ liệu — nên thêm một
  // collection dữ liệu cá nhân mới mà quên đăng ký handler (hoặc quên thêm vào danh sách) sẽ làm
  // MỘT TRONG HAI chiều dưới đây đỏ, không phụ thuộc vào việc ai đó chép tay đúng hay sai.
  it("mọi target (trừ users/{uid}) đều có handler xóa thật trong DELETION_TARGET_HANDLERS", () => {
    const targets = collectDeletionTargets().filter((t) => t !== "users/{uid}");
    for (const target of targets) {
      expect(DELETION_TARGET_HANDLERS).toHaveProperty(target);
    }
  });

  it("mọi handler đã đăng ký đều nằm trong collectDeletionTargets() — không có handler mồ côi", () => {
    const targets = new Set(collectDeletionTargets());
    for (const key of Object.keys(DELETION_TARGET_HANDLERS)) {
      expect(targets.has(key)).toBe(true);
    }
  });

  it("liệt kê đủ mọi nơi chứa dữ liệu cá nhân đã biết, bao gồm aiJournalOutputs/aiUsage (C1)", () => {
    expect(collectDeletionTargets()).toEqual([
      "testAttempts", "testAnswers", "moodLogs", "cbtSessions", "aiJournalOutputs", "aiUsage",
      "users/{uid}/favorites", "users/{uid}",
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
