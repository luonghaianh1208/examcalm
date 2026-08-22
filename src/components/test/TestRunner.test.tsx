import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestRunner } from "./TestRunner";
import type { TestDefinition } from "@/lib/types/test";

const TEST: TestDefinition & { id: string } = {
  id: "t1",
  title: "Test lo âu (mẫu)",
  version: 1,
  status: "published",
  isSampleContent: true,
  questions: [
    { id: "q1", text: "Bạn có khó ngủ?", options: [
      { label: "Không", score: 0 }, { label: "Có", score: 2 },
    ]},
    { id: "q2", text: "Bạn có hay lo lắng?", options: [
      { label: "Không", score: 0 }, { label: "Có", score: 2 },
    ]},
  ],
  scoring: { thresholds: [
    { min: 0, max: 1, level: "thap", interpretation: "Mức thấp." },
    { min: 2, max: 4, level: "cao", interpretation: "Mức cao." },
  ]},
  disclaimer: "Đây không phải chẩn đoán y khoa.",
  updatedBy: "admin-1",
};

describe("TestRunner", () => {
  it("hiển thị banner nội dung mẫu khi isSampleContent = true", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/Nội dung mẫu/i)).toBeInTheDocument();
  });

  it("KHÔNG hiển thị banner khi isSampleContent = false", () => {
    render(<TestRunner test={{ ...TEST, isSampleContent: false }} onComplete={vi.fn()} />);
    expect(screen.queryByText(/Nội dung mẫu/i)).not.toBeInTheDocument();
  });

  it("luôn hiển thị disclaimer", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/không phải chẩn đoán y khoa/i)).toBeInTheDocument();
  });

  it("vô hiệu hóa nút nộp khi chưa trả lời hết", async () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /xem kết quả/i })).toBeDisabled();
  });

  it("gọi onComplete với điểm và mức đúng khi nộp bài", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={onComplete} />);

    // Chọn "Có" cho cả hai câu — mỗi câu là một nhóm radio riêng
    const yesOptions = screen.getAllByRole("radio", { name: "Có" });
    expect(yesOptions).toHaveLength(2);
    for (const option of yesOptions) await user.click(option);

    await user.click(screen.getByRole("button", { name: /xem kết quả/i }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 4, level: "cao", testId: "t1", testVersion: 1 }),
    );
  });
});
