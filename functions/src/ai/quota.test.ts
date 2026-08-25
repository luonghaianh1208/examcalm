// LỰA CHỌN HARNESS: Firestore emulator, KHÔNG dùng db giả. Lý do (xem task-7-brief.md,
// mục 7): kiểm chứng transaction không mất lượt tăng dưới truy cập song song chỉ có ý
// nghĩa khi chạy trên Firestore thật — một db giả tự viết chỉ chứng minh được rằng chính
// cái fake đó cư xử đúng như code test viết ra, không chứng minh được semantics thật của
// transaction Firestore (optimistic concurrency, tự retry khi xung đột).
//
// File này BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã được set (do
// `firebase emulators:exec` set tự động). Chạy bằng:
//   npm run test:quota   (script trong functions/package.json, tự bọc emulator)
// hoặc thủ công nếu emulator Firestore đã chạy sẵn ở nơi khác:
//   npx vitest run src/ai/quota.test.ts
//
// Fix round 1 cho Task 5 (Finding 1, CRITICAL): consumeQuota() giờ nhận thêm tham số
// `feature` ("reflection" | "chat") — mọi test dưới đây dùng "reflection" cho các phép thử
// thuần cơ chế (không quan tâm tính năng nào), TRỪ describe cuối file, chuyên kiểm chứng
// đúng bất biến MỚI: hai feature khác nhau không thể làm cạn quota của nhau.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { consumeQuota } from "./quota";

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "quota.test.ts cần Firestore emulator: chạy `npm run test:quota` (đã bọc sẵn " +
        "firebase emulators:exec) thay vì gọi vitest trực tiếp mà không có emulator.",
    );
  }
  // Máy chạy test không nằm trên GCP — không có metadata server để hỏi. Không tắt dòng này
  // thì google-auth-library vẫn thử dò rồi mới bỏ cuộc, in ra MetadataLookupWarning (vi
  // phạm yêu cầu "test output sạch, không warning") dù không ảnh hưởng kết quả test.
  process.env.METADATA_SERVER_DETECTION = "none";
  app = initializeApp({ projectId: "examcalm-quota-test" }, "quota-test-app");
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("aiUsage"));
});

describe("consumeQuota", () => {
  it("lượt đầu trong ngày được cho phép, tạo aiUsage với count 1", async () => {
    const now = new Date("2026-08-24T03:00:00Z"); // 10:00 giờ VN cùng ngày
    const result = await consumeQuota(
      db,
      "u1",
      "reflection",
      { quotaStudentPerDay: 5, rateLimitPerMinute: 60 },
      now,
    );

    expect(result).toEqual({ allowed: true, reason: null });

    const snap = await db.collection("aiUsage").doc("u1_reflection_2026-08-24").get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.count).toBe(1);
    expect(snap.data()?.uid).toBe("u1");
    expect(snap.data()?.feature).toBe("reflection");
    expect(snap.data()?.date).toBe("2026-08-24");
  });

  it("cho phép đúng N lượt khi quotaStudentPerDay=N, từ chối lượt N+1 với reason quota và KHÔNG tăng count", async () => {
    const config = { quotaStudentPerDay: 3, rateLimitPerMinute: 120 };
    const base = new Date("2026-08-24T02:00:00Z").getTime();
    const nowAt = (i: number) => new Date(base + i * 60_000); // cách nhau 1 phút, xa ngưỡng rate limit

    for (let i = 0; i < 3; i++) {
      const result = await consumeQuota(db, "u2", "reflection", config, nowAt(i));
      expect(result).toEqual({ allowed: true, reason: null });
    }

    const denied = await consumeQuota(db, "u2", "reflection", config, nowAt(3));
    expect(denied).toEqual({ allowed: false, reason: "quota" });

    const snapAfterFirstDenial = await db.collection("aiUsage").doc("u2_reflection_2026-08-24").get();
    expect(snapAfterFirstDenial.data()?.count).toBe(3);

    // Gọi thêm lần nữa sau khi đã bị từ chối — vẫn bị từ chối, count vẫn dừng ở 3.
    // Đây là phép thử trực tiếp cho yêu cầu: một lượt bị từ chối KHÔNG được tiêu quota.
    const deniedAgain = await consumeQuota(db, "u2", "reflection", config, nowAt(4));
    expect(deniedAgain).toEqual({ allowed: false, reason: "quota" });

    const snapAfterSecondDenial = await db.collection("aiUsage").doc("u2_reflection_2026-08-24").get();
    expect(snapAfterSecondDenial.data()?.count).toBe(3);
  });

  it("quotaStudentPerDay = 0 từ chối ngay lượt đầu (KHÔNG phải unlimited)", async () => {
    const now = new Date("2026-08-24T02:00:00Z");
    const result = await consumeQuota(
      db,
      "u3",
      "reflection",
      { quotaStudentPerDay: 0, rateLimitPerMinute: 60 },
      now,
    );

    expect(result).toEqual({ allowed: false, reason: "quota" });

    const snap = await db.collection("aiUsage").doc("u3_reflection_2026-08-24").get();
    expect(snap.exists).toBe(false); // bị từ chối ngay từ transaction đầu tiên, chưa từng ghi doc
  });

  it("tính đúng ngày theo giờ Việt Nam (UTC+7): 23:00 UTC rơi vào ngày VN kế tiếp", async () => {
    const now = new Date("2026-08-24T23:00:00Z"); // = 2026-08-25T06:00:00 giờ VN
    const result = await consumeQuota(
      db,
      "u4",
      "reflection",
      { quotaStudentPerDay: 5, rateLimitPerMinute: 60 },
      now,
    );

    expect(result.allowed).toBe(true);

    const wrongDay = await db.collection("aiUsage").doc("u4_reflection_2026-08-24").get();
    expect(wrongDay.exists).toBe(false);

    const rightDay = await db.collection("aiUsage").doc("u4_reflection_2026-08-25").get();
    expect(rightDay.exists).toBe(true);
    expect(rightDay.data()?.date).toBe("2026-08-25");
  });

  it("hai lượt cách nhau dưới ngưỡng rate limit → lượt thứ hai bị từ chối reason rate_limit, không tăng count", async () => {
    const config = { quotaStudentPerDay: 10, rateLimitPerMinute: 60 }; // ngưỡng tối thiểu 1000ms
    const t1 = new Date("2026-08-24T02:00:00.000Z");
    const t2 = new Date("2026-08-24T02:00:00.500Z"); // 500ms sau — dưới ngưỡng 1000ms

    const first = await consumeQuota(db, "u5", "reflection", config, t1);
    expect(first).toEqual({ allowed: true, reason: null });

    const second = await consumeQuota(db, "u5", "reflection", config, t2);
    expect(second).toEqual({ allowed: false, reason: "rate_limit" });

    const snap = await db.collection("aiUsage").doc("u5_reflection_2026-08-24").get();
    expect(snap.data()?.count).toBe(1); // lượt bị rate-limit không tăng count

    // t3 cách t1 đúng 1200ms (>= ngưỡng 1000ms) nhưng chỉ cách t2 700ms (< ngưỡng).
    // Nếu lượt bị từ chối ở trên (t2) LỠ cập nhật updatedAt, t3 sẽ vẫn bị từ chối —
    // phép thử này bắt được đúng lỗi đó.
    const t3 = new Date("2026-08-24T02:00:01.200Z");
    const third = await consumeQuota(db, "u5", "reflection", config, t3);
    expect(third).toEqual({ allowed: true, reason: null });
  });

  it("rateLimitPerMinute = 0 nghĩa là KHÔNG áp rate limit (ngược chiều quotaStudentPerDay) " +
    "— hai lượt liên tiếp ngay lập tức đều được cho phép và đều tăng count", async () => {
    const config = { quotaStudentPerDay: 10, rateLimitPerMinute: 0 };
    const t1 = new Date("2026-08-24T02:00:00.000Z");
    const t2 = new Date("2026-08-24T02:00:00.000Z"); // cùng một mốc — cách nhau 0ms

    const first = await consumeQuota(db, "u7", "reflection", config, t1);
    expect(first).toEqual({ allowed: true, reason: null });

    const second = await consumeQuota(db, "u7", "reflection", config, t2);
    expect(second).toEqual({ allowed: true, reason: null });

    const snap = await db.collection("aiUsage").doc("u7_reflection_2026-08-24").get();
    expect(snap.data()?.count).toBe(2); // cả hai lượt đều tiêu quota, không lượt nào bị chặn
  });

  it("tăng count bằng transaction — N lượt gọi song song không mất lượt nào", async () => {
    // 10 transaction cạnh tranh trên cùng một document cần retry (optimistic concurrency)
    // của Firestore emulator — chậm hơn timeout mặc định 5000ms của vitest.
    const N = 10;
    const config = { quotaStudentPerDay: N, rateLimitPerMinute: 6000 }; // ngưỡng tối thiểu 10ms
    const base = new Date("2026-08-24T02:00:00Z").getTime();

    // Mỗi lượt mang một mốc "now" cách nhau 1s — khoảng cách nhỏ nhất giữa hai mốc bất kỳ
    // trong dãy là 1000ms, luôn lớn hơn ngưỡng rate limit 10ms, nên bất kể Promise.all
    // hoàn tất (commit) theo thứ tự nào, không lượt nào có thể bị từ chối vì rate limit —
    // phép thử này CHỈ còn kiểm tra đúng một điều: transaction tăng count có mất lượt
    // dưới truy cập đồng thời hay không. Đọc-rồi-ghi không transaction sẽ làm test này đỏ.
    const calls = Array.from({ length: N }, (_, i) =>
      consumeQuota(db, "u6", "reflection", config, new Date(base + i * 1000)),
    );

    const results = await Promise.all(calls);
    expect(results.every((r) => r.allowed === true)).toBe(true);

    const snap = await db.collection("aiUsage").doc("u6_reflection_2026-08-24").get();
    expect(snap.data()?.count).toBe(N);
  }, 20_000);

  // Quota concurrency test (final whole-branch review): test trên KHÔNG phân biệt được
  // "transaction đúng" với "implementation cho vượt quota" — quota=N với đúng N caller thì
  // MỌI implementation (kể cả một cái cho phép overrun) đều trả về allowed=true cho tất cả,
  // vì không có ai vượt ngưỡng để bị từ chối cả. Test này dùng quota < số caller (10 < 20) để
  // thực sự bắt được overrun: nếu consumeQuota đọc-rồi-ghi không transaction (hoặc transaction
  // có bug), nhiều hơn 10 lượt có thể "thấy" count cũ và đều được cho phép.
  it("quota=10, 20 lượt gọi song song -> ĐÚNG 10 lượt được phép, count cuối cùng ĐÚNG 10 (không vượt, không mất lượt)", async () => {
    const N_CALLERS = 20;
    const QUOTA = 10;
    const config = { quotaStudentPerDay: QUOTA, rateLimitPerMinute: 6000 }; // ngưỡng tối thiểu 10ms
    const base = new Date("2026-08-24T02:00:00Z").getTime();

    // Mỗi lượt cách nhau 1s (>> ngưỡng rate limit 10ms) để CHỈ còn kiểm tra đúng bất biến
    // quota dưới truy cập đồng thời, không lẫn với rate limit.
    const calls = Array.from({ length: N_CALLERS }, (_, i) =>
      consumeQuota(db, "u8", "reflection", config, new Date(base + i * 1000)),
    );

    const results = await Promise.all(calls);
    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(QUOTA);

    const snap = await db.collection("aiUsage").doc("u8_reflection_2026-08-24").get();
    expect(snap.data()?.count).toBe(QUOTA);
  }, 20_000);
});

// Fix round 1 cho Task 5 (Finding 1, CRITICAL): bằng chứng trực tiếp rằng hai tính năng
// không còn tiêu chung một ngân sách — trước fix, cùng uid/cùng ngày nghĩa là cùng MỘT
// document `aiUsage/{uid}_{date}`, nên "5 chat messages" và "3 reflections" cộng dồn vào
// đúng một count. Sau fix, `feature` là một phần của khoá document, nên hai counter độc
// lập hoàn toàn — cạn quota bên này không đụng gì tới bên kia.
describe("consumeQuota — cách ly theo feature (Fix round 1, Finding 1)", () => {
  it("reflection cạn quota (5/5) KHÔNG ảnh hưởng gì tới chat — chat vẫn còn nguyên 30 lượt", async () => {
    const uid = "student-both-features";
    const base = new Date("2026-08-24T02:00:00Z").getTime();

    // Dùng hết 5/5 lượt reflection.
    for (let i = 0; i < 5; i++) {
      const result = await consumeQuota(
        db,
        uid,
        "reflection",
        { quotaStudentPerDay: 5, rateLimitPerMinute: 0 },
        new Date(base + i * 1000),
      );
      expect(result.allowed).toBe(true);
    }
    const reflectionDenied = await consumeQuota(
      db,
      uid,
      "reflection",
      { quotaStudentPerDay: 5, rateLimitPerMinute: 0 },
      new Date(base + 5000),
    );
    expect(reflectionDenied).toEqual({ allowed: false, reason: "quota" });

    // Chat, CÙNG uid, CÙNG ngày — nếu hai feature còn giẫm lên nhau, lượt này sẽ bị từ chối
    // vì count đã ở mức 5 (bằng quotaStudentPerDay của reflection). Với fix, chat có counter
    // riêng, bắt đầu từ 0, và ngân sách 30 của riêng nó.
    const chatResult = await consumeQuota(
      db,
      uid,
      "chat",
      { quotaStudentPerDay: 30, rateLimitPerMinute: 0 },
      new Date(base + 6000),
    );
    expect(chatResult).toEqual({ allowed: true, reason: null });

    const reflectionDoc = await db.collection("aiUsage").doc(`${uid}_reflection_2026-08-24`).get();
    const chatDoc = await db.collection("aiUsage").doc(`${uid}_chat_2026-08-24`).get();
    expect(reflectionDoc.data()?.count).toBe(5);
    expect(chatDoc.data()?.count).toBe(1);
  });

  it("chat 27 lượt (gần cạn ngân sách 30) KHÔNG làm reflection thấy count > 0 — reflection vẫn còn nguyên 5/5", async () => {
    const uid = "student-both-features-2";
    const base = new Date("2026-08-24T02:00:00Z").getTime();

    for (let i = 0; i < 27; i++) {
      const result = await consumeQuota(
        db,
        uid,
        "chat",
        { quotaStudentPerDay: 30, rateLimitPerMinute: 0 },
        new Date(base + i * 1000),
      );
      expect(result.allowed).toBe(true);
    }

    // Reflection, cùng uid, cùng ngày — nếu còn giẫm lên nhau, count hiện tại (27) đã vượt
    // quotaStudentPerDay (5) của reflection, và lượt này sẽ bị từ chối oan.
    const reflectionResult = await consumeQuota(
      db,
      uid,
      "reflection",
      { quotaStudentPerDay: 5, rateLimitPerMinute: 0 },
      new Date(base + 27_000),
    );
    expect(reflectionResult).toEqual({ allowed: true, reason: null });

    const reflectionDoc = await db.collection("aiUsage").doc(`${uid}_reflection_2026-08-24`).get();
    expect(reflectionDoc.data()?.count).toBe(1);
  });
});
