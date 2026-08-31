"use client";

import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { cbtStepSchema, type CbtModule } from "@/lib/types/cbt";

/** Phần admin nhập tay; status/updatedBy/updatedAt do hệ thống đặt. */
export const cbtDraftSchema = z.object({
  title: z.string().min(1).max(200),
  version: z.number().int().min(1),
  isSampleContent: z.boolean(),
  disclaimer: z.string().min(1),
  intro: z.string(),
  steps: z.array(cbtStepSchema).min(1).max(12),
  closingText: z.string(),
  suggestedResourceSlugs: z.array(z.string()).max(5),
});

export type CbtModuleDraft = z.infer<typeof cbtDraftSchema>;
export type CbtModuleRecord = CbtModule & { id: string };
export type CbtParseResult =
  | { ok: true; value: CbtModuleDraft }
  | { ok: false; error: string };

/**
 * Kiểm tra một draft ĐÃ là object. Form nhập liệu và ô "Dán JSON" dùng chung
 * hàm này, nên bộ luật (schema + chống trùng id) chỉ được viết MỘT lần — chép
 * lại cho form thì hai bên sẽ lệch nhau ngay lần sửa schema kế tiếp.
 */
export function validateCbtDraft(raw: unknown): CbtParseResult {
  const parsed = cbtDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "dữ liệu"}: ${issue?.message}` };
  }

  const ids = parsed.data.steps.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Có bước trùng id. Mỗi bước cần một id riêng." };
  }

  return { ok: true, value: parsed.data };
}

export function parseCbtDraft(json: string): CbtParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON sai cú pháp. Kiểm tra lại dấu ngoặc và dấu phẩy." };
  }
  return validateCbtDraft(raw);
}

/** Liệt kê tường minh — xem giải thích ở toResourceListItem() trong queries-public.ts. */
function toCbtRecord(id: string, data: CbtModule): CbtModuleRecord {
  return {
    id,
    title: data.title,
    version: data.version,
    status: data.status,
    isSampleContent: data.isSampleContent,
    disclaimer: data.disclaimer,
    intro: data.intro,
    steps: data.steps,
    closingText: data.closingText,
    suggestedResourceSlugs: data.suggestedResourceSlugs,
    updatedBy: data.updatedBy,
  };
}

export async function listAllCbtModules(): Promise<CbtModuleRecord[]> {
  // Đóng race giống listAllTests — xem giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const snap = await getDocs(collection(getDb(), "cbtModules"));
  return snap.docs.map((d) => toCbtRecord(d.id, d.data() as CbtModule));
}

export async function saveCbtModule(
  moduleId: string | null,
  draft: CbtModuleDraft,
  adminUid: string,
): Promise<string> {
  // Đóng race giống saveTest — xem giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const payload = { ...draft, updatedBy: adminUid, updatedAt: serverTimestamp() };

  if (moduleId) {
    await updateDoc(doc(getDb(), "cbtModules", moduleId), payload);
    return moduleId;
  }
  const ref = await addDoc(collection(getDb(), "cbtModules"), { ...payload, status: "draft" });
  return ref.id;
}

export async function publishCbtModule(moduleId: string, publish: boolean): Promise<void> {
  // Đóng race giống publishTest ở trên — publish/unpublish cũng là một lần ghi.
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "cbtModules", moduleId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
