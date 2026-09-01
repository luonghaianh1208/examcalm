"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { callAskWebAppHelp } from "@/lib/firebase/functions-client";
import { CatMascot } from "@/components/mascot/CatMascot";

type Turn = {
  id: number;
  question: string;
  answer: string;
  href?: string;
  hrefLabel?: string;
  isCrisisReply: boolean;
};

/**
 * Bốn câu gợi ý sẵn.
 *
 * Bốn chuỗi này được KHOÁ bằng test ở phía server (webAppFaq.test.ts): nếu ai
 * đó đổi từ khoá trong FAQ mà quên đây, test đỏ ngay — thay vì học sinh bấm
 * đúng nút mà bot trả lời "mình không hiểu".
 */
const GOI_Y = [
  "Nhật ký ở đâu?",
  "Làm sao xem lại kết quả?",
  "Ai đọc được nhật ký của tôi?",
  "Làm sao xoá dữ liệu của tôi?",
];

/**
 * "Hỏi về web app" — chatbot phản hồi, chỉ mở khi người dùng chủ động gõ.
 *
 * Brand Guideline §6.2: KHÔNG tự mở, không tự gửi lời chào, không khởi động
 * tour. Phạm vi là cách dùng sản phẩm, không phải tư vấn tâm lý — đúng phản
 * hồi 5.8 của học sinh.
 */
export function WebAppHelpChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  async function hoi(question: string) {
    const q = question.trim();
    if (q === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      const r = await callAskWebAppHelp(q);
      setTurns((prev) => [
        ...prev,
        { id: nextId.current++, question: q, ...r },
      ]);
      setDraft("");
    } catch {
      setError("Chưa gửi được câu hỏi. Có thể do mạng chập chờn — bạn thử lại nhé.");
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex items-start gap-4 rounded-[var(--ec-radius-lg)] bg-feature-ai/10 px-5 py-4">
        <CatMascot size={72} expression="listen" className="shrink-0" />
        <div>
          <h2 className="font-medium text-ink">Meo giúp bạn dùng ExamCalm</h2>
          {/* Nói rõ phạm vi TRƯỚC KHI học sinh gõ — phản hồi 5.7: các em cần
              biết đây là trợ giúp cách dùng web, không phải nơi tâm sự. */}
          <p className="mt-1 text-body">
            Hỏi mình chỗ nào bấm vào đâu, dữ liệu của bạn ra sao, tài khoản và cài đặt.
            Mình <strong>không phải</strong> nơi tư vấn tâm lý — muốn viết ra điều đang nghĩ
            thì Nhật ký cảm xúc là chỗ dành cho việc đó.
          </p>
        </div>
      </section>

      {turns.length === 0 && (
        <div>
          <p className="mb-2 text-sm text-muted">Thử một trong những câu này:</p>
          <ul className="flex flex-wrap gap-2">
            {GOI_Y.map((g) => (
              <li key={g}>
                <button
                  type="button"
                  onClick={() => hoi(g)}
                  disabled={pending}
                  className="min-h-11 rounded-[var(--ec-radius-pill)] border border-line px-4 text-sm text-body transition-colors hover:bg-subtle disabled:opacity-60"
                >
                  {g}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {turns.length > 0 && (
        <ul className="flex flex-col gap-4">
          {turns.map((t) => (
            <li key={t.id} className="flex flex-col gap-2">
              <p className="self-end rounded-[var(--ec-radius-lg)] bg-brand-soft px-4 py-2 text-ink">
                {t.question}
              </p>
              <div
                className={`rounded-[var(--ec-radius-lg)] px-4 py-3 ${
                  // Câu trả lời an toàn dùng tông cảnh báo dịu, không phải tông
                  // đỏ toàn khối — guideline cấm dùng đỏ như tín hiệu mức độ
                  // sức khoẻ tâm thần.
                  t.isCrisisReply ? "bg-warning-soft text-warning" : "bg-surface text-body"
                }`}
              >
                <p className="whitespace-pre-line">{t.answer}</p>
                {t.href && t.hrefLabel && (
                  <Link
                    href={t.href}
                    className="mt-3 inline-block min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-4 py-2.5 text-sm font-medium text-ink-inverse"
                  >
                    {t.hrefLabel}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void hoi(draft);
        }}
        className="flex gap-2"
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="Ví dụ: Nhật ký ở đâu?"
          aria-label="Câu hỏi về cách dùng web app"
          className="min-h-11 flex-1 rounded-[var(--ec-radius-md)] border border-line bg-surface px-4"
        />
        <button
          type="submit"
          disabled={pending || draft.trim() === ""}
          className="min-h-11 rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-5 font-medium text-ink-inverse disabled:opacity-60"
        >
          {pending ? "Đang tìm…" : "Hỏi"}
        </button>
      </form>
    </div>
  );
}
