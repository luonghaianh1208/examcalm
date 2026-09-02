import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } from "firebase/firestore";
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

const OWN_TRACK = {
  title: "Bài em tự thêm",
  artist: "",
  youtubeUrl: "https://www.youtube.com/watch?v=bbbbbbbbbbb",
  mood: "thu-gian",
  suggestionId: "",
};

describe("kho nhạc riêng của học sinh", () => {
  it("Chủ tài khoản lưu và đọc lại được bài đã lưu từ kho chung", async () => {
    const db = authedDb(env, "u1");
    await assertSucceeds(setDoc(doc(db, "users/u1/musicSaved/t1"), { trackId: "t1" }));
    await assertSucceeds(getDoc(doc(db, "users/u1/musicSaved/t1")));
  });

  it("Học sinh KHÁC không đọc được kho đã lưu của người ta", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "users/u1/musicSaved/t1"), { trackId: "t1" });
    });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "users/u1/musicSaved/t1")));
  });

  /*
   * Chặt hơn users/{uid} một bậc, và đó là chủ đích.
   *
   * Admin đọc được document users/{uid} để hỗ trợ tài khoản, nhưng nhạc một
   * học sinh nghe lúc nửa đêm không phải thứ nhà trường cần biết. Bài nào em
   * ấy muốn thầy cô thấy thì tự bấm đề xuất — đường đó đi qua musicSuggestions
   * và chỉ mang theo đúng bài được chọn.
   */
  it("ADMIN cũng KHÔNG đọc được kho riêng của học sinh", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "users/u1/musicOwn/o1"), OWN_TRACK);
      await setDoc(doc(db, "users/u1/musicSaved/t1"), { trackId: "t1" });
    });
    await assertFails(getDoc(doc(adminDb(env), "users/u1/musicOwn/o1")));
    await assertFails(getDoc(doc(adminDb(env), "users/u1/musicSaved/t1")));
  });

  it("Khách chưa đăng nhập không đụng được gì", async () => {
    await assertFails(setDoc(doc(guestDb(env), "users/u1/musicOwn/o1"), OWN_TRACK));
  });

  it("Học sinh KHÁC không ghi đè được bài trong kho riêng của người ta", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u2"), "users/u1/musicOwn/o1"), OWN_TRACK));
  });
});

const SUGGESTION = {
  authorUid: "u1",
  title: "Bài em muốn đề xuất",
  artist: "",
  youtubeUrl: "https://www.youtube.com/watch?v=ccccccccccc",
  mood: "truoc-khi-ngu",
  status: "pending",
  reviewedBy: "",
};

describe("musicSuggestions", () => {
  it("Học sinh đã xác thực email gửi được đề xuất đứng tên mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "musicSuggestions/s1"), SUGGESTION));
  });

  // Đứng tên người khác được thì một tài khoản bị chiếm là đủ để đổ vạ cho bạn
  // cùng lớp về một bài nhạc không phù hợp.
  it("KHÔNG gửi được đề xuất đứng tên người khác", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u2"), "musicSuggestions/s1"), SUGGESTION),
    );
  });

  /*
   * Rào chắn quan trọng nhất của collection này. Client tự đặt được status thì
   * một đề xuất gửi thẳng "approved" sẽ không bao giờ xuất hiện trong hàng chờ
   * — thầy cô không có cách nào biết nó tồn tại.
   */
  it("KHÔNG tự đặt status khác pending lúc gửi", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "musicSuggestions/s1"), { ...SUGGESTION, status: "approved" }),
    );
  });

  it("KHÔNG tự điền reviewedBy lúc gửi", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "musicSuggestions/s1"), { ...SUGGESTION, reviewedBy: "admin-1" }),
    );
  });

  it("Email chưa xác thực thì KHÔNG gửi được", async () => {
    await assertFails(
      setDoc(
        doc(authedDb(env, "u1", { email_verified: false }), "musicSuggestions/s1"),
        SUGGESTION,
      ),
    );
  });

  it("Học sinh đọc lại được đề xuất của chính mình, KHÔNG đọc được của bạn", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicSuggestions/s1"), SUGGESTION); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "musicSuggestions/s1")));
    await assertFails(getDoc(doc(authedDb(env, "u2"), "musicSuggestions/s1")));
  });

  it("Admin đọc và duyệt được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicSuggestions/s1"), SUGGESTION); });
    await assertSucceeds(getDoc(doc(adminDb(env), "musicSuggestions/s1")));
    await assertSucceeds(
      setDoc(doc(adminDb(env), "musicSuggestions/s1"), { ...SUGGESTION, status: "approved", reviewedBy: "admin-1" }),
    );
  });

  // Tự duyệt đề xuất của mình được thì cả hàng chờ chỉ là hình thức.
  it("Học sinh KHÔNG tự đổi trạng thái đề xuất của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicSuggestions/s1"), SUGGESTION); });
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "musicSuggestions/s1"), { ...SUGGESTION, status: "approved" }),
    );
  });

  /*
   * Query khác hẳn đọc từng document: Firestore chỉ cho chạy khi rules chắc
   * chắn ĐÚNG với mọi kết quả có thể trả về. Hai lời gọi thật của tính năng
   * này đều là query, nên đọc-một-document xanh không chứng minh được gì.
   */
  it("Học sinh query được đề xuất của chính mình (lọc theo authorUid)", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicSuggestions/s1"), SUGGESTION); });
    const db = authedDb(env, "u1");
    await assertSucceeds(
      getDocs(query(collection(db, "musicSuggestions"), where("authorUid", "==", "u1"))),
    );
    // Không có bộ lọc thì query có thể chạm bài của người khác — phải bị chặn.
    await assertFails(getDocs(collection(db, "musicSuggestions")));
  });

  it("Admin query được cả hàng chờ", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicSuggestions/s1"), SUGGESTION); });
    await assertSucceeds(
      getDocs(query(collection(adminDb(env), "musicSuggestions"), where("status", "==", "pending"))),
    );
  });

  it("Học sinh rút lại được đề xuất của chính mình, KHÔNG xoá được của bạn", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "musicSuggestions/s1"), SUGGESTION); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "musicSuggestions/s1")));
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "musicSuggestions/s1")));
  });
});
