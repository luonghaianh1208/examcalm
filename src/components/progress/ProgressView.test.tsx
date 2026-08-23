import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProgressView } from "./ProgressView";
import { listMyAttempts } from "@/lib/firestore/attempts";
import { listMyMoodLogs } from "@/lib/firestore/moods";
import type { AttemptRecord } from "@/lib/firestore/attempts";
import type { MoodRecord } from "@/lib/firestore/moods";

vi.mock("@/lib/firestore/attempts", () => ({
  listMyAttempts: vi.fn(),
}));
vi.mock("@/lib/firestore/moods", () => ({
  listMyMoodLogs: vi.fn(),
}));

const mockedListMyAttempts = vi.mocked(listMyAttempts);
const mockedListMyMoodLogs = vi.mocked(listMyMoodLogs);

const attempt: AttemptRecord = {
  id: "a1", userId: "u1", testId: "t1", testVersion: 1,
  score: 12, level: "moderate",
  createdAt: new Date("2026-08-20T10:00:00Z"),
};

function mood(over: Partial<MoodRecord>): MoodRecord {
  return {
    id: "m1", moodScore: 5, moodIcon: "neutral", note: "", tags: [],
    context: "standalone", linkedActivityRef: null,
    createdAt: new Date("2026-08-20T10:00:00Z"), ...over,
  };
}

beforeEach(() => {
  mockedListMyAttempts.mockReset();
  mockedListMyMoodLogs.mockReset();
});

describe("ProgressView", () => {
  it("khi tải lịch sử test thất bại: hiện lỗi riêng cho mục test, KHÔNG dùng chữ trạng thái rỗng, và mục cảm xúc vẫn hiển thị bình thường", async () => {
    mockedListMyAttempts.mockRejectedValue(new Error("network lỗi"));
    mockedListMyMoodLogs.mockResolvedValue([mood({ moodScore: 6 })]);
    render(<ProgressView uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được lịch sử làm test/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/bạn chưa làm bài test nào/i)).not.toBeInTheDocument();
    // Mục cảm xúc không bị kéo vào lỗi của mục test.
    expect(screen.getByText("Cảm xúc gần đây")).toBeInTheDocument();
    expect(screen.getAllByText(/6\/10/).length).toBeGreaterThan(0);
  });

  it("khi tải cảm xúc thất bại: hiện lỗi riêng cho mục cảm xúc, KHÔNG dùng chữ trạng thái rỗng, và mục test vẫn hiển thị bình thường", async () => {
    mockedListMyAttempts.mockResolvedValue([attempt]);
    mockedListMyMoodLogs.mockRejectedValue(new Error("network lỗi"));
    render(<ProgressView uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được ghi chép cảm xúc/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/chưa có ghi chép nào/i)).not.toBeInTheDocument();
    expect(screen.getByText("Điểm 12")).toBeInTheDocument();
  });

  it("khi cả hai tải thành công nhưng không có dữ liệu: hiện đúng trạng thái rỗng cho từng mục, không phải lỗi", async () => {
    mockedListMyAttempts.mockResolvedValue([]);
    mockedListMyMoodLogs.mockResolvedValue([]);
    render(<ProgressView uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText(/bạn chưa làm bài test nào/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/chưa có ghi chép nào/i)).toBeInTheDocument();
    expect(screen.queryByText(/chưa tải được/i)).not.toBeInTheDocument();
  });

  it("hiện cặp trước/sau khi có linkedActivityRef trùng nhau, kèm câu giải thích không quy kết nguyên nhân", async () => {
    mockedListMyAttempts.mockResolvedValue([]);
    mockedListMyMoodLogs.mockResolvedValue([
      mood({ id: "b", context: "before", moodScore: 3, linkedActivityRef: "testAttempts/x" }),
      mood({ id: "c", context: "after", moodScore: 6, linkedActivityRef: "testAttempts/x" }),
    ]);
    render(<ProgressView uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText(/3\/10.*6\/10/)).toBeInTheDocument();
    });
    expect(screen.getByText(/không phải bằng chứng/i)).toBeInTheDocument();
  });

  it("không có ngôn ngữ về chuỗi ngày hay cải thiện xuất hiện trên trang", async () => {
    mockedListMyAttempts.mockResolvedValue([attempt]);
    mockedListMyMoodLogs.mockResolvedValue([
      mood({ id: "b", context: "before", moodScore: 3, linkedActivityRef: "testAttempts/x" }),
      mood({ id: "c", context: "after", moodScore: 6, linkedActivityRef: "testAttempts/x" }),
    ]);
    render(<ProgressView uid="u1" />);

    await waitFor(() => {
      expect(screen.getByText("Điểm 12")).toBeInTheDocument();
    });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/streak|chuỗi ngày|liên tiếp|cải thiện|hiệu quả/i);
  });
});
