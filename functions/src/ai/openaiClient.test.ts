import { describe, it, expect } from "vitest";
import {
  callChatCompletion,
  AiProviderError,
  type ChatCompletionParams,
  type ChatCompletionMessage,
} from "./openaiClient";

// Key giả dùng xuyên suốt file test — mọi nhánh lỗi phải được khẳng định KHÔNG echo lại chuỗi này.
const SECRET_API_KEY = "sk-SECRET-VALUE";

const baseParams: ChatCompletionParams = {
  baseUrl: "https://provider.example.com/v1",
  apiKey: SECRET_API_KEY,
  model: "gpt-test",
  systemPrompt: "Bạn là trợ lý.",
  userPrompt: "Xin chào",
  temperature: 0.7,
  maxTokens: 256,
  timeoutMs: 5000,
};

type FakeFetchResult = { ok: boolean; status: number; json?: () => Promise<unknown> };

/** Tạo fetch giả tuân theo `typeof fetch` nhưng không gọi mạng thật. */
function fakeFetch(
  handler: (url: string, init: RequestInit) => FakeFetchResult | Promise<FakeFetchResult>,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const result = await handler(url, init ?? {});
    return result as unknown as Response;
  }) as unknown as typeof fetch;
}

/** fetch giả ném MỘT lỗi mạng chung (không phải AbortError) — DNS/connection refused/... Nhánh
 *  catch này (ride-along, task-3-brief.md) chưa từng có case test riêng: message của lỗi ném ra
 *  cố tình mang theo API key giả để chứng minh nhánh này KHÔNG bao giờ nội suy `error.message`
 *  gốc vào AiProviderError.message — đây là nhánh dễ "mọc" thêm `error.message` nhất trong
 *  tương lai, và đó là cách phổ biến nhất khiến API key lọt vào log. */
function networkErrorFetch(secretInErrorMessage: string): typeof fetch {
  return (async () => {
    throw new Error(`ECONNREFUSED khi gọi AI provider (key=${secretInErrorMessage})`);
  }) as unknown as typeof fetch;
}

/** fetch giả chờ vô hạn cho tới khi bị AbortController huỷ — dùng cho test timeout. */
function neverResolvingFetch(): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  }) as unknown as typeof fetch;
}

function validSuccessResponse(): FakeFetchResult {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: "Xin chào bạn" }, finish_reason: "stop" }],
    }),
  };
}

describe("callChatCompletion", () => {
  it("case 1: POST tới {baseUrl}/chat/completions, chuẩn hoá dấu / cuối", async () => {
    const seenUrls: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      seenUrls.push(url);
      return validSuccessResponse();
    });

    await callChatCompletion({ ...baseParams, baseUrl: "https://x.example.com/v1" }, { fetchImpl });
    await callChatCompletion({ ...baseParams, baseUrl: "https://x.example.com/v1/" }, { fetchImpl });

    expect(seenUrls).toEqual([
      "https://x.example.com/v1/chat/completions",
      "https://x.example.com/v1/chat/completions",
    ]);
  });

  it("case 2: header Authorization Bearer <apiKey> và Content-Type application/json", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    await callChatCompletion(baseParams, { fetchImpl });

    const headers = seenInit!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${SECRET_API_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("case 3: body có model, messages (system rồi user), temperature, max_tokens, stream: false", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    await callChatCompletion(baseParams, { fetchImpl });

    const body = JSON.parse(seenInit!.body as string);
    expect(body).toEqual({
      model: baseParams.model,
      messages: [
        { role: "system", content: baseParams.systemPrompt },
        { role: "user", content: baseParams.userPrompt },
      ],
      temperature: baseParams.temperature,
      max_tokens: baseParams.maxTokens,
      stream: false,
    });
  });

  // Task 5 (Spec #4): sendChatMessage.ts truyền một mảng `messages` nhiều lượt (dựng sẵn bởi
  // buildChatMessages) thay vì cặp systemPrompt/userPrompt — callChatCompletion phải gửi thẳng
  // mảng đó, không tự ý bọc lại thành hai lượt system/user.
  it("case 3b: params dùng `messages` (nhiều lượt) → body.messages gửi thẳng mảng đó, không phải [system, user]", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    const messages: ChatCompletionMessage[] = [
      { role: "system", content: "Bạn là trợ lý." },
      { role: "user", content: "Lượt cũ 1" },
      { role: "assistant", content: "Trả lời cũ 1" },
      { role: "user", content: "Tin mới" },
    ];
    const params: ChatCompletionParams = {
      baseUrl: baseParams.baseUrl,
      apiKey: baseParams.apiKey,
      model: baseParams.model,
      temperature: baseParams.temperature,
      maxTokens: baseParams.maxTokens,
      timeoutMs: baseParams.timeoutMs,
      messages,
    };

    await callChatCompletion(params, { fetchImpl });

    const body = JSON.parse(seenInit!.body as string);
    expect(body.messages).toEqual(messages);
  });

  it("case 4: response hợp lệ → trả text từ choices[0].message.content", async () => {
    const fetchImpl = fakeFetch(() => validSuccessResponse());

    const result = await callChatCompletion(baseParams, { fetchImpl });

    expect(result).toEqual({ text: "Xin chào bạn", finishReason: "stop" });
  });

  it("case 5: choices rỗng → ném AiProviderError, không trả chuỗi rỗng", async () => {
    const fetchImpl = fakeFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [] }),
    }));

    await expect(callChatCompletion(baseParams, { fetchImpl })).rejects.toThrow(AiProviderError);
  });

  it("case 6: HTTP 401 → AiProviderError kind auth", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 401 }));

    await expect(callChatCompletion(baseParams, { fetchImpl })).rejects.toMatchObject({
      kind: "auth",
    });
  });

  it("case 7: HTTP 429 → kind rate_limit", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 429 }));

    await expect(callChatCompletion(baseParams, { fetchImpl })).rejects.toMatchObject({
      kind: "rate_limit",
    });
  });

  it("case 8: HTTP 500 → kind server", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }));

    await expect(callChatCompletion(baseParams, { fetchImpl })).rejects.toMatchObject({
      kind: "server",
    });
  });

  it("case 9: body không phải JSON → kind bad_response, không ném SyntaxError thô", async () => {
    const fetchImpl = fakeFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    }));

    const promise = callChatCompletion(baseParams, { fetchImpl });

    await expect(promise).rejects.toBeInstanceOf(AiProviderError);
    await expect(promise).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("case 11: quá timeoutMs → kind timeout, dùng AbortController", async () => {
    const fetchImpl = neverResolvingFetch();

    const promise = callChatCompletion({ ...baseParams, timeoutMs: 20 }, { fetchImpl });

    await expect(promise).rejects.toMatchObject({ kind: "timeout" });
  });

  // Ride-along (task-3-brief.md): nhánh catch mạng chung (fetch ném lỗi KHÔNG PHẢI AbortError —
  // DNS, connection refused...) chưa từng có case riêng. kind phải là "server" (không có status
  // code để phân loại chi tiết hơn), và message KHÔNG BAO GIỜ echo error.message gốc — cố tình
  // nhét API key giả vào message lỗi gốc để chứng minh code không nội suy nó vào AiProviderError.
  it("case 11b: lỗi mạng chung (không phải AbortError) → kind server, KHÔNG echo message gốc (không lộ apiKey)", async () => {
    const fetchImpl = networkErrorFetch(SECRET_API_KEY);

    const promise = callChatCompletion(baseParams, { fetchImpl });

    await expect(promise).rejects.toBeInstanceOf(AiProviderError);
    await expect(promise).rejects.toMatchObject({ kind: "server" });
    let caught: unknown;
    try {
      await callChatCompletion(baseParams, { fetchImpl });
    } catch (error) {
      caught = error;
    }
    expect((caught as AiProviderError).message).not.toContain(SECRET_API_KEY);
  });

  // Case 10 (quan trọng nhất): AiProviderError.message không bao giờ chứa apiKey,
  // kiểm tra trên MỌI nhánh lỗi chứ không chỉ một nhánh — vì message lỗi vô tình
  // echo lại request/header là cách API key rò rỉ vào log phổ biến nhất.
  describe("case 10: message không bao giờ chứa apiKey, ở mọi nhánh lỗi", () => {
    const branches: Array<{ name: string; kind: string; fetchImpl: () => typeof fetch }> = [
      {
        name: "401 auth",
        kind: "auth",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 401 })),
      },
      {
        name: "403 auth",
        kind: "auth",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 403 })),
      },
      {
        name: "429 rate_limit",
        kind: "rate_limit",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 429 })),
      },
      {
        name: "500 server",
        kind: "server",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 500 })),
      },
      {
        name: "400 misconfig → server",
        kind: "server",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 400 })),
      },
      {
        name: "404 misconfig → server",
        kind: "server",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 404 })),
      },
      {
        name: "body không phải JSON → bad_response",
        kind: "bad_response",
        fetchImpl: () =>
          fakeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError("bad json");
            },
          })),
      },
      {
        name: "choices rỗng → bad_response",
        kind: "bad_response",
        fetchImpl: () =>
          fakeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => ({ choices: [] }),
          })),
      },
      {
        name: "thiếu choices[0].message.content → bad_response",
        kind: "bad_response",
        fetchImpl: () =>
          fakeFetch(() => ({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: {} }] }),
          })),
      },
      {
        name: "timeout",
        kind: "timeout",
        fetchImpl: () => neverResolvingFetch(),
      },
      {
        name: "lỗi mạng chung (không phải AbortError) → server",
        kind: "server",
        fetchImpl: () => networkErrorFetch(SECRET_API_KEY),
      },
    ];

    it.each(branches)("$name", async ({ kind, fetchImpl }) => {
      const params: ChatCompletionParams = { ...baseParams, timeoutMs: 20, apiKey: SECRET_API_KEY };

      let caught: unknown;
      try {
        await callChatCompletion(params, { fetchImpl: fetchImpl() });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(AiProviderError);
      const err = caught as AiProviderError;
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(SECRET_API_KEY);
    });
  });
});
