import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendPasswordResetEmail } from "firebase/auth";
import { sendPasswordReset, authErrorMessage } from "./auth-client";
import { getFirebaseAuth } from "@/lib/firebase/client";

vi.mock("firebase/auth", () => ({
  sendPasswordResetEmail: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  signOut: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseAuth: vi.fn(),
  getDb: vi.fn(),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

const mockedSend = vi.mocked(sendPasswordResetEmail);
const mockedGetAuth = vi.mocked(getFirebaseAuth);

function authErr(code: string) {
  return Object.assign(new Error(code), { code });
}

describe("sendPasswordReset", () => {
  let auth: { languageCode: string | null };

  beforeEach(() => {
    vi.clearAllMocks();
    auth = { languageCode: null };
    mockedGetAuth.mockReturnValue(auth as unknown as ReturnType<typeof getFirebaseAuth>);
    mockedSend.mockResolvedValue(undefined);
  });

  it("gửi mail đặt lại tới đúng email được truyền vào", async () => {
    await sendPasswordReset("hocsinh@example.com");
    expect(mockedSend).toHaveBeenCalledWith(auth, "hocsinh@example.com");
  });

  it("đặt ngôn ngữ tiếng Việt trước khi gửi, để học sinh không nhận mail tiếng Anh", async () => {
    await sendPasswordReset("hocsinh@example.com");
    expect(auth.languageCode).toBe("vi");
  });

  it("nuốt auth/user-not-found — không để lộ email nào đã có tài khoản", async () => {
    mockedSend.mockRejectedValue(authErr("auth/user-not-found"));
    await expect(sendPasswordReset("chua-dang-ky@example.com")).resolves.toBeUndefined();
  });

  it("vẫn ném lỗi thật, để người dùng biết mà thử lại", async () => {
    mockedSend.mockRejectedValue(authErr("auth/too-many-requests"));
    await expect(sendPasswordReset("hocsinh@example.com")).rejects.toMatchObject({
      code: "auth/too-many-requests",
    });
  });
});

describe("authErrorMessage", () => {
  it("dịch auth/invalid-email — form đặt noValidate nên chuỗi sai định dạng đi thẳng tới Firebase", () => {
    expect(authErrorMessage(authErr("auth/invalid-email"))).toBe("Email không hợp lệ.");
  });
});
