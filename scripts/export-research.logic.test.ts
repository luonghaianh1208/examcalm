import { describe, it, expect } from "vitest";
import { toMoodExportRow } from "./export-research.logic";

describe("toMoodExportRow", () => {
  it("chỉ lấy đúng participantId, moodScore, context, createdAt", () => {
    const row = toMoodExportRow("hash123", {
      moodScore: 7,
      context: "standalone",
      createdAt: { toDate: () => new Date("2026-01-01T00:00:00.000Z") },
    });
    expect(row).toEqual({
      participantId: "hash123",
      moodScore: 7,
      context: "standalone",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  // Finding 4 của review: tags là văn bản tự do học sinh tự gõ (không có vocabulary
  // cố định), có thể chứa tên người/lớp/trường y như note — trước đây bị đưa nhầm
  // vào export. Test này đảm bảo nếu ai đó thêm lại `data.tags` vào hàm chọn trường
  // thì assertion `toEqual` bên dưới (đối chiếu ĐÚNG BỘ key, không chỉ "chứa") sẽ fail.
  it("KHÔNG có field note hay tags trong kết quả dù document Firestore có sẵn", () => {
    const row = toMoodExportRow("hash123", {
      moodScore: 5,
      context: "before",
      createdAt: null,
      note: "riêng tư: gặp bạn Minh lớp 12A2",
      tags: ["cãi nhau với Minh 12A2"],
      userId: "raw-uid-khong-duoc-lo-ra",
    });
    expect(row).toEqual({
      participantId: "hash123",
      moodScore: 5,
      context: "before",
      createdAt: null,
    });
    expect(row).not.toHaveProperty("note");
    expect(row).not.toHaveProperty("tags");
    expect(row).not.toHaveProperty("userId");
  });

  it("createdAt = null khi document không có timestamp hợp lệ", () => {
    const row = toMoodExportRow("hash1", { moodScore: 3, context: "after", createdAt: null });
    expect(row.createdAt).toBeNull();
  });
});
