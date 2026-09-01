"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, type NavItem } from "@/lib/nav";

/**
 * Danh sách điều hướng dùng chung cho sidebar và cho bottom sheet "Tất cả".
 *
 * Màu tính năng chỉ xuất hiện ở chấm định vị bên trái, không bao giờ làm màu
 * chữ — Brand Guideline mục 2.1.
 */
export function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => {
        // Tiêu đề nhóm hiện ở mục ĐẦU TIÊN của mỗi nhóm. So với mục liền trước
        // thay vì gom sẵn thành mảng lồng nhau: giữ cấu hình phẳng, dễ đọc, và
        // menu học sinh (không có group) thì không tốn gì.
        //
        // Bọc trong <li role="presentation"> chứ không phải <p> trần: con trực
        // tiếp của <ul> phải là <li>, nếu không trình đọc màn hình sẽ đếm sai
        // số mục trong danh sách.
        const groupHeader =
          item.group && item.group !== items[index - 1]?.group ? (
            <li
              role="presentation"
              className="mt-4 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted first:mt-0"
            >
              {item.group}
            </li>
          ) : null;

        // Mục chưa có trang: KHÔNG render thành link. Một link dẫn tới 404 tệ
        // hơn hẳn một nhãn nói thật rằng tính năng chưa có.
        if (item.comingSoon) {
          return (
            <Fragment key={item.href}>
              {groupHeader}
              <li>
                {/* Nhãn "Sắp ra mắt" xuống DÒNG RIÊNG chứ không đứng cạnh tên.
                    Đặt cạnh bằng ml-auto thì ở sidebar hẹp (tablet 224px) cả
                    tên lẫn nhãn đều vỡ thành nhiều dòng — "Confession" từng bị
                    tách làm ba dòng. Xếp dọc thì rộng bao nhiêu cũng đọc được. */}
                <span className="flex items-start gap-3 rounded-md px-3 py-2 text-sm text-disabled">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.dot} opacity-40`} aria-hidden />
                  <span className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="text-xs">Sắp ra mắt</span>
                  </span>
                </span>
              </li>
            </Fragment>
          );
        }

        const active = isActive(pathname, item);
        return (
          <Fragment key={item.href}>
            {groupHeader}
            <li>
              <Link
                href={item.href}
                onClick={onNavigate}
                data-tour={item.tour}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  // Tint nhẹ + chữ đậm cho trang đang mở. Không dùng màu tính
                  // năng làm nền: guideline chỉ cho tint 4-12%.
                  active ? "bg-brand-soft font-medium text-ink" : "text-body hover:bg-subtle",
                ].join(" ")}
              >
                <span className={`size-2 shrink-0 rounded-full ${item.dot}`} aria-hidden />
                {item.label}
              </Link>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
