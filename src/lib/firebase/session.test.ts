import { describe, it, expect } from "vitest";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS, sessionCookieOptions } from "./session-config";

describe("cấu hình session cookie", () => {
  it("dùng đúng tên __session mà Firebase Hosting yêu cầu", () => {
    expect(SESSION_COOKIE_NAME).toBe("__session");
  });

  it("hết hạn sau 5 ngày", () => {
    expect(SESSION_MAX_AGE_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it("là httpOnly và sameSite lax", () => {
    const opts = sessionCookieOptions(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  it("bật secure ở production, tắt ở local http", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
