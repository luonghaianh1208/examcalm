# Danh sách kiểm tra trước khi bật AI cho học sinh

**Dành cho ai:** thầy/cô phụ trách ExamCalm — không cần là dân kỹ thuật, không cần là luật
sư. Bạn chỉ cần đọc kỹ và làm đúng từng mục dưới đây, theo đúng thứ tự.

**Vì sao tài liệu này quan trọng:** ExamCalm mặc định ship ở trạng thái **im lặng hoàn
toàn** — chưa cấu hình provider nào, và học sinh mặc định CHƯA đồng ý dùng AI. Hệ thống
được cố tình thiết kế như vậy, vì đây là ghi chú cảm xúc riêng tư của học sinh vị thành niên
— một khi bạn bật, ghi chú đó sẽ được gửi ra một dịch vụ AI bên ngoài trường. Danh sách này
là **cổng chặn cuối cùng do con người xác nhận**, không phải thủ tục giấy tờ.

> ## QUY TẮC DUY NHẤT KHÔNG ĐƯỢC PHÁ VỠ
> **Chưa tick đủ TẤT CẢ các mục dưới đây thì KHÔNG đặt `baseUrl` trên production** (tức
> không hoàn tất mục 5 ở [docs/ai-provider-setup.md](./ai-provider-setup.md) trên project
> `examcalm` thật). Bạn có thể thử nghiệm thoải mái trên Firebase Emulator hoặc một project
> dev riêng — quy tắc này chỉ áp dụng cho production, nơi học sinh thật đang dùng.
>
> **Tính năng Trò chuyện (chat) có công tắc BẬT/TẮT RIÊNG** ("Bật tính năng trò chuyện AI cho
> học sinh" ở `/admin/ai`, độc lập với công tắc "phản chiếu") **và có thêm ba mục chặn RIÊNG**
> ở phần [Trước khi bật riêng tính năng Trò chuyện](#-trước-khi-bật-riêng-tính-năng-trò-chuyện-spec-4)
> bên dưới — hoàn tất 8 mục ở trên KHÔNG đủ điều kiện để tick công tắc trò chuyện.

---

## ☐ 1. Chọn provider và đọc điều khoản dữ liệu của họ

Tìm trang chính sách/điều khoản dùng dữ liệu của provider — thường có tên như "Data Usage
Policy", "API Data Privacy", "Enterprise Privacy Policy", hoặc nằm trong "Terms of Service"
mục nói riêng về API (khác với điều khoản cho sản phẩm tiêu dùng/app di động của cùng công
ty — hai thứ này thường KHÁC NHAU). Link thường nằm ở chân trang web của provider, hoặc
trong trang tài liệu API (docs) của họ.

Đọc kỹ trước khi qua mục 2 — mục đó sẽ dùng đúng trang này.

## ☐ 2. Xác nhận đã tắt "lưu dữ liệu để huấn luyện" (data retention for training)

Đây là mục **khó nhất và quan trọng nhất** trong toàn bộ danh sách. Làm theo đúng các bước
cụ thể sau — đừng chỉ "đọc điều khoản rồi tự đánh giá":

1. Ở trang chính sách đã tìm thấy ở mục 1, dùng chức năng tìm trong trang (Ctrl+F trên
   Windows, Cmd+F trên Mac) và gõ từ khoá **"train"** (hoặc "training", "cải thiện mô
   hình", "improve the model"). Đọc kỹ CẢ CÂU chứa từ đó, không chỉ đọc từ khoá.
2. Vào trang **quản lý tài khoản (dashboard)** của provider — không phải trang chính sách,
   mà là nơi bạn đăng nhập để quản lý API key. Tìm mục **Settings** (Cài đặt) → tìm phần có
   tên gần giống **"Data Controls"**, **"Privacy"**, **"Data Sharing"**, hoặc
   **"Model training"**. Nhiều provider có hẳn một CÔNG TẮC ở đây — nếu có, công tắc đó
   PHẢI đang ở trạng thái TẮT (không cho phép dùng dữ liệu của bạn để huấn luyện).
3. Nếu bạn **không tìm thấy công tắc nào**, và trang chính sách ở bước 1 **không nói rõ
   ràng bằng câu chữ tường minh** rằng dữ liệu gửi qua API KHÔNG được dùng để huấn luyện
   theo mặc định — coi như câu trả lời là "CÓ, họ dùng để huấn luyện". Không đoán theo
   hướng có lợi cho provider.
4. Việc phải chắc chắn 100%, không phải "gần chắc chắn": nếu điều khoản viết mập mờ, viết
   bằng ngôn ngữ bạn không đọc được rõ, hoặc bạn phải liên hệ hỗ trợ để hỏi mà không nhận
   được câu trả lời rõ ràng bằng văn bản — coi như CHƯA đạt yêu cầu của mục này.

**Nếu provider bạn chọn KHÔNG cho tắt việc này** (không có công tắc, và chính sách không
cam kết rõ ràng bằng văn bản) — **câu trả lời là chọn một provider khác.** Không có ngoại
lệ, không "tạm chấp nhận rồi tính sau". Đây là ghi chú cảm xúc của trẻ vị thành niên.

## ☐ 3. Ghi `providerLabel` đúng tên nhà cung cấp THẬT

Ở `/admin/ai`, ô "Tên nhà cung cấp" phải ghi đúng tên công ty đứng sau dịch vụ bạn chọn (vd:
"OpenAI", không phải "AI" hay một biệt danh nội bộ nào khác). Tên này hiển thị THẲNG cho học
sinh ở màn hình đồng ý — các em có quyền biết chính xác ghi chú của mình đi tới công ty nào.

## ☐ 4. Quyết định có cần thông báo phụ huynh

Đây là dữ liệu sức khoẻ tinh thần của trẻ vị thành niên được gửi ra một dịch vụ bên ngoài
trường. Trao đổi với ban giám hiệu/người phụ trách đạo đức nghiên cứu của trường (nếu có) về
việc có cần gửi thông báo cho phụ huynh trước khi bật tính năng này hay không, và nếu có,
soạn nội dung thông báo đó **trước** khi qua mục 8.

## ☐ 5. Đặt `quotaStudentPerDay` thấp cho tuần đầu

Đề xuất: **5** lượt/học sinh/ngày cho tuần đầu tiên sau khi bật. Vào `/admin/ai`, điền số
này vào ô "Quota mỗi học sinh mỗi ngày", lưu lại. Sau một tuần theo dõi không có vấn đề gì
bất thường (chi phí, nội dung trả về...), có thể cân nhắc nâng dần lên.

## ☐ 6. Xác nhận cảnh báo ngân sách (budget alert) trong Cloud Billing đang hoạt động

Vào [Google Cloud Console](https://console.cloud.google.com/billing) → chọn đúng billing
account gắn với project `examcalm` → mục **Budgets & alerts** (Ngân sách và cảnh báo) →
xác nhận đã có ít nhất một ngân sách (budget) được tạo cho project này, với ít nhất một
ngưỡng cảnh báo (vd: 50%, 90%, 100%) gửi email tới địa chỉ bạn thực sự theo dõi. Nếu chưa có,
tạo một cái trước khi qua mục tiếp theo — đây là lưới an toàn khi có gì đó gọi AI quá nhiều
(lỗi phần mềm, hoặc lạm dụng) mà không ai nhận ra kịp thời.

## ☐ 7. Bật kill switch rồi tắt xuống một lần trên production, xác nhận nó thật sự chặn

"Kill switch" chính là ô tick **"Bật tính năng phản chiếu AI cho học sinh"** ở `/admin/ai`
(tick = tính năng đang BẬT; bỏ tick = kill switch đang chặn, tính năng TẮT). Làm đúng thứ tự
sau, trên project production thật (`examcalm`), không phải trên emulator:

1. Đảm bảo ô đó đang **bỏ tick** (tính năng tắt), bấm "Lưu cấu hình".
2. Dùng một tài khoản học sinh thử (của chính bạn hoặc tài khoản test), thử ghi một nhật ký
   cảm xúc — xác nhận **không có** thẻ phản chiếu AI nào xuất hiện, và ở trang Hồ sơ, phần
   AI báo "chưa khả dụng" hoặc không cho bật đồng ý.
3. Tick lại ô đó (tính năng bật), bấm "Lưu cấu hình".
4. Xác nhận tính năng hoạt động trở lại bình thường với tài khoản thử ở bước 2.

Mục đích: chứng minh rằng nếu sau này bạn cần TẮT KHẨN CẤP (xem mục 4 của
docs/ai-provider-setup.md), công tắc đó thật sự có tác dụng trên production — không phải chỉ
tin là nó hoạt động.

## ☐ 8. Nhờ một chuyên gia tâm lý đọc `systemPrompt` trước khi publish template

Trước khi bấm "Đăng" (publish) bất kỳ prompt template nào ở `/admin/ai`, gửi nguyên văn nội
dung ô **"System prompt"** (và "User template") cho một chuyên gia tâm lý học đường (hoặc
tương đương) đọc và góp ý — đây là đoạn văn bản định hình CÁCH mà "phản chiếu" của AI nói
chuyện với học sinh đang căng thẳng trước kỳ thi. Chỉ publish sau khi người đó xác nhận nội
dung ổn. Sửa lại một bản ĐANG published sẽ bị hệ thống chặn (phải gỡ đăng trước) — đúng để
ép quy trình này luôn diễn ra trước khi có thay đổi tới tay học sinh.

---

## ⛔ Trước khi bật riêng tính năng Trò chuyện (Spec #4)

Tám mục ở trên áp dụng cho MỌI tính năng AI của ExamCalm (bao gồm cả "phản chiếu" sau khi ghi
cảm xúc VÀ "trò chuyện" — cùng dùng chung `baseUrl`/API key). Trò chuyện là tính năng **mở một
ô để học sinh gõ bất cứ điều gì** — khác hẳn "phản chiếu" (AI chỉ viết lại vài câu sau một lần
ghi cảm xúc) — nên có công tắc bật/tắt RIÊNG ("Bật tính năng trò chuyện AI cho học sinh" ở
`/admin/ai`, độc lập với công tắc phản chiếu) và có đường xử lý khủng hoảng riêng khi học sinh
có dấu hiệu tự hại. **Ba mục dưới đây PHẢI xong TRƯỚC khi tick công tắc trò chuyện, kể cả khi 8
mục ở trên đã xong từ lâu** (ví dụ trường bạn đã bật "phản chiếu" từ trước, giờ mới bật thêm
"trò chuyện").

**Điều sẽ tự động xảy ra khi bạn tick công tắc này (I4, final whole-branch review):** một học
sinh đã đồng ý dùng AI TỪ TRƯỚC (dưới hộp thoại cũ, chỉ nói về "ghi chú cảm xúc"/phản chiếu —
chưa từng nhắc chat hay đường cảnh báo tới thầy cô) sẽ **không** được tự động vào thẳng màn hình
trò chuyện. Hệ thống ghi nhớ PHIÊN BẢN của hộp thoại đồng ý mỗi học sinh đã đọc
(`privacySettings.aiConsentVersion`) — một đồng ý cũ hơn phiên bản hiện tại không đủ cho chat.
Học sinh đó sẽ thấy màn hình chat báo "cần bật tính năng AI trong phần Cài đặt riêng tư", và ở
trang Hồ sơ, ô tick đồng ý sẽ hiện lại như CHƯA tick — bấm vào sẽ hiện lại đúng hộp thoại đồng ý
(giờ đã nói rõ cả chat), không xoá bất cứ dữ liệu nào, và phản chiếu của em vẫn hoạt động bình
thường trong lúc chờ em xác nhận lại. Đây là hành vi **có chủ đích**, không phải lỗi — không nên
coi là "học sinh bị mất quyền dùng AI" khi nhận được câu hỏi từ giáo viên/học sinh về việc này.

### ☐ 9. Ai nhận cảnh báo khủng hoảng, và trong bao lâu phải phản hồi?

**Đây là dòng quan trọng nhất trong toàn bộ tài liệu này — quan trọng hơn mọi mục ở trên.**

Khi hệ thống phát hiện một học sinh có dấu hiệu tự hại (qua từ khoá hoặc qua chính AI tự đánh
giá), nó ghi một bản ghi vào `crisisAlerts` — admin xem được ở trang quản trị cảnh báo. **Nhưng
bản ghi đó, tự nó, không cứu được ai.** Nó chỉ có ý nghĩa nếu có một CON NGƯỜI thật sự đọc nó và
đi hỏi thăm em học sinh đó. Một hệ thống cảnh báo mà đằng sau không có quy trình con người xử lý
còn TỆ HƠN không có hệ thống cảnh báo nào cả — nó khiến người thiết kế app tưởng rằng vấn đề đã
"được xử lý bằng công nghệ", trong khi thực ra không ai đang theo dõi.

Trước khi bật tính năng trò chuyện, trường bạn PHẢI trả lời rõ ràng bằng văn bản (điền ngay vào
ô dưới đây, không được để trống hay ghi "sẽ tính sau"):

- **Ai** là người (hoặc những người) chịu trách nhiệm kiểm tra trang cảnh báo? Ghi rõ tên/chức
  vụ, không ghi chung chung như "ban giám hiệu": `______________________________`
- **Bao lâu một lần** người đó kiểm tra trang cảnh báo? (Đề xuất: ít nhất 1 lần mỗi buổi học,
  không phải 1 lần mỗi ngày — mức `urgent` cần được thấy trong vài giờ, không phải qua đêm.)
  `______________________________`
- Nếu người phụ trách chính **vắng mặt** (nghỉ ốm, đi công tác...), ai là người thay thế?
  `______________________________`
- Sau khi thấy cảnh báo, quy trình cụ thể là gì? (Gọi phụ huynh? Mời em lên phòng tư vấn? Báo
  giáo viên chủ nhiệm?) `______________________________`

Chỉ tick mục này khi cả bốn dòng trên đã có câu trả lời cụ thể, có tên người thật, không phải
một kế hoạch còn để ngỏ.

### ☐ 10. Chuyên gia tâm lý học đường duyệt BA văn bản, không phải một

Mục 8 ở trên chỉ yêu cầu duyệt "System prompt"/"User template" của tính năng phản chiếu. Tính
năng trò chuyện có đường xử lý khủng hoảng riêng, và người review cần đọc đúng **ba** văn bản —
thiếu một trong ba là chưa đạt yêu cầu của mục này:

1. **Danh sách từ khoá khủng hoảng** (`URGENT_KEYWORDS`/`CONCERN_KEYWORDS`,
   `functions/src/ai/crisisDetector.ts`) — kèm lý do xếp mức của từng cụm, đã tổng hợp sẵn tại
   [docs/crisis-keyword-rationale.md](./crisis-keyword-rationale.md) để không phải đọc mã nguồn.
2. **`CRISIS_REPLY_TEXT`** — câu trả lời cố định học sinh nhận khi hệ thống xác định mức
   `urgent` (nguyên văn đã trích sẵn trong tài liệu ở mục 1).
3. **System prompt của cuộc trò chuyện bình thường** — CẢ HAI hằng số sau, đều nằm trong
   `functions/src/ai/buildChatPrompt.ts` và đều là **hằng số biên dịch cứng trong mã nguồn,
   KHÔNG sửa được qua `/admin/ai` hay bất kỳ trang admin nào** (I8, final whole-branch review —
   đính chính một sai sót trước đây của chính tài liệu này, xem thêm ở cuối mục này):
   - `DEFAULT_CHAT_TEMPLATE.systemPrompt` — giọng "ấm áp, gần gũi" của chú mèo đồng hành.
   - `buildChatStructuralInstructions()` — quy tắc an toàn cố định (cấm chẩn đoán, không giả vờ
     là người, không hứa giữ bí mật, hướng dẫn khi học sinh tuyệt vọng...).

   **Đây là mục dễ bị bỏ sót nhất.** Sau một lần sửa thiết kế, chỉ mức `urgent` mới nhận câu cố
   định ở mục 2 — mức `concern` (tuyệt vọng nhưng chưa nêu ý định cụ thể) vẫn để chính AI tiếp
   tục trò chuyện, dựa theo hai hằng số trên. Nghĩa là câu chữ một học sinh tuyệt vọng thật sự
   đọc được là do AI tự soạn theo chỉ dẫn đó, không phải một câu đã duyệt sẵn — nên chỉ dẫn đó
   cũng cần được duyệt như một văn bản các em sẽ đọc, không phải chỉ là "cấu hình kỹ thuật".

Nhờ người phụ trách kỹ thuật in/gửi nguyên văn cả ba cho chuyên gia tâm lý, chỉ tick mục này sau
khi người đó xác nhận cả ba đều ổn (hoặc sau khi các góp ý đã được sửa và người đó xác nhận lại).

### ☐ 11. Quyết định: `crisisAlerts` có bị xoá khi học sinh xoá tài khoản không?

`crisisAlerts` là **hồ sơ an toàn** (ai từng có dấu hiệu nguy hiểm, mức độ, đã xử lý chưa) —
khác với nhật ký cảm xúc hay lịch sử trò chuyện, vốn là nội dung riêng tư của học sinh. Trường
bạn có thể có nghĩa vụ lưu giữ loại hồ sơ này lâu hơn (theo quy định nội bộ, hoặc để theo dõi
một em đã từng có dấu hiệu nguy hiểm).

**Mặc định của hệ thống: CÓ xoá `crisisAlerts` khi học sinh xoá toàn bộ dữ liệu của mình** —
nhất quán với lời hứa "xoá toàn bộ dữ liệu" ở trang Hồ sơ. Nếu trường bạn cần GIỮ LẠI hồ sơ cảnh
báo dù học sinh đã xoá tài khoản, đó phải là một **quyết định có chủ đích, có người chịu trách
nhiệm ký tên**, không phải một cấu hình bật/tắt có sẵn trên giao diện — cần sửa mã nguồn
(`functions/src/admin/deleteUserData.logic.ts`, hàm `collectDeletionTargets()`) để bỏ
`crisisAlerts` ra khỏi danh sách bị xoá cùng tài khoản, và nên tham khảo ý kiến pháp lý về việc
lưu giữ dữ liệu sức khoẻ tinh thần của trẻ vị thành niên sau khi các em đã yêu cầu xoá.

Ghi lại quyết định của trường bạn ở đây:

☐ Giữ mặc định — `crisisAlerts` bị xoá cùng tài khoản, không cần sửa gì thêm.
☐ Giữ lại `crisisAlerts` sau khi học sinh xoá tài khoản (đã sửa mã nguồn, đã tham khảo ý kiến
phù hợp). Người quyết định: `______________________` Ngày: `______________________`

---

## ℹ️ Đính chính (I8, final whole-branch review): persona của Trò chuyện KHÔNG admin-sửa-được

Một phiên bản trước của tài liệu này có một mục "Câu hỏi cần chủ sản phẩm trả lời" dựa trên tiền
đề **sai**: rằng giọng nói "ấm áp, gần gũi" của chú mèo đồng hành trong cuộc **trò chuyện**
(`DEFAULT_CHAT_TEMPLATE.systemPrompt`, `functions/src/ai/buildChatPrompt.ts`) là phần admin sửa
được qua ô "System prompt" ở `/admin/ai`, và đặt câu hỏi liệu điều đó có nên bị siết lại như mục
10 hay không.

**Sự thật:** `sendChatMessage.ts` (Cloud Function phục vụ tính năng Trò chuyện) KHÔNG BAO GIỜ
đọc `promptTemplates` — `buildChatMessages()` luôn được gọi mà không kèm template, nên LUÔN dùng
thẳng `DEFAULT_CHAT_TEMPLATE` cứng trong mã nguồn. Ô "System prompt" ở `/admin/ai` (mục 8 phía
trên) chỉ ghi vào `promptTemplates` với `name: "mood_reflection"` — tài liệu này chỉ được
`generateReflection.ts` (tính năng **Phản chiếu**) đọc. Một admin sửa ô đó và publish tin rằng
mình vừa đổi giọng chú mèo TRÒ CHUYỆN thực ra đang đổi văn bản của PHẢN CHIẾU, sống ngay lập tức
với học sinh — một rủi ro hình dạng khác, ngược hướng với câu hỏi đã đặt sai ở trên (AiConfigEditor.tsx
giờ đã có dòng chú thích ngay tại trang để tránh nhầm lẫn này).

Vì persona của Trò chuyện là hằng số biên dịch, thay đổi nó LUÔN đi qua review code + deploy —
đã chặt hơn một ô nhập liệu admin có thể sửa bất cứ lúc nào, nên câu hỏi "có nên siết thêm một
vòng duyệt" không còn tiền đề để đặt ra nữa. Mục 10 ở trên vẫn yêu cầu chuyên gia tâm lý duyệt cả
`DEFAULT_CHAT_TEMPLATE` lẫn `buildChatStructuralInstructions()` trước lần đầu go-live; bất kỳ lần
sửa nào sau đó với hai hằng số này là một thay đổi mã nguồn, nên đi qua đúng quy trình review code
của đội kỹ thuật.

---

## ⚠️ Một hạn chế đã biết: đổi provider KHÔNG hỏi lại học sinh

Hệ thống lưu **rằng** một học sinh đã đồng ý, nhưng **không lưu em đã đồng ý với nhà cung cấp nào**.

Nghĩa là: nếu bạn đổi `baseUrl` sang một nhà cung cấp khác, những học sinh đã bật AI từ trước **vẫn ở trạng thái đã đồng ý**. Ghi chú của các em bắt đầu được gửi sang công ty mới ngay lần check-in kế tiếp, dù các em chưa từng nhìn thấy tên công ty đó. Màn hình Hồ sơ có hiện tên mới, nhưng không có gì buộc các em phải đọc lại.

Đây là hạn chế của thiết kế hiện tại, không phải lỗi — nhưng nó có nghĩa là **đổi provider là một quyết định cần thông báo, không phải một thao tác cấu hình**.

**Nếu bạn đổi provider sau khi đã cho học sinh dùng, hãy làm theo thứ tự này:**

1. Tắt tính năng trước (bỏ tick "Bật tính năng phản chiếu AI cho học sinh", bấm Lưu).
2. Báo cho học sinh biết sắp đổi sang nhà cung cấp nào, và rằng các em có thể tắt AI cùng xoá toàn bộ phản chiếu cũ trong trang Hồ sơ — **khi tính năng đang tắt, đường tắt-và-xoá vẫn dùng được**, đúng để phục vụ tình huống này.
3. Làm lại **mục 1 và mục 2** của danh sách này với nhà cung cấp mới (đọc điều khoản, xác nhận đã tắt lưu dữ liệu để huấn luyện).
4. Đổi `baseUrl`, `model`, và `providerLabel`, rồi mới bật lại.

Bỏ qua bước 2 là điều duy nhất trong toàn bộ tài liệu này có thể khiến bạn gửi bài viết riêng tư của một học sinh tới một công ty mà em ấy chưa từng đồng ý — hãy đừng bỏ qua.

---

## Tick xong cả 8 mục?

Quay lại [docs/ai-provider-setup.md](./ai-provider-setup.md) mục 5 để điền `baseUrl` +
`model` thật trên production, rồi bấm "Thử kết nối" một lần cuối trước khi công bố cho học
sinh biết tính năng đã sẵn sàng.
