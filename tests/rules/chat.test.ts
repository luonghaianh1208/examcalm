import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

// Khớp mô hình dữ liệu ở design spec §4 (chatSessions/chatMessages) và §3.4
// (crisisAlerts) — Spec #4, 2026-08-25-examcalm-chat-design.md.
const SESSION = {
  userId: "u1",
  startedAt: new Date(),
  lastMessageAt: new Date(),
  messageCount: 1,
};

const MESSAGE = {
  userId: "u1", // trùng lặp có chủ đích (design §4) — rule kiểm không cần get() cha
  sessionId: "s1",
  role: "user",
  text: "Em thấy lo lắng quá",
  isCrisisResponse: false,
  createdAt: new Date(),
};

const ALERT = {
  userId: "u1",
  severity: "concern",
  triggeredBy: "keyword",
  createdAt: new Date(),
  handledBy: null,
  handledAt: null,
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("chatSessions/{id}", () => {
  it("chủ sở hữu (verified) tạo được phiên chat của mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "chatSessions/s1"), SESSION));
  });

  it("chưa verify email KHÔNG tạo được", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1", { email_verified: false }), "chatSessions/s1"), SESSION),
    );
  });

  it("userId không khớp uid của chính mình KHÔNG tạo được", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "chatSessions/s1"), { ...SESSION, userId: "u2" }),
    );
  });

  it("Guest KHÔNG tạo được", async () => {
    await assertFails(setDoc(doc(guestDb(env), "chatSessions/s1"), SESSION));
  });

  it("chủ sở hữu đọc được phiên của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "chatSessions/s1")));
  });

  it("người khác KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "chatSessions/s1")));
  });

  it("ADMIN CŨNG KHÔNG đọc được — nội dung chat nhạy cảm hơn cả moodLogs/cbtSessions", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertFails(getDoc(doc(adminDb(env), "chatSessions/s1")));
  });

  it("chủ sở hữu xoá được phiên của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "chatSessions/s1")));
  });

  it("người khác KHÔNG xoá được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "chatSessions/s1")));
  });

  it("update bị từ chối kể cả chính chủ — chỉ Cloud Function mới cập nhật lastMessageAt/messageCount", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "chatSessions/s1"), { messageCount: 2 }),
    );
  });

  it("ADMIN CŨNG KHÔNG update được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatSessions/s1"), SESSION); });
    await assertFails(
      updateDoc(doc(adminDb(env), "chatSessions/s1"), { messageCount: 2 }),
    );
  });
});

describe("chatMessages/{id}", () => {
  it("chủ sở hữu đọc được tin nhắn của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatMessages/m1"), MESSAGE); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "chatMessages/m1")));
  });

  it("người khác KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatMessages/m1"), MESSAGE); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "chatMessages/m1")));
  });

  it("ADMIN CŨNG KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatMessages/m1"), MESSAGE); });
    await assertFails(getDoc(doc(adminDb(env), "chatMessages/m1")));
  });

  it("chủ sở hữu xoá được tin nhắn của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatMessages/m1"), MESSAGE); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "chatMessages/m1")));
  });

  it("người khác KHÔNG xoá được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatMessages/m1"), MESSAGE); });
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "chatMessages/m1")));
  });

  // Rule quan trọng nhất của cả spec: MỌI tin nhắn phải đi qua Cloud Function
  // callable (nơi chạy lớp phát hiện khủng hoảng) trước khi vào Firestore. Test
  // này ký gửi ĐÚNG uid chủ sở hữu với document ĐÚNG hình dạng schema — nếu rule
  // vẫn từ chối thì chắc chắn bị chặn bởi "allow create: if false", không phải
  // vì userId lệch hay thiếu field nào khác (bài học: test không được fail vì lý
  // do sai).
  it("create BỊ TỪ CHỐI kể cả chính chủ với document đúng hình dạng — mọi tin nhắn phải qua callable", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "chatMessages/m1"), MESSAGE));
  });

  it("Guest cũng KHÔNG tạo được", async () => {
    await assertFails(setDoc(doc(guestDb(env), "chatMessages/m1"), MESSAGE));
  });

  it("admin cũng KHÔNG tạo được", async () => {
    await assertFails(setDoc(doc(adminDb(env), "chatMessages/m1"), MESSAGE));
  });

  it("update bị từ chối kể cả chính chủ — tin nhắn không được sửa sau khi gửi", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "chatMessages/m1"), MESSAGE); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "chatMessages/m1"), { text: "nội dung sửa lại" }),
    );
  });
});

describe("crisisAlerts/{id}", () => {
  it("admin đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertSucceeds(getDoc(doc(adminDb(env), "crisisAlerts/a1")));
  });

  // Ruling C4 (design §3.4/§5): học sinh KHÔNG đọc được cảnh báo, KỂ CẢ cảnh
  // báo về chính mình — em đã được báo trực tiếp trong đoạn chat lúc đó rồi,
  // và một bản ghi đọc được sẽ lộ ngưỡng phát hiện cho em né tránh lần sau.
  // ALERT.userId == "u1" ở đây CHÍNH LÀ uid đang đọc, để chứng minh rule không
  // hề có ngoại lệ "đọc được cảnh báo của chính mình".
  it("học sinh KHÔNG đọc được cảnh báo về CHÍNH MÌNH (ruling C4)", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "crisisAlerts/a1")));
  });

  it("học sinh khác cũng KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "crisisAlerts/a1")));
  });

  it("KHÔNG ai create được từ client — kể cả admin, chỉ Cloud Function (Admin SDK) mới tạo", async () => {
    await assertFails(setDoc(doc(adminDb(env), "crisisAlerts/a1"), ALERT));
    await assertFails(setDoc(doc(authedDb(env, "u1"), "crisisAlerts/a1"), ALERT));
  });

  it("KHÔNG ai delete được — kể cả admin", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(deleteDoc(doc(adminDb(env), "crisisAlerts/a1")));
  });

  // Fix round 1, Finding 1: nhánh delete chỉ có nửa admin, thiếu nửa học sinh
  // — đối xứng với test create ở trên vốn đã kiểm cả hai persona. Quan trọng
  // vì Task 10 (cascade xoá tài khoản) rất dễ copy-paste shape
  // "allow delete: if isSignedIn() && resource.data.userId == request.auth.uid"
  // dùng cho MỌI collection khác trong file này sang crisisAlerts — nếu vậy,
  // học sinh tự xoá được cảnh báo về chính mình (xoá bằng chứng để thầy cô
  // không bao giờ biết em đã gặp nguy) mà không test nào bắt được. ALERT.userId
  // == "u1" ở đây CHÍNH LÀ uid đang xoá, để em thực sự là chủ thể của cảnh báo.
  it("học sinh (kể cả chủ thể cảnh báo) KHÔNG delete được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(deleteDoc(doc(authedDb(env, "u1"), "crisisAlerts/a1")));
  });

  it("admin update được CHỈ handledBy + handledAt, tự nhận xử lý bằng đúng uid của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertSucceeds(
      updateDoc(doc(adminDb(env), "crisisAlerts/a1"), {
        handledBy: "admin-1",
        handledAt: new Date(),
      }),
    );
  });

  // Fix round 1, Finding 2: handledBy là bản ghi "ai đã nhận xử lý cảnh báo an
  // toàn của một đứa trẻ" — không ràng buộc thì admin A có thể gán handledBy
  // cho "admin-2" (đổ trách nhiệm cho đồng nghiệp) hoặc ngược lại. hasOnly()
  // đã pass (đúng 2 field), isAdmin() đã pass — chỉ còn nhánh handledBy ==
  // request.auth.uid có thể từ chối, nên test này thật sự isolate đúng nhánh.
  it("admin KHÔNG gán handledBy cho người khác — chỉ được tự nhận xử lý bằng chính uid của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(
      updateDoc(doc(adminDb(env), "crisisAlerts/a1"), {
        handledBy: "admin-2",
        handledAt: new Date(),
      }),
    );
  });

  // Fix round 2 (coordinator, hệ quả của chính ruling Finding 2): chỉ cho
  // "handledBy == request.auth.uid" đã vô tình khoá VĨNH VIỄN mọi cảnh báo
  // đã đánh dấu "đã xử lý" — không ai, kể cả chính người đã xử lý, mở lại
  // được nếu đánh dấu nhầm hoặc xử lý sơ sài. Ba test dưới đây pin nhánh mở
  // lại (handledBy == null) mới thêm, cộng với xác nhận nhánh chống đổ trách
  // nhiệm (test attribution ở trên) vẫn đứng vững với clause mới.

  it("admin mở lại được cảnh báo do CHÍNH MÌNH đã đánh dấu xử lý (handledBy/handledAt về null)", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "crisisAlerts/a1"), { ...ALERT, handledBy: "admin-1", handledAt: new Date() });
    });
    await assertSucceeds(
      updateDoc(doc(adminDb(env, "admin-1"), "crisisAlerts/a1"), {
        handledBy: null,
        handledAt: null,
      }),
    );
  });

  // Cố ý: admin-2 (KHÔNG phải người đã đánh dấu xử lý) vẫn mở lại được. Một
  // cảnh báo bị xử lý sai không được kẹt vĩnh viễn ở trạng thái "đã xử lý"
  // chỉ vì người xử lý sai đó nghỉ việc/vắng mặt/không đăng nhập lại — mở lại
  // không phải hành vi cần "đúng người" như tự nhận xử lý, vì nó không gán
  // trách nhiệm cho ai, chỉ đưa cảnh báo về trạng thái trung lập ban đầu.
  it("admin KHÁC (không phải người đã xử lý) vẫn mở lại được cảnh báo — cố ý, tránh kẹt vĩnh viễn", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "crisisAlerts/a1"), { ...ALERT, handledBy: "admin-1", handledAt: new Date() });
    });
    await assertSucceeds(
      updateDoc(doc(adminDb(env, "admin-2"), "crisisAlerts/a1"), {
        handledBy: null,
        handledAt: null,
      }),
    );
  });

  // Ca re-reviewer trace bằng tay nhưng chưa test nào pin: admin chỉ ghi
  // handledAt, KHÔNG kèm handledBy trong payload update. Lý do vẫn an toàn:
  // handledBy là field bắt buộc trong schema (src/lib/types/chat.ts) nên
  // luôn có sẵn trong document, và updateDoc() chỉ merge đúng field được
  // truyền — handledBy giữ nguyên giá trị cũ ("admin-1", trùng uid admin
  // đang ghi ở đây), nên diff().affectedKeys() chỉ có "handledAt" (vẫn nằm
  // trong hasOnly) và handledBy == request.auth.uid vẫn đúng vì KHÔNG đổi.
  it("admin update CHỈ handledAt (không kèm handledBy trong payload) vẫn thành công — merge giữ nguyên handledBy cũ", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "crisisAlerts/a1"), { ...ALERT, handledBy: "admin-1", handledAt: new Date("2026-01-01") });
    });
    await assertSucceeds(
      updateDoc(doc(adminDb(env, "admin-1"), "crisisAlerts/a1"), { handledAt: new Date() }),
    );
  });

  // Bài học Critical Spec #3 Task 2: hasOnly() phải khoá TOÀN BỘ field khác,
  // không chỉ pin riêng lẻ. Mỗi test tampering dưới đây kèm THEO handledBy +
  // handledAt hợp lệ, để buộc hasOnly() là nhánh DUY NHẤT còn có thể từ chối —
  // nếu không, test có thể fail vì lý do khác (thiếu handledBy/handledAt) và
  // không thật sự chứng minh hasOnly() có tác dụng.
  it("admin update severity bị từ chối dù kèm handledBy/handledAt hợp lệ", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(
      updateDoc(doc(adminDb(env), "crisisAlerts/a1"), {
        severity: "urgent",
        handledBy: "admin-1",
        handledAt: new Date(),
      }),
    );
  });

  it("admin update userId bị từ chối dù kèm handledBy/handledAt hợp lệ", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(
      updateDoc(doc(adminDb(env), "crisisAlerts/a1"), {
        userId: "u2",
        handledBy: "admin-1",
        handledAt: new Date(),
      }),
    );
  });

  it("admin update thêm field lạ bị từ chối dù kèm handledBy/handledAt hợp lệ", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(
      updateDoc(doc(adminDb(env), "crisisAlerts/a1"), {
        hacked: true,
        handledBy: "admin-1",
        handledAt: new Date(),
      }),
    );
  });

  // Isolate nhánh isAdmin(): học sinh cố update ĐÚNG field hasOnly cho phép
  // (handledBy/handledAt) — nếu rule chỉ có hasOnly() mà thiếu isAdmin(), test
  // này sẽ (sai) succeed. Dùng đúng field hợp lệ để chứng minh cái chặn ở đây
  // là isAdmin(), không phải hasOnly().
  it("học sinh (kể cả chủ sở hữu) KHÔNG update được dù đúng field handledBy/handledAt", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "crisisAlerts/a1"), ALERT); });
    await assertFails(
      updateDoc(doc(authedDb(env, "u1"), "crisisAlerts/a1"), {
        handledBy: "u1",
        handledAt: new Date(),
      }),
    );
  });
});
