import { z } from "zod";

/**
 * Nhóm theo NHU CẦU lúc nghe, không theo thể loại nhạc.
 *
 * Học sinh mở Music Hub vì đang cần một trạng thái ("mình cần tập trung"),
 * chứ không phải vì muốn nghe lo-fi hay piano. Cùng logic với ba cửa vào ở
 * trang chủ.
 */
export const MUSIC_MOODS = ["tap-trung", "thu-gian", "truoc-khi-ngu"] as const;

export const MUSIC_MOOD_LABELS: Record<MusicMood, string> = {
  "tap-trung": "Để tập trung",
  "thu-gian": "Để thư giãn",
  "truoc-khi-ngu": "Trước khi ngủ",
};

export const musicTrackSchema = z.object({
  title: z.string().min(1).max(200),
  /** Nghệ sĩ hoặc kênh. Để trống được khi là nhạc không lời không rõ tác giả. */
  artist: z.string().max(200).default(""),
  /** Chỉ nhận link YouTube — xem getYouTubeEmbedUrl. */
  youtubeUrl: z.string().url(),
  mood: z.enum(MUSIC_MOODS),
  /**
   * Ghi chú quyền sử dụng — BẮT BUỘC, không cho để trống.
   *
   * PRD §7.2.8: "Mỗi asset bắt buộc có metadata quyền sử dụng". Với nguồn
   * YouTube thì đây là nơi ghi vì sao được phép nhúng (kênh chính thức, giấy
   * phép Creative Commons, đã xin phép...). Bắt buộc điền để không ai âm thầm
   * thêm nhạc mà không nghĩ tới bản quyền — đây là dự án của trường.
   */
  rightsNote: z.string().min(1).max(300),
  status: z.enum(["draft", "published"]),
  /** Nhỏ hơn hiện trước trong cùng một nhóm. */
  order: z.number().int().min(0).default(0),
  updatedBy: z.string().min(1),
});

export type MusicMood = (typeof MUSIC_MOODS)[number];
export type MusicTrack = z.infer<typeof musicTrackSchema>;
