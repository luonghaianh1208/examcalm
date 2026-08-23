import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteAccountSection } from "./DeleteAccountSection";
import { callDeleteUserData } from "@/lib/firebase/functions-client";
import { signOutEverywhere } from "@/lib/auth-client";

vi.mock("@/lib/firebase/functions-client", () => ({
  callDeleteUserData: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signOutEverywhere: vi.fn().mockResolvedValue(undefined),
}));

const mockedCallDeleteUserData = vi.mocked(callDeleteUserData);
const mockedSignOutEverywhere = vi.mocked(signOutEverywhere);

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

  it("khi callable xóa thất bại: hiện lỗi và KHÔNG đăng xuất", async () => {
    mockedCallDeleteUserData.mockRejectedValue(new Error("lỗi mạng"));
    const user = userEvent.setup();
    render(<DeleteAccountSection uid="u1" />);

    await user.type(screen.getByRole("textbox"), "XOA DU LIEU");
    await user.click(screen.getByRole("button", { name: /xóa vĩnh viễn/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/chưa xóa được/i);
    expect(signOutEverywhere).not.toHaveBeenCalled();
  });

  // Finding 2 của review: callable xóa dữ liệu thành công (dữ liệu ĐÃ mất thật),
  // nhưng bước đăng xuất sau đó lỗi — trước đây cả hai bước dùng chung 1
  // try/catch nên lỗi đăng xuất bị báo nhầm thành "chưa xóa được", khiến học
  // sinh hiểu lầm rằng dữ liệu vẫn còn và có thể thử xóa lại.
  it("khi xóa THÀNH CÔNG nhưng đăng xuất thất bại: báo đã xóa xong (status), KHÔNG báo lỗi xóa (alert)", async () => {
    mockedCallDeleteUserData.mockResolvedValue({
      ok: true, deleted: { attempts: 1, moods: 1, favorites: 1 },
    });
    mockedSignOutEverywhere.mockRejectedValue(new Error("mất kết nối"));
    const user = userEvent.setup();
    render(<DeleteAccountSection uid="u1" />);

    await user.type(screen.getByRole("textbox"), "XOA DU LIEU");
    await user.click(screen.getByRole("button", { name: /xóa vĩnh viễn/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/dữ liệu của bạn đã được xóa/i);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(callDeleteUserData).toHaveBeenCalledWith("u1");
  });
});
