/**
 * Kho nhạc riêng của học sinh — phần logic thuần, không đụng Firestore.
 *
 * Kho riêng gồm hai loại bài, cố ý tách rời:
 *
 *   1. Bài LƯU VỀ từ kho chung. Chỉ lưu id, nội dung vẫn đọc từ `musicTracks`
 *      — trường sửa hay gỡ một bài thì kho riêng của mọi học sinh theo kịp
 *      ngay, không có bản sao cũ nằm lại.
 *   2. Bài học sinh TỰ THÊM. Nằm dưới `users/{uid}/`, chỉ chủ tài khoản đọc
 *      được. Không có ghi chú bản quyền vì không phát tán cho ai.
 *
 * Bài tự thêm có thể được ĐỀ XUẤT cho kho chung; lúc đó một bản sao đi vào
 * `musicSuggestions` để thầy cô đọc. Đề xuất KHÔNG tự vào kho chung: thầy cô
 * phải tự điền ghi chú bản quyền rồi mới thêm được — xem admin/music.
 */

import { z } from "zod";
import { getYouTubeEmbedUrl } from "@/lib/video";
import { MUSIC_MOODS } from "@/lib/types/music";
import type { MusicTrackListItem } from "@/lib/firebase/queries-public";

/**
 * Phần học sinh nhập tay khi tự thêm một bài.
 *
 * So với musicDraftSchema của thầy cô (admin-music.ts) thì thiếu HAI field, cả
 * hai đều cố ý: `rightsNote` (học sinh không đủ căn cứ để điền — xem đầu file)
 * và `order` (kho riêng không cần thầy cô sắp thứ tự).
 */
export const studentTrackDraftSchema = z.object({
  title: z.string().trim().min(1, "Hãy đặt tên cho bài này.").max(200),
  artist: z.string().trim().max(200),
  // Kiểm bằng CHÍNH hàm mà trình phát dùng, cùng lý do với musicDraftSchema:
  // link không nhúng được mà vẫn lưu thì học sinh bấm Phát và thấy khung trống.
  youtubeUrl: z
    .string()
    .min(1, "Hãy dán link YouTube.")
    .refine((v) => getYouTubeEmbedUrl(v) !== null, "Link không phải video YouTube hợp lệ."),
  mood: z.enum(MUSIC_MOODS),
});

export type StudentTrackDraft = z.infer<typeof studentTrackDraftSchema>;

/**
 * Lọc ra những bài kho chung mà học sinh đã lưu.
 *
 * Giữ nguyên thứ tự của `tracks` (đã sắp sẵn theo order rồi tiêu đề) thay vì
 * theo thứ tự lưu: kho riêng đọc giống kho chung thì dễ tìm hơn.
 *
 * Id không khớp bài nào bị bỏ qua IM LẶNG — đó là bài thầy cô đã gỡ hoặc
 * chuyển về nháp. Hiện một dòng "bài này không còn" sẽ để lại dấu vết của thứ
 * trường vừa cố ý gỡ đi.
 */
export function pickSavedTracks(
  savedIds: string[],
  tracks: MusicTrackListItem[],
): MusicTrackListItem[] {
  const daLuu = new Set(savedIds);
  return tracks.filter((t) => daLuu.has(t.id));
}
