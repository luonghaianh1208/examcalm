import Link from "next/link";
import Image from "next/image";
import type { SessionUser } from "@/lib/firebase/session";
import { visibleNav, type NavItem } from "@/lib/nav";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { NavList } from "./NavList";
import { MobileNav } from "./MobileNav";

/**
 * Vỏ chung của toàn app: brand zone + logo + vùng nội dung.
 *
 * MỘT vỏ duy nhất cho mọi route, chỉ khác phần nội dung menu truyền vào
 * (STUDENT_NAV hoặc ADMIN_NAV). Đây là lý do tồn tại của component này: Brand
 * Guideline mục 12 yêu cầu "logo ở góc trái trên cùng trên mọi route" và
 * "không layout shift khi đổi route". Hai vỏ riêng thì không giữ nổi cam kết
 * đó — logo sẽ nhảy khi đi từ trang học sinh sang trang quản trị.
 *
 * Kích thước logo và brand zone KHÔNG viết ở đây. Chúng nằm trong hai class
 * .ec-app-shell__brand và .ec-app-logo của brand-tokens.css, vốn đã có sẵn
 * media query cho từng breakpoint.
 */
export function AppShell({
  nav,
  user,
  children,
}: {
  nav: NavItem[];
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const items = visibleNav(nav, Boolean(user));

  const actions = user ? (
    <Link
      href="/ho-so"
      className="rounded-[var(--ec-radius-pill)] bg-brand-soft px-4 py-2 text-sm font-medium text-ink"
    >
      Hồ sơ
    </Link>
  ) : (
    <div className="flex items-center gap-2">
      <Link href="/dang-nhap" className="px-3 py-2 text-sm text-link underline">
        Đăng nhập
      </Link>
      <Link
        href="/dang-ky"
        className="rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-4 py-2 text-sm font-medium text-ink-inverse"
      >
        Đăng ký
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Sidebar: cố định, không cuộn theo nội dung — guideline mục 4.1 cấm
          logo cuộn cùng feed khi app shell đang cố định. */}
      {/* 224px ở tablet, 248px (token) từ 1280px. Guideline gọi tablet là
          "navigation rail thu gọn"; 200px thì "Trò chuyện AI với Meo" vỡ dòng
          xấu, 224px vừa đủ chứa nhãn dài nhất. */}
      <aside className="hidden w-[224px] shrink-0 border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:flex-col md:overflow-y-auto xl:w-[var(--ec-sidebar-width)]">
        <div className="ec-app-shell__brand">
          <Link href="/" aria-label="ExamCalm — về trang chủ">
            {/* width/height chỉ khai báo tỉ lệ nguồn (512×512) cho next/image;
                kích thước hiển thị thật do .ec-app-logo quyết định theo
                breakpoint. Trước đây file nguồn chỉ 96×96 mà khai báo 132×40
                nên logo render ra 40×40 — đúng lỗi học sinh phản ánh. */}
            <Image
              src="/brand/logo.webp"
              alt="ExamCalm"
              width={512}
              height={512}
              priority
              className="ec-app-logo"
            />
          </Link>
        </div>
        <nav aria-label="Chính" className="px-3 pb-6">
          <NavList items={items} />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Thanh thương hiệu mobile: 88px = logo 72px + 8px đệm trên dưới. */}
        <header className="flex h-[var(--ec-mobile-topbar-height)] shrink-0 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <Link href="/" aria-label="ExamCalm — về trang chủ">
            <Image
              src="/brand/logo.webp"
              alt="ExamCalm"
              width={512}
              height={512}
              priority
              className="ec-app-logo"
            />
          </Link>
          <div className="ml-auto">{actions}</div>
        </header>

        <div className="hidden h-[var(--ec-topbar-height)] shrink-0 items-center justify-end px-6 md:flex">
          {actions}
        </div>

        {/* pb-24 trên mobile: chừa chỗ cho bottom nav 68px + safe area, nếu
            không thì nội dung cuối trang bị thanh điều hướng che. */}
        <main className="mx-auto w-full max-w-[var(--ec-content-max)] flex-1 px-4 pb-24 md:px-6 md:pb-10">
          {children}
        </main>

        <SiteFooter />
      </div>

      <MobileNav items={items} />
    </div>
  );
}
