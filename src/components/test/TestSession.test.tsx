import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestSession } from "./TestSession";
import { saveTestAttempt } from "@/lib/firestore/attempts";
import { loadGuestResult } from "@/lib/guest-storage";
import type { TestDefinition } from "@/lib/types/test";

vi.mock("@/lib/firestore/attempts", () => ({
  saveTestAttempt: vi.fn().mockResolvedValue("attempt-1"),
  listMyAttempts: vi.fn().mockResolvedValue([]),
}));

const TEST: TestDefinition & { id: string } = {
  id: "t1", title: "Test mẫu", version: 1, status: "published", isSampleContent: false,
  questions: [{ id: "q1", text: "Bạn có lo lắng?", options: [
    { label: "Không", score: 0 }, { label: "Có", score: 2 },
  ]}],
  scoring: { thresholds: [
    { min: 0, max: 1, level: "thap", interpretation: "Mức thấp." },
    { min: 2, max: 2, level: "cao", interpretation: "Mức cao." },
  ]},
  disclaimer: "Không phải chẩn đoán.",
  updatedBy: "admin-1",
};

async function completeTest() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: "Có" }));
  await user.click(screen.getByRole("button", { name: /xem kết quả/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("TestSession", () => {
  it("Guest: KHÔNG gọi saveTestAttempt và lưu vào sessionStorage", async () => {
    render(<TestSession test={TEST} uid={null} isSignedIn={false} canSave={false} />);
    await completeTest();

    expect(saveTestAttempt).not.toHaveBeenCalled();
    expect(loadGuestResult("t1")?.score).toBe(2);
    expect(screen.queryByText(/đã được lưu vào trang Tiến trình/i)).not.toBeInTheDocument();
  });

  it("Student đã verify: gọi saveTestAttempt và KHÔNG ghi sessionStorage", async () => {
    render(<TestSession test={TEST} uid="u1" isSignedIn canSave />);
    await completeTest();

    expect(saveTestAttempt).toHaveBeenCalledWith("u1", expect.objectContaining({ score: 2, level: "cao" }));
    expect(loadGuestResult("t1")).toBeNull();
    expect(await screen.findByText(/đã được lưu vào trang Tiến trình/i)).toBeInTheDocument();
  });

  it("Student CHƯA verify email: không lưu, hiện lời nhắc xác thực", async () => {
    render(<TestSession test={TEST} uid="u1" isSignedIn canSave={false} />);
    await completeTest();

    expect(saveTestAttempt).not.toHaveBeenCalled();
    expect(screen.getByText(/xác thực email/i)).toBeInTheDocument();
    expect(screen.queryByText(/đã được lưu vào trang Tiến trình/i)).not.toBeInTheDocument();
  });

  it("vẫn hiện kết quả cho Student ngay cả khi lưu thất bại", async () => {
    vi.mocked(saveTestAttempt).mockRejectedValueOnce(new Error("mạng lỗi"));
    render(<TestSession test={TEST} uid="u1" isSignedIn canSave />);
    await completeTest();

    expect(await screen.findByText("2")).toBeInTheDocument();
    expect(await screen.findByText(/đang chờ đồng bộ/i)).toBeInTheDocument();
    expect(screen.queryByText(/đã được lưu vào trang Tiến trình/i)).not.toBeInTheDocument();
  });
});
