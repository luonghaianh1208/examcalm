"use client";

import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, Timestamp, updateDoc,
  where, writeBatch,
} from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { callSaveAiConfig } from "@/lib/firebase/functions-client";
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
 * true khi và chỉ khi ÍT NHẤT MỘT trong hai tính năng AI (phản chiếu hoặc chat) sẵn sàng phục
 * vụ học sinh. Bản mirror ở functions/src/ai/config.ts (Cloud Function saveAiConfig, fix
 * I4+I5) mới là nơi THẬT SỰ derive `enabled` của aiPublic từ server; hàm ở đây chỉ còn dùng để
 * xem trước kết quả ở phía client (vd hiển thị UI) và pin bằng test — không tự ghi Firestore.
 *
 * M8 (final whole-branch review): CỘNG thêm quotaStudentPerDay > 0 — quota mặc định khi ship
 * là 0 (nghĩa là "không lượt nào", xem aiConfigSchema). Thiếu điều kiện này, admin điền xong
 * baseUrl/model và tắt kill switch trong khi quên nâng quota sẽ khiến aiPublic.enabled=true,
 * màn hình đồng ý mời học sinh bật, và MỌI lượt gọi đều rớt resource-exhausted ngay lập tức —
 * học sinh nhận thông báo "đã dùng hết lượt hôm nay" dù chưa dùng lượt nào.
 *
 * Task 9 (task-9-brief.md — lý do đầy đủ trong task-9-report.md): giờ có HAI tính năng dùng
 * chung document cấu hình này, mỗi tính năng có killSwitch VÀ quota riêng. `enabled` là OR giữa
 * hai tính năng, KHÔNG PHẢI AND: CHÍNH ô tick "aiOptIn" (một field DUY NHẤT trên users/{uid})
 * gate quyền truy cập CẢ HAI tính năng, nên dùng AND sẽ khiến một admin cố ý bật RIÊNG chat
 * trong khi giữ phản chiếu tắt (đúng kịch bản §10 design spec) không bao giờ hiện được ô tick
 * cho học sinh. baseUrl/model vẫn là điều kiện CHUNG bắt buộc (hai tính năng dùng chung provider).
 *
 * SỬA (Task 9 fix round 1, Finding 2 — reviewer, CRITICAL): docstring bản trước nói `enabled`
 * "chỉ quyết định MỘT điều" (ô tick đồng ý) — SAI. `ReflectionCard.tsx` và `ChatWindow.tsx`
 * (functions/src/ai/config.ts không với tới hai file này, nhưng bản mirror `enabled` ở đây có
 * cùng giá trị) từng gate TRỰC TIẾP trên `aiPublic.enabled` — bật RIÊNG chat làm `enabled=true`
 * và mở luôn cổng phản chiếu dù killSwitch.moodReflection còn tắt. Hai component đó giờ gate
 * trên `aiPublic.reflectionEnabled`/`aiPublic.chatEnabled` RIÊNG (derive bởi
 * `isReflectionEnabled`/`isChatEnabled` ở functions/src/ai/config.ts, không mirror ở file này vì
 * không có component nào phía client tiêu thụ trực tiếp `isAiEnabled` của file này — nó chỉ còn
 * dùng để xem trước/pin `enabled`, xem đoạn đầu docstring). `enabled` ở đây vẫn đúng — chỉ không
 * còn là flag DUY NHẤT gate quyền dùng AI nữa.
 */
export function isAiEnabled(
  config: Pick<
    AiConfig,
    "baseUrl" | "model" | "killSwitch" | "quotaStudentPerDay" | "chatQuotaPerDay"
  >,
): boolean {
  // baseUrl là hằng số PROVIDER_BASE_URL nên luôn hợp lệ — chỉ còn tên model
  // do thầy cô nhập mới quyết định đã cấu hình xong hay chưa.
  if (config.model === "") return false;
  const moodReflectionReady =
    config.killSwitch.moodReflection === false && config.quotaStudentPerDay > 0;
  const chatReady = config.killSwitch.chat === false && config.chatQuotaPerDay > 0;
  return moodReflectionReady || chatReady;
}

/**
 * Lưu cấu hình AI qua Cloud Function `saveAiConfig` (functions/src/admin/saveAiConfig.ts, fix
 * I4+I5 — final whole-branch review), THAY vì ghi trực tiếp bằng writeBatch từ client như
 * trước đây. Hai lý do đổi:
 *
 * - I5: đổi baseUrl/providerLabel/killSwitch là hành động mạnh nhất của cả tính năng (baseUrl
 *   là kênh đọc nguyên văn ghi chú học sinh còn mạnh hơn quyền đọc aiJournalOutputs mà admin bị
 *   cấm) — callable ghi audit log before/after, còn ghi trực tiếp từ client thì không thể.
 * - I4: firestore.rules giờ ràng buộc `systemConfig/aiPublic.providerLabel` phải khớp
 *   `systemConfig/aiConfig` mỗi khi ghi qua client SDK — nhưng get() trong rules KHÔNG thấy
 *   được write khác trong CÙNG một batch, nên writeBatch trực tiếp cho aiConfig+aiPublic sẽ tự
 *   chặn chính nó mỗi khi đổi providerLabel. Cloud Function dùng Admin SDK bỏ qua rules, tránh
 *   hẳn vấn đề này — và closes luôn đường ghi aiPublic RIÊNG LẺ từ client mà rules test cũ
 *   từng chứng minh là mở.
 */
export async function saveAiConfig(config: AiConfig): Promise<void> {
  await callSaveAiConfig(config);
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

/**
 * Liệt kê PHÒNG THỦ từng field (kiểm tra kiểu runtime, fallback an toàn) thay vì ép kiểu thẳng
 * `d.data() as PromptTemplate` — Fix round 1, Finding 6: `getAiConfig()` ở trên safeParse qua
 * zod, nhưng `promptTemplateSchema` khai báo `updatedAt: z.date()` trong khi Firestore luôn trả
 * về `Timestamp` (không phải `Date`), nên parse thẳng document qua đúng schema đó sẽ luôn rớt ở
 * field này — không dùng lại được y nguyên cách getAiConfig() làm. Tự kiểm tra runtime từng
 * field còn lại (cùng phong cách `safeNumber`/`sanitizeFreeText` ở
 * functions/src/ai/buildPrompt.ts, và `safePromptVersion` ở
 * functions/src/ai/generateReflection.ts — cùng fallback version mặc định 1) để một document
 * lệch hình dạng không làm `name`/`version` trở thành `undefined`, rơi vào
 * `where("name", "==", undefined)` ở publishPromptTemplate() bên dưới hay `value={undefined}`
 * trên textarea của AiConfigEditor.tsx (React cảnh báo uncontrolled input).
 */
function toPromptTemplateRecord(id: string, data: Record<string, unknown>): PromptTemplateRecord {
  const updatedAtValue = data.updatedAt;
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    version: typeof data.version === "number" && Number.isInteger(data.version) ? data.version : 1,
    status: data.status === "published" ? "published" : "draft",
    systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : "",
    userTemplate: typeof data.userTemplate === "string" ? data.userTemplate : "",
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : "",
    updatedAt: updatedAtValue instanceof Timestamp ? updatedAtValue.toDate() : new Date(0),
  };
}

/** Sắp theo `version` giảm dần — Fix round 1, Finding 7: trước đây không có `orderBy` nên
 *  Firestore trả về theo thứ tự auto-ID, khiến bản v3 có thể hiện DƯỚI bản v1 trong danh sách
 *  admin bấm "Đăng" từ đó. */
export async function listPromptTemplates(): Promise<PromptTemplateRecord[]> {
  await ensureAuthReady();
  const snap = await getDocs(
    query(collection(getDb(), "promptTemplates"), orderBy("version", "desc")),
  );
  return snap.docs.map((d) => toPromptTemplateRecord(d.id, d.data()));
}

/** Thông báo khi cố sửa trực tiếp một bản ĐANG PUBLISHED — export để component hiển thị lại
 *  đúng chuỗi này (so sánh, không đoán lại nội dung message). */
export const EDIT_PUBLISHED_TEMPLATE_ERROR =
  "Không thể sửa trực tiếp một prompt ĐANG PUBLISHED. Hãy gỡ đăng trước, rồi mới sửa nội dung.";

/**
 * Lưu bản NHÁP — publish luôn ở trạng thái draft khi vừa tạo; publishPromptTemplate() bên dưới
 * mới là bước đăng.
 *
 * Fix round 1, Finding 5 (ruling của reviewer): sửa một bản ĐANG PUBLISHED qua hàm này bị CHẶN
 * — không tự hạ về draft rồi lưu, mà từ chối hẳn. Lý do: prompt này được gửi kèm bài viết cảm
 * xúc riêng tư của học sinh, và go-live checklist yêu cầu một nhà tâm lý học đọc qua nội dung
 * TRƯỚC khi publish. Cho phép sửa thẳng một bản published sẽ âm thầm đổi nội dung đang phục vụ
 * học sinh mà không đi qua bước rà soát đó. unpublishPromptTemplate() đã có sẵn — một cú click
 * gỡ đăng chính là thời điểm admin nhận ra mình đang đổi thứ học sinh nhìn thấy.
 *
 * Kiểm tra rồi mới ghi (check-then-act, không transaction) — chấp nhận được: đây là một rào
 * chắn quy trình cho MỘT admin đơn lẻ đang biên tập, không phải một bất biến chống hai admin
 * ghi đồng thời (khác publishPromptTemplate() bên dưới, nơi đích thực có nhiều admin có thể
 * publish cùng lúc).
 */
export async function saveDraftPromptTemplate(
  templateId: string | null,
  draft: PromptTemplateDraft,
  adminUid: string,
): Promise<string> {
  await ensureAuthReady();
  const db = getDb();
  const payload = { ...draft, updatedBy: adminUid, updatedAt: serverTimestamp() };

  if (templateId) {
    const current = await getDoc(doc(db, "promptTemplates", templateId));
    if (current.data()?.status === "published") {
      throw new Error(EDIT_PUBLISHED_TEMPLATE_ERROR);
    }
    await updateDoc(doc(db, "promptTemplates", templateId), payload);
    return templateId;
  }
  const ref = await addDoc(collection(db, "promptTemplates"), { ...payload, status: "draft" });
  return ref.id;
}

/**
 * Publish một prompt template, và gỡ đăng mọi bản KHÁC cùng `name` đang published — trong CÙNG
 * một writeBatch — task-12-brief.md: "Do not let two templates with the same name both be
 * published — enforce it in the write path."
 *
 * Fix round 1, Finding 4: comment bản trước ghi "tại mọi thời điểm chỉ có tối đa một bản
 * published" — SAI, đây KHÔNG phải một bất biến tại-mọi-thời-điểm. `getDocs()` bên dưới đọc
 * "ai đang published" nằm NGOÀI batch, và writeBatch không có precondition trên phần đọc đó —
 * nó chỉ làm các LỆNH GHI atomic với NHAU, không làm cặp ĐỌC-RỒI-GHI atomic. Đã cân nhắc dùng
 * `runTransaction()` để đóng hẳn cửa sổ này, nhưng KHÔNG khả thi với bản Firestore JS SDK đang
 * dùng: `Transaction.get()` chỉ nhận một `DocumentReference` đơn lẻ, không nhận `Query` (xem
 * @firebase/firestore/dist/firestore/src/api/transaction.d.ts) — không có cách đọc "mọi bản
 * đang published cùng tên" (một tập hợp không biết trước số lượng/id) bằng transaction.get()
 * của SDK này.
 *
 * Vì vậy: hai admin publish hai bản KHÁC NHAU cùng `name` gần như đồng thời — cả hai đều đọc
 * trạng thái CŨ trước khi bất kỳ ai commit, cả hai batch đều commit thành công, có thể kết thúc
 * với HAI bản published cùng tên. Đây là một cửa sổ race THU HẸP (rất hẹp — đòi hỏi hai admin
 * bấm gần như cùng lúc trên cùng `name`), không phải đóng hoàn toàn. Chấp nhận được vì (1) đây
 * là console admin nội bộ, đội quản trị nhỏ, và (2) generateReflection
 * (functions/src/ai/generateReflection.ts) tự chọn version cao nhất trong số các bản published
 * nếu lỡ có nhiều hơn một, nên hành vi phục vụ học sinh vẫn xác định được dù race này xảy ra.
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
