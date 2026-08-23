import "server-only";

import { adminDb } from "@/lib/firebase/admin";

export type UserSummary = {
  uid: string;
  nickname: string;
  school: string;
  gradeLevel: string;
  role: "student" | "admin";
};

export type AuditLogEntry = {
  id: string;
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: Date | null;
};

/** Chỉ trả về trường hành chính — KHÔNG bao giờ trả nội dung nhật ký hay điểm test. */
export async function listUsers(max = 200): Promise<UserSummary[]> {
  const snap = await adminDb().collection("users").limit(max).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      nickname: (data.nickname as string) ?? "(chưa đặt)",
      school: (data.school as string) ?? "",
      gradeLevel: (data.gradeLevel as string) ?? "",
      role: data.role === "admin" ? "admin" : "student",
    };
  });
}

export async function listAuditLogs(max = 100): Promise<AuditLogEntry[]> {
  const snap = await adminDb()
    .collection("auditLogs")
    .orderBy("timestamp", "desc")
    .limit(max)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      actorUid: data.actorUid as string,
      action: data.action as string,
      targetType: data.targetType as string,
      targetId: data.targetId as string,
      timestamp: data.timestamp?.toDate?.() ?? null,
    };
  });
}
