import { requireAdmin } from "@/lib/firebase/session";
import { listAuditLogs } from "@/lib/firestore/admin-users";

export const metadata = { title: "Nhật ký hệ thống" };

const formatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export default async function Page() {
  await requireAdmin();
  const logs = await listAuditLogs();

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Nhật ký hệ thống</h1>
      {logs.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có hoạt động nào được ghi.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <li key={log.id} className="rounded-xl border bg-white px-4 py-3">
              <span className="font-mono text-sm">{log.action}</span>
              <span className="ml-2 text-slate-600">{log.targetType}/{log.targetId}</span>
              <span className="block text-sm text-slate-500">
                bởi {log.actorUid} · {log.timestamp ? formatter.format(log.timestamp) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
