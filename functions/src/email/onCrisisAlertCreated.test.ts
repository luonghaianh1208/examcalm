// Test trigger onCrisisAlertCreated (ExamCalm Spec #5, Task 2) trên Firestore emulator. Gọi
// thẳng `runOnCrisisAlertCreated` (lõi có thể test được, tách khỏi onDocumentCreated thật của
// Cloud Functions) với dữ liệu document mô phỏng `event.data.data()` và deps GIẢ (listUsers,
// sendEmail) — không một byte nào ra mạng thật, và KHÔNG cần Auth emulator (listUsers tiêm được
// qua deps, cùng cách sendChatMessage.ts tiêm callChatCompletion).
//
// BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (`npm test`, xem package.json). File này
// cũng nằm trong danh sách loại trừ của `test:unit` (cần emulator).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  runOnCrisisAlertCreated,
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
const ADMIN_A_EMAIL = "admin-a@examcalm.test";
const ADMIN_B_EMAIL = "admin-b@examcalm.test";

async function setAiConfig(overrides: Partial<AiConfig> = {}): Promise<void> {
  const config: AiConfig = {
    ...DEFAULT_AI_CONFIG,
    crisisEmailEnabled: true,
    crisisEmailFrom: "canhbao@examcalm.test",
    ...overrides,
  };
  await db.collection("systemConfig").doc("aiConfig").set(config);
}

/** Ghi document cảnh báo trực tiếp (bỏ qua writeCrisisAlert của sendChatMessage.ts — file đó
 *  không thuộc phạm vi test này) rồi đọc lại NGUYÊN VĂN — mô phỏng đúng những gì
 *  `event.data.data()` thật trả về (Timestamp thật từ emulator, không phải Date tự tạo). */
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

describe("onCrisisAlertCreated", () => {
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

  it("4. đường thuận: gọi sendEmail một lần với to là mọi email admin, ghi 'sent' + emailedAt", async () => {
    await setAiConfig();
    await setStudent();
    const alertData = await writeAlert();
    const sendEmailSpy = fakeSendEmail();
    const deps = makeDeps({ listUsers: fakeListUsers([ADMIN_A, ADMIN_B, NON_ADMIN]), sendEmail: sendEmailSpy });

    await runOnCrisisAlertCreated(ALERT_ID, alertData, deps);

    expect(sendEmailSpy).toHaveBeenCalledTimes(1);
    const params = sendEmailSpy.mock.calls[0][0];
    expect([...params.to].sort()).toEqual([ADMIN_A_EMAIL, ADMIN_B_EMAIL].sort());

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
    expect(params.to).toEqual([ADMIN_A_EMAIL]);
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

  it("7. thân mail chứa biệt danh, lớp, trường, mức độ, thời điểm và link tới /admin/canh-bao", async () => {
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
});
