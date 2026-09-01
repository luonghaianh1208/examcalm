import Link from "next/link";
import { CatMascot } from "@/components/mascot/CatMascot";

// Không export metadata.title riêng: trang chủ dùng đúng title.default và
// description đã khai báo ở root layout (src/app/layout.tsx).

/**
 * Ba cửa vào theo NHU CẦU, không phải theo tên tính năng.
 *
 * Brand Guideline trang 20: "Ưu tiên đầu tiên: 'Bạn cần gì lúc này?' thay vì
 * liệt kê toàn bộ tính năng trong hero." Học sinh mở app lúc đang lo thì biết
 * mình đang cảm thấy gì, chứ chưa biết "CBT" hay "GAD-7" là gì.
 *
 * Music Hub và Confession theo guideline thuộc cửa 2 và cửa 3, nhưng đang "Sắp
 * ra mắt" nên KHÔNG xuất hiện ở đây dưới dạng link. Hứa một cửa rồi dẫn tới
 * 404 còn tệ hơn là chưa hứa.
 */
const DOORS = [
  {
    href: "/test",
    title: "Hiểu cảm xúc",
    desc: "Một bài tự đánh giá ngắn để gọi tên điều bạn đang thấy.",
    tint: "bg-feature-test/10",
    dot: "bg-feature-test",
  },
  {
    href: "/cbt",
    title: "Bình tĩnh lại",
    desc: "Bài tập ngắn giúp gỡ một suy nghĩ đang làm bạn căng.",
    tint: "bg-feature-cbt/10",
    dot: "bg-feature-cbt",
  },
  {
    href: "/thu-vien",
    title: "Tìm một hoạt động",
    desc: "Bài viết và kỹ thuật ngắn, đọc xong là làm được ngay.",
    tint: "bg-feature-library/10",
    dot: "bg-feature-library",
  },
];

export default function Page() {
  return (
    <div className="py-8">
      {/* Gradient chỉ dùng ở ĐÚNG một khu vực trọng tâm của trang — guideline
          trang 08 giới hạn 1-2 vùng mỗi màn hình. */}
      <section
        className="mb-8 overflow-hidden rounded-[var(--ec-radius-xl)] px-6 py-10 md:px-10"
        style={{ backgroundImage: "var(--ec-gradient-hero)" }}
      >
        <div className="flex flex-col-reverse items-start gap-6 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold text-ink md:text-[44px] md:leading-tight">
              Bạn cần gì lúc này?
            </h1>
            <p className="mt-3 max-w-[52ch] text-body">
              ExamCalm giúp bạn hiểu mình và chọn một bước nhỏ phù hợp. Bạn không cần làm
              tất cả.
            </p>
            <Link
              href="/test"
              className="mt-6 inline-block rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-6 py-3 font-medium text-ink-inverse"
            >
              Bắt đầu
            </Link>
          </div>
          <CatMascot size={140} expression="welcome" priority className="shrink-0" />
        </div>
      </section>

      <ul className="mb-8 grid gap-4 md:grid-cols-3">
        {DOORS.map((door) => (
          <li key={door.href}>
            <Link
              href={door.href}
              className={`flex h-full flex-col rounded-[var(--ec-radius-lg)] ${door.tint} px-5 py-5 transition-transform motion-safe:hover:-translate-y-0.5`}
            >
              <span className={`mb-3 size-3 rounded-full ${door.dot}`} aria-hidden />
              <span className="font-semibold text-ink">{door.title}</span>
              <span className="mt-1 text-sm text-body">{door.desc}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mb-6 rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-4 text-body">
        Bạn dùng được ngay mà không cần tài khoản. Đăng ký chỉ cần khi bạn muốn lưu lại để
        xem thay đổi theo thời gian.
      </p>

      {/* Đoạn này là ranh giới an toàn của sản phẩm, không phải trang trí —
          giữ nguyên nội dung, chỉ đổi sang token màu cảnh báo. */}
      <section className="rounded-[var(--ec-radius-lg)] bg-warning-soft px-5 py-4 text-warning">
        <h2 className="mb-1 font-medium">Một điều quan trọng</h2>
        <p>
          ExamCalm là công cụ tự tìm hiểu, <strong>không chẩn đoán và không thay thế chuyên
          gia tâm lý</strong>. Nếu bạn đang thấy rất khó khăn, hãy nói với người bạn tin
          tưởng: phụ huynh, thầy cô, hoặc cán bộ tâm lý học đường.
        </p>
      </section>
    </div>
  );
}
