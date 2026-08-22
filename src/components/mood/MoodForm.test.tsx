import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodForm } from "./MoodForm";

describe("MoodForm", () => {
  it("mặc định điểm cảm xúc là 5", () => {
    render(<MoodForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("slider", { name: /điểm cảm xúc/i })).toHaveValue("5");
  });

  it("gửi đúng dữ liệu khi lưu", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MoodForm onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: /ghi chú/i }), "Hôm nay ôn được 2 chương");
    await user.click(screen.getByRole("button", { name: /lưu/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ moodScore: 5, note: "Hôm nay ôn được 2 chương", context: "standalone" }),
    );
  });

  it("cho phép lưu khi ghi chú để trống", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MoodForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /lưu/i }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("KHÔNG hiển thị chuỗi ngày liên tiếp hay bất kỳ streak nào", () => {
    render(<MoodForm onSubmit={vi.fn()} />);
    expect(screen.queryByText(/streak|chuỗi ngày|ngày liên tiếp/i)).not.toBeInTheDocument();
  });

  it("truyền context và linkedActivityRef khi được cấu hình", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MoodForm onSubmit={onSubmit} context="after" linkedActivityRef="testAttempts/a1" />);
    await user.click(screen.getByRole("button", { name: /lưu/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ context: "after", linkedActivityRef: "testAttempts/a1" }),
    );
  });
});
