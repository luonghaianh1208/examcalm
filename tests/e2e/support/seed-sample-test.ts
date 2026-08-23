import { initializeApp, cert, applicationDefault, getApps, type App } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * `npm run seed` (chạy trước `playwright test` trong script `test:e2e`) hiện
 * seed đúng một bài test THẬT — GAD-7 (isSampleContent=false, xem
 * scripts/seed-data.mts) — không còn bài test nào gắn cờ "nội dung mẫu" nữa.
 *
 * Suite E2E vẫn cần kiểm tra hành vi UI khi isSampleContent=true (banner cảnh
 * báo "Nội dung mẫu" trên SampleContentBanner/TestResult) — nên tự seed thêm
 * MỘT bài test riêng, CHỈ DÙNG CHO E2E, hoàn toàn tách biệt khỏi
 * scripts/seed.mts và scripts/seed-data.mts (không đụng tới các file đó theo
 * yêu cầu — chúng vừa được refactor và đang dùng cho production thật).
 */
export const E2E_SAMPLE_TEST_ID = "e2e-sample-content-test";

function adminApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return initializeApp({
    credential: raw ? cert(JSON.parse(raw) as Record<string, string>) : applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "examcalm-dev",
  });
}

export async function seedSampleContentTest(): Promise<void> {
  await getFirestore(adminApp())
    .collection("testDefinitions")
    .doc(E2E_SAMPLE_TEST_ID)
    .set({
      title: "Bài test tham khảo về căng thẳng trước kỳ thi (MẪU)",
      version: 1,
      status: "published",
      isSampleContent: true,
      disclaimer:
        "Đây là công cụ tự tìm hiểu, không phải chẩn đoán y khoa hay tâm lý. " +
        "Nếu bạn đang thấy rất khó khăn, hãy nói với phụ huynh, thầy cô hoặc cán bộ tâm lý học đường.",
      questions: [
        { id: "q1", text: "Dạo này, bạn có khó đi vào giấc ngủ vì cứ nghĩ đến kỳ thi không?" },
        { id: "q2", text: "Khi ngồi vào bàn học, bạn có thấy khó tập trung không?" },
        { id: "q3", text: "Bạn có hay lo rằng mình sẽ làm bài không tốt không?" },
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
          { min: 0, max: 3, level: "thap", interpretation: "Bạn đang khá ổn. Giữ nhịp sinh hoạt hiện tại nhé." },
          { min: 4, max: 6, level: "trung-binh", interpretation: "Có vài dấu hiệu căng thẳng. Thử một kỹ thuật thư giãn ngắn trong thư viện." },
          { min: 7, max: 9, level: "cao", interpretation: "Bạn đang chịu khá nhiều áp lực. Hãy cân nhắc chia sẻ với người bạn tin tưởng." },
        ],
      },
      updatedBy: "e2e-suite",
      updatedAt: FieldValue.serverTimestamp(),
    });
}
