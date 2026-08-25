"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listCrisisAlerts, markCrisisAlertHandled, reopenCrisisAlert, isAlertUnhandled,
  type CrisisAlertRecord,
} from "@/lib/firestore/admin-crisis";
import type { UserSummary } from "@/lib/firestore/admin-users";

const SEVERITY_LABEL: Record<CrisisAlertRecord["severity"], string> = {
  urgent: "Khẩn cấp",
  concern: "Cần chú ý",
};

const formatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

/** Fix round 1, Finding 5: `admin-crisis.ts` rơi về `new Date(NaN)` (Invalid Date) khi
 *  `createdAt` không đọc được từ document — KHÔNG BAO GIỜ đưa Invalid Date thẳng vào
 *  `formatter.format()` (ném RangeError), và KHÔNG BAO GIỜ hiện một ngày giả (vd 1970) trông
 *  như một thời điểm THẬT trên một dòng cảnh báo khủng hoảng. */
function formatAlertTime(d: Date): string {
  return Number.isNaN(d.getTime()) ? "Không rõ thời điểm" : formatter.format(d);
}

/** Fix round 1, Finding 1 (CRITICAL): `alert.userId` một mình là ngõ cụt trong sản phẩm — không
 *  trang admin nào khác hiện hay tìm được theo uid. `studentsByUid` (đổ từ `listUsers()` ở
 *  `canh-bao/page.tsx`, server-side) join uid sang danh tính DÙNG ĐƯỢC. Không có access delta:
 *  admin đã đọc được mọi `users/{uid}` qua firestore.rules — đây chỉ là hiển thị lại đúng danh
 *  tính đó ở một dạng thầy cô dùng được, thay vì mã thô. Fallback về uid thô CHỈ khi join không
 *  khớp (tài khoản đã xoá, hoặc vượt trần `listUsers()`). */
function StudentIdentity({ userId, student }: { userId: string; student: UserSummary | undefined }) {
  if (!student) {
    return <span className="font-mono text-sm">Mã học sinh: {userId}</span>;
  }
  return (
    <span className="text-sm">
      <span className="font-medium">{student.nickname}</span>
      <span className="text-slate-500"> · Lớp {student.gradeLevel} · {student.school}</span>
    </span>
  );
}

export function CrisisAlertList({
  adminUid, studentsByUid,
}: { adminUid: string; studentsByUid: Record<string, UserSummary> }) {
  const [alerts, setAlerts] = useState<CrisisAlertRecord[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fix round 1, Finding 4: TRẢ VỀ promise của listCrisisAlerts() (trước đây không return gì) —
  // để handleMark/handleReopen bên dưới `await load()` được THẬT SỰ, không chỉ gọi rồi bỏ đó.
  const load = useCallback(() => {
    return listCrisisAlerts()
      .then((result) => {
        setAlerts(result);
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleMark(alertId: string) {
    setPendingId(alertId);
    setActionError(null);
    try {
      await markCrisisAlertHandled(alertId, adminUid);
      // Fix round 1, Finding 4: AWAIT load() — trước đây gọi fire-and-forget, nên `finally`
      // bên dưới re-enable nút NGAY khi markCrisisAlertHandled() resolve, trong khi `alerts`
      // hiển thị vẫn còn là dòng CŨ (chưa xử lý) tới khi load() tự âm thầm resolve sau đó —
      // nút nháy bật rồi tắt lại đúng lúc dòng mới xuất hiện.
      await load();
    } catch {
      setActionError("Không đánh dấu được. Kiểm tra lại quyền quản trị của bạn.");
    } finally {
      setPendingId(null);
    }
  }

  async function handleReopen(alertId: string) {
    setPendingId(alertId);
    setActionError(null);
    try {
      await reopenCrisisAlert(alertId);
      await load();
    } catch {
      setActionError("Không mở lại được. Kiểm tra lại quyền quản trị của bạn.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* task-9-brief.md, Step 1 mục 6: trang phải nói rõ việc cần làm là ĐI GẶP học sinh, không
          phải đọc hồ sơ — design spec §3.4: cảnh báo cố ý không mang nguyên văn, nên không có gì
          để đọc thêm ở đây cả. */}
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
        Khi có cảnh báo dưới đây: việc cần làm là <strong>đi gặp trực tiếp học sinh này</strong> —
        không phải đọc thêm hồ sơ. Hệ thống cố ý không lưu lại nguyên văn các em đã viết.
      </p>

      {actionError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{actionError}</p>
      )}

      {loadFailed ? (
        <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
          <p>Chưa tải được danh sách cảnh báo lúc này — có thể do mạng chập chờn thôi.</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
          >
            Thử tải lại
          </button>
        </div>
      ) : alerts === null ? (
        <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
      ) : alerts.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có cảnh báo nào.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((alert) => {
            // Khoá theo handledBy — KHÔNG BAO GIỜ handledAt (xem isAlertUnhandled).
            const unhandled = isAlertUnhandled(alert);
            return (
              <li
                key={alert.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3"
              >
                <span
                  className={
                    alert.severity === "urgent"
                      ? "rounded-full bg-rose-100 px-2 py-0.5 text-sm font-medium text-rose-800"
                      : "rounded-full bg-amber-100 px-2 py-0.5 text-sm font-medium text-amber-800"
                  }
                >
                  {SEVERITY_LABEL[alert.severity]}
                </span>
                <span className="text-sm text-slate-500">{formatAlertTime(alert.createdAt)}</span>
                <StudentIdentity userId={alert.userId} student={studentsByUid[alert.userId]} />

                {unhandled ? (
                  <button
                    type="button"
                    disabled={pendingId === alert.id}
                    onClick={() => handleMark(alert.id)}
                    className="ml-auto underline disabled:opacity-50"
                  >
                    Đánh dấu đã xử lý
                  </button>
                ) : (
                  <>
                    <span className="text-sm text-slate-500">
                      Đã xử lý bởi {alert.handledBy}
                      {alert.handledAt ? ` lúc ${formatAlertTime(alert.handledAt)}` : ""}
                    </span>
                    <button
                      type="button"
                      disabled={pendingId === alert.id}
                      onClick={() => handleReopen(alert.id)}
                      className="ml-auto underline disabled:opacity-50"
                    >
                      Mở lại
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
