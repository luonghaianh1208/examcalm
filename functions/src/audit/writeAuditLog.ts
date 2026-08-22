import { getFirestore, FieldValue } from "firebase-admin/firestore";

export type AuditEntry = {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
};

/**
 * Ghi audit log. Client KHÔNG ghi được collection này (rules deny mọi write) —
 * chỉ Admin SDK trong Cloud Function mới ghi được.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await getFirestore().collection("auditLogs").add({
    ...entry,
    timestamp: FieldValue.serverTimestamp(),
  });
}
