"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type NavItem } from "@/lib/nav";
import { useFocusTrap } from "@/components/onboarding/useFocusTrap";
import { NavList } from "./NavList";

/**
 * Điều hướng mobile: thanh dưới cùng 68px + bottom sheet "Tất cả".
 *
 * Brand Guideline trang 12: giữ các điểm vào chính trên thanh dưới, phần còn
 * lại nằm sau một lần chạm. Đây là câu trả lời cho phản hồi 5.3 của học sinh —
 * menu ngang cũ chật tới mức tên tính năng xuống hai hàng.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useFocusTrap(sheetOpen, () => setSheetOpen(false));

  const primary = items.filter((i) => i.primary);
  const rest = items.filter((i) => !i.primary);

  return (
    <>
      {sheetOpen && (
        <>
          {/* Lớp phủ đóng sheet khi chạm ra ngoài. aria-hidden vì Escape và nút
              Đóng đã lo đường thoát cho bàn phím. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-40 bg-[var(--ec-bg-overlay)] md:hidden"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Tất cả tính năng"
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--ec-radius-xl)] bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-floating outline-none md:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-medium text-ink">Tất cả tính năng</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="min-h-11 min-w-11 rounded-md px-3 text-sm text-link underline"
              >
                Đóng
              </button>
            </div>
            <NavList items={rest} onNavigate={() => setSheetOpen(false)} />
          </div>
        </>
      )}

      <nav
        aria-label="Chính"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primary.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              data-tour={item.tour}
              aria-current={active ? "page" : undefined}
              // min-h-[68px] khớp token --ec-mobile-bottom-nav-height; mỗi ô
              // rộng đều nhau và luôn vượt 44px touch target của guideline.
              className="flex min-h-[68px] flex-1 flex-col items-center justify-center gap-1 px-1 text-xs"
            >
              <span
                className={`size-2 rounded-full ${item.dot} ${active ? "" : "opacity-40"}`}
                aria-hidden
              />
              <span className={active ? "font-medium text-ink" : "text-muted"}>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-expanded={sheetOpen}
          className="flex min-h-[68px] flex-1 flex-col items-center justify-center gap-1 px-1 text-xs"
        >
          <span className="size-2 rounded-full bg-line" aria-hidden />
          <span className="text-muted">Tất cả</span>
        </button>
      </nav>
    </>
  );
}
