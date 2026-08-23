import Link from "next/link";
import { CatMascot } from "@/components/mascot/CatMascot";

// Không export metadata.title riêng: trang chủ dùng đúng title.default và
// description đã khai báo ở root layout (src/app/layout.tsx).

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <CatMascot size={96} expression="cheer" />
        <div>
          <h1 className="text-3xl font-semibold">Bạn đang cảm thấy thế nào?</h1>
          <p className="mt-2 text-slate-600">
            ExamCalm giúp bạn gọi tên cảm xúc của mình trước kỳ thi và tìm một việc nhỏ
            có thể làm ngay.
          </p>
        </div>
      </div>

      <div className="mb-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/test" className="flex-1 rounded-xl bg-teal-600 px-4 py-3 text-center font-medium text-white">
          Làm thử bài test
        </Link>
        <Link href="/thu-vien" className="flex-1 rounded-xl border px-4 py-3 text-center">
          Xem thư viện
        </Link>
      </div>

      <p className="mb-8 rounded-xl bg-slate-100 px-4 py-3 text-slate-700">
        Bạn dùng được ngay mà không cần tài khoản. Đăng ký chỉ cần khi bạn muốn lưu lại
        để xem thay đổi theo thời gian.
      </p>

      <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
        <h2 className="mb-1 font-medium">Một điều quan trọng</h2>
        <p>
          ExamCalm là công cụ tự tìm hiểu, <strong>không chẩn đoán và không thay thế
          chuyên gia tâm lý</strong>. Nếu bạn đang thấy rất khó khăn, hãy nói với người
          bạn tin tưởng: phụ huynh, thầy cô, hoặc cán bộ tâm lý học đường.
        </p>
      </section>
    </main>
  );
}
