"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp, signUpInputSchema, authErrorMessage } from "@/lib/auth-client";
import { PasswordField } from "./PasswordField";

const GRADE_LEVELS = ["10", "11", "12"] as const;

const FIELD =
  "min-h-11 rounded-[var(--ec-radius-md)] border border-line bg-surface px-4";

/** Dấu sao đánh dấu mục bắt buộc — phản hồi 4.1. */
function Sao() {
  // aria-hidden vì thuộc tính `required` trên input đã báo cho trình đọc màn
  // hình rồi; đọc thêm "sao" chỉ làm nhiễu.
  return <span className="text-danger" aria-hidden> *</span>;
}

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
      <p className="text-sm text-muted">
        Mục có dấu <span className="text-danger">*</span> là bắt buộc.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-ink">Email<Sao /></span>
        <input name="email" type="email" required autoComplete="email" className={FIELD} />
      </label>

      <PasswordField
        id="password"
        name="password"
        label="Mật khẩu"
        hint="Ít nhất 8 ký tự."
        autoComplete="new-password"
        minLength={8}
      />

      <label className="flex flex-col gap-1">
        <span className="text-ink">Biệt danh<Sao /></span>
        <input name="nickname" type="text" required maxLength={50} className={FIELD} />
        <span className="text-sm text-muted">Bạn không cần dùng tên thật.</span>
      </label>

      {/*
        Phản hồi 4.2: học sinh muốn biết VÌ SAO web hỏi những thông tin này.
        Gom ba trường vào một nhóm có lời giải thích chung, thay vì để mỗi
        trường trơ trọi một cái nhãn — hỏi thông tin về trường lớp của trẻ vị
        thành niên mà không nói lý do là điều đáng ngờ.
      */}
      <fieldset className="flex flex-col gap-4 rounded-[var(--ec-radius-lg)] bg-subtle px-5 py-4">
        <legend className="px-2 text-sm text-muted">Vì sao mình hỏi những điều này</legend>
        <p className="text-sm text-body">
          Khối lớp và mục tiêu thi giúp gợi ý nội dung sát với giai đoạn bạn đang trải qua.
          Tên trường chỉ dùng để thầy cô phụ trách biết bạn thuộc nhóm nào khi cần hỗ trợ —
          không hiện công khai và không dùng để so sánh giữa các trường.
        </p>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Khối lớp<Sao /></span>
          <select name="gradeLevel" required defaultValue="12" className={FIELD}>
            {GRADE_LEVELS.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">Trường<Sao /></span>
          <input name="school" type="text" required maxLength={120} className={FIELD} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-ink">
            Mục tiêu thi <span className="text-muted">(có thể bỏ qua)</span>
          </span>
          <input
            name="examGoals" type="text"
            placeholder="Khối A, Đại học Bách khoa"
            className={FIELD}
          />
          <span className="text-sm text-muted">Cách nhau bằng dấu phẩy.</span>
        </label>
      </fieldset>

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
        {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
      </button>

      {/* Phản hồi 4.4 */}
      <p className="text-center text-body">
        Đã có tài khoản?{" "}
        <Link href="/dang-nhap" className="text-link underline">Đăng nhập</Link>
      </p>
    </form>
  );
}
