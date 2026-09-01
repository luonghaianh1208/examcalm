"use client";

import { useCallback, useEffect, useState } from "react";
import { listMyConfessions, submitConfession, type MyConfession } from "@/lib/firestore/confessions";
import { MAX_CONFESSION_LENGTH, type ConfessionStatus } from "@/lib/types/confession";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

/**
 * Chữ hiển thị cho từng trạng thái.
 *
 * Viết cho học sinh đọc, không phải cho lập trình viên: các em cần biết bài
 * mình đang ở đâu và còn phải chờ gì. "hold" nói rõ là có người đọc chứ không
 * phải bị bỏ quên.
 */
const STATUS_TEXT: Record<ConfessionStatus, { label: string; tone: string; note: string }> = {
  pending: {
    label: "Đang kiểm tra",
    tone: "bg-subtle text-body",
    note: "Bài vừa gửi, hệ thống đang xem.",
  },
  auto_approved: {
    label: "Đã đăng",
    tone: "bg-success-soft text-success",
    note: "Bài của bạn đang hiển thị ẩn danh trong bảng tin.",
  },
  hold: {
    label: "Chờ thầy cô đọc",
    tone: "bg-warning-soft text-warning",
    note: "Bài cần một người thật xem lại trước khi đăng. Thầy cô sẽ đọc sớm nhất có thể.",
  },
  rejected: {
    label: "Không đăng",
    tone: "bg-danger-soft text-danger",
    note: "Bài này không được đăng công khai.",
  },
};

export function ConfessionComposer({ uid, canPost }: { uid: string; canPost: boolean }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [mine, setMine] = useState<MyConfession[] | null>(null);

  const load = useCallback(() => {
    listMyConfessions(uid).then(setMine).catch(() => setMine([]));
  }, [uid]);

  useEffect(() => { load(); }, [load]);

  /**
   * Hỏi lại tới khi Cloud Function kiểm duyệt xong, tối đa ~24 giây.
   *
   * Tải lại đúng MỘT lần sau khi gửi là không đủ: hàm kiểm duyệt còn phải gọi
   * provider AI, nên có lúc mất vài giây, có lúc lâu hơn. Học sinh sẽ mắc kẹt ở
   * "Đang kiểm tra" và tưởng bài bị nuốt mất.
   *
   * Có TRẦN số lần rõ ràng, không hỏi lại vô hạn: nếu kiểm duyệt hỏng thật thì
   * trạng thái "Đang kiểm tra" vẫn là mô tả đúng, và tải lại trang lúc nào cũng
   * lấy được kết quả mới.
   */
  const doiKetQuaKiemDuyet = useCallback(async () => {
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const list = await listMyConfessions(uid).catch(() => null);
      if (list === null) return;
      setMine(list);
      if (list[0] && list[0].status !== "pending") return;
    }
  }, [uid]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const noiDung = text.trim();
    if (noiDung === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      await submitConfession(uid, noiDung);
      setText("");
      setJustSent(true);
      load();
      void doiKetQuaKiemDuyet();
    } catch {
      setError("Chưa gửi được. Có thể do mạng chập chờn — bạn thử lại nhé.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canPost ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-ink">Bạn muốn kể điều gì?</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={MAX_CONFESSION_LENGTH}
              placeholder="Viết như đang nói với một người bạn."
              className="rounded-[var(--ec-radius-md)] border border-line bg-surface px-4 py-3"
            />
            <span className="text-sm text-muted">
              {text.length}/{MAX_CONFESSION_LENGTH} ký tự
            </span>
          </label>

          {/* Nói THẲNG hai điều trước khi các em bấm gửi, không giấu trong
              trang điều khoản: bài được đọc trước khi đăng, và danh tính có
              lưu lại. Hứa "hoàn toàn ẩn danh" rồi vẫn lưu authorUid là nói dối. */}
          <div className="rounded-[var(--ec-radius-md)] bg-subtle px-4 py-3 text-sm text-body">
            <p>Bài được kiểm tra trước khi hiện công khai, nên không đăng lên ngay.</p>
            <p className="mt-1">
              Bạn bè không biết bài nào là của bạn. Nhưng hệ thống có lưu lại để thầy cô hỏi
              thăm được nếu bạn viết điều gì khiến chúng mình lo cho bạn.
            </p>
          </div>

          {error && (
            <p role="alert" className="rounded-[var(--ec-radius-md)] bg-danger-soft px-4 py-3 text-danger">
              {error}
            </p>
          )}
          {justSent && !error && (
            <p role="status" className="rounded-[var(--ec-radius-md)] bg-success-soft px-4 py-3 text-success">
              Đã gửi. Bài của bạn đang được kiểm tra.
            </p>
          )}

          <button
            type="submit"
            disabled={pending || text.trim() === ""}
            className="min-h-12 self-start rounded-[var(--ec-radius-md)] bg-[var(--ec-ocean-700)] px-6 font-medium text-ink-inverse disabled:opacity-60"
          >
            {pending ? "Đang gửi…" : "Gửi bài"}
          </button>
        </form>
      ) : (
        <p className="rounded-[var(--ec-radius-lg)] bg-warning-soft px-5 py-4 text-warning">
          Bạn cần xác thực email trước khi gửi bài. Kiểm tra hộp thư giúp mình nhé.
        </p>
      )}

      {mine !== null && mine.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-ink">Bài bạn đã gửi</h2>
          <ul className="flex flex-col gap-3">
            {mine.map((c) => {
              const s = STATUS_TEXT[c.status];
              return (
                <li key={c.id} className="rounded-[var(--ec-radius-lg)] border border-line bg-surface px-5 py-4">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className={`rounded-full px-3 py-0.5 text-sm ${s.tone}`}>{s.label}</span>
                    {c.createdAt && (
                      <span className="text-sm text-muted">{dateFormatter.format(c.createdAt)}</span>
                    )}
                  </div>
                  <p className="whitespace-pre-line text-body">{c.textContent}</p>
                  <p className="mt-2 text-sm text-muted">{s.note}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
