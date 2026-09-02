import { describe, expect, it } from "vitest";
import { pickSavedTracks, studentTrackDraftSchema } from "./music-personal";
import type { MusicTrackListItem } from "@/lib/firebase/queries-public";

function track(id: string, title: string): MusicTrackListItem {
  return {
    id,
    title,
    artist: "",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    mood: "tap-trung",
    rightsNote: "Kênh chính thức",
    status: "published",
    order: 0,
    updatedBy: "admin1",
  };
}

describe("pickSavedTracks", () => {
  it("giữ đúng những bài đã lưu, theo thứ tự của kho chung", () => {
    const tracks = [track("a", "An"), track("b", "Bien"), track("c", "Cay")];
    expect(pickSavedTracks(["c", "a"], tracks).map((t) => t.id)).toEqual(["a", "c"]);
  });

  /*
   * Trường hợp thật, không phải giả định: thầy cô gỡ một bài khỏi kho chung
   * (hoặc chuyển về nháp) trong khi học sinh đã lưu bài đó. Id trong kho riêng
   * trỏ vào một bài không còn đọc được nữa.
   *
   * Bỏ qua im lặng là ĐÚNG ở đây: bài đã bị gỡ thì không nên hiện lại cho học
   * sinh dưới bất kỳ hình thức nào, kể cả một dòng "bài này không còn".
   */
  it("bỏ qua id trỏ vào bài đã bị gỡ khỏi kho chung", () => {
    expect(pickSavedTracks(["a", "khong-ton-tai"], [track("a", "An")]).map((t) => t.id)).toEqual(["a"]);
  });

  it("chưa lưu gì thì trả về danh sách rỗng", () => {
    expect(pickSavedTracks([], [track("a", "An")])).toEqual([]);
  });
});

describe("studentTrackDraftSchema", () => {
  const hopLe = {
    title: "Nhạc piano để học",
    artist: "",
    youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    mood: "tap-trung",
  };

  it("nhận link YouTube hợp lệ", () => {
    expect(studentTrackDraftSchema.safeParse(hopLe).success).toBe(true);
  });

  /*
   * Cùng lý do với musicDraftSchema của thầy cô: kiểm bằng CHÍNH hàm mà trình
   * phát dùng. Link không nhúng được mà vẫn lưu thì học sinh bấm Phát và thấy
   * một khung trống, không hiểu vì sao.
   */
  it("từ chối link không phải YouTube", () => {
    for (const url of ["https://example.com/bai-hat.mp3", "https://vimeo.com/12345", "khong-phai-url"]) {
      expect(studentTrackDraftSchema.safeParse({ ...hopLe, youtubeUrl: url }).success, url).toBe(false);
    }
  });

  it("bắt buộc có tên bài và nhóm nhu cầu", () => {
    expect(studentTrackDraftSchema.safeParse({ ...hopLe, title: "  " }).success).toBe(false);
    expect(studentTrackDraftSchema.safeParse({ ...hopLe, mood: "khong-co" }).success).toBe(false);
  });

  /*
   * rightsNote CỐ Ý không có ở đây. Học sinh không đủ căn cứ để điền ghi chú
   * bản quyền, và bài trong kho riêng chỉ mình em ấy nghe nên không phát tán
   * gì. Ghi chú đó chỉ bắt buộc khi bài vào kho CHUNG — do thầy cô điền lúc
   * duyệt đề xuất. Nhận rightsNote từ học sinh sẽ tạo ra một ghi chú bản quyền
   * không ai chịu trách nhiệm.
   */
  it("KHÔNG nhận rightsNote từ học sinh", () => {
    const parsed = studentTrackDraftSchema.safeParse({ ...hopLe, rightsNote: "em tu ghi" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "rightsNote" in parsed.data).toBe(false);
  });
});
