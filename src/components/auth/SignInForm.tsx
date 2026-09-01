"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, authErrorMessage } from "@/lib/auth-client";
import { PasswordField } from "./PasswordField";

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
        <span className="text-ink">Email</span>
        <input
          name="email" type="email" required autoComplete="email"
          className="min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-4"
        />
      </label>

      <PasswordField
        id="signin-password"
        name="password"
        label="Mật khẩu"
        autoComplete="current-password"
      />

      <Link href="/quen-mat-khau" className="-mt-2 self-end text-sm text-link underline">
        Quên mật khẩu?
      </Link>

      {error && (
        <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse disabled:opacity-60"
      >
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>

      <p className="text-center text-body">
        Chưa có tài khoản?{" "}
        <Link href="/dang-ky" className="text-link underline">Đăng ký</Link>
      </p>
    </form>
  );
}
