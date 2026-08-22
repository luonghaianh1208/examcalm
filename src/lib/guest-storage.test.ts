import { describe, it, expect, beforeEach } from "vitest";
import { saveGuestResult, loadGuestResult, clearGuestResults } from "./guest-storage";

const RESULT = {
  testId: "t1", testVersion: 1, answers: { q1: 1 },
  score: 1, level: "thap", completedAt: "2026-08-22T10:00:00.000Z",
};

beforeEach(() => { sessionStorage.clear(); });

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
});
