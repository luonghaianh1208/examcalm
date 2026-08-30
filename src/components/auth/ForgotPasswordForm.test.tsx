import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForgotPasswordForm } from "./ForgotPasswordForm";
import { sendPasswordReset } from "@/lib/auth-client";

vi.mock("@/lib/auth-client", () => ({
  sendPasswordReset: vi.fn(),
  authErrorMessage: () => "Bạn thử lại sau ít phút nhé.",
}));

const mockedSend = vi.mocked(sendPasswordReset);

beforeEach(() => {
  vi.clearAllMocks();
  mockedSend.mockResolvedValue(undefined);
});

async function fillAndSubmit(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Gửi mail đặt lại" }));
  return user;
}

describe("ForgotPasswordForm", () => {
  it("gửi xong thì nhắc lại đúng email vừa nhập, để học sinh tự nhận ra nếu gõ nhầm", async () => {
    render(<ForgotPasswordForm />);
    await fillAndSubmit("hocsinh@example.com");

    expect(await screen.findByText("hocsinh@example.com")).toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("gặp lỗi thì báo lỗi và giữ nguyên form, không chuyển sang màn đã gửi", async () => {
    mockedSend.mockRejectedValue(Object.assign(new Error("x"), { code: "auth/too-many-requests" }));
    render(<ForgotPasswordForm />);
    await fillAndSubmit("hocsinh@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Bạn thử lại sau ít phút nhé.");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("bấm Thử email khác thì quay lại form nhập", async () => {
    render(<ForgotPasswordForm />);
    const user = await fillAndSubmit("go-nham@example.com");

    await user.click(await screen.findByRole("button", { name: "Thử email khác" }));

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByText("go-nham@example.com")).not.toBeInTheDocument();
  });
});
