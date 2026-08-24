import Image from "next/image";

type Expression = "calm" | "cheer" | "listen";

type Props = {
  expression?: Expression;
  size?: number;
  className?: string;
  /**
   * Đặt true cho hình mèo xuất hiện ngay khung nhìn đầu tiên (widget nổi, header)
   * để Next tải sớm thay vì lazy — tránh mèo "nhảy vào" sau khi trang đã vẽ xong.
   */
  priority?: boolean;
};

/**
 * Mascot chính thức của ExamCalm.
 *
 * Ảnh nguồn nằm ở WEB/MASCOT/ (500x500 PNG, ~130–200KB mỗi file). Bản dùng trong
 * app đã được nén sang WebP 160x160 (5–8KB) ở public/brand/ — hiển thị tối đa 72px
 * nên 160px là đủ cho màn hình 2x. Đổi mascot chỉ cần thay ba file webp đó và
 * chạy lại lệnh nén; không component nào khác phải sửa.
 *
 * Ba trạng thái tương ứng ba tư thế:
 *   calm   — mèo cuộn tròn ngủ, dùng làm mặc định
 *   listen — mèo ngồi ngước nhìn, dùng khi mở nhật ký cảm xúc
 *   cheer  — mèo đứng, dùng khi động viên
 */
const POSE: Record<Expression, { src: string; alt: string }> = {
  calm: { src: "/brand/meo-calm.webp", alt: "Mèo đồng hành của ExamCalm đang nằm nghỉ" },
  listen: { src: "/brand/meo-listen.webp", alt: "Mèo đồng hành của ExamCalm đang lắng nghe" },
  cheer: { src: "/brand/meo-cheer.webp", alt: "Mèo đồng hành của ExamCalm đang vui" },
};

export function CatMascot({ expression = "calm", size = 72, className, priority = false }: Props) {
  const pose = POSE[expression];
  return (
    <Image
      src={pose.src}
      alt={pose.alt}
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
