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

/** ExamCalm Spec #5, Task 3 (task-3-brief.md, "Bốn trạng thái không quan trọng như nhau"):
 *  bốn trạng thái mail nghĩa khác nhau, admin phải phân biệt được:
 *  - "failed" — mail HỎNG, KHÔNG ai được báo qua email. Nổi bật nhất (emailStatusClassName).
 *  - "skipped" — tính năng đang tắt HOẶC chưa có admin nào — CỐ Ý không nói "admin đã tắt", vì
 *    một cấu hình THIẾU (chưa từng cấu hình) cũng ra đúng trạng thái này, không chỉ trường hợp
 *    admin chủ ý tắt (một cấu hình SAI HÌNH DẠNG mới ra "failed" — xem onCrisisAlertCreated.ts).
 *  - "sent" — đã gửi, kèm mốc thời gian.
 *  - null (vắng mặt trên document — xem admin-crisis.ts) — "chưa rõ", KHÔNG PHẢI thành công hay
 *    thất bại: trigger Task 2 có thể chưa chạy, hoặc chết trước khi ghi lại được gì. I2 (final
 *    whole-branch review): "chưa rõ" một mình là trạng thái ÍT NỔI BẬT NHẤT trên trang (xám nhạt)
 *    — đúng cho một cảnh báo vài giây tuổi, nhưng SAI cho một cảnh báo urgent BA NGÀY tuổi mà
 *    trigger chưa từng chạm tới. Quá STALE_TRIGGER_THRESHOLD_MS, "chưa rõ" phải nổi bật lên thành
 *    một cảnh báo vận hành riêng — xem isTriggerStale bên dưới. */
/** I2 (final whole-branch review): ngưỡng coi một `emailStatus` VẮNG MẶT là "trigger chưa phản
 *  hồi" thay vì "còn mới, đang chờ". 5 phút: độ trễ thật TỆ NHẤT của trigger (cold start Cloud
 *  Functions vài chục giây + `listAllAuthUsers` phân trang + timeout gửi mail 10s của
 *  onCrisisAlertCreated.ts) vẫn nằm gọn dưới 1 phút, nên ngưỡng này đủ RỘNG để không báo động giả
 *  cho một cảnh báo vài giây/vài chục giây tuổi — nhưng đủ HẸP để một trigger CHẾT (thiếu secret,
 *  crash trước khi vào code, hoặc chính writeEmailStatus lỗi — bị nuốt im lặng có chủ đích) không
 *  im lặng hàng giờ/ngày trước khi ai tình cờ nhận ra. */
const STALE_TRIGGER_THRESHOLD_MS = 5 * 60 * 1000;

/** true nếu một `emailStatus` vắng mặt đã ĐỦ LÂU để coi là "trigger chưa phản hồi" thay vì "còn
 *  mới, đang chờ" — xem STALE_TRIGGER_THRESHOLD_MS. `createdAt` NaN (Invalid Date, xem
 *  admin-crisis.ts) rơi về false — không suy diễn "cũ" từ một thời điểm không đọc được. */
function isTriggerStale(createdAt: Date): boolean {
  const ageMs = Date.now() - createdAt.getTime();
  return !Number.isNaN(ageMs) && ageMs > STALE_TRIGGER_THRESHOLD_MS;
}

function formatEmailStatus(
  status: CrisisAlertRecord["emailStatus"],
  emailedAt: Date | null,
  createdAt: Date,
): string {
  if (status === "sent") {
    return emailedAt ? `Đã gửi mail cảnh báo lúc ${formatAlertTime(emailedAt)}` : "Đã gửi mail cảnh báo";
  }
  if (status === "failed") {
    return "Gửi mail cảnh báo THẤT BẠI — không ai được báo qua mail";
  }
  if (status === "skipped") {
    return "Đã bỏ qua gửi mail (tính năng đang tắt, hoặc chưa có admin nào nhận được)";
  }
  // status vắng mặt — giữ nguyên chữ "Chưa rõ trạng thái gửi mail" trong CẢ hai nhánh (không đổi
  // hẳn sang chữ khác) để không mất đi ý nghĩa gốc "không biết chắc điều gì đã xảy ra"; nhánh cũ
  // (I2) chỉ THÊM một câu cảnh báo khi đã đủ lâu để nghi ngờ trigger đã chết.
  return isTriggerStale(createdAt)
    ? "Chưa rõ trạng thái gửi mail — trigger CHƯA PHẢN HỒI sau nhiều phút, có thể đã lỗi, kiểm tra ngay"
    : "Chưa rõ trạng thái gửi mail";
}

function emailStatusClassName(status: CrisisAlertRecord["emailStatus"], createdAt: Date): string {
  if (status === "failed") {
    return "rounded-lg bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-900";
  }
  // I2: status vắng mặt VÀ đã đủ lâu — nổi bật bằng amber (cảnh báo vận hành), KHÔNG dùng rose
  // (đã dành riêng cho "failed" — hai mức độ nghiêm trọng khác nhau không được lẫn vào nhau).
  if (status == null && isTriggerStale(createdAt)) {
    return "rounded-lg bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-900";
  }
  return "text-sm text-slate-500";
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
  // I6 (final whole-branch review): true khi danh sách "gần đây" (không phải phần chưa xử lý —
  // xem comment listCrisisAlerts) có thể đã bị cắt bởi trần `max`. Cảnh báo CHƯA xử lý không
  // bao giờ khiến cờ này bật vì lý do "chỉ là bị cắt hiển thị" — xem admin-crisis.ts.
  const [truncated, setTruncated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fix round 1, Finding 4: TRẢ VỀ promise của listCrisisAlerts() (trước đây không return gì) —
  // để handleMark/handleReopen bên dưới `await load()` được THẬT SỰ, không chỉ gọi rồi bỏ đó.
  const load = useCallback(() => {
    return listCrisisAlerts()
      .then((result) => {
        setAlerts(result.alerts);
        setTruncated(result.truncated);
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

      {/* I6 (final whole-branch review): cảnh báo CHƯA xử lý không bao giờ bị cắt (xem
          admin-crisis.ts) — cờ này chỉ có nghĩa "một số cảnh báo ĐÃ xử lý cũ hơn có thể không
          hiện ở đây", để không ai hiểu nhầm là còn cảnh báo chưa xử lý bị giấu. */}
      {truncated && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Danh sách này có thể chưa hiện hết các cảnh báo ĐÃ xử lý cũ hơn — mọi cảnh báo CHƯA xử
          lý đều chắc chắn hiện đầy đủ ở đây.
        </p>
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
                <span className={emailStatusClassName(alert.emailStatus ?? null, alert.createdAt)}>
                  {formatEmailStatus(alert.emailStatus ?? null, alert.emailedAt ?? null, alert.createdAt)}
                </span>

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
