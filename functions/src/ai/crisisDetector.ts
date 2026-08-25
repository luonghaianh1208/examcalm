// Bộ phát hiện khủng hoảng theo từ khoá — thuần TypeScript, không import firebase-admin,
// không đọc Firestore, không state mức module. Đây là Lớp 1 trong hai lớp phát hiện độc lập
// (§3.1 design spec): nhanh, miễn phí, tất định, chạy TRƯỚC khi gọi model. Bắt được ở đây thì
// KHÔNG gọi model nữa — trả thẳng phản hồi khủng hoảng, không có lý do gửi câu nói của học
// sinh ra một bên thứ ba.
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
// Fix round 1: một khi Lớp 1 khớp, model KHÔNG được gọi nữa — học sinh nhận thẳng phản hồi
// khủng hoảng (§3.1). Nghĩa là một báo nhầm ở đây không chỉ là "thầy cô hỏi thăm nhầm", mà còn
// là một học sinh đang than thở bình thường ("Đề khó muốn chết luôn") nhận về tổng đài 111 thay
// vì một câu trả lời chuyện trò — và học được rằng phải né chatbot để nói chuyện bình thường.
// Vì vậy hai việc cùng tồn tại trong file này không mâu thuẫn nhau: (a) danh sách vẫn CỐ Ý bao
// phủ rộng, và (b) một số cụm có guard hẹp, tường minh để loại trừ đúng một va chạm từ vựng
// (orthographic collision) cực kỳ phổ biến trong khẩu ngữ — xem PHRASE_GUARDS bên dưới và khối
// comment "CỐ Ý KHÔNG có NEGATION_PREFIXES" cạnh detectCrisisKeywords để phân biệt hai việc này
// với việc nới lỏng theo ngữ nghĩa (điều file này không làm).
//
// Fix round 1 cũng thêm một lượt so khớp dự phòng không dấu: học sinh gõ điện thoại bỏ dấu
// thanh là chuyện thường ngày ("em muon tu tu", "e ko muon song nua"), không phải edge case —
// bỏ qua nó là một lỗ hổng ở tầng cơ chế mà không danh sách từ khoá có dấu nào bịt được.

/**
 * Cụm biểu đạt Ý ĐỊNH hoặc KẾ HOẠCH tự hại — mức "urgent", thầy cô cần can thiệp NGAY.
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
  // vì "suicide" để bắt luôn "suicidal"/"suicides" mà không cần liệt kê từng biến thể.
  "suicid",
  "kill myself",
  "end my life",
  "end it all",
  "want to die",
  "wanna die",
  "unalive",
  "kms",
  "cutting",
  "self harm",
  "self-harm",
];

/**
 * Cụm biểu đạt TUYỆT VỌNG, VÔ GIÁ TRỊ, hoặc MUỐN BIẾN MẤT — mức "concern", chưa có ý định
 * hay kế hoạch cụ thể, nhưng thầy cô nên hỏi thăm (không cần đi ngay). CỐ Ý không đưa các từ
 * đơn lẻ như "mệt mỏi" hay "buồn" vào đây — chúng xuất hiện thường xuyên trong than thở áp
 * lực thi bình thường và sẽ khiến bộ lọc báo nhầm liên tục; chỉ những cụm gắn rõ với vô
 * vọng/vô giá trị/muốn biến mất mới đủ đặc hiệu để đưa vào danh sách này.
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
 * Việt chứ không phải "d" cộng dấu tổ hợp nên NFD không tách được. Dùng làm lượt so khớp dự
 * phòng (Fix round 1, Finding 1) — gõ điện thoại bỏ dấu thanh là thói quen phổ biến của học
 * sinh, không phải trường hợp hiếm.
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
 */
const TEEN_ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  không: ["không", "ko", "k", "hok", "hông", "kg"],
  muốn: ["muốn", "mún", "mong"],
};

/**
 * "X muốn chết" là một cấu trúc tăng cường độ (intensifier) productive trong khẩu ngữ tiếng
 * Việt — gắn được vào hầu như bất kỳ tính từ trạng thái nào ("khó muốn chết", "mệt muốn chết",
 * "nóng muốn chết"...) — và xuất hiện tự nhiên trong đúng use-case chính của app (than thở về
 * bài vở, thời tiết, chuyện đùa). Đây là một va chạm từ vựng (orthographic collision) với "muốn
 * chết" mang nghĩa ý định tự tử, KHÔNG PHẢI phủ định — xem khối comment "CỐ Ý KHÔNG có
 * NEGATION_PREFIXES" tại detectCrisisKeywords để phân biệt hai việc này (Fix round 1,
 * Finding 4 & 6).
 */
const MUON_CHET_INTENSIFIER_HOSTS: readonly string[] = [
  "khó",
  "mệt",
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
  "ngại",
  "mừng",
  "giận",
  "ghét",
  "nhớ",
  "thèm",
];

type PhraseGuard = { readonly before?: string; readonly after?: string };

/**
 * Guard trật tự chữ (lookbehind/lookahead) riêng cho từng cụm cụ thể — CHỈ áp dụng cho đúng
 * cụm được liệt kê ở key, không làm mềm bất kỳ cụm nào khác trong hai danh sách trên. Đây là
 * cơ chế loại trừ va chạm CHỮ (một chuỗi ký tự trùng nhau nhưng khác nghĩa), khác với việc nới
 * lỏng theo NGHĨA (VD: phủ định) mà file này cố ý không làm — xem detectCrisisKeywords
 * (Fix round 1, Finding 4, 5 & 6).
 */
const PHRASE_GUARDS: Readonly<Record<string, PhraseGuard>> = {
  "muốn chết": {
    before: `(?<!(?:${MUON_CHET_INTENSIFIER_HOSTS.join("|")})\\s+)`,
  },
  // "cắt tay áo" (quần áo) và "cắt tay khi gọt hoa quả/rau củ" (tai nạn bếp núc) là hai cách
  // dùng "cắt tay" hoàn toàn vô hại thường gặp — loại trừ đúng hai ngữ cảnh này.
  "cắt tay": {
    after: "(?!\\s*(?:áo|khi\\s+gọt))",
  },
  // "nhảy cầu lông" là một môn thể thao — loại trừ đúng ngữ cảnh này.
  "nhảy cầu": {
    after: "(?!\\s*lông)",
  },
};

/**
 * Dựng fragment regex cho một từ trong cụm khoá: nếu từ nằm trong TEEN_ABBREVIATIONS, dựng
 * alternation cho mọi biến thể gõ tắt đã biết; nếu không, escape từ đó như văn bản thuần.
 * `transform` là hàm biến đổi áp dụng cho từng biến thể trước khi escape — dùng để tạo lượt so
 * khớp không dấu (stripDiacritics) song song với lượt có dấu (danh tính).
 */
function buildWordFragment(word: string, transform: (segment: string) => string): string {
  const abbreviations = TEEN_ABBREVIATIONS[word];
  if (abbreviations !== undefined) {
    const alternatives = abbreviations.map((alt) => escapeRegExp(transform(alt)));
    return `(?:${alternatives.join("|")})`;
  }
  return escapeRegExp(transform(word));
}

/**
 * Dựng regex khớp một cụm khoá. Cho phép khoảng trắng bất kỳ (một hoặc nhiều — dấu cách, xuống
 * dòng, non-breaking space...) giữa các từ, để học sinh chèn xuống dòng hay double space giữa
 * hai từ không lách được qua so khớp chuỗi con đơn giản. Cụm chứa "..." được hiểu là hai vế
 * cách nhau một khoảng trống bất kỳ (dùng cho các cụm có chủ ngữ chen giữa, VD "không có em
 * thì ... đỡ khổ"). Mở rộng gõ tắt cho "không"/"muốn" qua buildWordFragment, và áp guard trật
 * tự chữ riêng của cụm (PHRASE_GUARDS) nếu có — `transform` được áp dụng thống nhất cho cả từ
 * khoá lẫn guard để lượt so khớp không dấu nhất quán với lượt có dấu.
 */
function buildKeywordPattern(
  normalizedKeyword: string,
  transform: (segment: string) => string,
): RegExp {
  const segments = normalizedKeyword.split("...").map((segment) => segment.trim());
  const segmentBodies = segments.map((segment) =>
    segment
      .split(/\s+/)
      .map((word) => buildWordFragment(word, transform))
      .join("\\s+"),
  );
  const body = segmentBodies.join("[\\s\\S]{0,40}?");

  const guard = PHRASE_GUARDS[normalizedKeyword];
  const before = guard?.before !== undefined ? transform(guard.before) : "";
  const after = guard?.after !== undefined ? transform(guard.after) : "";
  return new RegExp(before + body + after);
}

/**
 * Tìm từ khoá đầu tiên trong `keywords` xuất hiện trong văn bản. Thử lượt có dấu trước, chỉ
 * rơi xuống lượt không dấu (stripDiacritics) nếu lượt có dấu không khớp — giữ độ chính xác cho
 * văn bản có dấu, chỉ nới ra khi cần (Fix round 1, Finding 1).
 */
function findFirstMatch(
  normalizedAccentedText: string,
  normalizedStrippedText: string,
  keywords: readonly string[],
): string | null {
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.normalize("NFC").toLowerCase();

    const accentedPattern = buildKeywordPattern(normalizedKeyword, (segment) => segment);
    if (accentedPattern.test(normalizedAccentedText)) {
      return keyword;
    }

    const strippedPattern = buildKeywordPattern(normalizedKeyword, stripDiacritics);
    if (strippedPattern.test(normalizedStrippedText)) {
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
  // dạng và không phân biệt hoa thường. Chuỗi rỗng tự nhiên rơi qua mọi pattern (không cụm nào
  // khớp chuỗi rỗng) nên không cần nhánh đặc biệt cho nó.
  const normalizedAccented = text.normalize("NFC").toLowerCase();
  const normalizedStripped = stripDiacritics(normalizedAccented);

  const urgentMatch = findFirstMatch(normalizedAccented, normalizedStripped, URGENT_KEYWORDS);
  if (urgentMatch !== null) {
    return { detected: true, severity: "urgent", matched: urgentMatch };
  }

  const concernMatch = findFirstMatch(normalizedAccented, normalizedStripped, CONCERN_KEYWORDS);
  if (concernMatch !== null) {
    return { detected: true, severity: "concern", matched: concernMatch };
  }

  return { detected: false, severity: null, matched: null };
}
