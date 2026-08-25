// Bộ phát hiện khủng hoảng theo từ khoá — thuần TypeScript, không import firebase-admin,
// không đọc Firestore, không state mức module. Đây là Lớp 1 trong hai lớp phát hiện độc lập
// (§3.1 design spec): nhanh, miễn phí, tất định, chạy TRƯỚC khi gọi model.
//
// Fix round 2, Finding 4 (coordinator sửa §3.1/§3.2 design spec): CHỈ mức "urgent" mới chặn
// lượt gọi model — "concern" vẫn tạo cảnh báo cho thầy cô nhưng KHÔNG chặn cuộc trò chuyện,
// model vẫn được gọi bình thường. Lý do: một học sinh tuyệt vọng nhưng chưa có ý định thật sự
// có lợi từ một câu trả lời tử tế; cắt đứt hội thoại và chỉ đưa tổng đài không rõ ràng tốt hơn.
// Quyết định chặn-hay-không này thuộc về CALLER (Task 5's callable), KHÔNG nằm trong file này —
// file này chỉ trả `severity` để caller tự quyết, không tự ý chặn gì cả. Trước Fix round 2, cả
// hai mức đều bị coi là chặn model như nhau, khiến một báo nhầm dù ở mức "concern" cũng hijack
// hội thoại — đó là lý do các finding về báo nhầm ("muốn chết"/"cắt tay"/gộp thanh điệu...) ở
// các vòng review trước nghiêm trọng đến vậy.
//
// CẢNH BÁO: danh sách từ khoá dưới đây là bản nháp đầu tiên do một mô hình ngôn ngữ soạn ra,
// KHÔNG PHẢI một công cụ sàng lọc đã được kiểm chứng lâm sàng. Một chuyên gia tâm lý học đường
// PHẢI rà soát danh sách này trước khi tính năng này được đưa ra cho học sinh dùng thật — đây
// là một mục chặn (blocking) trong checklist go-live, không phải việc nên làm. Đừng đọc danh
// sách này rồi mặc định nó đã đủ thẩm quyền chỉ vì nó nằm trong code.
//
// Chiều sai lầm được chọn có chủ đích, giống hệt safetyFilter.ts (§3.2 design spec): THÀ BÁO
// NHẦM CÒN HƠN BỎ SÓT. Báo nhầm là thầy cô hỏi thăm một em đang ổn — hơi ngượng. Bỏ sót là một
// đứa trẻ gặp nguy mà không ai biết. Vì vậy danh sách này CỐ Ý bao phủ rộng hơn mức tối thiểu,
// và khi một cụm mơ hồ giữa hai mức, nó được xếp vào mức NẶNG hơn ("urgent") thay vì mức nhẹ
// ("concern"). Đừng "dọn gọn" danh sách này để giảm báo nhầm — điều đó mở lại đúng lỗ hổng nó
// tồn tại để bịt.
//
// Fix round 1: một khi Lớp 1 khớp ở mức "urgent", model KHÔNG được gọi nữa — học sinh nhận
// thẳng phản hồi khủng hoảng. Nghĩa là một báo nhầm ở mức đó không chỉ là "thầy cô hỏi thăm
// nhầm", mà còn là một học sinh đang than thở bình thường ("Đề khó muốn chết luôn") nhận về
// tổng đài 111 thay vì một câu trả lời chuyện trò — và học được rằng phải né chatbot để nói
// chuyện bình thường. Vì vậy hai việc cùng tồn tại trong file này không mâu thuẫn nhau: (a)
// danh sách vẫn CỐ Ý bao phủ rộng, và (b) một số cụm có guard hẹp, tường minh để loại trừ đúng
// một va chạm từ vựng (orthographic collision) cực kỳ phổ biến trong khẩu ngữ — xem
// PHRASE_GUARDS bên dưới và khối comment "CỐ Ý KHÔNG có NEGATION_PREFIXES" cạnh
// detectCrisisKeywords để phân biệt hai việc này với việc nới lỏng theo ngữ nghĩa (điều file
// này không làm).
//
// Fix round 2, Finding 1 (CRITICAL): cơ chế bỏ dấu của Fix round 1 (strip TOÀN BỘ văn bản rồi
// so với một bản strip của từ khoá) hoá ra gộp mất sự khác biệt về THANH ĐIỆU — "từ từ" (chầm
// chậm) và "tự tử" đều strip về "tu tu", nên strip cả câu khiến "tư vấn" (counselling) bị đọc
// thành "tự vẫn". Sửa bằng cách chuyển so khớp bỏ dấu xuống CẤP TỪ: mỗi từ trong một cụm khoá
// được thử ở cả dạng có dấu (nguyên văn) lẫn dạng bỏ dấu CỦA CHÍNH TỪ ĐÓ, so trực tiếp với văn
// bản GỐC (không strip cả câu) — một từ trong văn bản có dấu SAI (khác thanh điệu với từ khoá)
// sẽ không khớp dạng nào trong hai dạng đó, vì "tư" (khác thanh) không bằng cả "tự" (có dấu
// đúng) lẫn "tu" (bỏ dấu của "tự"). Nhờ vậy học sinh gõ "em muon chết" (chỉ "muốn" bị thiếu
// dấu) vẫn bắt được ở đúng từ thiếu dấu, còn "tư vấn"/"treo cờ"/"nói thật cô"/"Vinh biết" (đều
// có dấu, chỉ khác từ khoá) thì không còn bị gộp nhầm nữa. Xem buildWordFragment.
//
// Fix round 2, Finding 2: thêm boundary \b cho các biến thể thuần ASCII (không dấu) — "k"/"kg"
// không còn khớp giữa chừng "Ok"/"50kg" nữa — và một guard số riêng cho "kms" (loại trừ khi
// đứng ngay sau một con số, vì "kms" cũng là cách viết tắt đơn vị km/s rất phổ biến khi kể
// chuyện chạy bộ). Bỏ hẳn "cutting" khỏi danh sách — xem lý do tại Nhóm 9 của URGENT_KEYWORDS.

/**
 * Cụm biểu đạt Ý ĐỊNH hoặc KẾ HOẠCH tự hại — mức "urgent", thầy cô cần can thiệp NGAY, VÀ
 * (Fix round 2, Finding 4) là mức DUY NHẤT chặn lượt gọi model ở caller.
 * Bao gồm cả các phương thức tự hại cụ thể (rạch tay, treo cổ, nhảy lầu...) vì nêu tên
 * một phương thức là dấu hiệu ý định đã cụ thể hoá, không còn là tuyệt vọng chung chung nữa.
 * Gộp theo nhóm, có comment riêng từng nhóm, để chuyên gia tâm lý rà soát dễ theo dõi hơn.
 */
export const URGENT_KEYWORDS: readonly string[] = [
  // Nhóm 1: nói thẳng.
  "tự tử",
  "tự sát",
  "tự vẫn",

  // Nhóm 2: nói giảm nhẹ (euphemism) cho việc kết thúc mạng sống — rất thường gặp thay cho
  // "tự tử" trực tiếp.
  "kết liễu",
  "kết thúc cuộc đời",
  "kết thúc cuộc sống",

  // Nhóm 3: ý định thụ động ("passive suicidal ideation") — mơ hồ giữa ý định và than vãn bộc
  // phát, nên xếp urgent theo quy tắc "mơ hồ → xếp mức nặng hơn". "muốn chết" có guard riêng
  // (PHRASE_GUARDS) để loại trừ cấu trúc tăng cường "X muốn chết" ("khó muốn chết") — xem
  // comment tại PHRASE_GUARDS và tại detectCrisisKeywords.
  "muốn chết",
  "không muốn sống nữa",
  "không còn muốn sống",
  "chết đi cho rồi",
  "chết cho xong",

  // Nhóm 4: ý định gián tiếp — không nêu tên "chết"/"tự tử" nhưng cùng bản chất muốn kết thúc
  // mọi thứ. "chán đời" phổ biến hơn nhiều trong khẩu ngữ học sinh so với "chán sống" (đã có ở
  // CONCERN_KEYWORDS) nên được xếp urgent riêng, không dùng chung nhóm với "chán sống".
  "kết thúc tất cả",
  "kết thúc mọi thứ",
  "hết muốn sống",
  "không thiết sống",
  "chả thiết sống",
  "sống làm gì nữa",
  "sống để làm gì",
  "ước gì mình chết",
  "giá mà không tồn tại",
  "ngủ một giấc không bao giờ tỉnh",
  "đừng tỉnh dậy nữa",
  "buông xuôi hết rồi",
  "không trụ nổi nữa",
  "muốn ra đi mãi mãi",
  "chán đời",

  // Nhóm 5: tự hại nói chung (không nhất thiết gây chết) — vẫn cần can thiệp ngay, không chỉ
  // là tuyệt vọng.
  "tự làm hại bản thân",
  "tự hại bản thân",
  "tự hại",

  // Nhóm 6: lời từ biệt — một nhóm dấu hiệu cảnh báo cấp tính kinh điển (cho đi đồ đạc, viết
  // thư, nói lời tạm biệt) trong tài liệu phòng chống tự tử, không phải chỉ là hy vọng mất đi.
  // "thư tuyệt mệnh" là một trong những cụm có độ đặc hiệu cao nhất trong toàn bộ danh sách.
  "chào tạm biệt mọi người",
  "vĩnh biệt",
  "thư tuyệt mệnh",
  "để lại thư cho bố mẹ",
  "không làm phiền ai nữa",
  "kiếp sau không muốn làm người",

  // Nhóm 7: phương thức cụ thể — nêu tên PHƯƠNG THỨC là dấu hiệu ý định đã cụ thể hoá thành kế
  // hoạch, luôn xếp mức nặng nhất. Bao gồm cả các phương thức đặc thù ở Việt Nam (thuốc diệt
  // cỏ/thuốc sâu là nhóm phương thức phổ biến hàng đầu ở thanh thiếu niên Việt Nam, không phải
  // trường hợp hiếm). "cắt tay" và "nhảy cầu" có guard riêng (PHRASE_GUARDS) để loại trừ hai va
  // chạm từ vựng phổ biến ("cắt tay áo", "nhảy cầu lông").
  "rạch tay",
  "cắt tay",
  "cắt cổ tay",
  "cứa cổ tay",
  "cứa tay",
  "rạch đùi",
  "tự làm đau mình",
  "châm thuốc lá vào tay",
  "treo cổ",
  "thắt cổ",
  "nhảy lầu",
  "nhảy cầu",
  "nhảy sông",
  "lao vào xe",
  "uống thuốc quá liều",
  "thuốc ngủ",
  "gom thuốc",
  "thuốc diệt cỏ",
  "thuốc sâu",

  // Nhóm 8: tìm kiếm/hỏi trực tiếp về kế hoạch — tín hiệu kế hoạch rõ ràng nhất có thể có
  // trong văn bản. Không lặp lại "uống thuốc tự tử"/"kế hoạch tự tử"/"cách tự tử" ở đây vì cả
  // ba đều chứa sẵn "tự tử" (đã có ở Nhóm 1) — thêm chúng vào mảng chỉ khiến chúng bị "tự tử"
  // che khuất trong `matched` mà không tăng khả năng phát hiện (Fix round 1, Finding 8).
  "cách để chết",

  // Nhóm 9: học sinh có thể code-switch sang tiếng Anh khi diễn đạt điều khó nói, hoặc dùng từ
  // lóng né bộ lọc phổ biến trong ngôn ngữ mạng ("unalive", "kms"). Dùng gốc từ "suicid" thay
  // vì "suicide" để bắt luôn "suicidal"/"suicides" mà không cần liệt kê từng biến thể — đây là
  // ngoại lệ CỐ Ý không có boundary \b ở cuối (xem NO_BOUNDARY_WORDS). "kms" có guard riêng
  // (PHRASE_GUARDS) để loại trừ "kms" = đơn vị khoảng cách (km/s) khi đứng ngay sau một con số
  // (Fix round 2, Finding 2). KHÔNG có "cutting" (Fix round 2, Finding 2 — quyết định có chủ
  // đích): từ này là một substring quá phổ biến trong tiếng Anh đời thường ("cutting edge",
  // "cutting class", "cutting board", dựng phim...) để làm một tín hiệu đơn lẻ đáng tin, và một
  // guard "phải đứng gần đại từ tự xưng" sẽ là một cơ chế mới chỉ để cứu một từ — không đáng.
  // Hành vi tự hại bằng cắt/rạch đã được phủ đủ bởi Nhóm 7 (rạch tay, cắt tay, cứa tay, cứa cổ
  // tay, rạch đùi...) và "self harm"/"self-harm" ngay dưới đây.
  "suicid",
  "kill myself",
  "end my life",
  "end it all",
  "want to die",
  "wanna die",
  "unalive",
  "kms",
  "self harm",
  "self-harm",
];

/**
 * Cụm biểu đạt TUYỆT VỌNG, VÔ GIÁ TRỊ, hoặc MUỐN BIẾN MẤT — mức "concern". Sau Fix round 2,
 * Finding 4: mức này KHÔNG chặn lượt gọi model ở caller (quyết định nằm ở Task 5's callable) —
 * chỉ tạo cảnh báo cho thầy cô hỏi thăm (không cần đi ngay), cuộc trò chuyện vẫn tiếp tục bình
 * thường. CỐ Ý không đưa các từ đơn lẻ như "mệt mỏi" hay "buồn" vào đây — chúng xuất hiện
 * thường xuyên trong than thở áp lực thi bình thường và sẽ khiến bộ lọc báo nhầm liên tục; chỉ
 * những cụm gắn rõ với vô vọng/vô giá trị/muốn biến mất mới đủ đặc hiệu để đưa vào danh sách
 * này.
 */
export const CONCERN_KEYWORDS: readonly string[] = [
  "vô dụng",
  "vô giá trị",
  "không ai cần",
  "không ai yêu",
  "không ai quan tâm",
  "là gánh nặng",
  "gánh nặng cho mọi người",
  "gánh nặng cho gia đình",

  // Cảm giác là gánh nặng (perceived burdensomeness) — một yếu tố nguy cơ tự tử được nhiều
  // tài liệu tâm lý học nêu tên cụ thể, tách biệt với nhóm "gánh nặng" ở trên vì đây là những
  // cách diễn đạt khác không chứa từ "gánh nặng". "..." trong cụm thứ hai là placeholder cho
  // chủ ngữ chen giữa ("bố mẹ", "cả nhà"...) — buildKeywordPattern hiểu "..." như một khoảng
  // trống bất kỳ (tối đa ~40 ký tự) giữa hai vế, không phải ba dấu chấm literal.
  "tốt hơn nếu không có em",
  "không có em thì ... đỡ khổ",
  "chỉ toàn làm khổ mọi người",

  "muốn biến mất",
  "ước gì mình chưa từng tồn tại",
  "ước gì con chưa từng sinh ra",
  "chán sống",
  "sống không có ý nghĩa",
  "cuộc sống vô nghĩa",
  "không còn hy vọng",
  "tuyệt vọng",
  "mệt mỏi với cuộc sống",
  "muốn ngủ mãi mãi",
  "không còn lý do để sống",
];

/** Escape các ký tự đặc biệt của regex trong một đoạn văn bản thuần. */
function escapeRegExp(segment: string): string {
  return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Bỏ dấu thanh và dấu phụ tiếng Việt: NFD tách dấu ra khỏi chữ cái rồi loại bỏ khối dấu tổ hợp
 * (U+0300–U+036F), và xử lý riêng "đ"/"Đ" vì đây là một chữ cái riêng trong bảng chữ cái tiếng
 * Việt chứ không phải "d" cộng dấu tổ hợp nên NFD không tách được.
 */
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/**
 * Học sinh gõ điện thoại thường rút gọn phụ âm đầu hoặc bỏ dấu thanh cho hai từ xuất hiện
 * trong rất nhiều cụm khoá ("không", "muốn") — VD "ko", "k", "hok" thay cho "không"; "mún"
 * thay cho "muốn". CHỈ mở rộng đúng hai từ này, không mở rộng toàn bộ danh sách: mỗi biến thể
 * viết tắt thêm vào là một nguồn báo nhầm tiềm năng mới, và hai từ này đã đủ phủ phần lớn cách
 * gõ tắt thực tế (Fix round 1, Finding 1).
 *
 * Dùng `Map` thay vì object literal (Fix round 2, Finding 6): tra cứu `{}[word]` với `word` do
 * người dùng nhập ("constructor", "toString", "valueOf"...) có thể trả về một hàm kế thừa từ
 * `Object.prototype` thay vì `undefined`, khiến code phía sau ném lỗi thay vì chỉ bỏ sót một
 * cách an toàn. `Map.get()` không có rủi ro này. Danh sách này được thiết kế để một người
 * không phải kỹ sư có thể sửa sau này (chuyên gia tâm lý rà soát và đề xuất thêm từ) — không
 * nên đòi hỏi họ phải biết về prototype pollution để sửa an toàn.
 */
const TEEN_ABBREVIATIONS: ReadonlyMap<string, readonly string[]> = new Map([
  ["không", ["không", "ko", "k", "hok", "hông", "kg"]],
  ["muốn", ["muốn", "mún", "mong"]],
]);

/**
 * "X muốn chết" là một cấu trúc tăng cường độ (intensifier) productive trong khẩu ngữ tiếng
 * Việt — gắn được vào hầu như bất kỳ tính từ/trạng thái nào ("khó muốn chết", "mệt muốn chết",
 * "nóng muốn chết"...) — và xuất hiện tự nhiên trong đúng use-case chính của app (than thở về
 * bài vở, thời tiết, chuyện đùa, áp lực thi cử). Đây là một va chạm từ vựng (orthographic
 * collision) với "muốn chết" mang nghĩa ý định tự tử, KHÔNG PHẢI phủ định — xem khối comment
 * "CỐ Ý KHÔNG có NEGATION_PREFIXES" tại detectCrisisKeywords để phân biệt hai việc này (Fix
 * round 1, Finding 4 & 6). Danh sách này sẽ không bao giờ đầy đủ (Fix round 2, Finding 3) — đó
 * là một phần lý do §3.1 được sửa để chỉ "urgent" mới chặn model, không riêng một danh sách
 * hữu hạn nào có thể tự gánh hết rủi ro báo nhầm.
 *
 * Fix round 2, Finding 3: bổ sung từ vựng đúng use-case áp lực thi cử của app ("áp lực", "căng
 * thẳng", "stress", "hồi hộp"...) và các từ lân cận với danh sách cũ ("ngượng" cạnh "ngại đã
 * có sẵn", "bực" cạnh "tức đã có sẵn").
 */
const MUON_CHET_INTENSIFIER_HOSTS: readonly string[] = [
  "khó",
  "mệt",
  "mệt mỏi",
  "nóng",
  "lạnh",
  "đói",
  "khát",
  "buồn",
  "chán",
  "sợ",
  "lo",
  "dài",
  "lâu",
  "đau",
  "cười",
  "vui",
  "thích",
  "tức",
  "bực",
  "ngại",
  "ngượng",
  "mừng",
  "giận",
  "ghét",
  "nhớ",
  "thèm",
  "áp lực",
  "căng thẳng",
  "stress",
  "xấu hổ",
  "hồi hộp",
  "hoảng",
  "nản",
  "rối",
];

type PhraseGuard = { readonly before?: string; readonly after?: string };

/**
 * Dựng alternation cho một danh sách "host" (có thể nhiều từ, VD "áp lực") dùng trong guard
 * lookbehind của "muốn chết" — mỗi host được thử ở cả dạng có dấu lẫn dạng bỏ dấu để guard vẫn
 * có hiệu lực với văn bản gõ tắt không dấu ("kho muon chet" cũng phải được loại trừ, nhất quán
 * với cơ chế bỏ dấu cấp-từ ở buildWordFragment).
 */
function buildIntensifierAlternation(hosts: readonly string[]): string {
  const branches = new Set<string>();
  for (const host of hosts) {
    const accented = host.split(/\s+/).map(escapeRegExp).join("\\s+");
    const stripped = stripDiacritics(host).split(/\s+/).map(escapeRegExp).join("\\s+");
    branches.add(accented);
    branches.add(stripped);
  }
  return `(?:${Array.from(branches).join("|")})`;
}

/**
 * Guard trật tự chữ (lookbehind/lookahead) riêng cho từng cụm cụ thể — CHỈ áp dụng cho đúng
 * cụm được liệt kê ở key, không làm mềm bất kỳ cụm nào khác trong hai danh sách trên. Đây là
 * cơ chế loại trừ va chạm CHỮ (một chuỗi ký tự trùng nhau nhưng khác nghĩa), khác với việc nới
 * lỏng theo NGHĨA (VD: phủ định) mà file này cố ý không làm — xem detectCrisisKeywords
 * (Fix round 1, Finding 4, 5 & 6). Dùng `Map` cùng lý do với TEEN_ABBREVIATIONS (Fix round 2,
 * Finding 6).
 */
const PHRASE_GUARDS: ReadonlyMap<string, PhraseGuard> = new Map([
  ["muốn chết", { before: `(?<!${buildIntensifierAlternation(MUON_CHET_INTENSIFIER_HOSTS)}\\s+)` }],
  // "cắt tay áo" (quần áo) và "cắt tay khi gọt hoa quả/rau củ" (tai nạn bếp núc) là hai cách
  // dùng "cắt tay" hoàn toàn vô hại thường gặp — loại trừ đúng hai ngữ cảnh này.
  ["cắt tay", { after: "(?!\\s*(?:áo|khi\\s+gọt))" }],
  // "nhảy cầu lông" là một môn thể thao — loại trừ đúng ngữ cảnh này.
  ["nhảy cầu", { after: "(?!\\s*lông)" }],
  // "kms" cũng là cách viết tắt đơn vị "km/s" — rất phổ biến khi học sinh kể về chạy bộ/thể
  // dục ("chạy được 3 kms"). Đơn vị khoảng cách luôn đi kèm một con số ngay trước nó, trong khi
  // tiếng lóng "kms" (kill myself) thì không — loại trừ đúng trường hợp có số đứng ngay trước
  // (Fix round 2, Finding 2).
  ["kms", { before: "(?<!\\d\\s*)" }],
]);

/**
 * true nếu `s` chỉ gồm chữ cái/số ASCII (không dấu tiếng Việt) — dùng để quyết định có nên bọc
 * `\b` hay không: `\b` của JS chỉ đáng tin cậy cho ASCII vì `\w` của JS không tính ký tự có dấu
 * tiếng Việt là "ký tự từ" (word character). Bọc `\b` quanh một chuỗi có dấu sẽ tạo ranh giới
 * GIẢ ngay giữa một từ tiếng Việt thật (VD: giữa "tu" và phần còn lại có dấu của "tuần"), nên
 * chỉ áp dụng cho các biến thể thuần ASCII, nơi `\b` hoạt động đúng như kỳ vọng (Fix round 2,
 * Finding 2).
 */
function isAsciiOnly(s: string): boolean {
  return /^[a-z0-9]+$/i.test(s);
}

/**
 * Các "từ" ASCII cố ý KHÔNG được bọc `\b` dù `isAsciiOnly()` đúng — vì đây là gốc từ dùng để
 * bắt cả biến thể dài hơn: "suicid" phải khớp cả bên trong "suicidal"/"suicides" (Fix round 1,
 * Finding 3), nên đầu ra không được có ranh giới từ ở cuối.
 */
const NO_BOUNDARY_WORDS: ReadonlySet<string> = new Set(["suicid"]);

/**
 * Dựng fragment regex literal cho một chuỗi khớp cụ thể: bọc `\b` hai đầu nếu chuỗi thuần
 * ASCII (trừ NO_BOUNDARY_WORDS) để tránh khớp giữa chừng một từ khác (Fix round 2, Finding 2)
 * — VD "k"/"kg" không còn khớp bên trong "Ok"/"50kg" nữa. Chuỗi có dấu tiếng Việt không bọc
 * `\b` vì lý do đã nêu ở isAsciiOnly().
 */
function literalFragment(candidate: string): string {
  const escaped = escapeRegExp(candidate);
  if (isAsciiOnly(candidate) && !NO_BOUNDARY_WORDS.has(candidate)) {
    return `\\b${escaped}\\b`;
  }
  return escaped;
}

/**
 * Dựng fragment regex cho một từ trong cụm khoá. Luôn thử hai dạng: nguyên văn (có dấu, nếu
 * có) và dạng bỏ dấu CỦA CHÍNH TỪ ĐÓ (Fix round 2, Finding 1) — so trực tiếp trên văn bản GỐC,
 * không strip cả câu, nên một từ trong văn bản mang dấu SAI (khác thanh điệu với từ khoá) sẽ
 * không khớp dạng nào trong hai dạng này — đây chính là cơ chế tránh gộp nhầm thanh điệu (xem
 * comment lớn ở đầu file). Nếu từ nằm trong TEEN_ABBREVIATIONS, cộng thêm alternation cho mọi
 * biến thể gõ tắt đã biết.
 */
function buildWordFragment(word: string): string {
  const candidates = new Set<string>([word, stripDiacritics(word)]);

  const abbreviations = TEEN_ABBREVIATIONS.get(word);
  if (abbreviations !== undefined) {
    for (const alt of abbreviations) {
      candidates.add(alt);
    }
  }

  const alternatives = Array.from(candidates).map(literalFragment);
  return alternatives.length === 1 ? alternatives[0] : `(?:${alternatives.join("|")})`;
}

/**
 * Dựng regex khớp một cụm khoá. Cho phép khoảng trắng bất kỳ (một hoặc nhiều — dấu cách, xuống
 * dòng, non-breaking space...) giữa các từ, để học sinh chèn xuống dòng hay double space giữa
 * hai từ không lách được qua so khớp chuỗi con đơn giản. Cụm chứa "..." được hiểu là hai vế
 * cách nhau một khoảng trống bất kỳ (dùng cho các cụm có chủ ngữ chen giữa, VD "không có em
 * thì ... đỡ khổ"). Mở rộng gõ tắt/bỏ dấu qua buildWordFragment, và áp guard trật tự chữ riêng
 * của cụm (PHRASE_GUARDS) nếu có.
 */
function buildKeywordPattern(normalizedKeyword: string): RegExp {
  const segments = normalizedKeyword.split("...").map((segment) => segment.trim());
  const segmentBodies = segments.map((segment) =>
    segment
      .split(/\s+/)
      .map((word) => buildWordFragment(word))
      .join("\\s+"),
  );
  const body = segmentBodies.join("[\\s\\S]{0,40}?");

  const guard = PHRASE_GUARDS.get(normalizedKeyword);
  const before = guard?.before ?? "";
  const after = guard?.after ?? "";
  return new RegExp(before + body + after);
}

/**
 * Tìm từ khoá đầu tiên trong `keywords` xuất hiện trong văn bản (đã NFC + lowercase, KHÔNG bỏ
 * dấu cả câu — xem Fix round 2, Finding 1).
 */
function findFirstMatch(normalizedText: string, keywords: readonly string[]): string | null {
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.normalize("NFC").toLowerCase();
    const pattern = buildKeywordPattern(normalizedKeyword);
    if (pattern.test(normalizedText)) {
      return keyword;
    }
  }
  return null;
}

export type CrisisDetectionResult = {
  detected: boolean;
  severity: "urgent" | "concern" | null;
  /** Cụm từ khoá (nguyên văn trong URGENT_KEYWORDS/CONCERN_KEYWORDS) đã kích hoạt — dùng để
   *  admin hiệu chỉnh danh sách. KHÔNG được ghi trường này (hay bất kỳ trích đoạn nào từ lời
   *  học sinh) vào crisisAlerts — xem §3.4 design spec: cảnh báo không chứa nội dung gốc. */
  matched: string | null;
};

// CỐ Ý KHÔNG có NEGATION_PREFIXES như safetyFilter.ts — đây không phải một chỗ sót, mà là một
// quyết định khác cho một bài toán khác (Fix round 1, Finding 6). safetyFilter lọc OUTPUT của
// model ở văn phong trang trọng, nơi cụm phủ định gắn với câu rào đón có khuôn mẫu chính model
// tự sinh ra ("không phải là chẩn đoán..."). Ở đây, bộ lọc quét văn bản TỰ DO của một học sinh
// đang khủng hoảng, nơi phủ định là tín hiệu an toàn rất yếu: "Em không muốn chết, em chỉ muốn
// mọi thứ dừng lại" là một cách trình bày ambivalent kinh điển trong khủng hoảng tự tử — giảm
// nhẹ (minimisation) là một ĐẶC ĐIỂM của việc bộc lộ khủng hoảng, không phải nhiễu cần lọc.
// Thêm nữa, một exemption phủ định ở đây sẽ nới lỏng một lượt PHÁT HIỆN, trong khi ở
// safetyFilter nó nới lỏng một lượt CHẶN — hai hướng sai lầm ngược nhau, nên mang cùng cơ chế
// sang đây là sai theo hướng KHÔNG GIỚI HẠN được (mất vĩnh viễn khả năng bắt một tuyên bố
// ambivalent thật). Cùng lý do, phát hiện hộ người thứ ba ("bạn em nói nó muốn biến mất") vẫn
// cố ý được giữ nguyên, không bị loại trừ: một học sinh đang mang hộ lời bộc lộ khủng hoảng của
// bạn mình cần cuộc trò chuyện đó xảy ra trên chính tài khoản của em — "bộc lộ hộ người khác" là
// một hình thái đã biết của việc học sinh tìm cách nói ra mối lo cho người khác.
//
// Guard riêng cho "muốn chết" (PHRASE_GUARDS ở trên) KHÔNG mâu thuẫn với quyết định này: đó là
// guard trật tự CHỮ cho một va chạm từ vựng ngẫu nhiên ("khó muốn chết" = một từ vựng tăng
// cường khác trùng chuỗi ký tự, không liên quan gì tới ý định tự tử) — không phải một exemption
// theo NGHĨA cho phủ định. Từ chối nới lỏng theo ngữ nghĩa trong khi vẫn thêm guard theo trật tự
// chữ là hai lập trường nhất quán với nhau, không phải hai tiêu chuẩn khác nhau.
export function detectCrisisKeywords(text: string): CrisisDetectionResult {
  // Chuẩn hoá NFC + lowercase trước khi so khớp: tiếng Việt có thể tới dưới dạng NFC hoặc NFD
  // (dấu tổ hợp tách rời), cùng một chữ nhưng khác byte — so khớp phải bất biến với cả hai
  // dạng và không phân biệt hoa thường. KHÔNG bỏ dấu cả câu ở đây (Fix round 2, Finding 1) —
  // việc bỏ dấu chỉ xảy ra CẤP TỪ, bên trong buildWordFragment, để không gộp mất thanh điệu.
  // Chuỗi rỗng tự nhiên rơi qua mọi pattern (không cụm nào khớp chuỗi rỗng) nên không cần nhánh
  // đặc biệt cho nó.
  const normalized = text.normalize("NFC").toLowerCase();

  const urgentMatch = findFirstMatch(normalized, URGENT_KEYWORDS);
  if (urgentMatch !== null) {
    return { detected: true, severity: "urgent", matched: urgentMatch };
  }

  const concernMatch = findFirstMatch(normalized, CONCERN_KEYWORDS);
  if (concernMatch !== null) {
    return { detected: true, severity: "concern", matched: concernMatch };
  }

  return { detected: false, severity: null, matched: null };
}
