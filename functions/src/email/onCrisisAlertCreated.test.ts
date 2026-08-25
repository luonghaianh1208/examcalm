// Test trigger onCrisisAlertCreated (ExamCalm Spec #5, Task 2 + Fix round 1) trên Firestore
// emulator. Gọi thẳng `runOnCrisisAlertCreated`/`runOnCrisisAlertUpdated` (lõi có thể test được,
// tách khỏi onDocumentWritten thật của Cloud Functions) với dữ liệu document mô phỏng
// `event.data.{before,after}.data()` và deps GIẢ (listUsers, sendEmail) — không một byte nào ra
// mạng thật, không cần Auth emulator (listUsers tiêm được, xem task-2-brief.md).
//
// BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (`npm test`, xem package.json). File này
// cũng nằm trong danh sách loại trừ của `test:unit` (cần emulator).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  runOnCrisisAlertCreated,
  runOnCrisisAlertUpdated,
  type OnCrisisAlertCreatedDeps,
  type AuthUserRecordLike,
} from "./onCrisisAlertCreated";
import { EmailError, type SendEmailParams, type SendEmailResult } from "./resendClient";
import { DEFAULT_AI_CONFIG, type AiConfig } from "../ai/config";

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "onCrisisAlertCreated.test.ts cần Firestore emulator: chạy `npm test` (đã bọc sẵn " +
        "firebase emulators:exec) thay vì gọi vitest trực tiếp mà không có emulator.",
    );
  }
  // Không có metadata server GCP trên máy chạy test — tắt dò tìm để tránh MetadataLookupWarning
  // làm bẩn test output (yêu cầu "test output sạch, không warning"), cùng sendChatMessage.test.ts.
  process.env.METADATA_SERVER_DETECTION = "none";
  app = initializeApp({ projectId: "examcalm-crisis-email-test" }, "crisis-email-test-app");
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

const COLLECTIONS = ["systemConfig", "users", "crisisAlerts"];

beforeEach(async () => {
  await Promise.all(COLLECTIONS.map((name) => db.recursiveDelete(db.collection(name))));
});

const STUDENT_UID = "student1";
const ALERT_ID = "alert1";
const NOW = new Date("2026-08-25T03:00:00Z");
const CRISIS_EMAIL_FROM = "canhbao@examcalm.test";
const ADMIN_A_EMAIL = "admin-a@examcalm.test";
const ADMIN_B_EMAIL = "admin-b@examcalm.test";

async function setAiConfig(overrides: Partial<AiConfig> = {}): Promise<void> {
  const config: AiConfig = {
    ...DEFAULT_AI_CONFIG,
    crisisEmailEnabled: true,
    crisisEmailFrom: CRISIS_EMAIL_FROM,
    ...overrides,
  };
  await db.collection("systemConfig").doc("aiConfig").set(config);
}

/** Ghi document cảnh báo trực tiếp (bỏ qua writeCrisisAlert của sendChatMessage.ts — file đó
 *  không thuộc phạm vi test này) rồi đọc lại NGUYÊN VĂN — mô phỏng đúng những gì
 *  `event.data.after.data()` thật trả về (Timestamp thật từ emulator, không phải Date tự tạo). */
async function writeAlert(
  overrides: Record<string, unknown> = {},
  alertId: string = ALERT_ID,
): Promise<Record<string, unknown>> {
  await db
    .collection("crisisAlerts")
    .doc(alertId)
    .set({
      userId: STUDENT_UID,
      severity: "urgent",
      triggeredBy: "keyword",
      createdAt: Timestamp.fromDate(new Date("2026-08-25T02:30:00Z")),
      handledBy: null,
      handledAt: null,
      ...overrides,
    });
  const snap = await db.collection("crisisAlerts").doc(alertId).get();
  return snap.data() as Record<string, unknown>;
}

/** Cập nhật MỘT PHẦN document (mô phỏng `.update()` thật — chỉ đụng field được truyền, các field
 *  khác giữ nguyên, đúng cách `upgradeCrisisAlert`/`writeEmailStatus` hoạt động) rồi đọc lại. */
async function patchAlert(
  patch: Record<string, unknown>,
  alertId: string = ALERT_ID,
): Promise<Record<string, unknown>> {
  await db.collection("crisisAlerts").doc(alertId).update(patch);
  const snap = await db.collection("crisisAlerts").doc(alertId).get();
  return snap.data() as Record<string, unknown>;
}

async function setStudent(overrides: Record<string, unknown> = {}): Promise<void> {
  await db
    .collection("users")
    .doc(STUDENT_UID)
    .set({
      uid: STUDENT_UID,
      role: "student",
      nickname: "Mèo con",
      gradeLevel: "12",
      school: "THPT Trần Phú",
      ...overrides,
    });
}

async function getAlert(alertId: string = ALERT_ID): Promise<Record<string, unknown>> {
  const snap = await db.collection("crisisAlerts").doc(alertId).get();
  return snap.data() as Record<string, unknown>;
}

const ADMIN_A: AuthUserRecordLike = { email: ADMIN_A_EMAIL, customClaims: { role: "admin" } };
const ADMIN_B: AuthUserRecordLike = { email: ADMIN_B_EMAIL, customClaims: { role: "admin" } };
/** Admin thật (custom claim role=admin) nhưng thiếu email — task-2-brief.md mục 5: phải bị bỏ
 *  qua, không được làm hỏng cả danh sách. */
const ADMIN_NO_EMAIL: AuthUserRecordLike = { customClaims: { role: "admin" } };
/** Có email nhưng KHÔNG phải admin — không được nhận mail. */
const NON_ADMIN: AuthUserRecordLike = { email: "student-auth@examcalm.test", customClaims: { role: "student" } };

function fakeListUsers(users: AuthUserRecordLike[]) {
  return vi.fn(async (): Promise<AuthUserRecordLike[]> => users);
}

function fakeSendEmail(impl?: (params: SendEmailParams) => Promise<SendEmailResult>) {
  return vi.fn(async (params: SendEmailParams): Promise<SendEmailResult> => {
    if (impl) return impl(params);
    return { id: "email_fake_1" };
  });
}

function makeDeps(overrides: Partial<OnCrisisAlertCreatedDeps> = {}): OnCrisisAlertCreatedDeps {
  return {
    db,
    listUsers: fakeListUsers([ADMIN_A]),
    sendEmail: fakeSendEmail(),
    apiKey: "fake-resend-key",
    now: NOW,
    ...overrides,
  };
}

/** Bọc `db` thật, CHỈ chặn `.collection("systemConfig").doc(...).get()` để mô phỏng đúng kịch
 *  bản "Firestore tạm thời không đọc được đúng lúc loadAiConfig chạy" (Fix round 1, Finding 1) —
 *  mọi collection khác (kể cả `crisisAlerts`, nơi writeEmailStatus phải vẫn ghi được) đi thẳng
 *  qua `db` thật không đổi gì. Type assertion có chú thích: chỉ mô phỏng đúng bề mặt
 *  `collection().doc().get()` mà loadAiConfig thực sự gọi tới, không phải toàn bộ SDK (không
 *  phải `any` không giải thích). */
function makeDbThrowingOnSystemConfigRead(): Firestore {
  return {
    collection: (name: string) => {
      if (name === "systemConfig") {
        return {
          doc: () => ({
            get: async () => {
              throw new Error("Firestore tạm thời không truy cập được (mô phỏng test)");
            },
          }),
        };
      }
      return db.collection(name);
    },
  } as unknown as Firestore;
}

describe("onCrisisAlertCreated — sự kiện TẠO", () => {
  it("1. crisisEmailEnabled=false → không gọi mạng, ghi emailStatus 'skipped'", async () => {
    await setAiConfig({ crisisEmailEnabled: false });
    const alertData = await writeAlert();
    const listUsersSpy = fakeListUsers([ADMIN_A]);
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ listUsers: listUsersSpy, sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).not.toHaveBeenCalled();
    expect(listUsersSpy).not.toHaveBeenCalled();
    const alert = await getAlert();
    expect(alert.emailStatus).toBe("skipped");
    expect(alert.emailedAt).toBeNull();
  });

  it("2. crisisEmailFrom rỗng → không gọi mạng, 'skipped'", async () => {
    await setAiConfig({ crisisEmailFrom: "" });
    const alertData = await writeAlert();
    const listUsersSpy = fakeListUsers([ADMIN_A]);
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ listUsers: listUsersSpy, sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).not.toHaveBeenCalled();
    expect(listUsersSpy).not.toHaveBeenCalled();
    expect((await getAlert()).emailStatus).toBe("skipped");
  });

  it("3. không có admin nào → không gọi mạng, 'skipped'", async () => {
    await setAiConfig();
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ listUsers: fakeListUsers([NON_ADMIN]), sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).not.toHaveBeenCalled();
    expect((await getAlert()).emailStatus).toBe("skipped");
  });

  it("4. đường thuận: gọi sendEmail một lần với bcc là mọi email admin (to = người gửi), ghi 'sent' + emailedAt", async () => {
    await setAiConfig();
    await setStudent();
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ listUsers: fakeListUsers([ADMIN_A, ADMIN_B, NON_ADMIN]), sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const params = sendEmailSpy.mock.calls[0][0];
    // Fix round 1, Finding 5(d): admin nằm ở BCC (không lộ cho nhau khi forward), `to` chỉ chứa
    // chính người gửi.
    expect(params.to).toEqual([CRISIS_EMAIL_FROM]);
    expect([...(params.bcc ?? [])].sort()).toEqual([ADMIN_A_EMAIL, ADMIN_B_EMAIL].sort());

    const alert = await getAlert();
    expect(alert.emailStatus).toBe("sent");
    expect(alert.emailedAt).toBeInstanceOf(Timestamp);
    expect((alert.emailedAt as Timestamp).toDate().getTime()).toBe(NOW.getTime());
  });

  it("5. người nhận lấy từ Auth custom claim role=admin (không phải Firestore); bỏ qua admin không có email", async () => {
    await setAiConfig();
    // Firestore role="admin" nhưng KHÔNG có mặt trong danh sách Auth giả — KHÔNG được nhận mail,
    // chứng minh nguồn thật là custom claim, không phải field role của users/{uid}.
    const firestoreOnlyAdminUid = "firestore-only-admin";
    await db
      .collection("users")
      .doc(firestoreOnlyAdminUid)
      .set({ uid: firestoreOnlyAdminUid, role: "admin" });

    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({
      listUsers: fakeListUsers([ADMIN_A, ADMIN_NO_EMAIL, NON_ADMIN]),
      sendEmail: sendEmailSpy,
    });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.bcc).toEqual([ADMIN_A_EMAIL]);
  });

  it("6. sendEmail ném lỗi → ghi 'failed', trigger KHÔNG ném ra ngoài", async () => {
    await setAiConfig();
    const alertData = await writeAlert();
    const deps = makeDeps({
      sendEmail: fakeSendEmail(async () => {
        throw new EmailError("server", "Không thể kết nối tới Resend.");
      }),
    });

    await expect(runOnCrisisAlertCreated(ALERT_ID, alertData, deps)).resolves.toBeUndefined();

    const alert = await getAlert();
    expect(alert.emailStatus).toBe("failed");
    expect(alert.emailedAt).toBeNull();
  });

  it("7. thân mail chứa biệt danh, lớp, trường, mức độ, thời điểm (kèm timezone) và link tới /admin/canh-bao", async () => {
    await setAiConfig();
    await setStudent({ nickname: "Mèo con", gradeLevel: "12", school: "THPT Trần Phú" });
    const alertData = await writeAlert({ severity: "concern" });
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.text).toContain("Mèo con");
    expect(params.text).toContain("12");
    expect(params.text).toContain("THPT Trần Phú");
    expect(params.text).toContain("Cần chú ý");
    expect(params.text).toContain("/admin/canh-bao");
    expect(params.text).toMatch(/2026/);
    expect(params.text).toContain("giờ Việt Nam");
    // Fix round 1, Finding 5(c): dòng ngữ cảnh giải thích đây là tín hiệu nguy cơ tự hại và vì
    // sao không có trích đoạn tin nhắn.
    expect(params.text).toContain("NGUY CƠ TỰ HẠI");
    expect(params.text).toContain("KHÔNG được đưa vào email này");
  });

  it("7b. school quá dài (SDK ghi trực tiếp, không qua giới hạn UI) → thân mail CẮT về đúng trần 120 ký tự của userSchema, không đưa nguyên văn (I1, final whole-branch review)", async () => {
    await setAiConfig();
    const longSchool = "T".repeat(200); // vượt xa trần 120 ký tự của userProfileSchema.school
    await setStudent({ school: longSchool });
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.text).not.toContain(longSchool);
    expect(params.text).toContain("T".repeat(120));
  });

  it("7c. gradeLevel ngoài enum \"10\"|\"11\"|\"12\" (SDK ghi trực tiếp, rules không kiểm tra) → thân mail hiện 'Không rõ', không đưa nguyên giá trị lạ (I1, final whole-branch review)", async () => {
    await setAiConfig();
    await setStudent({ gradeLevel: "một đoạn văn dài học sinh cố tình nhét vào field lớp" });
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.text).not.toContain("một đoạn văn dài");
    expect(params.text).toContain("Lớp: Không rõ");
  });

  it("7d. nickname/school chứa xuống dòng (SDK ghi trực tiếp) → KHÔNG giả mạo được dòng \"Mức độ:\" thứ hai trong thân mail (I1 follow-up, final whole-branch review)", async () => {
    await setAiConfig();

    // Baseline: cùng severity, không ký tự lạ -> số DÒNG THẬT của một thân mail bình thường (kind
    // "initial") — không hardcode một con số ma thuật, để test không vỡ vô cớ nếu buildEmailBody
    // đổi số dòng sau này vì lý do khác không liên quan gì tới cuộc tấn công này.
    await setStudent({ nickname: "Mèo con", school: "THPT Trần Phú" });
    const baselineAlertData = await writeAlert({ severity: "concern" }, "alert-baseline");
    const baselineSendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertCreated(
      "alert-baseline",
      baselineAlertData,
      makeDeps({ sendEmail: baselineSendEmailSpy }),
    );
    const baselineLineCount = baselineSendEmailSpy.mock.calls[0][0].text.split("\n").length;

    // Tấn công: nickname/school chứa \n cố tình giả mạo thêm một dòng "Mức độ: Khẩn cấp" thứ hai
    // — nếu thân mail plain text không gộp khoảng trắng trước khi cắt, thầy cô đọc dòng giả này
    // như dữ liệu THẬT của hệ thống (mức độ đã tăng lên khẩn cấp), không phải chữ học sinh viết.
    await setStudent({
      nickname: "Mèo con\nMức độ: Khẩn cấp",
      school: "THPT Trần Phú\nMức độ: Khẩn cấp",
    });
    const attackAlertData = await writeAlert({ severity: "concern" }, "alert-attack");
    const attackSendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertCreated(
      "alert-attack",
      attackAlertData,
      makeDeps({ sendEmail: attackSendEmailSpy }),
    );

    const params = attackSendEmailSpy.mock.calls[0][0];
    const lines = params.text.split("\n");

    // Đúng bằng số dòng baseline — \n trong nickname/school không tạo thêm dòng nào.
    expect(lines.length).toBe(baselineLineCount);
    // Đúng MỘT dòng "Mức độ:" — không bị giả mạo thêm dòng thứ hai.
    const severityLines = lines.filter((line) => line.startsWith("Mức độ:"));
    expect(severityLines).toEqual(["Mức độ: Cần chú ý"]);
    // \n gộp về một dấu cách, không biến mất — vẫn đọc được nguyên nội dung trên MỘT dòng.
    expect(params.text).toContain("Học sinh: Mèo con Mức độ: Khẩn cấp");
    expect(params.text).toContain("Trường: THPT Trần Phú Mức độ: Khẩn cấp");
  });

  it("8. thân mail KHÔNG chứa gì ngoài danh sách field cho phép — không được spread document", async () => {
    await setAiConfig();
    await setStudent();
    // Field lạ nằm ngoài mô hình crisisAlertSchema (guard của Task 1 chặn field này ở SCHEMA,
    // nhưng ghi thẳng xuống Firestore vẫn bỏ qua guard đó) — nếu implementation từng spread
    // alertData vào params gửi mail thay vì liệt kê field tường minh, canary này sẽ lọt ra.
    const alertData = await writeAlert({
      messageExcerptCanary: "CANARY-KHONG-DUOC-LO-RA-NGOAI",
    });
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.text).not.toContain("CANARY-KHONG-DUOC-LO-RA-NGOAI");
    expect(params.subject).not.toContain("CANARY-KHONG-DUOC-LO-RA-NGOAI");
  });

  it("9. tiêu đề phân biệt urgent với concern nhưng KHÔNG chứa tên học sinh", async () => {
    await setAiConfig();
    await setStudent({ nickname: "Mèo con" });

    const urgentAlertData = await writeAlert({ severity: "urgent" }, "alert-urgent");
    const urgentSendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertCreated(
      "alert-urgent",
      urgentAlertData,
      makeDeps({ sendEmail: urgentSendEmailSpy }),
    );

    const concernAlertData = await writeAlert({ severity: "concern" }, "alert-concern");
    const concernSendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertCreated(
      "alert-concern",
      concernAlertData,
      makeDeps({ sendEmail: concernSendEmailSpy }),
    );

    const urgentSubject = urgentSendEmailSpy.mock.calls[0][0].subject;
    const concernSubject = concernSendEmailSpy.mock.calls[0][0].subject;

    expect(urgentSubject).not.toBe(concernSubject);
    expect(urgentSubject).not.toContain("Mèo con");
    expect(concernSubject).not.toContain("Mèo con");
  });

  it("10. học sinh đã xoá tài khoản (users/{uid} không đọc được) → vẫn gửi, dùng uid thô, 'sent'", async () => {
    await setAiConfig();
    // KHÔNG gọi setStudent — users/{uid} không tồn tại, mô phỏng tài khoản đã xoá.
    const alertData = await writeAlert({ userId: "deleted-user-uid" });
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.text).toContain("deleted-user-uid");

    const alert = await getAlert();
    expect(alert.emailStatus).toBe("sent");
  });

  it("11. loadAiConfig (đọc systemConfig/aiConfig) ném lỗi → vẫn ghi emailStatus 'failed', KHÔNG throw", async () => {
    await setStudent();
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ db: makeDbThrowingOnSystemConfigRead(), sendEmail: sendEmailSpy });

    await expect(runOnCrisisAlertCreated(ALERT_ID, alertData, deps)).resolves.toBeUndefined();

    expect(sendEmailSpy).not.toHaveBeenCalled();
    const alert = await getAlert();
    expect(alert.emailStatus).toBe("failed");
    expect(alert.emailedAt).toBeNull();
  });

  it("12. listUsers() ném lỗi (network Identity Toolkit) → vẫn ghi emailStatus 'failed', KHÔNG throw", async () => {
    await setAiConfig();
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({
      listUsers: vi.fn(async (): Promise<AuthUserRecordLike[]> => {
        throw new Error("Identity Toolkit tạm thời lỗi (mô phỏng test)");
      }),
      sendEmail: sendEmailSpy,
    });

    await expect(runOnCrisisAlertCreated(ALERT_ID, alertData, deps)).resolves.toBeUndefined();

    expect(sendEmailSpy).not.toHaveBeenCalled();
    const alert = await getAlert();
    expect(alert.emailStatus).toBe("failed");
    expect(alert.emailedAt).toBeNull();
  });

  it("13. systemConfig/aiConfig thiếu ĐÚNG hai field Spec #5 (tài liệu production TRƯỚC Spec #5) → 'skipped' nhờ default (C1, final whole-branch review), KHÔNG PHẢI 'failed'", async () => {
    // C1 (final whole-branch review): trước fix, crisisEmailEnabled/crisisEmailFrom không có
    // `.default()` khiến safeParse THẤT BẠI cho tài liệu này dù mọi field khác hợp lệ — SAU fix,
    // `.default()` làm tài liệu này parse THÀNH CÔNG với crisisEmailEnabled=false, nên kết quả
    // đúng giờ là "skipped" (tính năng THẬT SỰ chưa bật) — SỰ THẬT hơn "failed" (xem
    // final-fix-report.md, C1). Test này trước đây khẳng định NGƯỢC LẠI ("failed"); đổi kỳ vọng
    // là chính hành vi mà fix C1 tạo ra, không phải nới lỏng test.
    const { crisisEmailEnabled, crisisEmailFrom, ...oldShapeConfig } = DEFAULT_AI_CONFIG;
    void crisisEmailEnabled;
    void crisisEmailFrom;
    await db.collection("systemConfig").doc("aiConfig").set(oldShapeConfig);
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).not.toHaveBeenCalled();
    const alert = await getAlert();
    expect(alert.emailStatus).toBe("skipped");
  });

  it("13b. systemConfig/aiConfig THẬT SỰ sai hình dạng (field khác vi phạm ràng buộc, không cứu được bằng default) → vẫn 'failed'", async () => {
    // C1 chỉ thêm default cho HAI field Spec #5 — một field khác (vd temperature ngoài [0,1])
    // vẫn phải làm safeParse thất bại thật sự, để phân biệt "tài liệu cũ hợp lệ nhưng thiếu field
    // mới" (test 13, giờ 'skipped') khỏi "tài liệu THẬT SỰ hỏng" (test này, vẫn phải 'failed').
    await db.collection("systemConfig").doc("aiConfig").set({ ...DEFAULT_AI_CONFIG, temperature: 5 });
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).not.toHaveBeenCalled();
    const alert = await getAlert();
    expect(alert.emailStatus).toBe("failed");
  });
});

describe("onCrisisAlertCreated — sự kiện SỬA (escalation concern → urgent)", () => {
  it("14. leo thang sau khi mail ban đầu đã 'sent' → gửi mail CẬP NHẬT, tiêu đề/thân nêu rõ thay thế cảnh báo trước", async () => {
    await setAiConfig();
    await setStudent();
    const initialData = await writeAlert({ severity: "concern" });
    const initialSendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertCreated(ALERT_ID, initialData, makeDeps({ sendEmail: initialSendEmailSpy }));
    expect(initialSendEmailSpy).toHaveBeenCalledTimes(1);

    const beforeSnapData = await getAlert(); // đã có emailStatus "sent" từ bước trên
    expect(beforeSnapData.emailStatus).toBe("sent");

    // sendChatMessage.ts's upgradeCrisisAlert chỉ update severity + triggeredBy — mô phỏng đúng.
    const afterSnapData = await patchAlert({ severity: "urgent", triggeredBy: "both" });

    const escalationSendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertUpdated(
      ALERT_ID,
      beforeSnapData,
      afterSnapData,
      makeDeps({ sendEmail: escalationSendEmailSpy }),
    );

    expect(escalationSendEmailSpy).toHaveBeenCalledTimes(1);
    const params = escalationSendEmailSpy.mock.calls[0][0];
    expect(params.subject).toContain("CẬP NHẬT");
    expect(params.subject).toContain("KHẨN CẤP");
    expect(params.subject).not.toContain("Mèo con");
    expect(params.text).toContain("THAY THẾ");
    // Fix round 2, Finding 2: khẳng định đúng DÒNG severity, không chỉ chuỗi con "Khẩn cấp" —
    // đoạn văn escalation ở trên đã tự chứa "Khẩn cấp" nên assertion cũ không chứng minh được
    // dòng "Mức độ:" thật sự đổi theo severity mới.
    expect(params.text).toContain("Mức độ: Khẩn cấp");

    const finalAlert = await getAlert();
    expect(finalAlert.emailStatus).toBe("sent");
    expect(finalAlert.emailedAt).toBeInstanceOf(Timestamp);
  });

  it("15. severity KHÔNG đổi (vd chỉ handledBy đổi) → không gửi mail, KHÔNG ghi lại gì (chống tự kích hoạt lặp)", async () => {
    await setAiConfig();
    const initialData = await writeAlert({ severity: "concern" });
    await runOnCrisisAlertCreated(ALERT_ID, initialData, makeDeps());
    const beforeSnapData = await getAlert();

    const afterSnapData = await patchAlert({ handledBy: "admin-x" });
    // Fix round 2, Finding 2: chụp lại emailedAt TRƯỚC — so `emailStatus` với chính nó (cả hai
    // đều "sent") LUÔN đúng dù handler có chạy lại hay không, nên không chứng minh được gì; đây
    // mới là khẳng định mà comment của chính test này đưa ra ("không ghi lại gì").
    const emailedAtBefore = beforeSnapData.emailedAt;

    const sendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertUpdated(ALERT_ID, beforeSnapData, afterSnapData, makeDeps({ sendEmail: sendEmailSpy }));

    expect(sendEmailSpy).not.toHaveBeenCalled();
    const finalAlert = await getAlert();
    // Không bị viết đè: handledBy vẫn còn nguyên, emailStatus/emailedAt không đổi so với trước.
    expect(finalAlert.handledBy).toBe("admin-x");
    expect(finalAlert.emailStatus).toBe(beforeSnapData.emailStatus);
    expect((finalAlert.emailedAt as Timestamp).toDate().getTime()).toBe(
      (emailedAtBefore as Timestamp).toDate().getTime(),
    );
  });

  it("16. leo thang nhưng mail ban đầu KHÔNG phải 'sent' (vd 'skipped') → không gửi mail CẬP NHẬT", async () => {
    await setAiConfig({ crisisEmailEnabled: false }); // mail ban đầu sẽ là 'skipped'
    const initialData = await writeAlert({ severity: "concern" });
    await runOnCrisisAlertCreated(ALERT_ID, initialData, makeDeps());
    const beforeSnapData = await getAlert();
    expect(beforeSnapData.emailStatus).toBe("skipped");

    const afterSnapData = await patchAlert({ severity: "urgent", triggeredBy: "both" });

    const sendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertUpdated(ALERT_ID, beforeSnapData, afterSnapData, makeDeps({ sendEmail: sendEmailSpy }));

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("17. hướng khác concern→urgent (vd urgent → concern, không nên xảy ra theo bất biến hiện tại) → không gửi mail, phòng thủ", async () => {
    await setAiConfig();
    const initialData = await writeAlert({ severity: "urgent" });
    await runOnCrisisAlertCreated(ALERT_ID, initialData, makeDeps());
    const beforeSnapData = await getAlert();

    const afterSnapData = await patchAlert({ severity: "concern" });

    const sendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertUpdated(ALERT_ID, beforeSnapData, afterSnapData, makeDeps({ sendEmail: sendEmailSpy }));

    expect(sendEmailSpy).not.toHaveBeenCalled();
  });

  it("18. leo thang khi mail ban đầu 'failed' → gửi mail ĐẦY ĐỦ (kind initial, không phải escalation) để không bỏ sót cảnh báo urgent (Fix round 2, Finding 1a)", async () => {
    await setAiConfig();
    await setStudent();
    const beforeSnapData: Record<string, unknown> = {
      userId: STUDENT_UID,
      severity: "concern",
      triggeredBy: "keyword",
      createdAt: Timestamp.fromDate(new Date("2026-08-25T02:30:00Z")),
      handledBy: null,
      handledAt: null,
      emailStatus: "failed",
      emailedAt: null,
    };
    const afterSnapData = { ...beforeSnapData, severity: "urgent", triggeredBy: "both" };

    const sendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertUpdated(ALERT_ID, beforeSnapData, afterSnapData, makeDeps({ sendEmail: sendEmailSpy }));

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const params = sendEmailSpy.mock.calls[0][0];
    // Tiêu đề mail BAN ĐẦU (urgent), KHÔNG phải tiêu đề escalation — thân mail escalation nói
    // "THAY THẾ đánh giá mức độ trong email trước đó", một lời nói dối khi mail đầu chưa từng
    // tới nơi.
    expect(params.subject).toBe("[ExamCalm] Cảnh báo KHẨN CẤP — cần xử lý ngay");
    expect(params.subject).not.toContain("CẬP NHẬT");
    expect(params.text).not.toContain("THAY THẾ");
    expect(params.text).toContain("Mức độ: Khẩn cấp");
  });

  it("19. leo thang khi mail ban đầu CHƯA kịp ghi trạng thái (emailStatus thiếu — race điều kiện) → vẫn gửi mail ĐẦY ĐỦ, không bỏ sót (Fix round 2, Finding 1b)", async () => {
    await setAiConfig();
    await setStudent();
    // Mô phỏng đúng race: nhánh TẠO chưa kịp writeEmailStatus khi upgradeCrisisAlert đã chạy —
    // `before` KHÔNG có field emailStatus/emailedAt (không phải null, mà THIẾU HẲN — đúng những
    // gì event.data.before.data() trả về ngay sau writeCrisisAlert, trước khi trigger TẠO ghi gì).
    const beforeSnapData: Record<string, unknown> = {
      userId: STUDENT_UID,
      severity: "concern",
      triggeredBy: "keyword",
      createdAt: Timestamp.fromDate(new Date("2026-08-25T02:30:00Z")),
      handledBy: null,
      handledAt: null,
    };
    const afterSnapData = { ...beforeSnapData, severity: "urgent", triggeredBy: "both" };

    const sendEmailSpy = fakeSendEmail();
    await runOnCrisisAlertUpdated(ALERT_ID, beforeSnapData, afterSnapData, makeDeps({ sendEmail: sendEmailSpy }));

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const params = sendEmailSpy.mock.calls[0][0];
    expect(params.subject).toBe("[ExamCalm] Cảnh báo KHẨN CẤP — cần xử lý ngay");
    expect(params.text).not.toContain("THAY THẾ");
    expect(params.text).toContain("Mức độ: Khẩn cấp");
  });
});
