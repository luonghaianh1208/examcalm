"use client";

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";

export const RESEARCH_CONSENT_VERSION = "v1-2026-08";

export function ResearchConsentForm({
  uid, initialGranted,
}: { uid: string; initialGranted: boolean }) {
  const [granted, setGranted] = useState(initialGranted);
  const [message, setMessage] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setGranted(next);
    // Đóng race giữa lần điều hướng trang đầu tiên và lúc client Auth khôi phục
    // xong currentUser từ persistence — xem giải thích ensureAuthReady() ở client.ts.
    await ensureAuthReady();
    await updateDoc(doc(getDb(), "users", uid), {
      researchConsent: next
        ? { granted: true, grantedAt: serverTimestamp(), version: RESEARCH_CONSENT_VERSION }
        : { granted: false, grantedAt: null, version: RESEARCH_CONSENT_VERSION },
      updatedAt: serverTimestamp(),
    });
    setMessage(next ? "Cảm ơn bạn đã đồng ý." : "Đã ghi nhận. Dữ liệu của bạn sẽ không được dùng cho nghiên cứu.");
  }

  return (
    <section className="rounded-xl border bg-white px-4 py-4">
      <h2 className="mb-2 font-medium">Tham gia nghiên cứu (không bắt buộc)</h2>
      <p className="mb-3 text-slate-600">
        Nhóm nghiên cứu muốn dùng dữ liệu ở dạng <strong>ẩn danh</strong> để phân tích cho
        đề tài khoa học kỹ thuật. Nếu bạn đồng ý, chỉ điểm cảm xúc, thẻ ngữ cảnh và thời gian
        được sử dụng — <strong>nội dung ghi chú của bạn không bao giờ được lấy ra</strong>.
        Bạn từ chối thì vẫn dùng đầy đủ mọi tính năng, và có thể đổi ý bất cứ lúc nào.
      </p>

      <label className="flex items-start gap-2">
        <input
          type="checkbox" checked={granted}
          onChange={(e) => handleChange(e.target.checked)}
          className="mt-1"
        />
        <span>Tôi đồng ý cho dùng dữ liệu ẩn danh của mình vào nghiên cứu.</span>
      </label>

      {message && <p role="status" className="mt-2 text-teal-800">{message}</p>}

      <p className="mt-3 text-sm text-slate-500">
        Nếu bạn dưới 18 tuổi, hãy trao đổi với phụ huynh hoặc thầy cô trước khi đồng ý.
      </p>
    </section>
  );
}
