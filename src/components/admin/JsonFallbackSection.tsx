"use client";

import { useState } from "react";

/**
 * Đường nhập JSON cho người dùng thành thạo, nằm ẩn trong mục mở rộng.
 *
 * Giữ lại vì một nhu cầu có thật: khi đã có thang đo được thẩm định, dán cả
 * bài trong vài giây hơn hẳn gõ tay từng câu. Nhưng giáo viên không rành kỹ
 * thuật không bao giờ phải nhìn thấy nó — form mới là đường mặc định.
 *
 * Dữ liệu chỉ chảy MỘT chiều: JSON -> form, và chỉ khi bấm "Áp dụng JSON".
 * Đồng bộ hai chiều theo từng phím gõ là nguồn sinh lỗi không cần thiết.
 */
type Props = {
  /** JSON dựng từ trạng thái form hiện tại — để admin sao chép ra được. */
  jsonHienTai: string;
  /** Nhận chuỗi thô; bên gọi tự kiểm tra bằng validate*Draft() và báo lỗi. */
  onApply: (json: string) => void;
};

export function JsonFallbackSection({ jsonHienTai, onApply }: Props) {
  const [jsonDaThay, setJsonDaThay] = useState(jsonHienTai);
  const [json, setJson] = useState(jsonHienTai);

  // Form đổi (admin sửa ô nhập, hoặc bấm Sửa một bài khác) thì ô JSON phải
  // theo kịp — nếu không, admin mở mục này ra sẽ thấy nội dung cũ đã lỗi thời
  // và tưởng đó là bài đang sửa.
  //
  // Chỉnh state ngay trong lúc render, KHÔNG dùng useEffect: đây đúng là cách
  // React khuyến nghị cho tình huống "state phải chạy theo prop". Dùng effect
  // sẽ vẽ một lượt với nội dung cũ rồi mới vẽ lại — và eslint
  // react-hooks/set-state-in-effect chặn lại đúng vì lý do đó.
  if (jsonDaThay !== jsonHienTai) {
    setJsonDaThay(jsonHienTai);
    setJson(jsonHienTai);
  }

  return (
    <details className="rounded-xl border bg-slate-50 p-3">
      <summary className="cursor-pointer font-medium">Dán JSON (dành cho người dùng thành thạo)</summary>

      <p className="mt-2 text-sm text-slate-600">
        Dán toàn bộ nội dung ở đây rồi bấm Áp dụng — form bên trên sẽ được điền lại theo.
        Ô này cũng là nơi sao chép nội dung hiện tại ra ngoài.
      </p>

      <label className="mt-2 flex flex-col gap-1">
        <span className="text-sm">Nội dung dạng JSON</span>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={12}
          spellCheck={false}
          className="w-full rounded-lg border p-3 font-mono text-sm"
        />
      </label>

      <button
        type="button"
        onClick={() => onApply(json)}
        className="mt-2 rounded-lg border px-4 py-2"
      >
        Áp dụng JSON
      </button>
    </details>
  );
}
