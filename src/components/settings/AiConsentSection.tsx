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

// Hai thông điệp lỗi RIÊNG BIỆT — xem lý do ở handleConfirmOff bên dưới: gộp
// chung một câu "không lưu được" cho cả lỗi xoá và lỗi ghi khiến học sinh
// không biết bước nào thực sự thất bại, và (trước fix round 1) từng khiến màn
// hình báo "đã xoá vĩnh viễn" trong khi thao tác xoá đã lỗi.
const SAVE_ERROR_MESSAGE = "Không thể lưu thay đổi lúc này. Bạn thử lại sau nhé.";
const DELETE_ERROR_MESSAGE = "Không thể xoá các phản chiếu đã lưu lúc này. Bạn thử lại sau nhé.";

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
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  /**
   * Fix round 1, Finding 1: XOÁ TRƯỚC, GHI CÀI ĐẶT SAU — cố ý ngược lại thứ
   * tự "tắt rồi mới xoá" ban đầu. Xoá là nửa việc tốn kém và có thể thất bại
   * (nhiều doc, nhiều batch — xem deleteAllMyOutputs), còn lời hứa "xoá vĩnh
   * viễn, không thể khôi phục" ở hộp thoại chỉ được coi là đã giữ SAU KHI xoá
   * xong thật; đảo công tắc sau đó là thao tác rẻ và idempotent.
   *
   * Hai nhánh lỗi vì vậy có ý nghĩa khác nhau và PHẢI báo khác nhau:
   * - Xoá lỗi: chưa ghi gì, công tắc vẫn ON, báo đúng "chưa xoá được" — bấm
   *   lại (còn đang ON) sẽ mở lại đúng hộp thoại tắt và thử lại toàn bộ.
   * - Xoá xong nhưng ghi cài đặt lỗi: dữ liệu đã mất thật, AI vẫn đang bật.
   *   Rối nhưng an toàn hơn: không có lời hứa nào bị nói dối, và bấm lại vẫn
   *   đúng vì xoá 0 document còn lại là no-op.
   */
  async function handleConfirmOff() {
    setPending(true);
    setError(null);
    try {
      await deleteAllMyOutputs(uid);
    } catch {
      setError(DELETE_ERROR_MESSAGE);
      setPending(false);
      return;
    }
    try {
      await ensureAuthReady();
      await updateDoc(doc(getDb(), "users", uid), {
        "privacySettings.aiOptIn": false,
        updatedAt: serverTimestamp(),
      });
      setAiOptIn(false);
      setDialogMode(null);
    } catch {
      setError(SAVE_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  const dialogRef = useFocusTrap(dialogMode !== null, closeDialog);

  if (aiPublic === null) return null;

  // I2 (final whole-branch review): trước fix, panel "chưa khả dụng" hiện ra bất cứ khi nào
  // kill switch tắt — KỂ CẢ khi học sinh đã bật aiOptIn trước đó. Hậu quả: một khi admin tắt
  // kill switch (vd runbook khẩn cấp, docs/ai-provider-setup.md), học sinh đã opt-in không còn
  // cách nào tắt aiOptIn hay xoá các phản chiếu cũ — đúng lúc có lý do chính đáng nhất để làm
  // vậy, và trái lời hứa ngay trong hộp thoại bật ("tắt bất cứ lúc nào"). Đường RÚT LUI (tắt +
  // xoá) phải luôn mở bất kể kill switch; chỉ đường BẬT mới phụ thuộc aiPublic.enabled.
  const showWithdrawOnly = !aiPublic.enabled && aiOptIn;

  if (!aiPublic.enabled && !aiOptIn) {
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
      {showWithdrawOnly ? (
        // aiPublic không còn xác nhận provider nào lúc này (kill switch tắt) — KHÔNG tự nêu
        // tên một provider ở đây, tránh nói sai nếu provider đã đổi trong lúc tính năng tắt
        // (R5, spec §3.3: màn hình đồng ý không được nói sai tên nơi nhận dữ liệu).
        <p className="mb-3 text-slate-600">
          Quản trị viên đã tạm khoá tính năng này — bạn không thể bật lại lúc này. Bạn vẫn có
          thể tắt và xoá vĩnh viễn các phản chiếu AI đã lưu bất cứ lúc nào.
        </p>
      ) : (
        <p className="mb-3 text-slate-600">
          Khi bật, ghi chú cảm xúc bạn viết sẽ được gửi tới dịch vụ AI bên ngoài{" "}
          <strong>{aiPublic.providerLabel}</strong> để tạo phản chiếu. Tắt tính năng này sẽ
          xoá vĩnh viễn các phản chiếu đã lưu.
        </p>
      )}

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
