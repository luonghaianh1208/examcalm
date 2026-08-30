"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordReset, authErrorMessage } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      await sendPasswordReset(email);
      setSentTo(email);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  // Màn xác nhận nhắc lại chính email vừa nhập: hệ thống không được nói email nào
  // đã đăng ký, nhưng học sinh gõ nhầm thì tự nhìn ra ngay ở đây.
  if (sentTo !== null) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          Mình đã gửi mail đặt lại mật khẩu tới <strong>{sentTo}</strong>. Bấm vào link
          trong mail để đặt mật khẩu mới nhé.
        </p>
        <p className="text-slate-600">
          Chưa thấy mail sau 2–3 phút? Kiểm tra hộp thư rác, hoặc thử lại với một email
          khác — có thể bạn đã đăng ký bằng địa chỉ khác.
        </p>
        <button
          type="button"
          onClick={() => setSentTo(null)}
          className="self-start rounded-lg border px-4 py-2 font-medium"
        >
          Thử email khác
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="rounded-lg border px-3 py-2" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang gửi…" : "Gửi mail đặt lại"}
      </button>
      <Link href="/dang-nhap" className="text-teal-700 underline">
        Quay lại đăng nhập
      </Link>
    </form>
  );
}
