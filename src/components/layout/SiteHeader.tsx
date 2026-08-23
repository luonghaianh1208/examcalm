import Link from "next/link";
import type { SessionUser } from "@/lib/firebase/session";
import { CatMascot } from "@/components/mascot/CatMascot";

type Props = {
  /**
   * Root layout đã gọi getSessionUser() một lần cho MoodWidget — truyền lại
   * qua prop thay vì SiteHeader tự gọi lần nữa (tránh verifySessionCookie() kép).
   */
  user: SessionUser | null;
};

export function SiteHeader({ user }: Props) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CatMascot size={32} />
          ExamCalm
        </Link>

        <nav aria-label="Chính" className="flex flex-wrap items-center gap-4">
          <Link href="/test">Bài test</Link>
          <Link href="/thu-vien">Thư viện</Link>
          {user && <Link href="/tien-trinh">Tiến trình</Link>}
          {user?.role === "admin" && <Link href="/admin">Quản trị</Link>}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <Link href="/ho-so">Hồ sơ</Link>
          ) : (
            <>
              <Link href="/dang-nhap">Đăng nhập</Link>
              <Link href="/dang-ky" className="rounded-lg bg-teal-600 px-3 py-1.5 text-white">Đăng ký</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
