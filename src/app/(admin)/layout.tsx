import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/session";
import { AppShell } from "@/components/shell/AppShell";
import { ADMIN_NAV } from "@/lib/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();

  return (
    <AppShell nav={ADMIN_NAV} user={user}>
      {/* CỐ Ý không dùng <h1> ở đây: mỗi trang quản trị đã có <h1> riêng, thêm
          một cái nữa sẽ thành hai h1 trên cùng một trang. Đây là dòng nhận diện
          khu vực, không phải tiêu đề trang. */}
      <div className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Bảng quản trị
        </p>
        {user.email && <p className="text-sm text-muted">{user.email}</p>}
        <Link href="/" className="ml-auto text-sm text-link underline">
          Về trang học sinh
        </Link>
      </div>
      {children}
    </AppShell>
  );
}
