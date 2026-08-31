import Link from "next/link";

export const metadata = { title: "Quản trị" };

const AREAS = [
  { href: "/admin/tests", label: "Bài test", desc: "Soạn câu hỏi, đặt ngưỡng điểm, xuất bản phiên bản mới." },
  { href: "/admin/cbt", label: "Bài tập CBT", desc: "Soạn các bước thực hành và câu hỏi dẫn dắt." },
  { href: "/admin/thu-vien", label: "Thư viện", desc: "Viết bài hướng dẫn và gắn video cho học sinh đọc." },
  { href: "/admin/nguoi-dung", label: "Người dùng", desc: "Xem danh sách và cấp hoặc thu quyền quản trị." },
  { href: "/admin/ai", label: "Cấu hình AI", desc: "Chọn nhà cung cấp, đặt hạn mức, bật tắt tính năng." },
  { href: "/admin/nhat-ky-he-thong", label: "Nhật ký hệ thống", desc: "Dấu vết những thay đổi quan trọng và ai đã làm." },
];

export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản trị</h1>

      {/* Cảnh báo an toàn đứng riêng, trên cùng, chiếm trọn chiều ngang: đây là mục
          duy nhất ở đây có thể GẤP. Các mục còn lại là bảo trì nội dung. */}
      <Link
        href="/admin/canh-bao"
        className="mb-6 block rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 transition-colors hover:bg-rose-100"
      >
        <p className="font-medium text-rose-900">Cảnh báo an toàn</p>
        <p className="mt-1 text-sm text-rose-800">
          Học sinh có dấu hiệu cần được hỏi thăm. Kiểm tra mục này trước mọi việc khác.
        </p>
      </Link>

      <ul className="grid gap-3 sm:grid-cols-2">
        {AREAS.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="block h-full rounded-xl border bg-white px-5 py-4 transition-colors hover:border-teal-300 hover:bg-teal-50/40"
            >
              <p className="font-medium">{a.label}</p>
              <p className="mt-1 text-sm text-slate-600">{a.desc}</p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
