"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

/**
 * Menu quản trị nhóm theo MỨC KHẨN, không theo loại dữ liệu.
 *
 * "Cảnh báo an toàn" đứng riêng một nhóm trên cùng vì đó là việc duy nhất ở khu
 * quản trị có thể gấp — mọi mục còn lại là bảo trì nội dung, hoãn được. Màu
 * rose CHỈ dùng cho nhóm này và không xuất hiện ở đâu khác trong khu quản trị,
 * nên khi thấy màu đó là biết có việc liên quan tới an toàn học sinh.
 */
const SAFETY: Item[] = [{ href: "/admin/canh-bao", label: "Cảnh báo an toàn" }];

const CONTENT: Item[] = [
  { href: "/admin/tests", label: "Bài test" },
  { href: "/admin/cbt", label: "Bài tập CBT" },
  { href: "/admin/thu-vien", label: "Thư viện" },
];

const SYSTEM: Item[] = [
  { href: "/admin/nguoi-dung", label: "Người dùng" },
  { href: "/admin/ai", label: "Cấu hình AI" },
  { href: "/admin/nhat-ky-he-thong", label: "Nhật ký hệ thống" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroup({
  label,
  items,
  pathname,
  tone,
}: {
  label: string;
  items: Item[];
  pathname: string;
  tone: "safety" | "normal";
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <ul className="flex flex-wrap gap-1 md:flex-col">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "block rounded-lg px-3 py-1.5 text-sm transition-colors",
                  tone === "safety"
                    ? active
                      ? "bg-rose-50 font-medium text-rose-800"
                      : "text-rose-700 hover:bg-rose-50"
                    : active
                      ? "bg-teal-50 font-medium text-teal-800"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Quản trị"
      className="flex flex-wrap gap-x-8 gap-y-4 md:w-52 md:shrink-0 md:flex-col md:gap-y-6"
    >
      <NavGroup label="An toàn" items={SAFETY} pathname={pathname} tone="safety" />
      <NavGroup label="Nội dung" items={CONTENT} pathname={pathname} tone="normal" />
      <NavGroup label="Hệ thống" items={SYSTEM} pathname={pathname} tone="normal" />
    </nav>
  );
}
