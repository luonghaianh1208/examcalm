import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodWidget } from "./MoodWidget";

describe("MoodWidget", () => {
  it("học sinh đã có tài khoản nhưng CHƯA xác thực email thấy lời mời xác thực, không phải lời mời đăng ký", async () => {
    const user = userEvent.setup();
    render(<MoodWidget uid="u1" canSave={false} />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));

    expect(screen.getByRole("link", { name: /xác thực email/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /đăng ký để lưu nhật ký/i })).not.toBeInTheDocument();
  });

  it("Guest (chưa đăng nhập) thấy lời mời đăng ký, không phải lời mời xác thực email", async () => {
    const user = userEvent.setup();
    render(<MoodWidget uid={null} canSave={false} />);
    await user.click(screen.getByRole("button", { name: /mở nhật ký cảm xúc/i }));

    expect(screen.getByRole("link", { name: /đăng ký để lưu nhật ký/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /xác thực email/i })).not.toBeInTheDocument();
  });
});
