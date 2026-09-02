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

/**
 * Bài học sinh tự thêm vào kho riêng — `users/{uid}/musicOwn/{id}`.
 *
 * KHÔNG có `rightsNote` và `status`: bài này chỉ chủ tài khoản đọc được (rules
 * `isOwner`), không phát tán cho ai, nên không cần ghi chú bản quyền cũng
 * không cần ai duyệt. Cả hai thứ đó chỉ xuất hiện khi bài được đề xuất vào kho
 * CHUNG — lúc ấy thầy cô tự điền. Xem src/lib/music-personal.ts.
 */
export const studentTrackSchema = z.object({
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(""),
  youtubeUrl: z.string().url(),
  mood: z.enum(MUSIC_MOODS),
  /** Id document trong `musicSuggestions`, hoặc "" khi chưa đề xuất bao giờ. */
  suggestionId: z.string().default(""),
});

export type StudentTrack = z.infer<typeof studentTrackSchema>;

export const MUSIC_SUGGESTION_STATUSES = ["pending", "approved", "rejected"] as const;
export type MusicSuggestionStatus = (typeof MUSIC_SUGGESTION_STATUSES)[number];

export const MUSIC_SUGGESTION_STATUS_LABELS: Record<MusicSuggestionStatus, string> = {
  pending: "Đang chờ thầy cô xem",
  approved: "Đã được nhận vào kho trường",
  rejected: "Lần này chưa nhận",
};

/**
 * Một đề xuất của học sinh cho kho chung — `musicSuggestions/{id}`.
 *
 * CÓ `authorUid`, khác hẳn Confession (nơi danh tính bị tách rời có chủ đích).
 * Ở đây thầy cô cần biết ai đề xuất để còn hỏi lại về nguồn nhạc trước khi ghi
 * ghi chú bản quyền — và bản thân việc đề xuất một bài nhạc không phải điều
 * cần ẩn danh để nói ra.
 */
export const musicSuggestionSchema = z.object({
  authorUid: z.string().min(1),
  title: z.string().min(1).max(200),
  artist: z.string().max(200).default(""),
  youtubeUrl: z.string().url(),
  mood: z.enum(MUSIC_MOODS),
  status: z.enum(MUSIC_SUGGESTION_STATUSES),
  /** Uid admin đã xử lý, "" khi còn chờ. */
  reviewedBy: z.string().default(""),
});

export type MusicSuggestion = z.infer<typeof musicSuggestionSchema>;
