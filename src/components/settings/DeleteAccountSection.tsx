"use client";

import { useState } from "react";
import { callDeleteUserData } from "@/lib/firebase/functions-client";
import { signOutEverywhere } from "@/lib/auth-client";

const CONFIRM_PHRASE = "XOA DU LIEU";

export function DeleteAccountSection({ uid }: { uid: string }) {
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    setNotice(null);

    try {
      await callDeleteUserData(uid);
    } catch {
      // Callable thất bại — dữ liệu CHƯA bị xóa, báo lỗi thật.
      setError("Chưa xóa được. Bạn thử lại sau ít phút nhé.");
      setPending(false);
      return;
    }

    // Từ đây trở đi, dữ liệu ĐÃ bị xóa thật (callable đã resolve thành công) —
    // lỗi bên dưới chỉ còn là vấn đề đăng xuất, KHÔNG được báo lại như "chưa xóa
    // được": học sinh sẽ hiểu nhầm và thử "xóa lại" dữ liệu vốn đã không còn tồn
    // tại, trên một tài khoản vốn cũng đã không còn tồn tại.
    try {
      await signOutEverywhere();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- reload toàn trang có chủ đích: xóa sạch cache Auth/Firestore phía client sau khi tài khoản đã bị xóa vĩnh viễn; router.push() sẽ giữ lại state cũ trong bộ nhớ.
      window.location.href = "/";
    } catch {
      setNotice("Dữ liệu của bạn đã được xóa. Bạn hãy đóng trình duyệt hoặc tự đăng xuất giúp mình nhé.");
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
      <h2 className="mb-2 font-medium text-rose-900">Xóa toàn bộ dữ liệu của tôi</h2>
      <p className="mb-3 text-rose-900">
        Thao tác này xóa vĩnh viễn tài khoản, toàn bộ nhật ký cảm xúc, lịch sử test
        và danh sách bài đã lưu. Không khôi phục lại được.
      </p>

      <label className="flex flex-col gap-1">
        <span>Gõ <code className="font-mono">{CONFIRM_PHRASE}</code> để xác nhận</span>
        <input
          value={phrase} onChange={(e) => setPhrase(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      {error && <p role="alert" className="mt-2 text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-2 text-teal-800">{notice}</p>}

      <button
        type="button" onClick={handleDelete}
        disabled={phrase !== CONFIRM_PHRASE || pending}
        className="mt-3 rounded-lg bg-rose-700 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {pending ? "Đang xóa…" : "Xóa vĩnh viễn"}
      </button>
    </section>
  );
}
