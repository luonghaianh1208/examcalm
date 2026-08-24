"use client";

import { markWelcomeSeen } from "@/lib/firestore/onboarding";
import { useFocusTrap } from "./useFocusTrap";

type Props = {
  uid: string;
  /** Gọi ngay sau khi dialog đóng — Controller dùng để chuyển sang bước tour. */
  onDismiss: () => void;
};

/**
 * Hiện đúng một lần cho học sinh vừa xác thực email xong. Đóng công cụ này
 * lại (bằng nút, hoặc Escape — xem useFocusTrap) đều coi là "đã thấy": ghi
 * welcomeSeenAt rồi nhường chỗ cho tour hướng dẫn.
 */
export function WelcomeDialog({ uid, onDismiss }: Props) {
  async function handleDismiss() {
    // Đợi ghi xong rồi mới báo "đã dismiss" — để state cục bộ và state đã lưu
    // khớp nhau trước khi học sinh có thể tải lại trang, tránh dialog hiện lại
    // ngay sau khi vừa đóng. markWelcomeSeen() tự nuốt lỗi ghi bên trong nó
    // (xem onboarding.ts) nên await ở đây không bao giờ throw hay treo UI vì
    // thất bại — ghi lỗi thì vẫn chuyển sang tour bình thường, lần sau mở app
    // dialog này chỉ hiện lại, không phải lỗi nghiêm trọng.
    await markWelcomeSeen(uid);
    onDismiss();
  }

  const containerRef = useFocusTrap(true, handleDismiss);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-dialog-title"
        tabIndex={-1}
        // Giữ padding 1.5rem (p-6) mặc định, chỉ nới thêm đáy khi có safe-area
        // (home indicator...) — cùng cách OnboardingTour.tsx làm với card của nó.
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl outline-none motion-safe:transition-transform"
      >
        <h2 id="welcome-dialog-title" className="mb-2 text-xl font-semibold">
          Chào mừng bạn đến với ExamCalm
        </h2>
        <p className="mb-6 text-slate-600">
          Đây là công cụ giúp bạn tự tìm hiểu cảm xúc của mình trước kỳ thi — không phải
          liệu pháp tâm lý hay công cụ chẩn đoán. Bạn có thể làm bài test tham khảo, ghi
          nhật ký cảm xúc và đọc các kỹ thuật thư giãn ngắn, bất cứ lúc nào bạn cần.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="w-full rounded-lg bg-teal-600 px-4 py-2 font-medium text-white motion-safe:transition-colors"
        >
          Bắt đầu khám phá
        </button>
      </div>
    </div>
  );
}
