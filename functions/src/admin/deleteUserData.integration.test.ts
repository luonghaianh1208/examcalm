// Task 10 — kiểm chứng THẬT bằng Firestore emulator, không chỉ so khớp TÊN trong registry.
// deleteUserData.test.ts chứng minh chatSessions/chatMessages/crisisAlerts có MẶT trong
// collectDeletionTargets()/DELETION_TARGET_HANDLERS — nhưng lời hứa "Xóa toàn bộ dữ liệu của
// tôi" (DeleteAccountSection.tsx) chỉ THẬT nếu handler.query(targetUid) của ba collection đó
// khớp ĐÚNG field mà mã ghi dữ liệu thật dùng: `userId` (functions/src/ai/sendChatMessage.ts —
// appendChatMessage/writeCrisisAlert; src/lib/firestore/chat.ts — startChatSession). File này
// seed document thật vào Firestore emulator rồi chạy ĐÚNG query của handler để xác nhận nó tìm
// đúng document của người bị xoá và không đụng tới document của người khác — cùng harness với
// quota.test.ts (Firestore emulator thật, không phải db giả) vì semantics query/where chỉ đáng
// tin khi chạy trên Firestore thật.
//
// Chạy bằng: `npm test` (functions/package.json, đã bọc `firebase emulators:exec --only
// firestore`). BỊ LOẠI khỏi `npm run test:unit` (cùng danh sách loại trừ với quota.test.ts,
// generateReflection.test.ts...) vì cần Firestore emulator.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { DELETION_TARGET_HANDLERS } from "./deleteUserData";

let app: App;
let db: Firestore;

const NEW_TARGETS = ["chatSessions", "chatMessages", "crisisAlerts"] as const;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "deleteUserData.integration.test.ts cần Firestore emulator: chạy qua `npm test` " +
        "(đã bọc sẵn firebase emulators:exec), không gọi vitest trực tiếp mà không có emulator.",
    );
  }
  // Cùng lý do quota.test.ts: máy chạy test không nằm trên GCP, tắt dò metadata server để
  // không in MetadataLookupWarning làm bẩn test output.
  process.env.METADATA_SERVER_DETECTION = "none";
  // KHÔNG đặt tên app (khác quota.test.ts/sendChatMessage.test.ts): DELETION_TARGET_HANDLERS
  // trong deleteUserData.ts gọi thẳng getFirestore() KHÔNG kèm app (đúng cách callable thật
  // dùng, xem deleteUserData.ts) — phải khởi tạo app MẶC ĐỊNH thì handler.query(...) ở đây mới
  // gọi tới ĐÚNG app đã kết nối Firestore emulator, không phải "default Firebase app không tồn tại".
  app = initializeApp({ projectId: "examcalm-delete-test" });
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const name of NEW_TARGETS) {
    await db.recursiveDelete(db.collection(name));
  }
});

describe("DELETION_TARGET_HANDLERS mới (chatSessions/chatMessages/crisisAlerts) khớp đúng field userId thật", () => {
  it.each(NEW_TARGETS)(
    "%s: query(targetUid) chỉ trả về document của ĐÚNG uid đó, không lẫn document của uid khác",
    async (collectionName) => {
      await db.collection(collectionName).add({ userId: "u-target", note: "của người cần xoá" });
      await db.collection(collectionName).add({ userId: "u-other", note: "của người khác" });

      const handler = DELETION_TARGET_HANDLERS[collectionName];
      const snap = await handler.query("u-target").get();

      expect(snap.size).toBe(1);
      expect(snap.docs[0].data().userId).toBe("u-target");
    },
  );

  it("xoá theo đúng query của cả ba handler làm sạch document của người bị xoá, giữ nguyên document của người khác — đúng lời hứa 'Xóa toàn bộ dữ liệu của tôi'", async () => {
    await db.collection("chatSessions").add({ userId: "u-target" });
    await db.collection("chatMessages").add({ userId: "u-target" });
    await db.collection("crisisAlerts").add({ userId: "u-target" });
    await db.collection("chatSessions").add({ userId: "u-other" });

    for (const name of NEW_TARGETS) {
      const snap = await DELETION_TARGET_HANDLERS[name].query("u-target").get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    for (const name of NEW_TARGETS) {
      const remaining = await DELETION_TARGET_HANDLERS[name].query("u-target").get();
      expect(remaining.empty).toBe(true);
    }
    const otherStillThere = await db.collection("chatSessions").where("userId", "==", "u-other").get();
    expect(otherStillThere.size).toBe(1);
  });
});
