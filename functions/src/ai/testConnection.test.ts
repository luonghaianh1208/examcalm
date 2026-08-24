// Test ráp callable testAiConnection trên Firestore emulator, cùng khuôn với
// generateReflection.test.ts: gọi thẳng `runTestAiConnection` (lõi có thể test được, tách
// khỏi onCall thật) với một `callChatCompletion` GIẢ tiêm qua deps — không một byte nào ra
// mạng thật. BẮT BUỘC chạy với FIRESTORE_EMULATOR_HOST đã set (`npm test`).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { runTestAiConnection } from "./testConnection";
import { AiProviderError, type ChatCompletionResult } from "./openaiClient";
import { DEFAULT_AI_CONFIG, type AiConfig } from "./config";
import { PermissionDeniedError, type CallerAuth } from "../admin/guards";

let app: App;
let db: Firestore;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "testConnection.test.ts cần Firestore emulator: chạy `npm test` (đã bọc sẵn " +
        "firebase emulators:exec) thay vì gọi vitest trực tiếp mà không có emulator.",
    );
  }
  process.env.METADATA_SERVER_DETECTION = "none";
  app = initializeApp({ projectId: "examcalm-testconn-test" }, "testconn-test-app");
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("systemConfig"));
});

const ADMIN_AUTH: CallerAuth = { uid: "admin1", token: { role: "admin" } };
const STUDENT_AUTH: CallerAuth = { uid: "student1", token: { role: "student" } };

async function setAiConfig(overrides: Partial<AiConfig> = {}): Promise<void> {
  const config: AiConfig = {
    ...DEFAULT_AI_CONFIG,
    baseUrl: "https://fake-provider.test/v1",
    model: "fake-model-v1",
    providerLabel: "FakeProvider",
    ...overrides,
  };
  await db.collection("systemConfig").doc("aiConfig").set(config);
}

function fakeCallChatCompletion(
  impl: () => Promise<ChatCompletionResult>,
): (...args: unknown[]) => Promise<ChatCompletionResult> {
  return vi.fn(impl);
}

function makeDeps(callChatCompletion: (...args: unknown[]) => Promise<ChatCompletionResult>) {
  return { db, apiKey: "fake-api-key", callChatCompletion };
}

describe("runTestAiConnection", () => {
  it("từ chối khi chưa đăng nhập", async () => {
    await expect(
      runTestAiConnection(undefined, makeDeps(fakeCallChatCompletion(async () => ({ text: "OK", finishReason: "stop" })))),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("từ chối student — chỉ admin mới được thử kết nối", async () => {
    await expect(
      runTestAiConnection(STUDENT_AUTH, makeDeps(fakeCallChatCompletion(async () => ({ text: "OK", finishReason: "stop" })))),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it("chưa cấu hình baseUrl/model -> ok:false, KHÔNG gọi callChatCompletion", async () => {
    await setAiConfig({ baseUrl: "", model: "" });
    const call = fakeCallChatCompletion(async () => ({ text: "OK", finishReason: "stop" }));

    const result = await runTestAiConnection(ADMIN_AUTH, makeDeps(call));

    expect(result.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it("chưa có document aiConfig nào -> ok:false, KHÔNG gọi callChatCompletion", async () => {
    const call = fakeCallChatCompletion(async () => ({ text: "OK", finishReason: "stop" }));

    const result = await runTestAiConnection(ADMIN_AUTH, makeDeps(call));

    expect(result.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
  });

  it("gọi thành công -> ok:true, không lộ text trả về của model", async () => {
    await setAiConfig();
    const call = fakeCallChatCompletion(async () => ({ text: "OK, kết nối tốt", finishReason: "stop" }));

    const result = await runTestAiConnection(ADMIN_AUTH, makeDeps(call));

    expect(result).toEqual({ ok: true });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("callChatCompletion ném AiProviderError('auth') -> ok:false, message KHÔNG chứa baseUrl/key/header", async () => {
    await setAiConfig();
    const call = fakeCallChatCompletion(async () => {
      throw new AiProviderError("auth", "AI provider trả về lỗi HTTP 401.");
    });

    const result = await runTestAiConnection(ADMIN_AUTH, makeDeps(call));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("auth");
      expect(result.message).not.toMatch(/fake-provider\.test/);
      expect(result.message).not.toMatch(/fake-api-key/);
      expect(result.message).not.toMatch(/Bearer/i);
    }
  });

  it("callChatCompletion ném AiProviderError('timeout') -> ok:false, kind='timeout'", async () => {
    await setAiConfig();
    const call = fakeCallChatCompletion(async () => {
      throw new AiProviderError("timeout", "Yêu cầu tới AI provider quá hạn 15000ms.");
    });

    const result = await runTestAiConnection(ADMIN_AUTH, makeDeps(call));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("timeout");
  });

  it("không tốn quota — không ghi bất kỳ document nào vào aiUsage", async () => {
    await setAiConfig();
    const call = fakeCallChatCompletion(async () => ({ text: "OK", finishReason: "stop" }));

    await runTestAiConnection(ADMIN_AUTH, makeDeps(call));

    const usageSnap = await db.collection("aiUsage").get();
    expect(usageSnap.empty).toBe(true);
  });
});
