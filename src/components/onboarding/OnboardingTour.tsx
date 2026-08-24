"use client";

import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";
import { setHideTooltips } from "@/lib/firestore/onboarding";
import { useFocusTrap } from "./useFocusTrap";

/**
 * `data-tour="..."` là attribute ổn định gắn riêng cho tour (không phải class
 * CSS hay text hiển thị — cả hai đều có thể đổi và âm thầm làm gãy anchor).
 * Xem MoodWidget.tsx và SiteHeader.tsx.
 */
const STEPS: { selector: string; text: string }[] = [
  {
    selector: '[data-tour="mood"]',
    text: "Chú mèo ở góc màn hình là nơi bạn ghi lại cảm xúc mỗi ngày — chỉ vài giây thôi.",
  },
  {
    selector: '[data-tour="test"]',
    text: '"Bài test" giúp bạn hiểu rõ hơn trạng thái của mình lúc này, không phải để xếp hạng.',
  },
  {
    selector: '[data-tour="library"]',
    text: '"Thư viện" có các kỹ thuật thư giãn ngắn, dễ áp dụng ngay khi bạn cần.',
  },
  {
    selector: '[data-tour="progress"]',
    text: '"Tiến trình" lưu lại những gì bạn đã tự ghi nhận — chỉ mình bạn xem được.',
  },
];

type Props = {
  uid: string;
  /** true: học sinh đã tick "không hiện lại" ở lần trước — không render gì cả. */
  hideTooltips: boolean;
};

const MARGIN = 16;

export function OnboardingTour({ uid, hideTooltips }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [closed, setClosed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  const isLastStep = stepIndex === STEPS.length - 1;
  const active = !hideTooltips && !closed;

  const handleClose = useCallback(() => {
    // KHÔNG ghi hideTooltips ở đây — "Bỏ qua"/Escape chỉ đóng cho phiên này,
    // đúng hành vi được yêu cầu: không tick "không hiện lại" thì lần sau vẫn
    // hiện lại tour.
    setClosed(true);
  }, []);

  const containerRef = useFocusTrap(active, handleClose);

  // useLayoutEffect vì cần đo kích thước thật của tooltip (đã render) để tính
  // vị trí không tràn màn hình, tránh nhấp nháy vị trí sai trước khi đo lại.
  useLayoutEffect(() => {
    if (!active) return;

    function reposition() {
      // stepIndex luôn nằm trong [0, STEPS.length) — chỉ tăng dần và bị chặn
      // ở bước cuối (xem handleNext) — non-null an toàn ở đây.
      const currentStep = STEPS[stepIndex]!;
      const anchor = document.querySelector<HTMLElement>(currentStep.selector);
      const card = containerRef.current;
      if (!anchor || !card) {
        setStyle({});
        return;
      }
      const anchorRect = anchor.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();

      const spaceBelow = window.innerHeight - anchorRect.bottom;
      const placeBelow = spaceBelow >= cardRect.height + MARGIN || anchorRect.top < cardRect.height + MARGIN;
      const top = placeBelow
        ? Math.min(anchorRect.bottom + 12, window.innerHeight - cardRect.height - MARGIN)
        : Math.max(MARGIN, anchorRect.top - cardRect.height - 12);

      const left = Math.min(
        Math.max(MARGIN, anchorRect.left),
        Math.max(MARGIN, window.innerWidth - cardRect.width - MARGIN),
      );

      // paddingBottom: bảo vệ nội dung khỏi bị che bởi vùng safe-area dưới
      // cùng (home indicator...) — không đọc được env() từ JS để CLAMP vị trí
      // theo nó, nhưng đệm thêm khoảng đó vào bên trong thẻ là đủ trong thực
      // tế vì MARGIN ở trên đã giữ card cách mép màn hình tối thiểu 16px.
      setStyle({ top, left, paddingBottom: "max(1rem, env(safe-area-inset-bottom))" });
    }

    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef ổn định (từ useRef), không cần trong deps.
  }, [active, stepIndex]);

  if (!active) return null;

  // Cùng bất biến như trong reposition() ở trên — non-null an toàn.
  const step = STEPS[stepIndex]!;

  function handleNext() {
    if (isLastStep) {
      setClosed(true);
      return;
    }
    setStepIndex((i) => i + 1);
  }

  function handleCheckbox(next: boolean) {
    setChecked(next);
    void setHideTooltips(uid, next);
  }

  return (
    <>
      {/* aria-modal="true" ở dialog bên dưới nói với screen reader rằng phần
          còn lại của trang đang bất hoạt — lớp này làm điều đó đúng luôn với
          chuột/chạm, chặn học sinh bấm xuyên qua card để lỡ tay điều hướng đi
          nơi khác giữa tour. Rất mờ (không dùng scrim đậm như WelcomeDialog)
          vì tour đang trỏ vào đúng phần tử được highlight, cần vẫn nhìn thấy
          rõ. Bấm vào đây coi như "Bỏ qua" — cùng hành vi với Escape, không ghi
          hideTooltips. */}
      <div aria-hidden="true" onClick={handleClose} className="fixed inset-0 z-40 bg-slate-900/5" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Hướng dẫn sử dụng — bước ${stepIndex + 1} trên ${STEPS.length}`}
        tabIndex={-1}
        style={style}
        className="fixed z-50 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 shadow-xl outline-none motion-safe:transition-[top,left]"
      >
        <p className="mb-4">{step.text}</p>

        {isLastStep && (
          <label className="mb-4 flex items-start gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => handleCheckbox(e.target.checked)}
            />
            <span>Không hiện lại hướng dẫn này</span>
          </label>
        )}

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={handleClose} className="text-slate-600 underline">
            Bỏ qua
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
          >
            {isLastStep ? "Xong" : "Tiếp"}
          </button>
        </div>
      </div>
    </>
  );
}
