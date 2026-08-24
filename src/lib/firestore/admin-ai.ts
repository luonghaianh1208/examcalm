"use client";

import {
  addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, Timestamp, updateDoc,
  where, writeBatch,
} from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import {
  aiConfigSchema, promptTemplateSchema, DEFAULT_AI_CONFIG,
  type AiConfig, type PromptTemplate,
} from "@/lib/types/ai";

/** Đọc systemConfig/aiConfig (admin-only qua firestore.rules). Doc thiếu hoặc sai hình dạng
 *  đều rơi về DEFAULT_AI_CONFIG — an toàn (baseUrl rỗng, killSwitch bật) và cho admin một form
 *  hợp lệ để bắt đầu sửa, thay vì một trang lỗi. */
export async function getAiConfig(): Promise<AiConfig> {
  // Đóng race giống mọi lần đọc Firestore khác trong codebase — xem giải thích
  // ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const snap = await getDoc(doc(getDb(), "systemConfig", "aiConfig"));
  const data = snap.data();
  if (!data) return DEFAULT_AI_CONFIG;
  const parsed = aiConfigSchema.safeParse(data);
  return parsed.success ? parsed.data : DEFAULT_AI_CONFIG;
}

/**
 * true khi và chỉ khi tính năng phản chiếu AI sẵn sàng phục vụ học sinh — khớp CHÍNH XÁC điều
 * kiện mà generateReflection kiểm tra (functions/src/ai/generateReflection.ts: killSwitch tắt,
 * baseUrl khác rỗng) CỘNG thêm model khác rỗng, vì baseUrl đúng mà model rỗng vẫn không gọi
 * được provider. Đây là hàm DUY NHẤT quyết định `enabled` của aiPublic — saveAiConfig() gọi
 * lại đúng hàm này, không tính lại điều kiện ở nơi khác (task-12-brief.md, Decision A).
 */
export function isAiEnabled(config: Pick<AiConfig, "baseUrl" | "model" | "killSwitch">): boolean {
  return config.baseUrl !== "" && config.model !== "" && config.killSwitch.moodReflection === false;
}

/**
 * Ghi ATOMIC systemConfig/aiConfig VÀ systemConfig/aiPublic trong CÙNG một writeBatch — xem
 * task-12-brief.md, Decision A. aiPublic là bản có thể đọc công khai (học sinh đã đăng nhập,
 * xem firestore.rules), derive từ aiConfig, dùng để đặt tên provider ở màn hình đồng ý AI. Ghi
 * tách rời hai lần .set() độc lập tạo ra một khoảng hở nơi hai document có thể lệch nhau — màn
 * hình đồng ý khi đó nói sai tên công ty nhận dữ liệu riêng tư của một học sinh vị thành niên.
 */
export async function saveAiConfig(config: AiConfig, adminUid: string): Promise<void> {
  await ensureAuthReady();
  const db = getDb();
  const batch = writeBatch(db);

  batch.set(doc(db, "systemConfig", "aiConfig"), {
    providerLabel: config.providerLabel,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    quotaStudentPerDay: config.quotaStudentPerDay,
    rateLimitPerMinute: config.rateLimitPerMinute,
    killSwitch: config.killSwitch,
    updatedBy: adminUid,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, "systemConfig", "aiPublic"), {
    providerLabel: config.providerLabel,
    enabled: isAiEnabled(config),
  });

  await batch.commit();
}

// ---- promptTemplates ----

export type PromptTemplateRecord = PromptTemplate & { id: string };

/** Phần admin nhập tay khi soạn draft; status/updatedBy/updatedAt do hệ thống đặt — cùng quy
 *  ước với cbtDraftSchema (admin-cbt.ts) / resourceDraftSchema (admin-resources.ts). .pick()
 *  TÁI SỬ DỤNG luật của promptTemplateSchema (Task 1) thay vì viết lại min(1)/int min(1). */
export const promptTemplateDraftSchema = promptTemplateSchema.pick({
  name: true,
  version: true,
  systemPrompt: true,
  userTemplate: true,
});
export type PromptTemplateDraft = z.infer<typeof promptTemplateDraftSchema>;

/** Liệt kê tường minh — xem giải thích ở toResourceRecord() trong admin-resources.ts:
 *  updatedAt đọc về từ SDK là Firestore `Timestamp` (một class instance), phải chuyển sang
 *  Date tường minh trước khi đưa ra khỏi module này. */
function toPromptTemplateRecord(id: string, data: PromptTemplate): PromptTemplateRecord {
  const updatedAt = data.updatedAt;
  return {
    id,
    name: data.name,
    version: data.version,
    status: data.status,
    systemPrompt: data.systemPrompt,
    userTemplate: data.userTemplate,
    updatedBy: data.updatedBy,
    updatedAt: updatedAt instanceof Timestamp ? updatedAt.toDate() : updatedAt,
  };
}

export async function listPromptTemplates(): Promise<PromptTemplateRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(collection(getDb(), "promptTemplates"));
  return snap.docs.map((d) => toPromptTemplateRecord(d.id, d.data() as PromptTemplate));
}

/** Lưu bản NHÁP — publish luôn ở trạng thái draft khi vừa tạo; publishPromptTemplate() bên
 *  dưới mới là bước đăng. Sửa một bản đã publish qua hàm này KHÔNG tự hạ nó về draft — dùng
 *  unpublishPromptTemplate() nếu cần gỡ đăng trước khi sửa nội dung đang phục vụ học sinh. */
export async function saveDraftPromptTemplate(
  templateId: string | null,
  draft: PromptTemplateDraft,
  adminUid: string,
): Promise<string> {
  await ensureAuthReady();
  const db = getDb();
  const payload = { ...draft, updatedBy: adminUid, updatedAt: serverTimestamp() };

  if (templateId) {
    await updateDoc(doc(db, "promptTemplates", templateId), payload);
    return templateId;
  }
  const ref = await addDoc(collection(db, "promptTemplates"), { ...payload, status: "draft" });
  return ref.id;
}

/**
 * Publish một prompt template. ATOMIC trong MỘT writeBatch: publish bản này VÀ gỡ đăng mọi
 * bản KHÁC cùng `name` đang published — task-12-brief.md: "Do not let two templates with the
 * same name both be published — enforce it in the write path." generateReflection
 * (functions/src/ai/generateReflection.ts) đã tự chọn version cao nhất nếu lỡ có hai bản cùng
 * published, nhưng để hai bản "published" cùng tên tồn tại đồng thời vẫn là trạng thái mơ hồ
 * cho admin đọc lại danh sách — enforce ở đây để tại mọi thời điểm chỉ có tối đa một bản
 * published cho mỗi `name`.
 */
export async function publishPromptTemplate(templateId: string, name: string): Promise<void> {
  await ensureAuthReady();
  const db = getDb();
  const othersPublished = await getDocs(
    query(
      collection(db, "promptTemplates"),
      where("name", "==", name),
      where("status", "==", "published"),
    ),
  );

  const batch = writeBatch(db);
  othersPublished.docs.forEach((d) => {
    if (d.id !== templateId) {
      batch.update(d.ref, { status: "draft", updatedAt: serverTimestamp() });
    }
  });
  batch.update(doc(db, "promptTemplates", templateId), {
    status: "published",
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function unpublishPromptTemplate(templateId: string): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "promptTemplates", templateId), {
    status: "draft",
    updatedAt: serverTimestamp(),
  });
}
