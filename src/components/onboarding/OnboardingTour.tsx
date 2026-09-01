"use client";

import { useCallback, useLayoutEffect, useState, type CSSProperties } from "react";
import { setGuideProgress } from "@/lib/firestore/onboarding";
import { useFocusTrap } from "./useFocusTrap";

/**
 * `data-tour="..."` là attribute ổn định gắn riêng cho tour (không phải class
 * CSS hay text hiển thị — cả hai đều có thể đổi và âm thầm làm gãy anchor).
 * Xem MoodWidget.tsx và SiteHeader.tsx.
 */
/**
 * Năm bước theo Brand Guideline §6.1: Trang chủ → Nhật ký cảm xúc → Dashboard
 * → Thư viện → nút "Hỏi về web app".
 *
 * Mỗi bước nêu MỘT lợi ích và MỘT hành động — guideline cấm mô tả cả sản phẩm
 * trong một bong bóng. Mốc neo là data-tour trong src/lib/nav.ts.
 */
const STEPS: { selector: string; text: string }[] = [
  {
    selector: '[data-tour="home"]',
    text: "Trang chủ hỏi bạn cần gì lúc này, rồi mở đúng một lối đi — bạn không phải tự tìm.",
  },
  {
    selector: '[data-tour="journal"]',
    text: "Nhật ký cảm xúc là nơi bạn ghi lại điều đang diễn ra. Chỉ mình bạn đọc được.",
  },
  {
    selector: '[data-tour="dashboard"]',
    text: "Dashboard cho bạn xem lại chính mình theo thời gian. Không xếp hạng, không chấm điểm.",
  },
  {
    selector: '[data-tour="library"]',
    text: "Thư viện có các kỹ thuật ngắn, đọc xong là làm được ngay. Có ô tìm kiếm ở đầu trang.",
  },
  {
    selector: '[data-tour="help"]',
    text: "Bí chỗ nào thì hỏi Meo ở đây — mình chỉ giúp về cách dùng web thôi, không phải nơi tư vấn tâm lý.",
  },
];

type Props = {
  uid: string;
  /** true: học sinh đã tick "không hiện lại" ở lần trước — không render gì cả. */
  hideTooltips: boolean;
  /** Bước để mở lại khi học sinh từng chọn "Để sau" (trạng thái paused). */
  initialStep?: number;
};

const MARGIN = 16;

export function OnboardingTour({ uid, hideTooltips, initialStep = 0 }: Props) {
  // Kẹp vào khoảng hợp lệ: số bước có thể GIẢM ở bản sau, và một guideStep cũ
  // vượt quá mảng sẽ làm STEPS[stepIndex] thành undefined rồi vỡ ở reposition.
  const [stepIndex, setStepIndex] = useState(() =>
    Math.min(Math.max(0, initialStep), STEPS.length - 1),
  );
  const [closed, setClosed] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  const isLastStep = stepIndex === STEPS.length - 1;
  const active = !hideTooltips && !closed;

  /**
   * "Bỏ qua" và Escape → trạng thái dismissed: KHÔNG tự chạy lại (guideline
   * §6.1). Khác "Để sau" ở chỗ không nhớ đang dở bước nào — đây là lời từ
   * chối, không phải lời hứa quay lại.
   */
  const handleClose = useCallback(() => {
    setClosed(true);
    void setGuideProgress(uid, "dismissed", 0);
  }, [uid]);

  const containerRef = useFocusTrap(active, handleClose);

  // useLayoutEffect vì cần đo kích thước thật của tooltip (đã render) để tính
  // vị trí không tràn màn hình, tránh nhấp nháy vị trí sai trước khi đo lại.
  useLayoutEffect(() => {
    if (!active) return;

    function reposition() {
      // stepIndex luôn nằm trong [0, STEPS.length) — chỉ tăng dần và bị chặn
      // ở bước cuối (xem handleNext) — non-null an toàn ở đây.
      const currentStep = STEPS[stepIndex]!;
      // querySelectorAll chứ không phải querySelector: cùng một mốc tồn tại ở
      // CẢ sidebar (desktop) lẫn bottom nav (mobile), nhưng mỗi lúc chỉ một cái
      // hiện. querySelector luôn trả về cái đầu tiên trong DOM — trên mobile đó
      // là bản sidebar đang display:none, getBoundingClientRect() ra toàn số 0
      // và bong bóng hướng dẫn nhảy về góc trái trên màn hình.
      const anchor = Array.from(
        document.querySelectorAll<HTMLElement>(currentStep.selector),
      ).find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
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
      void setGuideProgress(uid, "completed", STEPS.length);
      return;
    }
    const tiep = stepIndex + 1;
    setStepIndex(tiep);
    // Ghi từng bước để "Để sau" ở bất kỳ đâu cũng mở lại đúng chỗ, kể cả khi
    // học sinh đóng tab thay vì bấm nút.
    void setGuideProgress(uid, "active", tiep);
  }

  /**
   * "Để sau" → trạng thái paused, NHỚ đang dở bước nào.
   *
   * Guideline §6.1 đòi cả hai nút và chúng khác nhau thật sự: "Bỏ qua" là từ
   * chối, "Để sau" là hoãn. Gộp làm một thì hoặc ta quấy rầy người đã từ chối,
   * hoặc bỏ rơi người định quay lại.
   */
  function handlePause() {
    setClosed(true);
    void setGuideProgress(uid, "paused", stepIndex);
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

        <p className="mb-3 text-sm text-muted">Bước {stepIndex + 1}/{STEPS.length}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button type="button" onClick={handleClose} className="min-h-11 text-body underline">
            Bỏ qua
          </button>
          <button type="button" onClick={handlePause} className="min-h-11 text-body underline">
            Để sau
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="ml-auto min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse"
          >
            {isLastStep ? "Xong" : "Tiếp"}
          </button>
        </div>
      </div>
    </>
  );
}
