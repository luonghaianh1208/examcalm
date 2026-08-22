"use client";

import { useState } from "react";
import { resendVerificationEmail, authErrorMessage } from "@/lib/auth-client";

export function VerifyEmailNotice() {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

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
