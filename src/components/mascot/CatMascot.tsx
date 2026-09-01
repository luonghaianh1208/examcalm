import Image from "next/image";

type Expression = "calm" | "cheer" | "listen" | "home" | "welcome" | "journal";

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
 * Meo — mascot chính thức của ExamCalm.
 *
 * Ảnh gốc nằm ở BRAND GUIDELINE/assets/meo/ (1254×1254 PNG). Bản dùng trong app
 * là WebP 512×512 ở public/brand/meo/, sinh ra bằng
 * `npx tsx scripts/build-brand-assets.mts`. Đổi mascot thì thay ảnh gốc rồi
 * chạy lại script; không component nào phải sửa.
 *
 * Brand Guideline trang 10 quy định mỗi tư thế cho một ngữ cảnh, và cấm dùng
 * lặp lại Meo trong mọi card: "Meo xuất hiện ở điểm hướng dẫn, phản hồi, Nhật
 * ký và trạng thái trống".
 *
 * Ba tên calm/listen/cheer giữ nguyên từ bộ ảnh cũ để không phải sửa các chỗ
 * đang gọi; chúng trỏ sang ảnh chính thức tương ứng.
 */
const POSE: Record<Expression, { src: string; alt: string }> = {
  calm: { src: "/brand/meo/rest.webp", alt: "Meo đang nằm nghỉ" },
  listen: { src: "/brand/meo/listen.webp", alt: "Meo đang lắng nghe" },
  cheer: { src: "/brand/meo/cheer.webp", alt: "Meo đang cổ vũ" },
  home: { src: "/brand/meo/home.webp", alt: "Meo đứng chào ở trang chủ" },
  welcome: { src: "/brand/meo/welcome.webp", alt: "Meo vẫy tay chào mừng" },
  journal: { src: "/brand/meo/journal.webp", alt: "Meo trong nhật ký cảm xúc" },
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
