import { describe, it, expect } from "vitest";
import { sendEmail, EmailError, type SendEmailParams } from "./resendClient";

// Key giả dùng xuyên suốt file test — mọi nhánh lỗi phải được khẳng định KHÔNG echo lại chuỗi này.
const SECRET_API_KEY = "re_SECRET_VALUE";

const baseParams: SendEmailParams = {
  apiKey: SECRET_API_KEY,
  from: "canh-bao@examcalm.vn",
  to: ["admin1@school.edu.vn", "admin2@school.edu.vn"],
  subject: "Cảnh báo khủng hoảng",
  text: "Một học sinh cần được hỗ trợ.",
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
 *  gốc vào EmailError.message — đây là nhánh dễ "mọc" thêm `error.message` nhất trong tương lai,
 *  và đó là cách phổ biến nhất khiến API key lọt vào log. */
function networkErrorFetch(secretInErrorMessage: string): typeof fetch {
  return (async () => {
    throw new Error(`ECONNREFUSED khi gọi Resend (key=${secretInErrorMessage})`);
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
  return { ok: true, status: 200, json: async () => ({ id: "email_abc123" }) };
}

describe("sendEmail", () => {
  it("case 1: POST tới https://api.resend.com/emails", async () => {
    const seenUrls: string[] = [];
    const fetchImpl = fakeFetch((url) => {
      seenUrls.push(url);
      return validSuccessResponse();
    });

    await sendEmail(baseParams, { fetchImpl });

    expect(seenUrls).toEqual(["https://api.resend.com/emails"]);
  });

  it("case 2: header Authorization Bearer <apiKey> và Content-Type application/json", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    await sendEmail(baseParams, { fetchImpl });

    const headers = seenInit!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${SECRET_API_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("case 3: body có from, to (mảng), subject, text", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    await sendEmail(baseParams, { fetchImpl });

    const body = JSON.parse(seenInit!.body as string);
    expect(body).toEqual({
      from: baseParams.from,
      to: baseParams.to,
      subject: baseParams.subject,
      text: baseParams.text,
    });
  });

  it("case 3b (Fix round 1, Task 2 Finding 5): có bcc -> body chứa bcc", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    await sendEmail({ ...baseParams, bcc: ["a@x.test", "b@x.test"] }, { fetchImpl });

    const body = JSON.parse(seenInit!.body as string);
    expect(body.bcc).toEqual(["a@x.test", "b@x.test"]);
  });

  it("case 3c (Fix round 1, Task 2 Finding 5): không truyền bcc -> body KHÔNG có key bcc (hình dạng cũ giữ nguyên)", async () => {
    let seenInit: RequestInit | null = null;
    const fetchImpl = fakeFetch((_url, init) => {
      seenInit = init;
      return validSuccessResponse();
    });

    await sendEmail(baseParams, { fetchImpl });

    const body = JSON.parse(seenInit!.body as string);
    expect(body).not.toHaveProperty("bcc");
  });

  it("case 4: thành công -> trả { id }", async () => {
    const fetchImpl = fakeFetch(() => validSuccessResponse());

    const result = await sendEmail(baseParams, { fetchImpl });

    expect(result).toEqual({ id: "email_abc123" });
  });

  it("case 5: HTTP 401 -> EmailError kind auth", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 401 }));

    await expect(sendEmail(baseParams, { fetchImpl })).rejects.toMatchObject({ kind: "auth" });
  });

  it("case 6: HTTP 403 -> EmailError kind auth", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 403 }));

    await expect(sendEmail(baseParams, { fetchImpl })).rejects.toMatchObject({ kind: "auth" });
  });

  it("case 7: HTTP 429 -> kind rate_limit", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 429 }));

    await expect(sendEmail(baseParams, { fetchImpl })).rejects.toMatchObject({
      kind: "rate_limit",
    });
  });

  it("case 8: HTTP 500 -> kind server", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 500 }));

    await expect(sendEmail(baseParams, { fetchImpl })).rejects.toMatchObject({ kind: "server" });
  });

  it("case 9: HTTP 400 (cấu hình sai) -> kind server", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: false, status: 400 }));

    await expect(sendEmail(baseParams, { fetchImpl })).rejects.toMatchObject({ kind: "server" });
  });

  it("case 10: body không phải JSON -> kind bad_response, không ném SyntaxError thô", async () => {
    const fetchImpl = fakeFetch(() => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    }));

    const promise = sendEmail(baseParams, { fetchImpl });

    await expect(promise).rejects.toBeInstanceOf(EmailError);
    await expect(promise).rejects.toMatchObject({ kind: "bad_response" });
  });

  it("case 11: body JSON hợp lệ nhưng thiếu id -> kind bad_response", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, status: 200, json: async () => ({}) }));

    await expect(sendEmail(baseParams, { fetchImpl })).rejects.toMatchObject({
      kind: "bad_response",
    });
  });

  it("case 12: quá timeoutMs -> kind timeout, dùng AbortController", async () => {
    const fetchImpl = neverResolvingFetch();

    const promise = sendEmail({ ...baseParams, timeoutMs: 20 }, { fetchImpl });

    await expect(promise).rejects.toMatchObject({ kind: "timeout" });
  });

  // Ride-along (task-3-brief.md): nhánh catch mạng chung (fetch ném lỗi KHÔNG PHẢI AbortError —
  // DNS, connection refused...) chưa từng có case riêng. kind phải là "server" (không có status
  // code để phân loại chi tiết hơn), và message KHÔNG BAO GIỜ echo error.message gốc — cố tình
  // nhét API key giả vào message lỗi gốc để chứng minh code không nội suy nó vào EmailError.
  it("case 12b: lỗi mạng chung (không phải AbortError) -> kind server, KHÔNG echo message gốc (không lộ apiKey)", async () => {
    const fetchImpl = networkErrorFetch(SECRET_API_KEY);

    const promise = sendEmail(baseParams, { fetchImpl });

    await expect(promise).rejects.toBeInstanceOf(EmailError);
    await expect(promise).rejects.toMatchObject({ kind: "server" });
    let caught: unknown;
    try {
      await sendEmail(baseParams, { fetchImpl });
    } catch (error) {
      caught = error;
    }
    expect((caught as EmailError).message).not.toContain(SECRET_API_KEY);
  });

  // Case quan trọng nhất: EmailError.message không bao giờ chứa apiKey, kiểm tra trên MỌI
  // nhánh lỗi chứ không chỉ một nhánh — vì message lỗi vô tình echo lại request/header là cách
  // API key rò rỉ vào log phổ biến nhất (cùng kỷ luật với functions/src/ai/openaiClient.ts).
  describe("case 13: message không bao giờ chứa apiKey, ở mọi nhánh lỗi", () => {
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
        name: "400 misconfig -> server",
        kind: "server",
        fetchImpl: () => fakeFetch(() => ({ ok: false, status: 400 })),
      },
      {
        name: "body không phải JSON -> bad_response",
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
        name: "thiếu id -> bad_response",
        kind: "bad_response",
        fetchImpl: () => fakeFetch(() => ({ ok: true, status: 200, json: async () => ({}) })),
      },
      {
        name: "timeout",
        kind: "timeout",
        fetchImpl: () => neverResolvingFetch(),
      },
      {
        name: "lỗi mạng chung (không phải AbortError) -> server",
        kind: "server",
        fetchImpl: () => networkErrorFetch(SECRET_API_KEY),
      },
    ];

    it.each(branches)("$name", async ({ kind, fetchImpl }) => {
      const params: SendEmailParams = { ...baseParams, timeoutMs: 20, apiKey: SECRET_API_KEY };

      let caught: unknown;
      try {
        await sendEmail(params, { fetchImpl: fetchImpl() });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(EmailError);
      const err = caught as EmailError;
      expect(err.kind).toBe(kind);
      expect(err.message).not.toContain(SECRET_API_KEY);
    });
  });
});
