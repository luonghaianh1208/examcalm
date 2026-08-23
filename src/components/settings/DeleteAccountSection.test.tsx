import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { ensureAuthReady } from "@/lib/firebase/client";
import { signOutEverywhere } from "@/lib/auth-client";
import { httpsCallable } from "firebase/functions";

vi.mock("firebase/functions", () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
  connectFunctionsEmulator: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  getFirebaseApp: vi.fn(),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth-client", () => ({
  signOutEverywhere: vi.fn().mockResolvedValue(undefined),
}));

const mockedHttpsCallable = vi.mocked(httpsCallable);

// httpsCallable() thật trả về hàm có thêm method `.stream` — mock trong test chỉ
// cần gọi được như hàm, nên ép kiểu về đúng chữ ký httpsCallable() trả về.
function mockCallable(impl: () => Promise<unknown>): ReturnType<typeof httpsCallable> {
  return impl as unknown as ReturnType<typeof httpsCallable>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DeleteAccountSection", () => {
  it("nút xóa vĩnh viễn bị vô hiệu hoá cho đến khi gõ đúng cụm xác nhận", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection uid="u1" />);

    const button = screen.getByRole("button", { name: /xóa vĩnh viễn/i });
    expect(button).toBeDisabled();

    const input = screen.getByRole("textbox");
    await user.type(input, "xoa du lieu sai");
    expect(button).toBeDisabled();

    await user.clear(input);
    await user.type(input, "XOA DU LIEU");
    expect(button).toBeEnabled();
  });

  it("khi xóa thất bại: hiện lỗi và KHÔNG đăng xuất", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(() => Promise.reject(new Error("lỗi mạng"))));
    const user = userEvent.setup();
    render(<DeleteAccountSection uid="u1" />);

    await user.type(screen.getByRole("textbox"), "XOA DU LIEU");
    await user.click(screen.getByRole("button", { name: /xóa vĩnh viễn/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });

  it("gọi ensureAuthReady trước khi gọi callable xóa dữ liệu", async () => {
    mockedHttpsCallable.mockReturnValue(mockCallable(() => Promise.reject(new Error("lỗi mạng"))));
    const user = userEvent.setup();
    render(<DeleteAccountSection uid="u1" />);

    await user.type(screen.getByRole("textbox"), "XOA DU LIEU");
    await user.click(screen.getByRole("button", { name: /xóa vĩnh viễn/i }));

    await screen.findByRole("alert");
    expect(ensureAuthReady).toHaveBeenCalled();
  });
});
