import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/session";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* CỐ Ý không dùng <h1> ở đây: mỗi trang quản trị đã có <h1> riêng, thêm một
          cái nữa ở layout sẽ thành hai h1 trên cùng một trang. Đây là dòng nhận
          diện khu vực, không phải tiêu đề trang. */}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Bảng quản trị
        </p>
        {user.email && <p className="text-sm text-slate-500">{user.email}</p>}
        <Link href="/" className="ml-auto text-sm text-teal-700 underline">
          Về trang học sinh
        </Link>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        <AdminNav />
        {/* min-w-0 để bảng rộng trong trang con cuộn ngang được thay vì đẩy vỡ layout. */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
