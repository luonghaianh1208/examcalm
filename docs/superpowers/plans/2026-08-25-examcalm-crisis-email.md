# ExamCalm Spec #5 — Gửi mail cảnh báo khủng hoảng cho admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Khi một cảnh báo khủng hoảng được ghi, **mọi tài khoản admin** nhận được email trong vòng vài giây — đủ để biết đi tìm ai và gấp tới mức nào, và không có một chữ nào học sinh viết.

**Phụ thuộc:** Spec #4 (`crisisAlerts`). Dùng lại `openaiClient.ts`-style module thuần + Secret Manager + `aiConfig`.

**Quyết định của chủ sản phẩm:** dịch vụ **Resend**; mail chứa **tên + lớp + mức độ + link**, không có trích đoạn.

---

## Bối cảnh bắt buộc đọc trước

**`users/{uid}` KHÔNG có trường `email`.** Schema chỉ có `uid, role, nickname, gradeLevel, school, examGoals, privacySettings, researchConsent, deletionRequestedAt, onboarding`. Nên **không lấy được địa chỉ admin từ Firestore** — phải dùng Firebase Auth `getAuth().listUsers()` và lọc theo **custom claim** `role === "admin"`, rồi lấy `.email`. Claim là nguồn xác thực đúng cho quyền, và Auth là nguồn đúng cho email.

**Email nằm ngoài Firestore.** Nó ở trong hộp thư cá nhân vô thời hạn, trên điện thoại riêng, chuyển tiếp được, và ai dùng chung hộp thư đó cũng đọc được. Đó là lý do luật của §3.4 Spec #4 áp dụng **chặt hơn** ở đây, không lỏng hơn.

**Cảnh báo trong Firestore là nguồn sự thật; email chỉ là lớp thông báo.** Mail hỏng không được làm hỏng gì khác. Nhưng mail hỏng **im lặng** thì tệ hơn không có mail — vì lúc đó hệ thống tin là đã báo mà thật ra chưa.

## Global Constraints

Mọi ràng buộc của Spec #1–#4 vẫn áp dụng. Nhắc lại những cái đã bị vi phạm nhiều lần:

- UI tiếng Việt; tên file/biến/hàm tiếng Anh; comment tiếng Việt.
- TypeScript `strict`, `noUncheckedIndexedAccess`. Không `any` nếu không có comment giải thích.
- `await ensureAuthReady()` ở dòng đầu mọi hàm client chạm Firestore — kể cả đọc và xoá, có test khẳng định **thứ tự**.
- **Không bao giờ `{...(d.data() as T)}`.** Fixture test phải chứa một field ngoài mô hình, nếu không guard `Object.keys` không guard được gì.
- Sửa `firestore.rules` thì sửa **cả hai** file giống hệt, và trace rule mới qua **mọi** khối match — Firestore OR mọi grant khớp.
- **Mọi collection chứa dữ liệu cá nhân phải vào `collectDeletionTargets()`.** Sổ này đã bị quên ba lần.
- Viết test thất bại TRƯỚC, chạy, xác nhận đỏ đúng lý do. **Một test chưa từng thấy đỏ chưa phải bằng chứng.**
- File test cần emulator phải vào danh sách loại trừ của `test:unit` trong `functions/package.json`.
- Agent được phép `git commit`. Không `git push`, không deploy.

### Riêng spec này

- **Mail KHÔNG BAO GIỜ chứa nguyên văn, trích đoạn, hay tóm tắt tin nhắn.** Viết test đọc thân mail và khẳng định điều đó, không phải test đọc code.
- **API key Resend chỉ ở Secret Manager**, không ở Firestore, không ở biến `NEXT_PUBLIC_*`, không trong log, không trong message lỗi.
- **Gửi mail thất bại không được ném lỗi ra ngoài trigger** — cảnh báo đã nằm trong Firestore rồi.
- **Nhưng thất bại phải nhìn thấy được**: ghi trạng thái lên chính document cảnh báo.

---

### Task 1: Client Resend (thuần) + mở rộng cấu hình và schema

**Files:** Create `functions/src/email/resendClient.ts` + test · Modify `src/lib/types/ai.ts`, `functions/src/ai/config.ts`, `src/lib/types/chat.ts`, `src/lib/types/ai-config-sync.test.ts`

- [ ] **Step 1: Viết test thất bại**

**`sendEmail(params, deps?)`** — module thuần, không Firebase, nhận `fetchImpl` qua tham số. Đọc `functions/src/ai/openaiClient.ts` và theo đúng khuôn nó đã qua nhiều vòng review:

1. POST tới `https://api.resend.com/emails`, header `Authorization: Bearer <key>`, `Content-Type: application/json`.
2. Body có `from`, `to` (mảng), `subject`, `text`.
3. Thành công → trả `{ id }`.
4. HTTP 401/403 → ném `EmailError` `kind: "auth"`; 429 → `"rate_limit"`; 5xx → `"server"`; khác → `"server"` kèm comment rằng đây thường là cấu hình sai.
5. Body không phải JSON → `"bad_response"`, không ném `SyntaxError` thô.
6. Quá `timeoutMs` → `"timeout"`, dùng `AbortController`, **clear timer trên mọi nhánh**.
7. **`EmailError.message` không bao giờ chứa API key.** Test tham số hoá qua **mọi** nhánh lỗi với key `"re_SECRET_VALUE"` rồi khẳng định chuỗi đó không xuất hiện.

**Cấu hình** — thêm vào `aiConfigSchema` và mirror ở `functions/src/ai/config.ts`, cùng `DEFAULT_AI_CONFIG` cả hai bên:
- `crisisEmailEnabled: boolean` — mặc định **`false`**.
- `crisisEmailFrom: string` — địa chỉ người gửi; rỗng hợp lệ (nghĩa là chưa cấu hình).

Comment giải thích **vì sao** nó nằm trong `aiConfig` dù không phải cấu hình AI: cảnh báo chỉ sinh ra từ chat, chat cần AI, và đặt ở đây thì dùng lại được test đồng bộ, ghi batch nguyên tử, rule, và trang admin đã có — thay vì tạo document thứ hai với rule riêng và đường ghi riêng.

**Schema cảnh báo** — thêm vào `crisisAlertSchema`:
- `emailStatus: "sent" | "failed" | "skipped" | null`
- `emailedAt: Date | null`

**Guard hiện có cấm field tên chứa `text|message|content|excerpt|summary`** — kiểm rằng hai field mới không vướng, và **giữ nguyên guard**, đừng nới nó.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `cd functions && npx vitest run src/email && npm run test:unit && npx tsc --noEmit` · `npx vitest run src/lib/types && npm run typecheck`
- [ ] **Step 6: Commit**

---

### Task 2: Trigger gửi mail khi có cảnh báo

**Files:** Create `functions/src/email/onCrisisAlertCreated.ts` + test · Modify `functions/src/index.ts`, `functions/package.json`

- [ ] **Step 1: Viết test thất bại**

Firestore trigger `onDocumentCreated("crisisAlerts/{alertId}")`, region `asia-southeast1`, secret `EXAMCALM_RESEND_API_KEY` khai báo qua `defineSecret` và trong `secrets: [...]`.

Đọc `functions/src/ai/sendChatMessage.ts` để theo cùng khuôn xử lý secret và sanitise lỗi.

Thứ tự và hành vi, mỗi mục một `it()`:

1. `crisisEmailEnabled` false → **không gọi mạng**, ghi `emailStatus: "skipped"`.
2. `crisisEmailFrom` rỗng → không gọi mạng, `"skipped"`.
3. Không có admin nào → không gọi mạng, `"skipped"`.
4. Đường thuận: gọi `sendEmail` **một lần** với `to` là **mọi** email admin, ghi `emailStatus: "sent"` và `emailedAt`.
5. **Người nhận lấy từ Firebase Auth theo custom claim `role === "admin"`**, không phải từ Firestore — `users/{uid}` không có trường email. Test giả `listUsers` của Auth và khẳng định chỉ admin được lấy, và tài khoản không có email bị bỏ qua.
6. `sendEmail` ném → ghi `emailStatus: "failed"`, **và trigger KHÔNG ném ra ngoài**. Cảnh báo đã ở Firestore rồi; ném ra chỉ tạo retry lặp và có thể spam.
7. **Thân mail chứa** biệt danh học sinh, lớp, trường, mức độ, thời điểm, và link tới `/admin/canh-bao`.
8. **Thân mail KHÔNG chứa** nội dung tin nhắn. Test dựng một cảnh báo rồi khẳng định thân mail không chứa bất kỳ chuỗi nào ngoài danh sách trường cho phép — dựng payload bằng **danh sách trường tường minh**, không spread.
9. Tiêu đề mail phân biệt được `urgent` với `concern` để lọc hộp thư được, nhưng **không** nêu tên học sinh ở tiêu đề — tiêu đề hiện trên màn hình khoá điện thoại.
10. Học sinh đã xoá tài khoản (không tra được `users/{uid}`) → vẫn gửi, dùng uid thô, `emailStatus: "sent"`.

**Nhớ:** file test này cần emulator → thêm vào danh sách loại trừ của `test:unit`.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `cd functions && npm test && npm run test:unit && npx tsc --noEmit && npm run build`
- [ ] **Step 6: Commit**

---

### Task 3: Admin nhìn thấy trạng thái mail + cấu hình + tài liệu

**Files:** Modify `src/lib/firestore/admin-crisis.ts` + test, `src/components/admin/CrisisAlertList.tsx` + test, `src/components/admin/AiConfigEditor.tsx` + test, `docs/ai-go-live-checklist.md`, `docs/ai-provider-setup.md`

- [ ] **Step 1: Viết test thất bại**

1. Dòng cảnh báo hiện trạng thái mail: **đã gửi / gửi hỏng / bỏ qua / chưa rõ**. "Gửi hỏng" phải nổi bật — nó nghĩa là **không ai được báo qua mail**, và thầy cô chỉ biết nếu tình cờ mở trang này.
2. `admin-crisis.ts` map hai field mới **tường minh**, `Timestamp → Date`; fixture test có field ngoài mô hình để guard `Object.keys` thật sự guard.
3. `AiConfigEditor` có ô bật/tắt `crisisEmailEnabled` và ô nhập `crisisEmailFrom`, nhãn nói rõ chiều. Trạng thái hiện bằng lời, và phân biệt "đang" với "sẽ sau khi lưu" — cùng khuôn các công tắc khác trong file.
4. **Không có ô nhập nào cho API key Resend.** Viết test **quét DOM thật** tìm input có `name`/`id`/`placeholder`/`aria-label`/**nhãn** chứa `key|secret|token` — nhớ rằng file này dán nhãn bằng `<label><span>`, nên quét thiếu nhãn là guard vô dụng (bài học Spec #3 Task 12).
5. Trang hiện hướng dẫn đặt secret bằng CLI, nêu đúng tên `EXAMCALM_RESEND_API_KEY`.

**Tài liệu:**
- `docs/ai-provider-setup.md`: cách lấy API key Resend, cách đặt secret, cách xoay key, và **cách tắt khẩn cấp**.
- `docs/ai-go-live-checklist.md` mục 9 ("Ai nhận cảnh báo") — cập nhật: giờ **mọi admin nhận mail tự động**. Nhưng mục này **vẫn chặn**, vì câu hỏi thật là *trong bao lâu phải phản hồi* và *ai chịu trách nhiệm nếu người đó nghỉ* — mail không trả lời được câu đó. Thêm một mục kiểm: gửi thử một cảnh báo trên production và xác nhận mail thật sự tới hộp thư.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npx vitest run && npm run typecheck && npm run build` · `cd functions && npm test && npx tsc --noEmit`
- [ ] **Step 6: Commit**
