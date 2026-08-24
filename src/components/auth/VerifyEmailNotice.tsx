"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resendVerificationEmail, establishSession, authErrorMessage } from "@/lib/auth-client";
import { getFirebaseAuth, ensureAuthReady } from "@/lib/firebase/client";

export function VerifyEmailNotice() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function detectVerification() {
      // Trang có thể mở lạnh (dán link, F5) — đợi Auth khôi phục currentUser từ
      // persistence trước khi đọc nó, giống mọi lần ghi Firestore khác trong
      // codebase (xem giải thích ensureAuthReady() ở client.ts).
      await ensureAuthReady();
      const user = getFirebaseAuth().currentUser;
      if (!user || cancelled) return;

      try {
        // reload() lấy trạng thái MỚI NHẤT từ Firebase — cần thiết vì học sinh có
        // thể vừa xác thực ở MỘT trình duyệt/cửa sổ khác; user object ở cửa sổ
        // này vẫn đang giữ cache cũ (emailVerified: false). reload() cũng có thể
        // reject (tài khoản bị xoá ở thiết bị khác, mất mạng, token hết hạn...) —
        // nằm trong cùng try/catch với establishSession() để không lọt ra ngoài
        // thành unhandled rejection (detectVerification() được gọi qua
        // `void detectVerification()`, không có .catch()).
        await user.reload();
        if (cancelled || !user.emailVerified) return;

        // __session cookie đông cứng claims lúc mint — phải xin lại ID token
        // (force-refresh, establishSession() đã làm việc này) và đổi lấy cookie
        // mới thì Server Component mới nhận ra emailVerified: true.
        await establishSession(user);
        if (!cancelled) router.refresh();
      } catch {
        // reload() hoặc mint lại cookie thất bại: học sinh vẫn còn nút "Gửi lại
        // email xác thực" và có thể tự tải lại trang sau — không được chặn UI ở
        // đây, cứ để notice "chưa xác thực" hiện nguyên như hiện tại.
      }
    }

    void detectVerification();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleResend() {
    try {
      await resendVerificationEmail();
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(authErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={handleResend} className="rounded-lg border px-4 py-2">
        Gửi lại email xác thực
      </button>
      {status === "sent" && <p role="status" className="text-teal-700">Đã gửi lại. Bạn kiểm tra cả hộp thư spam nhé.</p>}
      {status === "error" && <p role="alert" className="text-rose-700">{message}</p>}
    </div>
  );
}
