"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bẫy focus bên trong một overlay (dialog/tooltip) khi đang mở: focus phần tử
 * đầu tiên lúc mở, Tab/Shift+Tab không thoát ra ngoài overlay, Escape gọi
 * onEscape. Dùng chung cho WelcomeDialog và OnboardingTour — cả hai đều là
 * overlay role="dialog" phải tuân thủ yêu cầu accessibility không thương lượng
 * của spec onboarding: học sinh dùng bàn phím không được kẹt lại phía sau overlay.
 */
export function useFocusTrap(active: boolean, onEscape: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onEscapeRef = useRef(onEscape);
  // Cập nhật ref trong effect (không phải trực tiếp lúc render) — đọc/ghi ref
  // lúc render bị react-hooks/refs cấm; effect này chạy sau mỗi render nên
  // onEscapeRef luôn có bản mới nhất trước khi keydown handler cần đến nó.
  useEffect(() => {
    onEscapeRef.current = onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    function getFocusable(): HTMLElement[] {
      return Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    }

    const focusable = getFocusable();
    (focusable[0] ?? container).focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      // items.length > 0 vừa được kiểm tra ở trên — non-null an toàn.
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active]);

  return containerRef;
}
