# Vì sao mỗi từ khoá khủng hoảng lại nằm trong danh sách — tài liệu cho chuyên gia tâm lý

**Dành cho ai:** chuyên gia tâm lý học đường (hoặc người tương đương) được mời rà soát bộ phát
hiện khủng hoảng của tính năng Trò chuyện AI, theo đúng mục bắt buộc ở
[docs/ai-go-live-checklist.md](./ai-go-live-checklist.md). Không cần biết lập trình để đọc tài
liệu này.

**Vì sao tài liệu này tồn tại:** danh sách từ khoá thật nằm trong mã nguồn
(`functions/src/ai/crisisDetector.ts`, hai hằng số `URGENT_KEYWORDS` và `CONCERN_KEYWORDS`) —
nhưng bản thân danh sách chỉ là các cụm từ, không giải thích được VÌ SAO mỗi cụm được xếp vào
mức đó, và những rủi ro báo nhầm/bỏ sót nào đã biết trước. Tài liệu này ghi lại đúng phần lý do
đó, để bạn không phải đọc mã nguồn để hiểu ý đồ thiết kế.

## Bối cảnh cần biết trước khi đọc danh sách

- Danh sách này là **bản nháp đầu tiên do một mô hình ngôn ngữ (AI) soạn ra** dựa trên hiểu biết
  chung về cách nói tự tử/tự hại bằng tiếng Việt — **không phải** một công cụ sàng lọc đã được
  kiểm chứng lâm sàng (không dựa trên C-SSRS, PHQ-9, hay bất kỳ thang đo đã được validate nào).
- Bộ lọc chỉ dùng khớp CHỮ (một cụm từ xuất hiện trong tin nhắn hay không), không hiểu ngữ cảnh
  như con người. Nó có hai kiểu sai: **báo nhầm** (một câu vô hại bị coi là dấu hiệu khủng hoảng)
  và **bỏ sót** (một câu thật sự đáng lo nhưng không dùng đúng cụm từ nào trong danh sách).
- Chiều sai lầm được chọn có chủ đích: **thà báo nhầm còn hơn bỏ sót**. Báo nhầm là thầy cô hỏi
  thăm một em đang ổn — hơi ngượng. Bỏ sót là một em gặp nguy mà không ai biết. Vì vậy danh sách
  cố ý bao phủ rộng, và khi một cụm mơ hồ giữa hai mức, nó được xếp vào mức **nặng hơn** (urgent).
- Có hai mức: **`urgent`** (thầy cô cần can thiệp NGAY; hệ thống trả lời học sinh bằng một câu
  cố định giới thiệu Tổng đài 111, KHÔNG gọi AI nữa cho tin nhắn đó — xem
  `CRISIS_REPLY_TEXT` ở mục riêng bên dưới) và **`concern`** (thầy cô hỏi thăm khi có thời gian,
  không cần đi ngay; AI vẫn tiếp tục trò chuyện bình thường với học sinh).
- Vì `urgent` cắt đứt cuộc trò chuyện, một lần báo nhầm ở mức đó **tốn nhiều hơn** một lần báo
  nhầm ở mức `concern`: một học sinh chỉ đang than thở bình thường ("Đề khó *muốn chết* luôn")
  mà nhận về tổng đài khủng hoảng thay vì một câu trả lời chuyện trò có thể học được rằng nên né
  tránh app này. Vì vậy một số cụm có "guard" — quy tắc loại trừ hẹp cho đúng cách dùng đời
  thường đã biết — ghi ở mục riêng bên dưới.

---

## `URGENT_KEYWORDS` — ý định/kế hoạch tự hại, cần can thiệp NGAY

| Nhóm | Cụm từ | Vì sao |
|---|---|---|
| Nói thẳng | tự tử, tự sát, tự vẫn | Ba cách nói phổ biến nhất trong tiếng Việt cho cùng một hành vi. |
| Nói giảm nhẹ | kết liễu, kết thúc cuộc đời, kết thúc cuộc sống | Cách nói giảm nhẹ rất thường gặp thay cho "tự tử". **Rủi ro đã biết:** "kết liễu" cũng dùng trong ngữ cảnh chơi game ("kết liễu con boss") — bạn nên cân nhắc mức báo nhầm này. |
| Ý định thụ động | muốn chết, không muốn sống nữa, không còn muốn sống, chết đi cho rồi, chết cho xong | Mơ hồ giữa ý định thật và than vãn bộc phát — xếp mức nặng theo nguyên tắc "mơ hồ thì xếp nặng hơn". "muốn chết" có một quy tắc loại trừ riêng — xem mục "Muốn chết" bên dưới. |
| Ý định gián tiếp | kết thúc tất cả, kết thúc mọi thứ, hết muốn sống, không thiết sống, chả thiết sống, sống làm gì nữa, sống để làm gì, ước gì mình chết, giá mà không tồn tại, ngủ một giấc không bao giờ tỉnh, đừng tỉnh dậy nữa, buông xuôi hết rồi, không trụ nổi nữa, muốn ra đi mãi mãi, chán đời | Không nêu tên "chết"/"tự tử" nhưng cùng bản chất muốn kết thúc mọi thứ. "chán đời" xếp mức nặng vì phổ biến hơn nhiều trong khẩu ngữ học sinh so với "chán sống" (xếp mức nhẹ, xem bảng dưới). |
| Tự hại chung | tự làm hại bản thân, tự hại bản thân, tự hại | Tự hại nói chung (không nhất thiết gây chết) nhưng vẫn cần can thiệp ngay. |
| Lời từ biệt | chào tạm biệt mọi người, vĩnh biệt, thư tuyệt mệnh, để lại thư cho bố mẹ, không làm phiền ai nữa, kiếp sau không muốn làm người | Dấu hiệu cảnh báo cấp tính kinh điển trong tài liệu phòng chống tự tử (cho đi đồ đạc, viết thư, nói lời tạm biệt). "thư tuyệt mệnh" là cụm có độ đặc hiệu cao nhất trong toàn bộ danh sách. |
| Phương thức cụ thể | rạch tay, cắt tay, cắt cổ tay, cứa cổ tay, cứa tay, rạch đùi, tự làm đau mình, châm thuốc lá vào tay, treo cổ, thắt cổ, nhảy lầu, nhảy cầu, nhảy sông, lao vào xe, uống thuốc quá liều, thuốc ngủ, gom thuốc, thuốc diệt cỏ, thuốc sâu | Nêu tên phương thức cụ thể nghĩa là ý định đã cụ thể hoá thành kế hoạch — luôn xếp mức nặng nhất. Ngộ độc thuốc bảo vệ thực vật (thuốc diệt cỏ/thuốc sâu) là nhóm phương thức phổ biến hàng đầu ở thanh thiếu niên Việt Nam nên có mặt trong danh sách. "cắt tay" và "nhảy cầu" có quy tắc loại trừ riêng — xem mục bên dưới. |
| Hỏi về kế hoạch | cách để chết | Hỏi trực tiếp về phương pháp — tín hiệu kế hoạch rõ ràng. |
| Tiếng Anh / từ lóng mạng | suicid (bắt cả "suicidal"/"suicides"), kill myself, end my life, end it all, want to die, wanna die, unalive, self harm, self-harm | Học sinh có thể chuyển sang tiếng Anh khi khó nói bằng tiếng Việt, hoặc dùng từ lóng né bộ lọc phổ biến trong ngôn ngữ mạng ("unalive"). |

### Hai cụm có quy tắc loại trừ riêng (để giảm báo nhầm mà không thu hẹp cả danh sách)

- **"muốn chết"** — tiếng Việt có cấu trúc tăng cường rất phổ biến kiểu "X muốn chết" ("khó muốn
  chết", "mệt muốn chết", "nóng muốn chết"...), dùng hàng ngày và dùng nhiều nhất đúng trong bối
  cảnh than thở về bài vở — chính use-case app này phục vụ. Hệ thống loại trừ "muốn chết" khi nó
  đứng ngay sau một từ tăng cường đã biết (khó, mệt, nóng, lạnh, đói, khát, buồn, chán, sợ, lo,
  dài, lâu, đau, cười, vui, thích, tức, bực, ngại, ngượng, mừng, giận, ghét, nhớ, thèm, áp lực,
  căng thẳng, stress, xấu hổ, hồi hộp, hoảng, nản, rối). "Muốn chết" đứng một mình, hoặc sau chủ
  ngữ ("em muốn chết"), vẫn ở mức urgent. Danh sách từ tăng cường này sẽ không bao giờ đầy đủ —
  đây là một phần lý do vì sao mức `concern` không còn cắt đứt hội thoại (xem phần đầu tài liệu).
- **"cắt tay"** — loại trừ "cắt tay áo" (quần áo) và "cắt tay khi gọt hoa quả/rau củ" (tai nạn
  bếp núc). **Rủi ro đã biết còn lại:** một câu mô tả tai nạn đứt tay theo cách khác (không đi
  kèm "khi gọt") vẫn có thể bị bắt nhầm, ví dụ "em bị cắt tay lúc làm bếp".
- **"nhảy cầu"** — loại trừ "nhảy cầu lông" (môn thể thao).
- **"gom thuốc", "thuốc ngủ"** — không có quy tắc loại trừ; có thể xuất hiện trong ngữ cảnh gia
  đình hoàn toàn vô hại (dọn tủ thuốc, người thân mất ngủ). Chấp nhận theo chiều sai lầm đã chọn
  của toàn bộ danh sách.

---

## `CONCERN_KEYWORDS` — tuyệt vọng/vô giá trị/muốn biến mất, chưa có ý định cụ thể

| Cụm từ | Vì sao |
|---|---|
| vô dụng, vô giá trị | Tín hiệu kinh điển của cảm giác vô giá trị. |
| không ai cần, không ai yêu, không ai quan tâm | Cảm giác bị bỏ rơi/cô lập, đi kèm cảm giác vô giá trị. |
| là gánh nặng, gánh nặng cho mọi người, gánh nặng cho gia đình, tốt hơn nếu không có em, không có em thì ... đỡ khổ, chỉ toàn làm khổ mọi người | "Cảm giác là gánh nặng" là một yếu tố nguy cơ tự tử được nhiều tài liệu tâm lý học nêu tên cụ thể. |
| muốn biến mất | Ước muốn không tồn tại nhưng không nêu phương thức/kế hoạch. |
| ước gì mình chưa từng tồn tại, ước gì con chưa từng sinh ra | Biến thể của "muốn biến mất", hướng về quá khứ nhưng cùng bản chất vô vọng. |
| chán sống, sống không có ý nghĩa, cuộc sống vô nghĩa | Vô vọng gắn với ý nghĩa sống. |
| không còn hy vọng, tuyệt vọng | Vô vọng (hopelessness) — hai từ dùng phổ biến, đủ đặc hiệu để đưa vào danh sách. |
| mệt mỏi với cuộc sống | Cụm đầy đủ đủ đặc hiệu, khác với "mệt mỏi" đơn lẻ (quá phổ biến trong than thở bài vở nên KHÔNG đưa vào danh sách — xem mục dưới). |
| **muốn ngủ mãi mãi** | Cách nói giảm nhẹ phổ biến cho ước muốn chết. **Đây là cụm có ranh giới mơ hồ nhất trong toàn bộ danh sách — nên là cụm đầu tiên bạn xem lại.** |
| không còn lý do để sống | Vô vọng gắn với mục đích sống. |
| kms | Viết tắt tiếng lóng "kill myself" — nhưng cũng là cách viết tắt đơn vị khoảng cách km/s ("chạy được 3 kms"), nên độ tin cậy thấp hơn các cụm khác; xếp mức nhẹ vì lý do đó. |

### Cố ý KHÔNG đưa vào danh sách

Các từ/cụm đơn lẻ như "mệt mỏi", "buồn", "chán", "áp lực", "stress", "khóc" — đều xuất hiện cực
kỳ thường xuyên trong than thở bình thường về áp lực thi cử (đúng use-case chính của app). Đưa
chúng vào sẽ khiến bộ lọc báo nhầm gần như mọi cuộc trò chuyện, làm thầy cô dần bỏ qua cảnh báo
vì kêu liên tục ("alert fatigue") — tức gây hại ngược lại mục tiêu "thà báo nhầm còn hơn bỏ sót".
Chỉ đưa vào danh sách những cụm đã gắn rõ với ý định/tuyệt vọng/vô giá trị.

---

## Vì sao bộ lọc KHÔNG bỏ qua câu có chữ phủ định

Một câu như *"Em không muốn chết, em chỉ muốn mọi thứ dừng lại"* vẫn bị bộ lọc bắt (vì chứa cụm
"muốn chết" theo sau chủ ngữ). Đây là quyết định có chủ đích: khi một em đang khủng hoảng, việc
tự giảm nhẹ mức độ nghiêm trọng ("em không có ý đó đâu, chỉ là...") là một ĐẶC ĐIỂM thường gặp
của việc bộc lộ khủng hoảng, không phải dấu hiệu an toàn. Bộ lọc cố tình không có cơ chế "bỏ qua
khi có từ phủ định ở gần" vì điều đó sẽ làm mất khả năng bắt đúng những câu như trên.

Cùng lý do, một em kể lại lời của bạn mình ("bạn em nói nó muốn biến mất") vẫn bị bắt — em đang
mang hộ lời bộc lộ của người khác, và cuộc trò chuyện đó cần xảy ra trên tài khoản của chính em
đang gõ.

---

## Điều bốn vòng rà soát kỹ thuật đã chứng minh — quan trọng để hiểu giới hạn của bộ lọc

Trước khi tới tay bạn, danh sách và cơ chế so khớp đã qua bốn vòng rà soát kỹ thuật độc lập, mỗi
vòng tìm ra một lỗi mà vòng trước không thấy: lần đầu phát hiện danh sách quá hẹp; lần hai phát
hiện cơ chế nhận diện chữ không dấu tự nó gộp nhầm hai từ khác nghĩa nhưng gần giống mặt chữ (ví
dụ ban đầu "tư vấn" từng bị đọc nhầm thành "tự vẫn"); lần ba phát hiện chính cách sửa của lần hai
vẫn còn hở ở một vị trí cụ thể; lần bốn phát hiện phần lớn bài kiểm tra tự viết trước đó không
thực sự chứng minh được điều nó tuyên bố.

Điều này nên được đọc như một **bằng chứng**, không phải một lời trấn an: **phát hiện bằng từ
khoá là một bộ lọc thô.** Nó sẽ còn báo nhầm những câu nó chưa từng thấy, và sẽ còn bỏ sót những
cách diễn đạt nó chưa từng thấy — không phải vì cẩu thả, mà vì đó là giới hạn cố hữu của cách
tiếp cận "khớp cụm từ". Thứ thật sự bảo vệ một học sinh không phải là bộ lọc bắt đúng 100% — mà
là **quy trình con người đứng sau cảnh báo**: một thầy cô đọc `crisisAlerts` và thật sự đi hỏi
thăm, dù bộ lọc báo đúng hay báo nhầm. Đây chính là lý do mục "Ai nhận cảnh báo, và trong bao lâu
phải phản hồi?" ở [docs/ai-go-live-checklist.md](./ai-go-live-checklist.md) là mục quan trọng
nhất trong toàn bộ tài liệu go-live — quan trọng hơn cả việc rà soát danh sách này.

---

## Câu trả lời cố định khi phát hiện mức "urgent" (`CRISIS_REPLY_TEXT`)

Khi bộ lọc (hoặc lớp thứ hai — chính AI tự đánh giá mức độ lo ngại sau khi trả lời) xác định mức
`urgent`, học sinh nhận **đúng câu chữ cố định sau** thay vì một câu trả lời do AI tự soạn — bạn
cần duyệt đúng nguyên văn này (nằm trong mã nguồn tại
`functions/src/ai/buildChatPrompt.ts`, hằng số `CRISIS_REPLY_TEXT`):

> Cảm ơn em đã nói ra điều này với mình.
>
> Ngay lúc này mình không thể tiếp tục trò chuyện về chuyện này — mình là một chương trình AI,
> không phải người có chuyên môn để giữ em an toàn.
>
> Em hãy gọi ngay Tổng đài Quốc gia Bảo vệ Trẻ em 111 — miễn phí, có người trực 24/7. Và hãy nói
> với một người lớn em tin tưởng ngay bây giờ: bố mẹ, thầy cô, hoặc bất kỳ ai đang ở gần em.
>
> Em xứng đáng được một người thật giúp đỡ, ngay hôm nay.

## Văn bản thứ ba cần duyệt: system prompt của cuộc trò chuyện bình thường

Sau một lần sửa thiết kế (2026-08-25), chỉ mức `urgent` mới nhận câu cố định ở trên — mức
`concern` (tuyệt vọng nhưng chưa nêu ý định cụ thể) **vẫn để AI tiếp tục trò chuyện bình
thường**, dựa trên chỉ dẫn cố định trong `buildChatStructuralInstructions()` (cùng file
`buildChatPrompt.ts`). Nghĩa là: **câu chữ mà một học sinh tuyệt vọng-nhưng-chưa-nêu-ý-định thật
sự đọc được là do AI tự soạn dựa trên chỉ dẫn đó, không phải một câu đã được duyệt sẵn như
`CRISIS_REPLY_TEXT`.** Đây là lý do mục 10 của checklist go-live yêu cầu bạn duyệt cả văn bản chỉ
dẫn này, không chỉ hai thứ ở trên — xin liên hệ người phụ trách kỹ thuật để nhận bản in đầy đủ
của hàm này khi rà soát.
