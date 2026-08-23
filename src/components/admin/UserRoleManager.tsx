"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callSetUserRole } from "@/lib/firebase/functions-client";
import type { UserSummary } from "@/lib/firestore/admin-users";

export function UserRoleManager({
  users, currentAdminUid,
}: { users: UserSummary[]; currentAdminUid: string }) {
  const router = useRouter();
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleChange(uid: string, role: "student" | "admin") {
    setPendingUid(uid);
    setError(null);
    setWarning(null);
    try {
      const result = await callSetUserRole(uid, role);
      router.refresh();
      if (result?.mirrorWriteFailed) {
        // Claim đã đổi thành công (nguồn sự thật) — đây là cảnh báo, không phải lỗi.
        setWarning(
          "Vai trò đã được đổi thành công. Danh sách hiển thị có thể chưa cập nhật ngay, hãy tải lại trang sau ít phút nếu cần.",
        );
      }
    } catch {
      setError("Không đổi được vai trò. Kiểm tra lại quyền quản trị của bạn.");
    } finally {
      setPendingUid(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
      {warning && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700">{warning}</p>}

      <ul className="flex flex-col gap-2">
        {users.map((u) => (
          <li key={u.uid} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
            <span className="font-medium">{u.nickname}</span>
            <span className="text-sm text-slate-500">Lớp {u.gradeLevel} · {u.school}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm">{u.role}</span>

            {u.role === "student" && (
              <button
                type="button" disabled={pendingUid === u.uid}
                onClick={() => handleChange(u.uid, "admin")}
                className="ml-auto underline disabled:opacity-50"
              >
                Nâng thành quản trị
              </button>
            )}

            {u.role === "admin" && u.uid !== currentAdminUid && (
              <button
                type="button" disabled={pendingUid === u.uid}
                onClick={() => handleChange(u.uid, "student")}
                className="ml-auto underline disabled:opacity-50"
              >
                Hạ xuống học sinh
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
