// Callable admin-only ghi ATOMIC systemConfig/aiConfig + systemConfig/aiPublic, VÀ ghi audit
// log — hai fix gộp lại của final whole-branch review (I4 + I5):
//
// - I5: đổi baseUrl/providerLabel/killSwitch là hành động MẠNH NHẤT của cả tính năng — admin
//   bị cấm đọc aiJournalOutputs (đúng), nhưng KIỂM SOÁT baseUrl là một kênh đọc còn mạnh hơn:
//   trỏ endpoint về server riêng thì nhận NGUYÊN VĂN ghi chú gốc của mọi học sinh đã opt-in.
//   Trước fix này không có gì ghi lại việc đó đã xảy ra — chỉ có quy trình, không có dấu vết.
//   Ghi audit log before/after ba field nhạy cảm nhất, theo đúng khuôn setUserRole.ts.
// - I4: chuyển ghi hai document từ client (writeBatch trực tiếp, src/lib/firestore/admin-ai.ts
//   cũ) sang Cloud Function dùng Admin SDK — Admin SDK bỏ qua Security Rules nên không đụng
//   vấn đề get() không thấy được write cùng batch (Firestore không cho get() trong rules đọc
//   lại chính write khác trong CÙNG một batch/transaction). Đồng thời closes đường ghi
//   aiPublic RIÊNG LẺ từ client (rules test tự chứng minh lỗ hổng này tồn tại) bằng ràng buộc
//   cross-document mới ở firestore.rules — ràng buộc đó không áp dụng cho callable này vì Admin
//   SDK bỏ qua rules.

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { assertCallerIsAdmin, PermissionDeniedError, type CallerAuth } from "./guards";
import { aiConfigSchema, DEFAULT_AI_CONFIG, isAiEnabled, type AiConfig } from "../ai/config";
import { writeAuditLog } from "../audit/writeAuditLog";

/** Đọc systemConfig/aiConfig HIỆN TẠI để làm "before" cho audit log — doc thiếu hoặc sai hình
 *  dạng đều coi như DEFAULT_AI_CONFIG, cùng quy ước với generateReflection.ts/admin-ai.ts. */
async function loadCurrentAiConfig(db: Firestore): Promise<AiConfig> {
  const snap = await db.collection("systemConfig").doc("aiConfig").get();
  if (!snap.exists) return DEFAULT_AI_CONFIG;
  const parsed = aiConfigSchema.safeParse(snap.data());
  return parsed.success ? parsed.data : DEFAULT_AI_CONFIG;
}

export type SaveAiConfigDeps = { db: Firestore };

/** Lõi có thể test được — nhận auth/data/deps đã bóc tách sẵn, không phụ thuộc runtime thật
 *  của Cloud Functions. Ném lỗi trực tiếp để test gọi thẳng hàm này với Firestore emulator. */
export async function runSaveAiConfig(
  auth: CallerAuth,
  data: unknown,
  deps: SaveAiConfigDeps,
): Promise<{ ok: true }> {
  assertCallerIsAdmin(auth);

  const parsed = aiConfigSchema.safeParse(data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Cấu hình AI không hợp lệ.");
  }
  const next = parsed.data;

  const before = await loadCurrentAiConfig(deps.db);

  const batch = deps.db.batch();
  batch.set(deps.db.collection("systemConfig").doc("aiConfig"), {
    providerLabel: next.providerLabel,
    baseUrl: next.baseUrl,
    model: next.model,
    temperature: next.temperature,
    maxTokens: next.maxTokens,
    quotaStudentPerDay: next.quotaStudentPerDay,
    chatQuotaPerDay: next.chatQuotaPerDay,
    rateLimitPerMinute: next.rateLimitPerMinute,
    chatRateLimitPerMinute: next.chatRateLimitPerMinute,
    killSwitch: next.killSwitch,
    updatedBy: auth!.uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(deps.db.collection("systemConfig").doc("aiPublic"), {
    providerLabel: next.providerLabel,
    enabled: isAiEnabled(next),
  });
  await batch.commit();

  await writeAuditLog({
    actorUid: auth!.uid,
    action: "saveAiConfig",
    targetType: "aiConfig",
    targetId: "aiConfig",
    before: { baseUrl: before.baseUrl, providerLabel: before.providerLabel, killSwitch: before.killSwitch },
    after: { baseUrl: next.baseUrl, providerLabel: next.providerLabel, killSwitch: next.killSwitch },
  });

  return { ok: true };
}

export const saveAiConfig = onCall({ region: "asia-southeast1" }, async (request) => {
  const auth = request.auth
    ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> }
    : undefined;

  try {
    return await runSaveAiConfig(auth, request.data, { db: getFirestore() });
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new HttpsError("permission-denied", error.message);
    }
    throw error;
  }
});
