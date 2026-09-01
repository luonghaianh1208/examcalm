"use client";

import { useState } from "react";

/**
 * Ô mật khẩu có nút hiện/ẩn — phản hồi 4.3 của học sinh.
 *
 * Nút nằm NGOÀI thẻ <label>, nối với input bằng htmlFor/id. Đặt nút bên trong
 * <label> thì chữ "Hiện" trở thành một phần tên gọi của trường, và trình đọc
 * màn hình sẽ đọc "Mật khẩu Hiện".
 */
export function PasswordField({
  id,
  name,
  label,
  hint,
  autoComplete,
  minLength,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-ink">
        {label} <span className="text-danger" aria-hidden>*</span>
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          required
          autoComplete={autoComplete}
          minLength={minLength}
          className="min-h-11 w-full rounded-[var(--ec-radius-md)] border border-line bg-surface px-4 pr-20"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // aria-pressed cho biết đây là công tắc hai trạng thái, không phải
          // một hành động chạy một lần.
          aria-pressed={visible}
          className="absolute right-1 top-1/2 min-h-9 -translate-y-1/2 rounded-[var(--ec-radius-sm)] px-3 text-sm text-link underline"
        >
          {visible ? "Ẩn" : "Hiện"}
        </button>
      </div>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}
