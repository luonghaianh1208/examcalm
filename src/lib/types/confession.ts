import { z } from "zod";

/**
 * Trạng thái kiểm duyệt — PRD §8.2.
 *
 *   pending        vừa gửi, Cloud Function chưa xử lý xong
 *   auto_approved  AI thấy rủi ro thấp → đã ghi sang confessionsPublic
 *   hold           AI không chắc hoặc rủi ro cao → CHỜ NGƯỜI THẬT duyệt
 *   rejected       vi phạm rõ ràng, hoặc người duyệt từ chối
 *
 * `hold` là nhánh mặc định khi chưa cấu hình AI. Đó là lựa chọn có chủ ý: thà
 * để bài chờ người đọc còn hơn cho một nội dung chưa ai xem lọt ra công khai
 * giữa các bạn cùng trường.
 */
export const CONFESSION_STATUSES = ["pending", "auto_approved", "hold", "rejected"] as const;

export const MAX_CONFESSION_LENGTH = 1500;

export const confessionSchema = z.object({
  /** Chỉ tồn tại ở collection RIÊNG TƯ. confessionsPublic không bao giờ có field này. */
  authorUid: z.string().min(1),
  textContent: z.string().min(1).max(MAX_CONFESSION_LENGTH),
  status: z.enum(CONFESSION_STATUSES),
  /** Lý do máy đọc được để hiện ở console duyệt bài. */
  moderationReason: z.string().max(300).default(""),
  /** uid người duyệt, null nghĩa là chưa ai đụng tới. */
  handledBy: z.string().nullable().default(null),
});

/**
 * Bản CÔNG KHAI — cố ý là một schema riêng, không phải Omit<> của schema trên.
 *
 * Viết rời ra để việc thêm một field vào `confessionSchema` KHÔNG tự động kéo
 * nó sang bản công khai. Rò rỉ ở đây nghĩa là lộ danh tính một học sinh vừa
 * kể chuyện riêng của mình.
 */
export const confessionPublicSchema = z.object({
  textContent: z.string().min(1).max(MAX_CONFESSION_LENGTH),
  /** Số lần bị báo cáo. Vượt ngưỡng thì đưa lại vào hàng chờ duyệt. */
  reportCount: z.number().int().min(0).default(0),
});

export type ConfessionStatus = (typeof CONFESSION_STATUSES)[number];
export type Confession = z.infer<typeof confessionSchema>;
export type ConfessionPublic = z.infer<typeof confessionPublicSchema>;
