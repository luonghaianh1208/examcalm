import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MoodHistory } from "./MoodHistory";
import { listMyMoodLogs } from "@/lib/firestore/moods";

vi.mock("@/lib/firestore/moods", () => ({
  listMyMoodLogs: vi.fn(),
  deleteMoodLog: vi.fn(),
}));

const mockedListMyMoodLogs = vi.mocked(listMyMoodLogs);

describe("MoodHistory", () => {
  beforeEach(() => {
    mockedListMyMoodLogs.mockReset();
  });

  it("khi tải thất bại: hiển thị trạng thái lỗi riêng, KHÔNG dùng chữ của trạng thái rỗng", async () => {
    mockedListMyMoodLogs.mockRejectedValue(new Error("network lỗi"));
    render(<MoodHistory uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được nhật ký/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/chưa có ghi chép nào/i)).not.toBeInTheDocument();
  });

  it("khi tải thành công nhưng không có bản ghi nào: hiển thị đúng trạng thái rỗng, không phải lỗi", async () => {
    mockedListMyMoodLogs.mockResolvedValue([]);
    render(<MoodHistory uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa có ghi chép nào/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/chưa tải được nhật ký/i)).not.toBeInTheDocument();
  });
});
