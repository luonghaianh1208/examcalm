import { describe, it, expect, vi, beforeEach } from "vitest";
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

// --- createSessionCookie: vá hồ sơ users/{uid} thiếu ngay lúc đăng nhập ---
// Tài khoản bootstrap ngoài app (Console/CLI — cách duy nhất tạo admin trong dự
// án này) không có users/{uid}. Không có hồ sơ, AiConsentSection/ResearchConsentForm
// (dùng updateDoc) ném "not-found" — chặn luôn đường bật AI consent. Test dưới
// đây xác nhận createSessionCookie() vá hồ sơ thiếu bằng Admin SDK (bỏ qua Rules).

vi.mock("server-only", () => ({}));

type FakeDocSnap = { exists: boolean };
type Write = { id: string; data: Record<string, unknown> };

const cookieStore = new Map<string, string>();
const cookiesApi = {
  set: (name: string, value: string) => {
    cookieStore.set(name, value);
  },
  get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
  delete: (name: string) => cookieStore.delete(name),
};
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => cookiesApi) }));

const existingProfiles = new Map<string, FakeDocSnap>();
const writes: Write[] = [];
let dbGetShouldThrow = false;

const adminDbMock = vi.fn(() => ({
  collection: (name: string) => {
    expect(name).toBe("users");
    return {
      doc: (id: string) => ({
        get: async () => {
          if (dbGetShouldThrow) throw new Error("firestore trục trặc");
          return existingProfiles.get(id) ?? { exists: false };
        },
        create: async (data: Record<string, unknown>) => {
          writes.push({ id, data });
        },
      }),
    };
  },
}));

const verifyIdTokenMock = vi.fn(
  async (_idToken: string) => ({ uid: "uid-default", email: "default@x.com", role: "student" }),
);
const createSessionCookieMock = vi.fn(async (_idToken: string, _opts: unknown) => "fake-cookie-value");
const adminAuthMock = vi.fn(() => ({
  verifyIdToken: verifyIdTokenMock,
  createSessionCookie: createSessionCookieMock,
}));

vi.mock("./admin", () => ({ adminAuth: adminAuthMock, adminDb: adminDbMock }));

const { createSessionCookie } = await import("./session");

beforeEach(() => {
  cookieStore.clear();
  existingProfiles.clear();
  writes.length = 0;
  dbGetShouldThrow = false;
  verifyIdTokenMock.mockReset();
  verifyIdTokenMock.mockImplementation(
    async () => ({ uid: "uid-default", email: "default@x.com", role: "student" }),
  );
  createSessionCookieMock.mockClear();
});

describe("createSessionCookie — vá hồ sơ users/{uid} thiếu", () => {
  it("đăng nhập với uid CHƯA có hồ sơ -> tạo hồ sơ với role đúng và privacySettings mặc định", async () => {
    verifyIdTokenMock.mockResolvedValue({
      uid: "admin-boostrap-cli",
      email: "quan.tri@truong.edu.vn",
      role: "admin",
    });

    await createSessionCookie("token-hop-le");

    // Đăng nhập vẫn diễn ra bình thường.
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBe("fake-cookie-value");

    // Hồ sơ được tạo ĐÚNG MỘT LẦN, đúng uid.
    expect(writes).toHaveLength(1);
    expect(writes[0]!.id).toBe("admin-boostrap-cli");
    const written = writes[0]!.data;
    // Role lấy từ custom claim đã xác minh — KHÔNG mặc định "student".
    expect(written.role).toBe("admin");
    // Điểm quan trọng nhất: privacySettings phải là mặc định (chưa từng đồng ý gì).
    expect(written.privacySettings).toEqual({ aiOptIn: false, shareImageWithAI: false });
  });

  it("đăng nhập với uid ĐÃ có hồ sơ -> KHÔNG sửa hồ sơ hiện có", async () => {
    existingProfiles.set("hoc-sinh-that", { exists: true });
    verifyIdTokenMock.mockResolvedValue({
      uid: "hoc-sinh-that",
      email: "hocsinh@truong.edu.vn",
      role: "student",
    });

    await createSessionCookie("token-hop-le");

    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBe("fake-cookie-value");
    expect(writes).toHaveLength(0);
  });

  it("vá hồ sơ lỗi -> đăng nhập vẫn thành công (không chặn login)", async () => {
    dbGetShouldThrow = true;
    verifyIdTokenMock.mockResolvedValue({
      uid: "uid-loi-firestore",
      email: "x@x.com",
      role: "student",
    });

    await expect(createSessionCookie("token-hop-le")).resolves.toBeUndefined();
    expect(cookieStore.get(SESSION_COOKIE_NAME)).toBe("fake-cookie-value");
  });
});
