import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { saveGuestResult, loadGuestResult, clearGuestResults } from "./guest-storage";

const RESULT = {
  testId: "t1", testVersion: 1, answers: { q1: 1 },
  score: 1, level: "thap", completedAt: "2026-08-22T10:00:00.000Z",
};

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("guest-storage", () => {
  it("lưu và đọc lại được kết quả", () => {
    saveGuestResult(RESULT);
    expect(loadGuestResult("t1")).toEqual(RESULT);
  });

  it("trả về null khi chưa có kết quả cho test đó", () => {
    expect(loadGuestResult("khong-ton-tai")).toBeNull();
  });

  it("dùng sessionStorage chứ KHÔNG dùng localStorage", () => {
    saveGuestResult(RESULT);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it("xóa sạch được kết quả", () => {
    saveGuestResult(RESULT);
    clearGuestResults();
    expect(loadGuestResult("t1")).toBeNull();
  });

  it("trả về null khi dữ liệu trong storage bị hỏng", () => {
    sessionStorage.setItem("examcalm:guest-results", "{khong-phai-json");
    expect(loadGuestResult("t1")).toBeNull();
  });

  it("không ném lỗi khi sessionStorage.setItem ném lỗi (hết quota, Safari private browsing)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveGuestResult(RESULT)).not.toThrow();
  });

  it("không ném lỗi khi sessionStorage.removeItem ném lỗi", () => {
    saveGuestResult(RESULT);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("removeItem lỗi");
    });
    expect(() => clearGuestResults()).not.toThrow();
  });

  it("trả về null khi sessionStorage.getItem ném lỗi", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("getItem lỗi");
    });
    expect(loadGuestResult("t1")).toBeNull();
  });
});
