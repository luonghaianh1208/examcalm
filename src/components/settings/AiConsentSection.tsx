"use client";

import { useEffect, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { getAiPublicConfig, type AiPublicConfig } from "@/lib/firestore/ai-public";
import { deleteAllMyOutputs } from "@/lib/firestore/ai-outputs";
import { useFocusTrap } from "@/components/onboarding/useFocusTrap";

type Props = { uid: string; initialAiOptIn: boolean };

// Đang hỏi bật hay hỏi tắt — quyết định nội dung hộp thoại xác nhận.
type DialogMode = "turn-on" | "turn-off";

const ERROR_MESSAGE = "Không thể lưu thay đổi lúc này. Bạn thử lại sau nhé.";

export function AiConsentSection({ uid, initialAiOptIn }: Props) {
  const [aiOptIn, setAiOptIn] = useState(initialAiOptIn);
  // null = đang tải xong dữ liệu systemConfig/aiPublic lần đầu — chưa đủ
  // thông tin để quyết định hiện nút bật hay trạng thái "chưa khả dụng".
  const [aiPublic, setAiPublic] = useState<AiPublicConfig | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAiPublicConfig().then((cfg) => {
      if (!cancelled) setAiPublic(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openConfirm() {
    setError(null);
    setDialogMode(aiOptIn ? "turn-off" : "turn-on");
  }

  function closeDialog() {
    setDialogMode(null);
  }

  async function handleConfirmOn() {
    setPending(true);
    setError(null);
    try {
      await ensureAuthReady();
      await updateDoc(doc(getDb(), "users", uid), {
        "privacySettings.aiOptIn": true,
        updatedAt: serverTimestamp(),
      });
      // Chỉ đổi trạng thái công tắc SAU KHI ghi thành công — công tắc nói dối
      // về trạng thái riêng tư nghiêm trọng hơn một thông báo lỗi (rào chắn task 10).
      setAiOptIn(true);
      setDialogMode(null);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  async function handleConfirmOff() {
    setPending(true);
    setError(null);
    try {
      await ensureAuthReady();
      await updateDoc(doc(getDb(), "users", uid), {
        "privacySettings.aiOptIn": false,
        updatedAt: serverTimestamp(),
      });
      // Công tắc đã tắt xong (an toàn dù bước xoá bên dưới có lỗi) — rồi mới
      // xoá thật toàn bộ phản chiếu đã lưu (spec §7.6: tắt là xoá, không phải ẩn).
      setAiOptIn(false);
      setDialogMode(null);
      await deleteAllMyOutputs(uid);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  const dialogRef = useFocusTrap(dialogMode !== null, closeDialog);

  if (aiPublic === null) return null;

  if (!aiPublic.enabled) {
    return (
      <section className="rounded-xl border bg-white px-4 py-4">
        <h2 className="mb-2 font-medium">Phản chiếu AI (không bắt buộc)</h2>
        <p className="text-slate-600">
          Tính năng phản chiếu AI hiện <strong>chưa khả dụng</strong> — nhà trường chưa cấu
          hình dịch vụ AI nào. Bạn sẽ thấy nút bật ở đây khi tính năng sẵn sàng.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white px-4 py-4">
      <h2 className="mb-2 font-medium">Phản chiếu AI (không bắt buộc)</h2>
      <p className="mb-3 text-slate-600">
        Khi bật, ghi chú cảm xúc bạn viết sẽ được gửi tới một dịch vụ AI bên ngoài để tạo
        phản chiếu. Tắt tính năng này sẽ xoá vĩnh viễn các phản chiếu đã lưu.
      </p>

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={aiOptIn}
          onChange={openConfirm}
          disabled={pending}
          className="mt-1"
        />
        <span>Tôi đồng ý cho AI đọc ghi chú cảm xúc của mình để tạo phản chiếu.</span>
      </label>

      {error && (
        <p role="alert" className="mt-2 text-rose-800">
          {error}
        </p>
      )}

      {dialogMode && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-consent-dialog-title"
            tabIndex={-1}
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl outline-none"
          >
            {dialogMode === "turn-on" ? (
              <>
                <h3 id="ai-consent-dialog-title" className="mb-2 text-lg font-semibold">
                  Gửi ghi chú cảm xúc tới AI?
                </h3>
                <p className="mb-6 text-slate-600">
                  Ghi chú cảm xúc của bạn sẽ được gửi tới dịch vụ AI bên ngoài{" "}
                  <strong>{aiPublic.providerLabel}</strong> để tạo phản chiếu. Bạn có thể tắt
                  tính năng này bất cứ lúc nào trong trang Hồ sơ.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={pending}
                    className="flex-1 rounded-lg border px-4 py-2 font-medium"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOn}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-40"
                  >
                    Đồng ý, bật tính năng
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 id="ai-consent-dialog-title" className="mb-2 text-lg font-semibold">
                  Tắt tính năng AI và xoá dữ liệu?
                </h3>
                <p className="mb-6 text-slate-600">
                  Tắt tính năng này sẽ <strong>xoá vĩnh viễn</strong> toàn bộ phản chiếu AI đã
                  lưu của bạn — không thể khôi phục lại. Ghi chú cảm xúc gốc của bạn không bị
                  ảnh hưởng.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={pending}
                    className="flex-1 rounded-lg border px-4 py-2 font-medium"
                  >
                    Huỷ
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmOff}
                    disabled={pending}
                    className="flex-1 rounded-lg bg-rose-700 px-4 py-2 font-medium text-white disabled:opacity-40"
                  >
                    Tắt và xoá dữ liệu
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
