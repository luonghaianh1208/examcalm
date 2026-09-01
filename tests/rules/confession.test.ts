import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const BAI_MOI = {
  authorUid: "u1",
  textContent: "Mình sợ trượt kỳ thi sắp tới.",
  status: "pending",
  moderationReason: "",
  handledBy: null,
};

const BAI_CONG_KHAI = { textContent: "Mình sợ trượt kỳ thi sắp tới.", reportCount: 0 };

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("confessions — bản riêng tư có authorUid", () => {
  it("học sinh đã xác thực email gửi được bài dưới tên chính mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "confessions/c1"), BAI_MOI));
  });

  // Nếu ghi được authorUid của người khác thì một tài khoản đủ để đổ tội cho
  // bất kỳ bạn nào trong trường.
  it("KHÔNG gửi được bài dưới tên người khác", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "confessions/c2"), { ...BAI_MOI, authorUid: "u2" }),
    );
  });

  // Client tự đặt status thì lớp kiểm duyệt thành vô nghĩa ngay từ đầu.
  it("KHÔNG tự đặt trạng thái đã duyệt cho bài của mình", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "confessions/c3"), { ...BAI_MOI, status: "auto_approved" }),
    );
  });

  it("khách chưa đăng nhập KHÔNG gửi được", async () => {
    await assertFails(setDoc(doc(guestDb(env), "confessions/c4"), BAI_MOI));
  });

  it("tác giả đọc lại được bài của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), BAI_MOI); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "confessions/c1")));
  });

  // Đây là lõi của lời hứa "ẩn danh": bài kèm authorUid không được lọt sang
  // bạn cùng trường.
  it("HỌC SINH KHÁC KHÔNG đọc được bài kèm danh tính", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), BAI_MOI); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "confessions/c1")));
  });

  it("khách chưa đăng nhập KHÔNG đọc được bản riêng tư", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), BAI_MOI); });
    await assertFails(getDoc(doc(guestDb(env), "confessions/c1")));
  });

  it("admin đọc được để duyệt", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), BAI_MOI); });
    await assertSucceeds(getDoc(doc(adminDb(env), "confessions/c1")));
  });

  it("tác giả KHÔNG tự đổi trạng thái bài của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), BAI_MOI); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "confessions/c1"), { status: "auto_approved" }),
    );
  });

  it("admin đổi được trạng thái", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), BAI_MOI); });
    await assertSucceeds(
      updateDoc(doc(adminDb(env), "confessions/c1"), { status: "rejected", handledBy: "admin-1" }),
    );
  });
});

describe("confessionsPublic — bản công khai KHÔNG có danh tính", () => {
  it("ai cũng đọc được, kể cả khách", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessionsPublic/c1"), BAI_CONG_KHAI); });
    await assertSucceeds(getDoc(doc(guestDb(env), "confessionsPublic/c1")));
  });

  /*
   * Bốn test dưới đây là hàng rào quan trọng nhất của cả tính năng.
   *
   * Nếu client ghi được collection này thì một học sinh tự đẩy bài của mình ra
   * công khai mà không qua duyệt — toàn bộ lớp kiểm duyệt trở thành trang trí.
   * Kiểm cả bốn vai vì `allow write: if false` gộp create/update/delete, và
   * một lần nới lỏng sau này rất dễ chỉ nghĩ tới một vai.
   */
  it("học sinh KHÔNG ghi được", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "confessionsPublic/c2"), BAI_CONG_KHAI));
  });

  it("khách KHÔNG ghi được", async () => {
    await assertFails(setDoc(doc(guestDb(env), "confessionsPublic/c2"), BAI_CONG_KHAI));
  });

  it("ADMIN cũng KHÔNG ghi thẳng được — mọi thay đổi phải qua Cloud Function", async () => {
    await assertFails(setDoc(doc(adminDb(env), "confessionsPublic/c2"), BAI_CONG_KHAI));
  });

  it("không ai xoá được từ client", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessionsPublic/c1"), BAI_CONG_KHAI); });
    await assertFails(deleteDoc(doc(adminDb(env), "confessionsPublic/c1")));
    await assertFails(deleteDoc(doc(authedDb(env, "u1"), "confessionsPublic/c1")));
  });
});
