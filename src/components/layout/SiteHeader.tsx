import Link from "next/link";
import Image from "next/image";
import type { SessionUser } from "@/lib/firebase/session";

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
        {/* Logo đã gồm sẵn chữ ExamCalm nên không lặp lại bằng text; tên sản phẩm
            vẫn tới được trình đọc màn hình qua alt của ảnh. */}
        <Link href="/" aria-label="ExamCalm — về trang chủ" className="flex items-center">
          <Image
            src="/brand/logo.webp"
            alt="ExamCalm"
            width={132}
            height={40}
            priority
            className="h-10 w-auto"
          />
        </Link>

        <nav aria-label="Chính" className="flex flex-wrap items-center gap-4">
          <Link href="/test" data-tour="test">Bài test</Link>
          <Link href="/thu-vien" data-tour="library">Thư viện</Link>
          {user && <Link href="/tien-trinh" data-tour="progress">Tiến trình</Link>}
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
