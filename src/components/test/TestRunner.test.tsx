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
  disclaimer: "Đây không phải chẩn đoán y khoa.", purpose: "", expertReviewedBy: "",
  updatedBy: "admin-1",
};

/** Vào thẳng câu hỏi đầu tiên, bỏ qua màn giới thiệu. */
async function batDau(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
}

describe("TestRunner — màn giới thiệu", () => {
  it("hiển thị banner nội dung mẫu khi isSampleContent = true", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/Nội dung mẫu/i)).toBeInTheDocument();
  });

  it("KHÔNG hiển thị banner khi isSampleContent = false", () => {
    render(<TestRunner test={{ ...TEST, isSampleContent: false }} onComplete={vi.fn()} />);
    expect(screen.queryByText(/Nội dung mẫu/i)).not.toBeInTheDocument();
  });

  it("hiển thị disclaimer trước khi bắt đầu", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/không phải chẩn đoán y khoa/i)).toBeInTheDocument();
  });

  it("cho biết số câu và thời gian ước lượng", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText("2 câu")).toBeInTheDocument();
    expect(screen.getByText(/khoảng 1 phút/i)).toBeInTheDocument();
  });

  // Rào chắn cho dự án KHKT: im lặng ở ô thẩm định sẽ khiến người đọc mặc định
  // là đã có chuyên gia duyệt.
  it("nói THẲNG khi chưa có chuyên gia thẩm định", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/chưa có chuyên gia thẩm định/i)).toBeInTheDocument();
  });

  it("hiện tên người thẩm định khi đã có", () => {
    render(
      <TestRunner test={{ ...TEST, expertReviewedBy: "TS. Nguyễn Văn A" }} onComplete={vi.fn()} />,
    );
    expect(screen.getByText("TS. Nguyễn Văn A")).toBeInTheDocument();
  });

  it("chỉ hiện mục đích khi thầy cô đã điền", () => {
    const { unmount } = render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.queryByText(/giúp bạn hiểu điều gì/i)).not.toBeInTheDocument();
    unmount();

    render(<TestRunner test={{ ...TEST, purpose: "Nhận diện mức lo âu." }} onComplete={vi.fn()} />);
    expect(screen.getByText(/giúp bạn hiểu điều gì/i)).toBeInTheDocument();
  });
});

describe("TestRunner — làm từng câu", () => {
  it("chỉ hiện MỘT câu mỗi lần, kèm chỉ báo tiến độ", async () => {
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    await batDau(user);

    expect(screen.getByText("Câu 1/2")).toBeInTheDocument();
    expect(screen.getByText("Bạn có khó ngủ?")).toBeInTheDocument();
    // Đây chính là phản hồi 1.5: câu sau không được lộ ra cùng lúc.
    expect(screen.queryByText("Bạn có hay lo lắng?")).not.toBeInTheDocument();
  });

  it("chưa chọn thì chưa đi tiếp được", async () => {
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    await batDau(user);

    expect(screen.getByRole("button", { name: /tiếp theo/i })).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "Có" }));
    expect(screen.getByRole("button", { name: /tiếp theo/i })).toBeEnabled();
  });

  it("quay lại được và giữ nguyên câu trả lời đã chọn", async () => {
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    await batDau(user);

    await user.click(screen.getByRole("radio", { name: "Có" }));
    await user.click(screen.getByRole("button", { name: /tiếp theo/i }));
    expect(screen.getByText("Câu 2/2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /quay lại/i }));
    expect(screen.getByText("Câu 1/2")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Có" })).toBeChecked();
  });

  it("nút Quay lại bị khoá ở câu đầu tiên", async () => {
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    await batDau(user);
    expect(screen.getByRole("button", { name: /quay lại/i })).toBeDisabled();
  });

  it("gọi onComplete với điểm và mức đúng khi nộp bài", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={onComplete} />);
    await batDau(user);

    await user.click(screen.getByRole("radio", { name: "Có" }));
    await user.click(screen.getByRole("button", { name: /tiếp theo/i }));
    await user.click(screen.getByRole("radio", { name: "Có" }));
    await user.click(screen.getByRole("button", { name: /xem kết quả/i }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 4, level: "cao", testId: "t1", testVersion: 1 }),
    );
  });
});

describe("TestRunner — cảnh báo nội dung mẫu", () => {
  // Rào chắn an toàn: học sinh đang NGỒI TRẢ LỜI bộ câu hỏi chưa thẩm định
  // cần thấy cảnh báo, không phải chỉ thấy một lần ở màn giới thiệu rồi mất.
  it("banner theo suốt cả bài, không chỉ ở màn giới thiệu", async () => {
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    expect(screen.getByText(/Nội dung mẫu/i)).toBeInTheDocument();
  });
});
