"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, authErrorMessage } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      router.push(params.get("tiep-tuc") ?? "/tien-trinh");
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="rounded-lg border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1">
        <span>Mật khẩu</span>
        <input name="password" type="password" required autoComplete="current-password" className="rounded-lg border px-3 py-2" />
      </label>
      <Link href="/quen-mat-khau" className="-mt-2 self-end text-sm text-teal-700 underline">
        Quên mật khẩu?
      </Link>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
