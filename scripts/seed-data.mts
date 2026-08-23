/**
 * Nội dung MẪU dùng chung cho cả hai script seed.
 *
 * SAMPLE_RESOURCES bên dưới là nội dung GIẢ, CHƯA qua thẩm định chuyên môn
 * (spec §1.1), mang cờ `isSampleContent: true`; rule production cấm publish
 * nội dung mang cờ này, nên `seed-prod.mts` ghi các bài đó ở trạng thái `draft`.
 * SAMPLE_TEST (GAD-7) KHÔNG mang cờ này — xem giải thích `isSampleContent: false`
 * ngay phía trên định nghĩa của nó.
 *
 * Không đặt timestamp ở đây: Admin SDK dùng `FieldValue.serverTimestamp()` còn
 * client SDK dùng `serverTimestamp()` — mỗi script tự thêm loại phù hợp.
 */

export const SEED_ACTOR = "seed-script";

export const SAMPLE_TEST_ID = "gad7-vi-v1";

/**
 * GAD-7 (Generalized Anxiety Disorder 7-item scale) — thang đo SÀNG LỌC lo âu
 * phổ biến, công khai, dùng rộng rãi cho cả thanh thiếu niên.
 *
 * Điểm: 7 mục × 0–3, tổng 0–21. Mốc chuẩn 5 / 10 / 15 chia thành bốn mức
 * tối thiểu / nhẹ / vừa / nặng. Từ 10 điểm trở lên, tài liệu chuyên môn khuyến
 * nghị nên được đánh giá kỹ hơn bởi người có chuyên môn.
 *
 * `isSampleContent: false` vì đây là thang đo THẬT, không phải câu hỏi tự nghĩ.
 *
 * NHƯNG: bản tiếng Việt dưới đây là bản CHUYỂN NGỮ do AI soạn theo nội dung
 * chuẩn của GAD-7, KHÔNG phải bản dịch đã được kiểm định tâm lý học tại Việt
 * Nam. Trước khi dùng cho nghiên cứu hoặc mở rộng ngoài phạm vi lớp học có
 * giáo viên đi kèm, cần người có chuyên môn đọc lại và đối chiếu với một bản
 * dịch đã công bố. Ghi nhận việc này ở docs/superpowers/plans/roadmap.
 */
export const SAMPLE_TEST = {
  title: "Thang đo lo âu GAD-7",
  version: 1,
  isSampleContent: false,
  disclaimer:
    "Hãy nghĩ về HAI TUẦN VỪA QUA khi trả lời. " +
    "Đây là công cụ tự tìm hiểu, giúp bạn nhìn rõ hơn cảm giác của mình — " +
    "nó KHÔNG phải chẩn đoán y khoa hay tâm lý, và không thay thế người có chuyên môn. " +
    "Bản tiếng Việt của bài test này đang chờ một chuyên gia tâm lý đối chiếu và thẩm định. " +
    "Nếu bạn đang thấy rất khó khăn, hãy nói với phụ huynh, thầy cô hoặc cán bộ tâm lý học đường.",
  questions: [
    { id: "q1", text: "Cảm thấy lo lắng, bồn chồn hoặc căng thẳng" },
    { id: "q2", text: "Không thể ngừng lo hoặc không kiểm soát được nỗi lo" },
    { id: "q3", text: "Lo quá nhiều về những chuyện khác nhau" },
    { id: "q4", text: "Khó thư giãn" },
    { id: "q5", text: "Bồn chồn tới mức khó ngồi yên" },
    { id: "q6", text: "Dễ bực bội hoặc cáu kỉnh" },
    { id: "q7", text: "Cảm thấy sợ, như thể sắp có chuyện gì đó không hay xảy ra" },
  ].map((q) => ({
    ...q,
    options: [
      { label: "Không có ngày nào", score: 0 },
      { label: "Vài ngày", score: 1 },
      { label: "Hơn một nửa số ngày", score: 2 },
      { label: "Gần như mỗi ngày", score: 3 },
    ],
  })),
  scoring: {
    thresholds: [
      {
        min: 0, max: 4, level: "toi-thieu",
        interpretation:
          "Trong hai tuần qua, có vẻ bạn không bị lo âu làm phiền nhiều. " +
          "Giữ nhịp sinh hoạt hiện tại, và cứ quay lại đây khi bạn muốn xem mình đang thế nào.",
      },
      {
        min: 5, max: 9, level: "nhe",
        interpretation:
          "Có một vài dấu hiệu lo âu ở mức nhẹ. Điều này khá thường gặp quanh mùa thi. " +
          "Thử một kỹ thuật thư giãn ngắn trong Thư viện, và để ý xem cảm giác thay đổi thế nào.",
      },
      {
        min: 10, max: 14, level: "vua",
        interpretation:
          "Kết quả gợi ý mức lo âu vừa phải. Ở mức này, nói chuyện với một người bạn tin tưởng " +
          "— phụ huynh, thầy cô, hoặc cán bộ tâm lý học đường — thường giúp ích nhiều hơn là tự xoay xở một mình.",
      },
      {
        min: 15, max: 21, level: "nang",
        interpretation:
          "Từ những gì bạn chia sẻ, có vẻ bạn đang phải chịu đựng khá nhiều trong hai tuần qua. " +
          "Bạn không cần tự mình vượt qua chuyện này. Hãy nói với phụ huynh, thầy cô hoặc cán bộ tâm lý " +
          "học đường sớm nhất có thể — kể cả khi bạn chưa biết diễn đạt thế nào. " +
          "Và nếu ngay lúc này khó tìm được ai để nói, Tổng đài Quốc gia Bảo vệ Trẻ em — số 111 — " +
          "luôn có người trực để lắng nghe, miễn phí và hoạt động 24/7. Đó cũng là một cánh cửa, " +
          "bất cứ lúc nào bạn cần.",
      },
    ],
  },
  updatedBy: SEED_ACTOR,
};

export const SAMPLE_RESOURCES = [
  {
    title: "Kỹ thuật thở 4-7-8",
    slug: "ky-thuat-tho-4-7-8",
    type: "guide", category: "Thư giãn", tags: ["thở", "trước khi ngủ"],
    content:
      "## Làm thế nào\n\n1. Hít vào bằng mũi, đếm thầm tới 4.\n2. Giữ hơi, đếm tới 7.\n3. Thở ra bằng miệng, đếm tới 8.\n4. Lặp lại 4 vòng.\n\n## Khi nào dùng\n\nTrước khi ngủ, hoặc ngay trước khi bước vào phòng thi.",
    videoUrl: null, visibility: "public",
  },
  {
    title: "Chia nhỏ buổi ôn thành 25 phút",
    slug: "chia-nho-buoi-on-25-phut",
    type: "tip", category: "Học tập", tags: ["tập trung", "quản lý thời gian"],
    content:
      "Ngồi vào bàn với ý định học 3 tiếng thường khiến ta trì hoãn.\n\nThử đặt hẹn giờ 25 phút, học một việc duy nhất, rồi nghỉ 5 phút. Sau 4 vòng thì nghỉ dài hơn.",
    videoUrl: null, visibility: "public",
  },
  {
    title: "Khi đầu óc trắng xóa lúc làm bài",
    slug: "khi-dau-oc-trang-xoa-luc-lam-bai",
    type: "article", category: "Chuẩn bị thi", tags: ["phòng thi", "lo âu"],
    content:
      "Đầu óc trắng xóa là phản ứng bình thường của cơ thể khi căng thẳng, không phải dấu hiệu bạn không biết gì.\n\n**Thử theo thứ tự này:**\n\n1. Đặt bút xuống, thở ra thật chậm ba lần.\n2. Bỏ qua câu đang mắc, làm câu bạn chắc chắn nhất.\n3. Quay lại câu khó sau khi đã lấy lại nhịp.",
    videoUrl: null, visibility: "public",
  },
  {
    title: "Ghi lại ba điều đã làm được hôm nay",
    slug: "ghi-lai-ba-dieu-da-lam-duoc-hom-nay",
    type: "tip", category: "Thư giãn", tags: ["nhật ký"],
    content:
      "Cuối ngày, viết ra ba việc bạn đã làm được — dù nhỏ tới đâu.\n\nMục tiêu không phải là thấy mình giỏi, mà là nhìn thấy ngày hôm nay không trống rỗng như cảm giác đang có.",
    videoUrl: null, visibility: "student_only",
  },
];
