"use client";

import { useState } from "react";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp, ensureAuthReady } from "@/lib/firebase/client";
import { signOutEverywhere } from "@/lib/auth-client";

const CONFIRM_PHRASE = "XOA DU LIEU";
let connected = false;

export function DeleteAccountSection({ uid }: { uid: string }) {
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      // Đóng race giữa lần điều hướng trang đầu tiên và lúc client Auth khôi phục
      // xong currentUser từ persistence — xem giải thích ensureAuthReady() ở client.ts.
      // Thiếu bước này, callable có thể đi ra trước khi ID token sẵn sàng, server
      // thấy request.auth = undefined và từ chối dù học sinh thực sự đã đăng nhập.
      await ensureAuthReady();
      const fns = getFunctions(getFirebaseApp(), "asia-southeast1");
      if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !connected) {
        connectFunctionsEmulator(fns, "127.0.0.1", 5001);
        connected = true;
      }
      await httpsCallable(fns, "deleteUserData")({ targetUid: uid });
      await signOutEverywhere();
      window.location.href = "/";
    } catch {
      setError("Chưa xóa được. Bạn thử lại sau ít phút nhé.");
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
