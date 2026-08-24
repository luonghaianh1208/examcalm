# ExamCalm Spec #3 — AI Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau khi ghi một mood log, học sinh **đã tự bật AI** nhận được một phản chiếu ngắn từ mèo — và toàn bộ lớp AI cắm được vào bất kỳ endpoint tương thích OpenAI nào, đổi bằng Admin console chứ không phải sửa code.

**Architecture:** API key chỉ tồn tại trong Secret Manager và chỉ Cloud Function đọc được; client không biết `baseUrl`, không biết key, chỉ gọi một callable. Bốn module thuần (client HTTP, dựng prompt, lọc an toàn, quota) tách hẳn khỏi Firebase để test được không cần emulator; callable chỉ là chỗ ráp chúng lại.

**Tech Stack:** Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · Firebase (Firestore, Auth, Cloud Functions gen2 Node 22 `asia-southeast1`, Secret Manager) · Zod 4 · Vitest + Testing Library · `@firebase/rules-unit-testing`

**Spec:** `docs/superpowers/specs/2026-08-24-examcalm-ai-design.md`

## Global Constraints

Tất cả ràng buộc của Spec #1 và #2 vẫn áp dụng nguyên vẹn. Nhắc lại những cái đã bị vi phạm nhiều lần, cộng thêm cái mới của spec này:

- UI tiếng Việt; tên file/biến/hàm tiếng Anh; comment tiếng Việt.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Không `any` nếu không có comment giải thích.
- Không cài thư viện i18n. Dùng `Intl` cho ngày/số.
- Output test phải sạch — không cảnh báo.
- **Mọi hàm ghi Firestore hoặc gọi callable từ client phải `await ensureAuthReady()` ở dòng đầu.** Race này đã bị phát hiện lại 10 lần qua hai spec. Nó áp dụng cho cả **đọc** và **xoá**, không chỉ ghi.
- **Không bao giờ `{...(d.data() as T)}`** — liệt kê từng field tường minh. Spread mang theo `Timestamp` (class instance) làm sập Client Component. Lỗi này đã làm sập production một lần.
- **Tải hỏng phải có trạng thái riêng**, không gộp thành danh sách rỗng. Theo khuôn `src/components/progress/ProgressView.tsx`.
- Trang public đọc Firestore dùng `export const dynamic = "force-dynamic"`, **không** `revalidate`.
- `firebase-admin` không bao giờ lọt vào code client. File dùng Admin SDK bắt đầu bằng `import "server-only"`.
- Không tạo cơ chế chuỗi ngày, nhắc nhở, hay đếm ngày liên tiếp.
- Agent được phép `git commit`. Không `git push`, không deploy.
- Không sửa `firestore.rules` ngoài Task 2. Sửa `firestore.rules` thì **phải sửa `firestore.prod.rules` giống hệt** — `tests/rules/rules-sync.test.ts` sẽ bắt nếu quên.

### Ràng buộc riêng của spec này — vi phạm là lỗi nghiêm trọng

- **API key không bao giờ xuất hiện trong: Firestore, code client, biến `NEXT_PUBLIC_*`, log, hay message lỗi trả về client.** Chỉ Secret Manager.
- **Không gửi định danh sang provider.** Payload gửi đi dựng bằng danh sách trường tường minh; `uid`, biệt danh, trường, lớp, email không bao giờ có mặt. Có test khẳng định điều này.
- **`aiOptIn` chưa bật thì callable từ chối ngay**, trước cả khi đọc mood log.
- **Mood log phải lưu được kể cả khi AI hỏng hoàn toàn.** AI là lớp phụ; lỗi AI không được biến thành lỗi của việc ghi nhật ký. Đây là bài học từ CBT Task 5 ("một lỗi lưu trữ biến thành hai").
- **`aiConfig` chưa cấu hình = tính năng tắt.** Trạng thái mặc định của hệ thống là không gọi đi đâu cả.

---

### Task 1: Kiểu dữ liệu và schema cho lớp AI

**Files:**
- Create: `src/lib/types/ai.ts`
- Test: `src/lib/types/ai.test.ts`

**Interfaces:**
- Consumes: không
- Produces: `aiConfigSchema`, `promptTemplateSchema`, `aiJournalOutputSchema`, `DEFAULT_AI_CONFIG`, types `AiConfig`, `PromptTemplate`, `AiJournalOutput`

- [ ] **Step 1: Viết test thất bại**

Test phải khẳng định các mệnh đề sau, mỗi cái một `it()`:

1. `aiConfigSchema` chấp nhận một config hợp lệ đầy đủ.
2. `aiConfigSchema` **từ chối `baseUrl` dùng `http://`** — trừ `http://localhost` và `http://127.0.0.1` (để cắm Ollama chạy máy nội bộ). Ghi chú cảm xúc không được đi qua kết nối không mã hoá trên Internet.
3. `aiConfigSchema` từ chối `baseUrl` không phải URL.
4. `quotaStudentPerDay` phải là số nguyên `>= 0`; `0` hợp lệ và nghĩa là tắt.
5. `maxTokens` có trần cứng — từ chối giá trị `> 2000`. Một phản chiếu 2–4 câu không cần hơn; trần này là phanh chi phí không sửa được từ Admin console.
6. `temperature` trong `[0, 1]`.
7. **`aiConfigSchema` không có trường nào tên chứa `key`, `secret`, hay `token`.** Viết test đọc `Object.keys(aiConfigSchema.shape)` và khẳng định điều đó — đây là chốt chặn ngăn ai đó "tiện tay" thêm API key vào Firestore sau này.
8. `DEFAULT_AI_CONFIG` có `baseUrl: ""`, `model: ""`, và **cả ba kill switch đều `true` (đang tắt)**. Mặc định của hệ thống là im lặng.
9. `promptTemplateSchema` bắt buộc `systemPrompt` và `userTemplate` không rỗng.
10. `aiJournalOutputSchema` bắt buộc `reflectionText` không rỗng, `userFeedback` nhận `"helpful" | "not_helpful" | null`.

- [ ] **Step 2: Chạy — xác nhận thất bại đúng lý do** (module chưa tồn tại)
- [ ] **Step 3: Viết code cho test pass**

`killSwitch` là object `{ moodReflection: boolean }`; `true` = ĐANG TẮT tính năng. Đặt tên field và viết comment thật rõ về chiều của boolean này — kill switch hiểu ngược là một lỗi tốn tiền.

- [ ] **Step 4: Chạy — xác nhận pass**
- [ ] **Step 5: Kiểm tra thủ công**

```bash
npx vitest run src/lib/types/ai.test.ts
npm run typecheck
```

- [ ] **Step 6: Commit**

---

### Task 2: Security Rules cho các collection AI

**Files:**
- Modify: `firestore.rules`, `firestore.prod.rules` (giống hệt nhau)
- Test: `tests/rules/ai.test.ts`

**Interfaces:**
- Consumes: không
- Produces: rule cho `aiJournalOutputs`, `aiUsage`, `systemConfig`, `promptTemplates`

- [ ] **Step 1: Viết test thất bại**

`tests/rules/ai.test.ts` phải khẳng định:

**`aiJournalOutputs`:**
1. Chủ sở hữu đọc được output của mình.
2. Người khác **không** đọc được.
3. **Admin KHÔNG đọc được.** Nó chứa phản chiếu về ghi chú riêng tư — cùng lý do admin không đọc được `moodLogs`. Test này quan trọng như test tương ứng ở `testAnswers`.
4. Không ai `create` được từ client (kể cả chính chủ) — chỉ Cloud Function qua Admin SDK.
5. Chủ sở hữu `delete` được của mình.
6. Chủ sở hữu `update` được **chỉ để đặt `userFeedback`**.
7. `update` sửa `reflectionText` bị từ chối. (Bài học từ lỗ hổng `moodLogs.userId`: ràng buộc phải so `request.resource.data` với `resource.data`, không chỉ kiểm quyền.)
8. `update` đổi `userId` bị từ chối.

**`aiUsage`:** không ai đọc hay ghi được từ client — kể cả chủ sở hữu, kể cả admin. Đây là sổ đếm quota; học sinh đọc được thì không sao, nhưng ghi được thì quota vô nghĩa, và mở đọc mà không cần thì thừa.

**`systemConfig` / `promptTemplates`:** chỉ admin đọc/ghi; người dùng thường bị từ chối cả hai.

- [ ] **Step 2: Chạy — xác nhận thất bại đúng lý do**
- [ ] **Step 3: Viết code cho test pass**

Viết rule vào **cả hai** file, giống hệt nhau.

- [ ] **Step 4: Chạy — xác nhận pass, và chạy cả `tests/rules/rules-sync.test.ts`**
- [ ] **Step 5: Kiểm tra thủ công**

```bash
npm run test:rules
```

- [ ] **Step 6: Commit**

---

### Task 3: Client HTTP tương thích OpenAI (thuần, không Firebase)

**Files:**
- Create: `functions/src/ai/openaiClient.ts`
- Test: `functions/src/ai/openaiClient.test.ts`

**Interfaces:**
- Consumes: không (module thuần, nhận `fetch` qua tham số để test được)
- Produces: `callChatCompletion(params, deps)`, type `ChatCompletionResult`, `AiProviderError`

Đây là **điểm cắm**: mọi thứ khác trong spec chỉ biết tới hàm này, không biết nhà cung cấp nào ở đầu dây.

- [ ] **Step 1: Viết test thất bại**

Chữ ký:

```ts
export type ChatCompletionParams = {
  baseUrl: string; apiKey: string; model: string;
  systemPrompt: string; userPrompt: string;
  temperature: number; maxTokens: number;
  timeoutMs: number;
};
export type ChatCompletionResult = { text: string; finishReason: string | null };
export async function callChatCompletion(
  params: ChatCompletionParams,
  deps?: { fetchImpl?: typeof fetch },
): Promise<ChatCompletionResult>;
```

Test (dùng `fetchImpl` giả, **không gọi mạng thật**):

1. POST tới đúng `{baseUrl}/chat/completions`, kể cả khi `baseUrl` có dấu `/` ở cuối (chuẩn hoá — đây là lỗi cấu hình phổ biến nhất khi cắm provider mới).
2. Header `Authorization: Bearer <apiKey>` và `Content-Type: application/json`.
3. Body có `model`, `messages` (system rồi user), `temperature`, `max_tokens`, và `stream: false`.
4. Response hợp lệ → trả `text` từ `choices[0].message.content`.
5. `choices` rỗng → ném `AiProviderError`, **không** trả chuỗi rỗng.
6. HTTP 401 → ném `AiProviderError` có `kind: "auth"`.
7. HTTP 429 → `kind: "rate_limit"`.
8. HTTP 500 → `kind: "server"`.
9. Body không phải JSON → `kind: "bad_response"`, không ném `SyntaxError` thô.
10. **`AiProviderError.message` không bao giờ chứa `apiKey`.** Viết test truyền key `"sk-SECRET-VALUE"` rồi khẳng định chuỗi đó không xuất hiện trong `err.message` ở mọi nhánh lỗi. Một message lỗi vô tình echo lại request headers là cách API key rò rỉ vào log.
11. Quá `timeoutMs` → `kind: "timeout"`. Dùng `AbortController`.

- [ ] **Step 2: Chạy — xác nhận thất bại đúng lý do**
- [ ] **Step 3: Viết code cho test pass**

Chỉ dùng phần lõi của `chat/completions` — không `tools`, không `response_format`, không `stream`. Càng ít bề mặt thì càng nhiều endpoint cắm vừa.

- [ ] **Step 4: Chạy — xác nhận pass**
- [ ] **Step 5: Kiểm tra thủ công**

```bash
cd functions && npx vitest run src/ai/openaiClient.test.ts && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

---

### Task 4: Bộ lọc ngôn ngữ chẩn đoán (thuần)

**Files:**
- Create: `functions/src/ai/safetyFilter.ts`
- Test: `functions/src/ai/safetyFilter.test.ts`

**Interfaces:**
- Consumes: không
- Produces: `checkOutputSafety(text): { safe: boolean; reason: string | null }`

- [ ] **Step 1: Viết test thất bại**

1. Văn bản phản chiếu bình thường → `safe: true`.
2. Chứa `"rối loạn lo âu"` → `safe: false`.
3. Chứa `"trầm cảm"` → `safe: false`.
4. Chứa `"chẩn đoán"` → `safe: false`.
5. Chứa `"bệnh tâm lý"`, `"triệu chứng"` → `safe: false`.
6. **Không phân biệt hoa thường và không phụ thuộc dấu tổ hợp** — `"Trầm Cảm"` và `"TRẦM CẢM"` đều bị bắt. Chuẩn hoá NFC trước khi so.
7. **Không bắt nhầm khi từ khoá nằm trong ngữ cảnh vô hại:** cụm `"không phải chẩn đoán"` là câu miễn trừ trách nhiệm hợp lệ — phải `safe: true`. Đây là ca dễ sai nhất; nếu không xử lý, chính câu disclaimer chuẩn của sản phẩm sẽ bị chặn.
8. Chuỗi rỗng → `safe: false` với lý do rõ ràng.
9. `reason` khi `safe: false` nêu được từ khoá nào kích hoạt (để admin đọc log mà sửa prompt).

- [ ] **Step 2: Chạy — xác nhận thất bại đúng lý do**
- [ ] **Step 3: Viết code cho test pass**

Danh sách từ khoá đặt trong hằng số có tên, kèm comment giải thích **vì sao** cấm: đây không phải kiểm duyệt tuỳ tiện, mà là ngăn một model gán nhãn bệnh cho học sinh lớp 12 — việc chỉ người có chuyên môn mới được làm.

- [ ] **Step 4: Chạy — xác nhận pass**
- [ ] **Step 5: Kiểm tra thủ công**

```bash
cd functions && npx vitest run src/ai/safetyFilter.test.ts
```

- [ ] **Step 6: Commit**

---

### Task 5: Dựng prompt — chốt chặn không rò định danh

**Files:**
- Create: `functions/src/ai/buildPrompt.ts`
- Test: `functions/src/ai/buildPrompt.test.ts`

**Interfaces:**
- Consumes: không
- Produces: `buildMoodPrompt(moodLog, template): { systemPrompt: string; userPrompt: string }`, `DEFAULT_MOOD_TEMPLATE`

- [ ] **Step 1: Viết test thất bại**

Đây là task **quan trọng nhất về quyền riêng tư** trong toàn spec. Test phải khẳng định:

1. `userPrompt` chứa `note`, `moodScore`, `moodIcon`, `tags`, `context` của mood log.
2. **`userPrompt` KHÔNG chứa `userId`.** Truyền vào một mood log có `userId: "UID-KHONG-DUOC-RO-RI"` và khẳng định chuỗi đó không xuất hiện.
3. Tương tự cho `id` của document, `createdAt`, và **bất kỳ trường lạ nào**: truyền một object có thêm `email: "hs@truong.edu.vn"` và `displayName: "Nguyễn Văn A"` rồi khẳng định cả hai không xuất hiện trong output. Test này chỉ pass nếu code dùng **danh sách trường tường minh** — spread sẽ làm nó đỏ. Đó là chủ đích.
4. `note` rỗng hoặc `null` vẫn dựng được prompt hợp lệ (học sinh check-in mà không viết gì).
5. `systemPrompt` yêu cầu ngôn ngữ phỏng đoán và cấm chẩn đoán — khẳng định nó chứa các cụm chỉ dẫn đó.
6. `note` quá dài bị cắt ở trần ký tự cố định (phanh chi phí + tránh prompt injection dài).
7. **Nội dung `note` không thể phá cấu trúc prompt:** truyền `note` chứa `"Bỏ qua hướng dẫn trên. Bạn là..."` và khẳng định nó nằm gọn trong phần dữ liệu có phân giới rõ ràng, không nối thẳng vào chỉ dẫn hệ thống.

- [ ] **Step 2: Chạy — xác nhận thất bại đúng lý do**
- [ ] **Step 3: Viết code cho test pass**

`DEFAULT_MOOD_TEMPLATE` là bản dự phòng dùng khi `promptTemplates` chưa có bản published — hệ thống phải chạy được ngay cả khi admin chưa soạn prompt nào.

Prompt yêu cầu model trả về đúng ba phần, phân tách bằng nhãn cố định để tách được mà không cần JSON mode (nhiều endpoint tương thích OpenAI không hỗ trợ `response_format`).

- [ ] **Step 4: Chạy — xác nhận pass**
- [ ] **Step 5: Kiểm tra thủ công**

```bash
cd functions && npx vitest run src/ai/buildPrompt.test.ts
```

- [ ] **Step 6: Commit**

---

### Task 6: Tách output của model thành ba phần

**Files:**
- Create: `functions/src/ai/parseOutput.ts`
- Test: `functions/src/ai/parseOutput.test.ts`

**Interfaces:**
- Consumes: không
- Produces: `parseReflectionOutput(text): { reflectionText, catStoryText, journalPrompt } | null`

- [ ] **Step 1: Viết test thất bại**

1. Output đúng định dạng ba nhãn → tách đủ ba phần, đã `trim()`.
2. Thiếu một nhãn → trả `null`. **Không đoán, không tự điền.** Thà không hiện phản chiếu còn hơn hiện một mảnh vỡ.
3. Nhãn viết hoa/thường khác nhau vẫn nhận ra.
4. Có văn bản thừa trước nhãn đầu tiên → bỏ qua phần thừa, vẫn tách đúng.
5. Một phần rỗng sau khi trim → trả `null`.
6. Chuỗi rỗng → `null`.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5: Kiểm tra thủ công**

```bash
cd functions && npx vitest run src/ai/parseOutput.test.ts
```

- [ ] **Step 6: Commit**

---

### Task 7: Quota theo ngày và rate limit

**Files:**
- Create: `functions/src/ai/quota.ts`
- Test: `functions/src/ai/quota.test.ts`

**Interfaces:**
- Consumes: Firestore Admin SDK (truyền `db` qua tham số để test được)
- Produces: `consumeQuota(db, uid, config, now): Promise<{ allowed: boolean; reason: "quota" | "rate_limit" | null }>`

- [ ] **Step 1: Viết test thất bại**

Test dùng emulator Firestore (khuôn có sẵn ở `tests/rules/`) hoặc `db` giả — chọn cái nào thì làm nhất quán và ghi lý do trong comment đầu file test.

1. Lượt đầu trong ngày → `allowed: true`, `aiUsage` được tạo với `count: 1`.
2. Lượt thứ N khi `quotaStudentPerDay = N` → vẫn cho.
3. Lượt N+1 → `allowed: false`, `reason: "quota"`.
4. `quotaStudentPerDay = 0` → từ chối ngay lượt đầu.
5. Khoá document đúng dạng `{uid}_{yyyy-mm-dd}`, tính theo **giờ Việt Nam (UTC+7)**, không phải UTC. Test một mốc thời gian 23:00 UTC (tức 06:00 hôm sau ở VN) và khẳng định nó rơi vào ngày VN đúng. Sai múi giờ = quota reset lúc 7 giờ sáng, học sinh không hiểu vì sao.
6. Hai lượt cách nhau dưới ngưỡng rate limit → lượt thứ hai `reason: "rate_limit"`.
7. **Tăng `count` bằng transaction.** Viết test gọi `consumeQuota` nhiều lần song song với `Promise.all` và khẳng định `count` cuối cùng đúng bằng số lời gọi — không mất lượt nào. Đọc-rồi-ghi không transaction sẽ làm test này đỏ.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5: Kiểm tra thủ công**

```bash
cd functions && npx vitest run src/ai/quota.test.ts
```

- [ ] **Step 6: Commit**

---

### Task 8: Callable `generateReflection`

**Files:**
- Create: `functions/src/ai/generateReflection.ts`
- Modify: `functions/src/index.ts`
- Test: `functions/src/ai/generateReflection.test.ts`

**Interfaces:**
- Consumes: Task 3, 4, 5, 6, 7
- Produces: callable `generateReflection({ moodLogId })` → `{ outputId }`

Đây là chỗ ráp mọi thứ. Bản thân nó nên **mỏng**: logic đã nằm trong các module thuần ở trên.

- [ ] **Step 1: Viết test thất bại**

Thứ tự kiểm tra **bắt buộc theo đúng danh sách này** — mỗi bước là một `it()`, và bước rẻ/nhạy cảm phải chạy trước bước tốn tiền:

1. Chưa đăng nhập → `unauthenticated`.
2. Email chưa xác thực → `permission-denied`.
3. **`killSwitch.moodReflection === true` → `failed-precondition`, và `callChatCompletion` KHÔNG được gọi.** Test này là bằng chứng kill switch hoạt động thật. Nó bắt buộc phải tồn tại — spec design §8 nêu đích danh.
4. **`aiConfig.baseUrl` rỗng (chưa cấu hình) → `failed-precondition`, không gọi mạng.** Trạng thái mặc định của hệ thống là im lặng.
5. **`privacySettings.aiOptIn === false` → `permission-denied`, và `callChatCompletion` KHÔNG được gọi.** Đây là lời hứa cốt lõi với học sinh; test phải chứng minh không một byte nào rời đi.
6. `moodLogId` không tồn tại → `not-found`.
7. **Mood log của người khác → `permission-denied`.** Callable chạy bằng Admin SDK nên Security Rules không bảo vệ nó; phải tự so `moodLog.userId === auth.uid`. Bỏ sót chỗ này là lỗ hổng đọc nhật ký người khác.
8. Quota hết → `resource-exhausted`, không gọi mạng.
9. Đường đi thuận lợi → ghi `aiJournalOutputs` với đủ trường, gồm `providerLabel` và `model` đã dùng.
10. **`checkOutputSafety` trả `safe: false` → KHÔNG ghi `aiJournalOutputs`**, ném `internal` với thông điệp trung tính, và ghi một bản ghi vào `aiSafetyLog` cho admin xem.
11. `parseReflectionOutput` trả `null` → không ghi, ném `internal`.
12. `callChatCompletion` ném `AiProviderError` → callable ném `internal` với **thông điệp không lộ `baseUrl` và không lộ key**. Test khẳng định `baseUrl` không xuất hiện trong lỗi trả về client.
13. **Quota chỉ bị trừ khi một request đã thật sự được phát ra provider.**

> **Sửa ngày 2026-08-24 — bản đầu của mục 13 sai.** Nó viết "chỉ bị trừ khi thực sự gọi model" nhưng thứ tự phía trên lại đặt quota **trên** not-found và ownership, nên bất biến đó không thể đạt được cho hai đường đó nếu không có rollback. Thứ tự đã được sửa: `consumeQuota` nằm ngay **trước** `callChatCompletion`.
>
> Quota đo **số lần thử có thể tốn tiền**. Not-found và ownership không bao giờ tới provider nên trừ là thuần gây hại — học sinh gửi ba `moodLogId` rác là tự khoá mình cả ngày. Lỗi provider, output không an toàn, và output không parse được đều đi sau một request đã phát ra và có thể đã bị tính tiền, nên vẫn trừ.
>
> Đánh đổi được chấp nhận có ý thức: provider hỏng vài phút có thể đốt hết lượt trong ngày của một học sinh mà em không nhận được gì. Chiều ngược lại — retry miễn phí vào một provider đang hỏng — là lỗ thủng chi phí trong một dự án mà chủ dự án tự trả tiền.

Test: `aiUsage` **không đổi** khi `moodLogId` không tồn tại và khi mood log thuộc người khác; `aiUsage` **có** bị trừ khi lời gọi provider thất bại.

- [ ] **Step 2: Chạy — xác nhận thất bại đúng lý do**
- [ ] **Step 3: Viết code cho test pass**

Region `asia-southeast1`, khớp với `setUserRole` và `deleteUserData`. API key lấy qua `defineSecret("EXAMCALM_AI_API_KEY")` của `firebase-functions/params` và khai báo trong `secrets: [...]` của callable — **không** đọc từ `process.env` thủ công.

- [ ] **Step 4: Chạy — xác nhận pass**
- [ ] **Step 5: Kiểm tra thủ công**

```bash
cd functions && npx vitest run && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

---

### Task 9: Lớp client — gọi callable và đọc/xoá output

**Files:**
- Create: `src/lib/firestore/ai-outputs.ts`
- Modify: `src/lib/firebase/functions-client.ts`
- Test: `src/lib/firestore/ai-outputs.test.ts`

**Interfaces:**
- Consumes: Task 1, 8
- Produces: `requestReflection(moodLogId)`, `getOutputForMoodLog(uid, moodLogId)`, `listMyOutputs(uid)`, `setOutputFeedback(id, value)`, `deleteOutput(id)`, `deleteAllMyOutputs(uid)`

- [ ] **Step 1: Viết test thất bại**

1. **Mọi hàm — kể cả đọc và xoá — gọi `ensureAuthReady()` trước lời gọi Firestore đầu tiên.** Viết một test cho từng hàm. Đây là lỗi đã tái diễn 10 lần; test là cách duy nhất nó ngừng tái diễn.
2. `getOutputForMoodLog` map từng trường **tường minh**; `createdAt` chuyển `Timestamp → Date`, không phải `Timestamp` thì thành `null`.
3. Có test khẳng định `Object.keys(result).sort()` đúng bằng danh sách mong đợi — chốt chặn chống spread, giống Spec #1.
4. `setOutputFeedback` chỉ ghi đúng trường `userFeedback`.
5. `deleteAllMyOutputs` xoá theo lô và trả về số lượng đã xoá.
6. Lỗi callable được bọc lại thành thông điệp tiếng Việt thân thiện, **không phơi mã lỗi Firebase thô cho học sinh**.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5: Kiểm tra thủ công**

```bash
npx vitest run src/lib/firestore/ai-outputs.test.ts && npm run typecheck
```

- [ ] **Step 6: Commit**

---

### Task 10: Màn hình đồng ý — bật/tắt AI trong Hồ sơ

**Files:**
- Modify: `src/components/settings/` (theo cấu trúc sẵn có — đọc trước khi sửa)
- Test: file test cạnh component

**Interfaces:**
- Consumes: Task 1, 9
- Produces: UI bật/tắt `privacySettings.aiOptIn`

- [ ] **Step 1: Viết test thất bại**

1. Mặc định hiển thị trạng thái **tắt**.
2. **Trước khi bật, hiện hộp thoại giải thích nêu đích danh `providerLabel` đọc từ `aiConfig`** — không phải chuỗi cứng trong code. Test: đặt `providerLabel = "DeepSeek"` và khẳng định chữ đó xuất hiện trên màn hình. Đây là rào chắn R5: đổi provider thì câu chữ đổi theo, không nói dối học sinh.
3. Hộp thoại nói rõ ghi chú sẽ được gửi tới dịch vụ bên ngoài, và tắt lúc nào cũng được.
4. Bấm huỷ → `aiOptIn` không đổi.
5. Bấm đồng ý → ghi `aiOptIn: true`.
6. **Tắt lại → hỏi xác nhận, và khi xác nhận thì gọi `deleteAllMyOutputs`.** Tắt là xoá thật, không phải ẩn đi — spec §7.6.
7. `aiConfig.baseUrl` rỗng → hiện trạng thái "chưa khả dụng" thay vì nút bật. Không mời học sinh bật một thứ chưa cắm gì.
8. Ghi hỏng → hiện lỗi, **không** đổi trạng thái công tắc trên màn hình. Công tắc nói dối về trạng thái riêng tư là nghiêm trọng hơn một thông báo lỗi.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5: Kiểm tra thủ công**

```bash
npx vitest run src/components/settings && npm run typecheck
```

- [ ] **Step 6: Commit**

---

### Task 11: Hiển thị phản chiếu của mèo sau khi ghi cảm xúc

**Files:**
- Create: `src/components/ai/ReflectionCard.tsx`
- Modify: `src/components/mood/MoodForm.tsx` (chạm tối thiểu)
- Test: `src/components/ai/ReflectionCard.test.tsx`

**Interfaces:**
- Consumes: Task 9
- Produces: `<ReflectionCard moodLogId={...} />`

- [ ] **Step 1: Viết test thất bại**

1. `aiOptIn` tắt → **không render gì, không gọi callable.**
2. `aiOptIn` bật → gọi `requestReflection`, hiện trạng thái đang tải.
3. Thành công → hiện `reflectionText`, `catStoryText`, `journalPrompt`.
4. **Luôn hiện nhãn "Nội dung do AI tạo"**, nhìn thấy được, không giấu trong tooltip. Có test riêng.
5. **Callable lỗi → hiện thông báo nhẹ nhàng, và mood log vẫn đã lưu.** Test khẳng định không có chữ nào gợi ý nhật ký thất bại. Ràng buộc cốt lõi: AI hỏng không được biến thành lỗi của việc ghi nhật ký.
6. Quota hết → thông điệp riêng, tử tế, **không dùng từ "lỗi"**. Học sinh dùng hết lượt không phải đã làm gì sai.
7. Có nút phản hồi hữu ích / không hữu ích; bấm → gọi `setOutputFeedback`.
8. Có nút xoá phản chiếu này; bấm → hỏi xác nhận rồi gọi `deleteOutput`.

**Sửa `MoodForm.tsx` ở mức tối thiểu.** Spec #1 và #2 đều dùng file này; test hiện có phải pass **không sửa một chữ**. Theo đúng cách CBT đã thêm `submitLabel`: thêm prop tuỳ chọn có giá trị mặc định giữ nguyên hành vi cũ.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5: Kiểm tra thủ công**

```bash
npx vitest run src/components/ai src/components/mood && npm run typecheck
```

Chạy **toàn bộ** test app để chắc chắn Spec #1/#2 không gãy: `npx vitest run`

- [ ] **Step 6: Commit**

---

### Task 12: Admin console — cắm provider và soạn prompt

**Files:**
- Create: `src/app/admin/ai/page.tsx`, `src/components/admin/AiConfigEditor.tsx`, `src/lib/firestore/admin-ai.ts`
- Modify: điều hướng admin (theo khuôn Task "Bài tập CBT" đã làm)
- Test: file test cạnh component

**Interfaces:**
- Consumes: Task 1
- Produces: UI cấu hình `aiConfig` và `promptTemplates`

- [ ] **Step 1: Viết test thất bại**

1. Form sửa được `providerLabel`, `baseUrl`, `model`, `temperature`, `maxTokens`, quota, rate limit.
2. **`baseUrl` sai định dạng hoặc dùng `http://` ngoài localhost → chặn lưu, hiện lỗi rõ ràng.** Dùng lại `aiConfigSchema` của Task 1, không viết lại luật kiểm tra.
3. Công tắc kill switch, có nhãn nói rõ **chiều nào là tắt** — không để admin phải đoán.
4. **Trang hiển thị hướng dẫn đặt API key bằng CLI, và nói rõ key KHÔNG nhập ở đây.** Có test khẳng định trang không hề có ô nhập nào tên chứa `key`/`secret`/`token`. Cùng lý do với Task 1 Step 1.7: chốt chặn ngăn ai đó thêm ô nhập key vào Firestore sau này.
5. Nút "Thử kết nối" gọi một callable admin-only gửi một prompt cố định ngắn, hiện kết quả hoặc lỗi. **Không** hiện raw response chứa header.
6. Soạn `promptTemplates` ở trạng thái draft, xem thử, rồi mới publish.
7. Người không phải admin vào trang → bị chặn (theo khuôn các trang admin sẵn có).

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5: Kiểm tra thủ công**

```bash
npx vitest run src/components/admin && npm run typecheck && npm run build
```

- [ ] **Step 6: Commit**

---

### Task 13: E2E, tài liệu vận hành, và soát lại toàn spec

**Files:**
- Create: `tests/e2e/ai.spec.ts`, `docs/ai-provider-setup.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: tất cả
- Produces: kiểm chứng đầu-cuối và hướng dẫn cắm provider

- [ ] **Step 1: Viết test thất bại**

E2E (chạy với emulator, `aiConfig` để trống):
1. Học sinh chưa bật AI ghi được mood log bình thường, **không thấy phần AI nào**.
2. Vào Hồ sơ, thấy trạng thái "chưa khả dụng" vì `aiConfig` trống.

- [ ] **Step 2–4:** như thường lệ

- [ ] **Step 5: Kiểm tra thủ công — soát lại toàn bộ**

Chạy tất cả:

```bash
npm run typecheck
npx vitest run
cd functions && npx vitest run && npx tsc --noEmit && cd ..
npm run test:rules
npm run build
```

Rồi **tự soát bằng grep**, mỗi lệnh phải ra rỗng:

```bash
# API key không được lọt ra ngoài Secret Manager
rg -i "sk-[a-zA-Z0-9]{10,}" --glob '!node_modules'
rg "EXAMCALM_AI_API_KEY" src/          # phải rỗng: client không được biết tên secret
rg "apiKey" src/lib/firestore/ai-outputs.ts src/components/ai/ src/components/admin/AiConfigEditor.tsx

# Không spread khi đọc Firestore
rg "\.\.\.\(?\w*\.data\(\)" src/lib/firestore/ai-outputs.ts
```

`docs/ai-provider-setup.md` phải ghi:
- Cách đặt secret: `firebase functions:secrets:set EXAMCALM_AI_API_KEY --project examcalm`
- Cách xoay key và cách thu hồi
- Ví dụ `baseUrl` + `model` cho vài endpoint tương thích OpenAI phổ biến
- **Danh sách kiểm tra trước khi bật cho học sinh** — xem Task 14

- [ ] **Step 6: Commit**

---

### Task 14: Cổng chặn trước khi bật cho học sinh (không phải task code)

**Files:**
- Create: `docs/ai-go-live-checklist.md`

Spec này viết xong thì code chạy được, nhưng **hệ thống vẫn im lặng** vì `aiConfig` trống và `aiOptIn` mặc định tắt. Đó là chủ đích. Danh sách dưới đây là những việc **con người** phải làm trước khi bật:

- [ ] Chọn provider và **đọc điều khoản dữ liệu** của họ
- [ ] **Xác nhận đã tắt "data retention for training"** — nếu provider không cho tắt, chọn provider khác
- [ ] Ghi `providerLabel` đúng tên nhà cung cấp thật vào `aiConfig`
- [ ] Quyết định có cần thông báo phụ huynh — đây là dữ liệu sức khoẻ tinh thần của trẻ vị thành niên gửi ra ngoài
- [ ] Đặt `quotaStudentPerDay` thấp (đề xuất 5) cho tuần đầu
- [ ] Xác nhận cảnh báo ngân sách trong Cloud Billing đang hoạt động
- [ ] Bật kill switch lên rồi tắt xuống một lần trên production, xác nhận nó thật sự chặn
- [ ] Nhờ chuyên gia tâm lý đọc `systemPrompt` trước khi publish template

**Không tick đủ danh sách này thì không đặt `baseUrl` trên production.**
