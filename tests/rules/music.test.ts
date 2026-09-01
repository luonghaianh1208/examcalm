import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const TRACK_PUBLISHED = {
  title: "Nhạc nền tập trung",
  artist: "Kênh mẫu",
  youtubeUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
  mood: "tap-trung",
  rightsNote: "Kênh chính thức, cho phép nhúng.",
  status: "published",
  order: 0,
  updatedBy: "admin-1",
};
const TRACK_DRAFT = { ...TRACK_PUBLISHED, status: "draft" };

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("musicTracks", () => {
  // Music Hub công khai có chủ đích: khách nghe được ngay, không cần tài khoản
  // — cùng lời hứa "dùng được mà không cần đăng ký" của trang chủ.
  it("Khách đọc được bài đã đăng", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicTracks/t1"), TRACK_PUBLISHED); });
    await assertSucceeds(getDoc(doc(guestDb(env), "musicTracks/t1")));
  });

  it("Khách KHÔNG đọc được bài còn ở nháp", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicTracks/t2"), TRACK_DRAFT); });
    await assertFails(getDoc(doc(guestDb(env), "musicTracks/t2")));
  });

  it("Admin đọc được bài nháp", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicTracks/t2"), TRACK_DRAFT); });
    await assertSucceeds(getDoc(doc(adminDb(env), "musicTracks/t2")));
  });

  it("Admin ghi được", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "musicTracks/t3"), TRACK_DRAFT));
  });

  it("Học sinh KHÔNG ghi được", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "musicTracks/t3"), TRACK_DRAFT));
  });

  it("Khách KHÔNG ghi được", async () => {
    await assertFails(setDoc(doc(guestDb(env), "musicTracks/t3"), TRACK_DRAFT));
  });

  // Học sinh xoá được nhạc của trường thì một tài khoản bị chiếm là đủ để phá
  // sạch nội dung — kiểm riêng vì `allow write` gộp cả create/update/delete.
  it("Học sinh KHÔNG xoá được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicTracks/t1"), TRACK_PUBLISHED); });
    await assertFails(deleteDoc(doc(authedDb(env, "u1"), "musicTracks/t1")));
  });

  it("Học sinh KHÔNG tự đăng bài nháp của mình lên được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicTracks/t2"), TRACK_DRAFT); });
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "musicTracks/t2"), TRACK_PUBLISHED),
    );
  });
});
