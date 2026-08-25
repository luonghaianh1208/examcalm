import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <nav aria-label="Quản trị" className="mb-8 flex flex-wrap gap-3 border-b pb-4">
        <Link href="/admin/tests" className="underline">Bài test</Link>
        <Link href="/admin/cbt" className="underline">Bài tập CBT</Link>
        <Link href="/admin/thu-vien" className="underline">Thư viện</Link>
        <Link href="/admin/nguoi-dung" className="underline">Người dùng</Link>
        <Link href="/admin/ai" className="underline">AI</Link>
        <Link href="/admin/canh-bao" className="underline">Cảnh báo</Link>
        <Link href="/admin/nhat-ky-he-thong" className="underline">Nhật ký hệ thống</Link>
      </nav>
      {children}
    </div>
  );
}
