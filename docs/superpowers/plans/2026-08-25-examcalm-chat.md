# ExamCalm Spec #4 — Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học sinh trò chuyện được với mèo, AI nhớ những gì em đã nói **với nó** trong các lần trước, và nếu em nói điều khiến lo cho an toàn của em thì thầy cô được báo — và em biết trước điều đó.

**Architecture:** Dùng lại gần như toàn bộ Spec #3. `callChatCompletion` đã nhận mảng `messages` nên bản thân nó không cần sửa. Điểm mới là **lưu hội thoại**, **cửa sổ trượt có trần**, và **đường xử lý khủng hoảng hai lớp**.

**Tech Stack:** Next.js 16 · TypeScript strict · Tailwind 4 · Firebase (Firestore, Auth, Cloud Functions gen2 Node 22 `asia-southeast1`, Secret Manager) · Zod 4 · Vitest + Testing Library · `@firebase/rules-unit-testing` · Playwright

**Spec:** `docs/superpowers/specs/2026-08-25-examcalm-chat-design.md`

## Global Constraints

Mọi ràng buộc của Spec #1, #2, #3 vẫn áp dụng. Nhắc lại những cái đã bị vi phạm nhiều lần trong dự án này, cộng cái mới:

- UI tiếng Việt; tên file/biến/hàm tiếng Anh; comment tiếng Việt.
- TypeScript `strict`, `noUncheckedIndexedAccess`. Không `any` nếu không có comment giải thích.
- Không cài thư viện i18n. Dùng `Intl` cho ngày/số.
- Output test phải sạch — không cảnh báo.
- **`await ensureAuthReady()` ở dòng đầu mọi hàm client chạm Firestore hoặc callable — kể cả đọc và xoá.** Race này đã bị phát hiện lại **hơn mười lần** qua ba spec. Mỗi hàm một test, và test phải khẳng định **thứ tự** (`invocationCallOrder`), không chỉ khẳng định "đã được gọi".
- **Không bao giờ `{...(d.data() as T)}`** — liệt kê từng field tường minh. Đã làm sập production một lần. Và fixture test phải chứa **một field ngoài mô hình**, nếu không guard `Object.keys` không guard được gì (bài học Task 9 Spec #3).
- Sửa `firestore.rules` thì **phải sửa `firestore.prod.rules` giống hệt**.
- **Rule mới phải trace qua MỌI khối match có thể khớp.** Firestore OR mọi grant khớp; một khối wildcard có thể vô hiệu hoá rule hẹp mà không ai thấy. Đã xảy ra hai lần ở Spec #3.
- **Mọi collection chứa dữ liệu cá nhân phải vào `collectDeletionTargets()`.** Sổ này đã bị quên ba lần. Test suy ra danh sách từ `firestore.rules` sẽ bắt được — đừng chờ nó bắt, hãy nhớ.
- Trang public đọc Firestore dùng `export const dynamic = "force-dynamic"`.
- `firebase-admin` không bao giờ lọt vào code client.
- Không tạo chuỗi ngày, nhắc nhở, hay đếm ngày liên tiếp.
- Viết test thất bại TRƯỚC, chạy, xác nhận đỏ đúng lý do, rồi mới code. **Một test chưa từng thấy đỏ chưa phải bằng chứng.**
- Agent được phép `git commit`. Không `git push`, không deploy.

### Ràng buộc riêng của spec này

- **Không đường nào ghi `chatMessages` từ client** — kể cả tin của chính học sinh. Mọi tin phải đi qua callable để không có tin nào vào DB mà chưa qua lớp phát hiện khủng hoảng.
- **`crisisAlerts` không bao giờ chứa nguyên văn, trích đoạn, hay tóm tắt.** Chỉ `userId`, `severity`, `triggeredBy`, thời điểm, trạng thái xử lý.
- **Bắt được ở lớp từ khoá thì KHÔNG gọi model.** Không có lý do gửi câu đó ra provider.
- **Phản hồi khủng hoảng không tính quota.**
- **AI không được giả vờ là người và không được hứa giữ bí mật.**

---

### Task 1: Kiểu dữ liệu và schema cho chat

**Files:** Create `src/lib/types/chat.ts` + test

**Produces:** `chatSessionSchema`, `chatMessageSchema`, `crisisAlertSchema`, `CHAT_WINDOW_SIZE`, `CHAT_MESSAGE_MAX_CHARS`

- [ ] **Step 1: Viết test thất bại**

1. `chatMessageSchema` bắt buộc `role` là `"user" | "assistant"`, `text` không rỗng.
2. `text` có trần ký tự (hằng số export, đề xuất 2000) — dài hơn thì từ chối.
3. `crisisAlertSchema` có đúng các field: `userId`, `severity`, `triggeredBy`, `createdAt`, `handledBy`, `handledAt`. **Test đọc `Object.keys(crisisAlertSchema.shape)` và khẳng định không có field nào tên chứa `text`, `message`, `content`, `excerpt`, `summary`** — chốt chặn ngăn ai đó "tiện tay" thêm nguyên văn vào cảnh báo sau này. Đây là guard load-bearing, không phải trang trí.
4. `severity` nhận `"urgent" | "concern"`; `triggeredBy` nhận `"keyword" | "model" | "both"`.
5. `CHAT_WINDOW_SIZE` là số nguyên dương — số lượt gửi lại mỗi lần.
6. Thêm `chatQuotaPerDay` vào `aiConfigSchema` (mặc định 30) **và** mirror ở `functions/src/ai/config.ts`. Test đồng bộ schema có sẵn sẽ bắt nếu quên một bên.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npx vitest run src/lib/types && npm run typecheck`
- [ ] **Step 6: Commit**

---

### Task 2: Security Rules cho chat và cảnh báo

**Files:** Modify `firestore.rules`, `firestore.prod.rules` · Test `tests/rules/chat.test.ts`

- [ ] **Step 1: Viết test thất bại**

**`chatSessions`:** chủ sở hữu tạo/đọc/xoá được; người khác không; **admin không đọc được**; `update` từ client bị từ chối.

**`chatMessages`:** chủ sở hữu đọc/xoá được; người khác không; **admin không đọc được**; **`create` bị từ chối kể cả khi `userId` khớp chính mình** — mọi tin phải qua callable; `update` bị từ chối.

**`crisisAlerts`:** admin đọc được; học sinh **không** đọc được (kể cả cảnh báo về chính mình — em đã được báo trực tiếp trong chat rồi, đọc bản ghi quản trị không thêm gì); không ai `create`/`delete` từ client; admin `update` được **chỉ** `handledBy` + `handledAt`, ràng buộc bằng `diff().affectedKeys().hasOnly([...])` — không phải ghim từng field, bài học Critical của Spec #3 Task 2.

**Trace shadowing:** sau khi viết rule, trace `chatMessages/{id}` và `crisisAlerts/{id}` qua **mọi** khối match trong file, gồm cả `match /{document=**}`, và ghi kết quả vào report. Rule hẹp bị wildcard OR đè lên đã xảy ra hai lần ở Spec #3.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npm run test:rules`
- [ ] **Step 6: Commit**

---

### Task 3: Bộ phát hiện khủng hoảng theo từ khoá (thuần)

**Files:** Create `functions/src/ai/crisisDetector.ts` + test

**Produces:** `detectCrisisKeywords(text): { detected: boolean; severity: "urgent" | "concern" | null; matched: string | null }`

Module thuần, không Firebase. Đọc `functions/src/ai/safetyFilter.ts` để theo đúng khuôn: chuẩn hoá NFC, không phân biệt hoa thường, khoảng trắng linh hoạt trong cụm nhiều từ, `escapeRegExp`.

- [ ] **Step 1: Viết test thất bại**

1. Văn bản trò chuyện bình thường về áp lực thi → `detected: false`.
2. Cụm biểu đạt ý định tự hại trực tiếp → `detected: true`, `severity: "urgent"`.
3. Cụm biểu đạt tuyệt vọng nhưng chưa có ý định → `detected: true`, `severity: "concern"`.
4. NFC/NFD cho cùng một cụm đều bắt được — test dựng bằng `.normalize("NFD")` tường minh.
5. Hoa/thường, khoảng trắng thừa, xuống dòng giữa cụm đều bắt được.
6. `matched` nêu được cụm nào kích hoạt (để admin hiệu chỉnh danh sách, **không** để ghi vào cảnh báo).
7. Chuỗi rỗng → `detected: false`.

**Danh sách từ khoá đặt trong hằng số có tên, comment tiếng Việt giải thích chiều sai lầm được chọn:** thà báo nhầm còn hơn bỏ sót. Báo nhầm là thầy cô hỏi thăm một em đang ổn; bỏ sót là một đứa trẻ gặp nguy mà không ai biết.

**Nội dung danh sách cần chuyên gia tâm lý duyệt** — ghi rõ điều đó trong comment đầu file, và ghi vào checklist go-live.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `cd functions && npx vitest run src/ai/crisisDetector.test.ts`
- [ ] **Step 6: Commit**

---

### Task 4: Dựng prompt hội thoại (thuần)

**Files:** Create `functions/src/ai/buildChatPrompt.ts` + test

**Produces:** `buildChatMessages(history, newText, template)`, `DEFAULT_CHAT_TEMPLATE`, `CRISIS_REPLY_TEXT`

Đọc `functions/src/ai/buildPrompt.ts` trước — nó đã giải quyết chống chèn prompt, khử ký tự phân giới bằng sentinel rời ký tự, cắt theo code point, và trần vùng dữ liệu. **Dùng lại những cơ chế đó**, đừng phát minh lại.

- [ ] **Step 1: Viết test thất bại**

1. Trả về mảng `messages` mở đầu bằng `role: "system"`, sau đó các lượt theo đúng thứ tự thời gian, kết thúc bằng tin mới của học sinh.
2. Chỉ lấy `CHAT_WINDOW_SIZE` lượt gần nhất — lịch sử dài hơn thì cắt phần cũ, **không** cắt tin mới.
3. **Không định danh nào lọt vào bất kỳ message nào.** Truyền history có `userId`, `email`, `displayName` và khẳng định không xuất hiện. Chỉ pass được nếu dựng bằng danh sách trường tường minh.
4. Nội dung học sinh bị khử ký tự phân giới, kể cả khi cố ghép chuỗi lồng nhau.
5. System prompt yêu cầu: ngôn ngữ phỏng đoán, cấm ngôn ngữ chẩn đoán (dùng lại `BANNED_DIAGNOSTIC_KEYWORDS`), **không giả vờ là người**, **không hứa giữ bí mật**, và không nhắc lại chính các từ bị cấm.
6. System prompt yêu cầu model trả kèm nhãn mức độ lo ngại (lớp 2 của phát hiện khủng hoảng).
7. `CRISIS_REPLY_TEXT` có Tổng đài 111, khuyên nói với người lớn ngay, và **không** cố tư vấn tiếp.
8. Tin quá dài bị cắt theo code point, không tạo surrogate mồ côi.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `cd functions && npx vitest run src/ai/buildChatPrompt.test.ts`
- [ ] **Step 6: Commit**

---

### Task 5: Callable `sendChatMessage`

**Files:** Create `functions/src/ai/sendChatMessage.ts` · Modify `functions/src/index.ts` · Test

Đọc `functions/src/ai/generateReflection.ts` — ráp cùng khuôn, cùng thứ tự guard, cùng cách xử lý secret.

- [ ] **Step 1: Viết test thất bại**

Thứ tự bắt buộc, mỗi bước một `it()`:

1. Chưa đăng nhập → `unauthenticated`.
2. Email chưa xác thực → `permission-denied`, `details: { reason: "email_unverified" }`.
3. Kill switch bật → `failed-precondition`, **`callChatCompletion` KHÔNG được gọi**.
4. `baseUrl` rỗng → `failed-precondition`, không gọi mạng.
5. `aiOptIn` tắt → `permission-denied`, `details: { reason: "ai_opt_in" }`, **không gọi mạng**.
6. Session không tồn tại → `not-found`. Session của người khác → `permission-denied`, **không** `details`.
7. **Lớp 1 bắt được → ghi `crisisAlerts`, ghi tin học sinh + `CRISIS_REPLY_TEXT` vào `chatMessages`, KHÔNG gọi `callChatCompletion`, KHÔNG trừ quota.** Test khẳng định cả bốn.
8. Hết quota → `resource-exhausted`, không gọi mạng.
9. Đường thuận: ghi tin học sinh, gọi model, lọc an toàn, ghi tin trợ lý, cập nhật `lastMessageAt`/`messageCount`.
10. **Lớp 2 bắt được (model trả nhãn lo ngại) → vẫn ghi `crisisAlerts`**, và tin trợ lý là `CRISIS_REPLY_TEXT` chứ không phải nội dung model sinh ra.
11. `checkOutputSafety` báo không an toàn → không ghi tin trợ lý, ghi `aiSafetyLog`, ném `internal` với thông điệp trung tính.
12. Lỗi provider → `internal`, **không lộ `baseUrl`, model, hay nguyên văn lỗi provider**. Test tiêm lỗi có chứa cả ba rồi khẳng định cả ba không xuất hiện.
13. **`crisisAlerts` được ghi KHÔNG có field nào chứa nguyên văn.** Test khẳng định `Object.keys()` đúng bằng danh sách cho phép.
14. Quota chỉ bị trừ khi thật sự phát ra request tới provider.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `cd functions && npm test && npx tsc --noEmit && npm run build`

**Nhớ:** file test này cần emulator → thêm vào danh sách loại trừ của `test:unit` trong `functions/package.json`.

- [ ] **Step 6: Commit**

---

### Task 6: Lớp client cho chat

**Files:** Create `src/lib/firestore/chat.ts` + test · Modify `src/lib/firebase/functions-client.ts`

**Produces:** `startChatSession(uid)`, `sendMessage(sessionId, text)`, `listMessages(uid, sessionId)`, `listMySessions(uid)`, `deleteMessage(id)`, `deleteSession(uid, sessionId)`

- [ ] **Step 1: Viết test thất bại**

1. **Mọi hàm** gọi `ensureAuthReady()` trước lời gọi đầu tiên — một test mỗi hàm, khẳng định **thứ tự**.
2. Map field tường minh; `createdAt` `Timestamp → Date`, không phải Timestamp thì `null`.
3. Guard `Object.keys(result).sort()` — **fixture phải chứa một field ngoài mô hình**, nếu không guard không guard được gì.
4. `deleteSession` xoá cả tin nhắn thuộc session, theo lô, xử lý đúng khi > 500 document.
5. Mã lỗi callable map sang tiếng Việt tử tế; hết quota **không** dùng từ "lỗi" và không hàm ý em làm sai.
6. Không mã lỗi Firebase thô nào tới học sinh trên bất kỳ đường nào.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npx vitest run src/lib/firestore/chat.test.ts && npm run typecheck`
- [ ] **Step 6: Commit**

---

### Task 7: Giao diện chat

**Files:** Create `src/components/chat/ChatWindow.tsx` + test, `src/app/(student)/tro-chuyen/page.tsx`

- [ ] **Step 1: Viết test thất bại**

1. `aiOptIn` tắt → không render ô chat, **không gọi callable**; chỉ dẫn tới trang Hồ sơ.
2. **Trước tin nhắn đầu tiên, hiển thị rõ ràng: nhãn "Nội dung do AI tạo" VÀ câu về cảnh báo an toàn** — "Nếu em nói điều gì khiến chúng tôi lo cho sự an toàn của em, thầy cô sẽ được báo để giúp em." Test riêng cho câu này, và nó phải là text thật, không phải tooltip.
3. Gửi tin → hiện tin của mình ngay, trạng thái đang chờ, rồi tin trả lời.
4. Lỗi → thông báo nhẹ nhàng, tin đã gửi **không** biến mất.
5. Hết quota → thông điệp riêng, tử tế, không dùng từ "lỗi".
6. Phản hồi khủng hoảng hiển thị **nổi bật**, có số 111 **bấm gọi được** (`tel:` link), khác biệt rõ với tin thường.
7. Xoá được từng tin và cả hội thoại, có xác nhận.
8. Bàn phím dùng được: ô nhập có nhãn, gửi bằng Enter, vùng tin nhắn là live region để trình đọc màn hình biết có tin mới.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npx vitest run src/components/chat && npm run typecheck`
- [ ] **Step 6: Commit**

---

### Task 8: Sửa câu chữ đồng ý cho khớp sự thật

**Files:** Modify `src/components/settings/AiConsentSection.tsx` + test; rà mọi nơi hứa về quyền riêng tư

- [ ] **Step 1: Viết test thất bại**

1. Hộp thoại đồng ý nêu **cả hai**: ghi chú gửi tới `providerLabel`, **và** có đường cảnh báo an toàn tới thầy cô.
2. **Không màn hình nào còn nói thầy cô không đọc được gì của em một cách tuyệt đối.** Grep toàn `src/` tìm các câu hứa riêng tư và đối chiếu; liệt kê trong report từng câu đã rà và kết luận.
3. Test có sẵn của Spec #3 pass — sửa câu chữ thì sửa cả test tương ứng, và **nói rõ trong report** test nào đã sửa và vì sao.

**Vì sao task này tồn tại:** dự án đã hai lần phải sửa đúng loại lỗi này — chữ hứa admin không xem được bài test trong khi rule cho xem, và `providerLabel` cứng trong code. Không tạo lần thứ ba.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npx vitest run && npm run typecheck`
- [ ] **Step 6: Commit**

---

### Task 9: Trang admin xem cảnh báo

**Files:** Create `src/app/(admin)/admin/canh-bao/page.tsx`, `src/components/admin/CrisisAlertList.tsx` + test, `src/lib/firestore/admin-crisis.ts` + test · Modify điều hướng admin

- [ ] **Step 1: Viết test thất bại**

1. Liệt kê cảnh báo **chưa xử lý trước**, mới nhất trên cùng.
2. Mỗi dòng hiện `severity`, thời điểm, và định danh học sinh đủ để thầy cô tìm được em — **không có nguyên văn, không trích đoạn**. Test khẳng định trang không render field nào ngoài danh sách cho phép.
3. Đánh dấu đã xử lý → ghi `handledBy` + `handledAt`, không ghi gì khác.
4. Người không phải admin bị chặn.
5. `ensureAuthReady` trước mọi đọc/ghi, có test thứ tự.
6. **Trang nói rõ việc cần làm là ĐI GẶP học sinh**, không phải đọc hồ sơ — một câu hướng dẫn ngắn ở đầu trang.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** `npx vitest run src/components/admin && npm run typecheck && npm run build`
- [ ] **Step 6: Commit**

---

### Task 10: Cascade xoá, E2E, tài liệu, tự soát

**Files:** Modify `functions/src/admin/deleteUserData.logic.ts` + `deleteUserData.ts` · Create `tests/e2e/chat.spec.ts` · Modify `docs/ai-go-live-checklist.md`, `docs/ai-provider-setup.md`, README

- [ ] **Step 1: Viết test thất bại**

**Cascade xoá:** thêm `chatSessions`, `chatMessages`, và `crisisAlerts` vào `collectDeletionTargets()`. Test suy-ra-từ-rules của Spec #3 sẽ đỏ nếu quên — chạy nó **trước** khi sửa để thấy nó bắt được, rồi mới sửa. Ghi cả hai lần chạy vào report.

**E2E:** học sinh chưa bật AI → không thấy trang trò chuyện hoặc thấy chỉ dẫn bật; học sinh đã bật → gửi được tin và thấy câu cảnh báo an toàn trước khi gõ.

**Tự soát bằng grep**, mỗi lệnh phải ra rỗng:

```bash
rg -n "messageText|excerpt|snippet" src/lib/types/chat.ts functions/src/ai/sendChatMessage.ts
rg -n "\.\.\.\(?\w*\.data\(\)" src/lib/firestore/chat.ts
```

**Checklist go-live** thêm ba mục chặn:
- **Ai nhận cảnh báo, và trong bao lâu phải phản hồi?** Cảnh báo mà đằng sau không có người thì tệ hơn không có — nó vừa hứa với học sinh một điều nó không giữ.
- Chuyên gia tâm lý duyệt danh sách từ khoá khủng hoảng **và** câu chữ `CRISIS_REPLY_TEXT`.
- Quyết `crisisAlerts` có xoá theo tài khoản không — mặc định spec là **có**; nếu nhà trường cần lưu thì đó là quyết định có ý thức.

- [ ] **Step 2–4:** như thường lệ
- [ ] **Step 5:** chạy tất cả

```bash
npx vitest run && npm run typecheck && npm run build
cd functions && npm test && npm run test:unit && npx tsc --noEmit && npm run build && cd ..
npm run test:rules && npm run test:e2e
```

- [ ] **Step 6: Commit**
