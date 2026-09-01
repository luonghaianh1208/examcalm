"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { SessionUser } from "@/lib/firebase/session";
import { getOnboarding } from "@/lib/firestore/onboarding";
import type { OnboardingState } from "@/lib/types/user";
import { WelcomeDialog } from "./WelcomeDialog";
import { OnboardingTour } from "./OnboardingTour";

type Props = {
  /**
   * Root layout đã gọi getSessionUser() một lần — truyền lại qua prop giống
   * MoodWidget/SiteHeader, tránh verifySessionCookie() kép.
   */
  user: SessionUser | null;
};

/** Trang quản trị và trang đang làm bài test không được hiện onboarding. */
function isExcludedPath(pathname: string): boolean {
  if (pathname.startsWith("/admin")) return true;
  // /test là danh sách bài test (chính là anchor bước 2 của tour) — chỉ loại
  // /test/{id} (đang làm bài), không loại /test.
  if (/^\/test\/.+/.test(pathname)) return true;
  return false;
}

/**
 * Mount đúng một lần ở root layout (cùng chỗ với MoodWidget/SiteHeader) —
 * KHÔNG mount riêng trên trang /xac-thuc-email — vì hai lý do:
 * 1) Bốn anchor của tour (mèo, "Bài test", "Thư viện", "Tiến trình") đều nằm
 *    trong SiteHeader/MoodWidget, vốn đã có mặt trên MỌI trang qua root layout.
 * 2) "Không tick -> hiện lại LẦN SAU" nghĩa là hiện lại ở LẦN GHÉ APP SAU, ở
 *    BẤT KỲ trang nào đủ điều kiện — không riêng trang xác thực email — nên
 *    logic hiển thị phải là một nơi global phản ứng theo state đã lưu, không
 *    phải state cục bộ của một trang cụ thể.
 * VerifyEmailNotice.tsx chỉ lo phần dò xác thực + re-mint session; sau khi nó
 * gọi router.refresh(), root layout render lại với emailVerified=true, và
 * component này tự nhiên thấy điều kiện đủ để hiện welcome dialog — không cần
 * hai nơi cùng biết logic hiển thị.
 */
export function OnboardingController({ user }: Props) {
  const pathname = usePathname();
  // Gắn state đã tải với uid nó thuộc về — tránh phải setState(null) đồng bộ
  // trong effect mỗi khi hết điều kiện hiển thị (bị react-hooks/set-state-in-effect
  // cấm); state "cũ của người khác" tự bị lọc ra lúc render thay vì phải dọn
  // dẹp chủ động trong effect.
  const [loaded, setLoaded] = useState<{ uid: string; state: OnboardingState } | null>(null);
  // Cùng pattern {uid, ...} như `loaded` ở trên — tránh state "đã dismiss của
  // tài khoản trước" bị mang nhầm sang tài khoản mới nếu chuyển tài khoản mà
  // không unmount lại toàn bộ component.
  const [welcomeDismissed, setWelcomeDismissed] = useState<{ uid: string } | null>(null);

  const eligible =
    user !== null && user.role === "student" && user.emailVerified && !isExcludedPath(pathname ?? "");

  useEffect(() => {
    if (!eligible || !user) return;
    let cancelled = false;
    getOnboarding(user.uid).then((s) => {
      if (!cancelled) setLoaded({ uid: user.uid, state: s });
    });
    return () => {
      cancelled = true;
    };
  }, [eligible, user]);

  const handleWelcomeDismiss = useCallback(() => {
    if (!user) return;
    setWelcomeDismissed({ uid: user.uid });
  }, [user]);

  const state = user && loaded?.uid === user.uid ? loaded.state : null;
  const dismissed = user && welcomeDismissed?.uid === user.uid;

  if (!eligible || !user || !state) return null;

  if (state.welcomeSeenAt === null && !dismissed) {
    return <WelcomeDialog uid={user.uid} onDismiss={handleWelcomeDismiss} />;
  }

  /*
   * Guideline §6.1: "Sau khi completed/dismissed, KHÔNG tự chạy lại."
   *
   * paused thì CÓ chạy lại — và mở đúng bước đang dở, vì "Để sau" là lời hứa
   * quay lại chứ không phải lời từ chối.
   *
   * hideTooltips giữ nguyên như một cổng riêng: nó có từ trước máy trạng thái
   * và các helper E2E đang dùng để tắt tour.
   */
  const daXong = state.guideStatus === "completed" || state.guideStatus === "dismissed";
  if (daXong) return null;

  return (
    <OnboardingTour
      uid={user.uid}
      hideTooltips={state.hideTooltips}
      initialStep={state.guideStatus === "paused" ? state.guideStep : 0}
    />
  );
}
