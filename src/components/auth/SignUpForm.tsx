"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp, signUpInputSchema, authErrorMessage } from "@/lib/auth-client";

const GRADE_LEVELS = ["10", "11", "12"] as const;

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signUpInputSchema.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      nickname: String(form.get("nickname") ?? ""),
      gradeLevel: String(form.get("gradeLevel") ?? ""),
      school: String(form.get("school") ?? ""),
      examGoals: String(form.get("examGoals") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    setPending(true);
    try {
      await signUp(parsed.data);
      router.push("/xac-thuc-email");
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
        <input name="password" type="password" required autoComplete="new-password" minLength={8} className="rounded-lg border px-3 py-2" />
        <span className="text-sm text-slate-500">Ít nhất 8 ký tự.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Biệt danh</span>
        <input name="nickname" type="text" required maxLength={50} className="rounded-lg border px-3 py-2" />
        <span className="text-sm text-slate-500">Bạn không cần dùng tên thật.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Khối lớp</span>
        <select name="gradeLevel" required defaultValue="12" className="rounded-lg border px-3 py-2">
          {GRADE_LEVELS.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Trường</span>
        <input name="school" type="text" required maxLength={120} className="rounded-lg border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        <span>Mục tiêu thi <span className="text-slate-500">(không bắt buộc)</span></span>
        <input name="examGoals" type="text" placeholder="Khối A, Đại học Bách khoa" className="rounded-lg border px-3 py-2" />
        <span className="text-sm text-slate-500">Cách nhau bằng dấu phẩy.</span>
      </label>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
      </button>
    </form>
  );
}
