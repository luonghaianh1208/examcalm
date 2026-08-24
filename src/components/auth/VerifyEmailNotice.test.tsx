import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerifyEmailNotice } from "./VerifyEmailNotice";
import { establishSession } from "@/lib/auth-client";
import { getFirebaseAuth, ensureAuthReady } from "@/lib/firebase/client";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

// App Router context không tồn tại trong môi trường test — mock useRouter(),
// cùng cách UserRoleManager.test.tsx đã làm. Dùng vi.hoisted để giữ lại đúng
// MỘT tham chiếu refresh xuyên suốt test, assert được toHaveBeenCalled().
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/auth-client", () => ({
  resendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  establishSession: vi.fn().mockResolvedValue(undefined),
  authErrorMessage: () => "Có lỗi xảy ra. Bạn thử lại sau nhé.",
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseAuth: vi.fn(),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

const mockedEstablishSession = vi.mocked(establishSession);
const mockedGetFirebaseAuth = vi.mocked(getFirebaseAuth);
const mockedEnsureAuthReady = vi.mocked(ensureAuthReady);

function fakeUser(emailVerified: boolean) {
  return { emailVerified, reload: vi.fn().mockResolvedValue(undefined) };
}

function mockCurrentUser(user: ReturnType<typeof fakeUser> | null) {
  mockedGetFirebaseAuth.mockReturnValue({ currentUser: user } as unknown as ReturnType<typeof getFirebaseAuth>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedEnsureAuthReady.mockResolvedValue(undefined);
  mockedEstablishSession.mockResolvedValue(undefined);
});

describe("VerifyEmailNotice — dò xác thực lúc mount", () => {
  it("user ĐÃ xác thực (vd: ở cửa sổ khác) -> re-mint session rồi router.refresh() (welcome dialog dựa vào đây để hiện)", async () => {
    const user = fakeUser(true);
    mockCurrentUser(user);

    render(<VerifyEmailNotice />);

    await waitFor(() => expect(user.reload).toHaveBeenCalled());
    await waitFor(() => expect(mockedEstablishSession).toHaveBeenCalledWith(user));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("user CHƯA xác thực -> không re-mint, không refresh, notice 'chưa xác thực' vẫn còn nguyên", async () => {
    const user = fakeUser(false);
    mockCurrentUser(user);

    render(<VerifyEmailNotice />);

    await waitFor(() => expect(user.reload).toHaveBeenCalled());
    expect(mockedEstablishSession).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /gửi lại email xác thực/i })).toBeInTheDocument();
  });

  it("currentUser null lúc mount (trang mở lạnh, Auth chưa khôi phục xong) -> đợi ensureAuthReady, không lỗi, không làm gì thêm", async () => {
    mockCurrentUser(null);

    render(<VerifyEmailNotice />);

    await waitFor(() => expect(mockedEnsureAuthReady).toHaveBeenCalled());
    expect(mockedEstablishSession).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("establishSession lỗi (vd: mất mạng) -> nuốt lỗi, không throw ra ngoài, UI vẫn dùng được", async () => {
    const user = fakeUser(true);
    mockCurrentUser(user);
    mockedEstablishSession.mockRejectedValue(new Error("mất mạng"));

    render(<VerifyEmailNotice />);

    await waitFor(() => expect(mockedEstablishSession).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /gửi lại email xác thực/i })).toBeInTheDocument();
  });
});

describe("VerifyEmailNotice — gửi lại email", () => {
  it("bấm gửi lại -> hiện thông báo đã gửi", async () => {
    mockCurrentUser(null);
    const userSession = userEvent.setup();
    render(<VerifyEmailNotice />);

    await userSession.click(screen.getByRole("button", { name: /gửi lại email xác thực/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/đã gửi lại/i);
  });
});
