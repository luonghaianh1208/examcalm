/**
 * Nội dung MẪU dùng chung cho cả hai script seed.
 *
 * TOÀN BỘ nội dung ở đây là GIẢ và CHƯA qua thẩm định chuyên môn (spec §1.1).
 * Bài test mang cờ `isSampleContent: true`; rule production cấm publish một bài
 * test mang cờ này, nên `seed-prod.mts` ghi nó ở trạng thái `draft`.
 *
 * Không đặt timestamp ở đây: Admin SDK dùng `FieldValue.serverTimestamp()` còn
 * client SDK dùng `serverTimestamp()` — mỗi script tự thêm loại phù hợp.
 */

export const SEED_ACTOR = "seed-script";

export const SAMPLE_TEST_ID = "sample-exam-stress-v1";

export const SAMPLE_TEST = {
  title: "Bài test tham khảo về căng thẳng trước kỳ thi (MẪU)",
  version: 1,
  isSampleContent: true,
  disclaimer:
    "Đây là công cụ tự tìm hiểu, không phải chẩn đoán y khoa hay tâm lý. " +
    "Nếu bạn đang thấy rất khó khăn, hãy nói với phụ huynh, thầy cô hoặc cán bộ tâm lý học đường.",
  questions: [
    { id: "q1", text: "Dạo này, bạn có khó đi vào giấc ngủ vì cứ nghĩ đến kỳ thi không?" },
    { id: "q2", text: "Khi ngồi vào bàn học, bạn có thấy khó tập trung không?" },
    { id: "q3", text: "Bạn có hay lo rằng mình sẽ làm bài không tốt không?" },
    { id: "q4", text: "Bạn có thấy căng cơ, đau đầu hoặc khó chịu ở bụng khi nghĩ đến kỳ thi không?" },
    { id: "q5", text: "Bạn có né tránh việc ôn tập vì cảm thấy quá tải không?" },
  ].map((q) => ({
    ...q,
    options: [
      { label: "Không bao giờ", score: 0 },
      { label: "Thỉnh thoảng", score: 1 },
      { label: "Khá thường xuyên", score: 2 },
      { label: "Gần như mỗi ngày", score: 3 },
    ],
  })),
  scoring: {
    thresholds: [
      { min: 0, max: 4, level: "thap", interpretation: "Bạn đang khá ổn. Giữ nhịp sinh hoạt hiện tại nhé." },
      { min: 5, max: 9, level: "trung-binh", interpretation: "Có vài dấu hiệu căng thẳng. Thử một kỹ thuật thư giãn ngắn trong thư viện." },
      { min: 10, max: 15, level: "cao", interpretation: "Bạn đang chịu khá nhiều áp lực. Hãy cân nhắc chia sẻ với người bạn tin tưởng." },
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
