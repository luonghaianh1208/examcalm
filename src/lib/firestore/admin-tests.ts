"use client";

import {
  addDoc, collection, doc, getDocs, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { questionSchema, thresholdSchema, type TestDefinition } from "@/lib/types/test";

/** Phần admin nhập tay; status/updatedBy/updatedAt do hệ thống đặt. */
export const testDraftSchema = z.object({
  title: z.string().min(1),
  version: z.number().int().min(1),
  isSampleContent: z.boolean(),
  disclaimer: z.string().min(1),
  // .default("") để bản nháp cũ và ô "Dán JSON" không bắt buộc phải có hai
  // field này — chuỗi rỗng có nghĩa rõ ràng: chưa điền.
  purpose: z.string().max(300).default(""),
  expertReviewedBy: z.string().max(200).default(""),
  questions: z.array(questionSchema),
  scoring: z.object({ thresholds: z.array(thresholdSchema) }),
});

export type TestDefinitionDraft = z.infer<typeof testDraftSchema>;
export type TestRecord = TestDefinition & { id: string };
export type ParseResult =
  | { ok: true; value: TestDefinitionDraft }
  | { ok: false; error: string };

/**
 * Kiểm tra một draft ĐÃ là object. Form nhập liệu và ô "Dán JSON" dùng chung
 * hàm này, nên bộ luật (schema + chống trùng id + ngưỡng min/max) chỉ được
 * viết MỘT lần — chép lại cho form thì hai bên sẽ lệch nhau ngay lần sửa sau.
 */
export function validateTestDraft(raw: unknown): ParseResult {
  const parsed = testDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "dữ liệu"}: ${issue?.message}` };
  }

  const ids = parsed.data.questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Có câu hỏi trùng id. Mỗi câu cần một id riêng." };
  }

  const badThreshold = parsed.data.scoring.thresholds.find((t) => t.min > t.max);
  if (badThreshold) {
    return { ok: false, error: `Ngưỡng "${badThreshold.level}" có min lớn hơn max.` };
  }

  return { ok: true, value: parsed.data };
}

export function parseTestDraft(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON sai cú pháp. Kiểm tra lại dấu ngoặc và dấu phẩy." };
  }
  return validateTestDraft(raw);
}

/**
 * Liệt kê tường minh từng field thay vì spread `d.data()` — document đọc về
 * từ SDK có thể mang theo field không nằm trong type (vd: `updatedAt` là một
 * Firestore `Timestamp`, một class instance) mà spread sẽ vô tình mang theo.
 * Xem giải thích đầy đủ ở toResourceListItem() trong queries-public.ts.
 */
function toTestRecord(id: string, data: TestDefinition): TestRecord {
  return {
    id,
    title: data.title,
    version: data.version,
    status: data.status,
    isSampleContent: data.isSampleContent,
    questions: data.questions,
    scoring: data.scoring,
    disclaimer: data.disclaimer,
    // ?? — document tạo trước khi có field này thì không mang nó.
    purpose: data.purpose ?? "",
    expertReviewedBy: data.expertReviewedBy ?? "",
    updatedBy: data.updatedBy,
  };
}

export async function listAllTests(): Promise<TestRecord[]> {
  // Đóng race giống listMyMoodLogs — xem giải thích ensureAuthReady() ở
  // client.ts. Thiếu bước này, admin vừa đăng nhập xong điều hướng thẳng tới
  // /admin/tests sẽ luôn bị Firestore từ chối đọc vì request.auth chưa kịp khôi phục.
  await ensureAuthReady();
  const snap = await getDocs(collection(getDb(), "testDefinitions"));
  return snap.docs.map((d) => toTestRecord(d.id, d.data() as TestDefinition));
}

export async function saveTest(
  testId: string | null,
  draft: TestDefinitionDraft,
  adminUid: string,
): Promise<string> {
  // Đóng race giống saveMoodLog/toggleFavorite: admin vừa đăng nhập xong có
  // thể lưu bài test ngay lập tức — xem giải thích ensureAuthReady() ở client.ts.
  await ensureAuthReady();
  const payload = { ...draft, updatedBy: adminUid, updatedAt: serverTimestamp() };

  if (testId) {
    await updateDoc(doc(getDb(), "testDefinitions", testId), payload);
    return testId;
  }
  const ref = await addDoc(collection(getDb(), "testDefinitions"), {
    ...payload,
    status: "draft",
  });
  return ref.id;
}

export async function publishTest(testId: string, publish: boolean): Promise<void> {
  // Đóng race giống saveTest ở trên — publish/unpublish cũng là một lần ghi.
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "testDefinitions", testId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
