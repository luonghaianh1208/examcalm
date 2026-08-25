import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDocs, updateDoc, Timestamp, where } from "firebase/firestore";
import { ensureAuthReady } from "@/lib/firebase/client";
import { listCrisisAlerts, markCrisisAlertHandled, reopenCrisisAlert, isAlertUnhandled } from "./admin-crisis";

// Mock đúng tại ranh giới mà admin-crisis.ts phụ thuộc vào — cùng phong cách admin-ai.test.ts.
vi.mock("@/lib/firebase/client", () => ({
  getDb: vi.fn(() => ({})),
  ensureAuthReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((..._args: unknown[]) => ({ id: "mock-doc" })),
  getDocs: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => ["WHERE", ...args]),
  orderBy: vi.fn((...args: unknown[]) => ["ORDER_BY", ...args]),
  limit: vi.fn((...args: unknown[]) => ["LIMIT", ...args]),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  Timestamp: class {
    constructor(private readonly d: Date) {}
    toDate() {
      return this.d;
    }
  },
}));

const mockedGetDocs = vi.mocked(getDocs);
const mockedUpdateDoc = vi.mocked(updateDoc);
const mockedWhere = vi.mocked(where);

/** Hầu hết test dùng CÙNG một fixture cho CẢ HAI truy vấn song song (listCrisisAlerts giờ gọi
 *  getDocs hai lần — chưa xử lý + gần đây) — mockResolvedValue áp cho mọi lần gọi, nên dedup
 *  theo id sẽ tự nhiên cho ra đúng tập cũ (không có gì mới, không có gì thiếu) khi cả hai truy
 *  vấn trả về cùng một fixture. Test I6 riêng bên dưới mới cố tình cho hai truy vấn khác nhau. */

function fakeQuerySnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  } as unknown as Awaited<ReturnType<typeof getDocs>>;
}

function fakeTimestamp(d: Date) {
  return new (Timestamp as unknown as new (d: Date) => Timestamp)(d);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listCrisisAlerts", () => {
  it("gọi ensureAuthReady TRƯỚC getDocs — đóng race lúc mới đăng nhập", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedGetDocs.mockImplementation(async () => {
      order.push("getDocs");
      return fakeQuerySnap([]);
    });

    await listCrisisAlerts();

    // I6 (final whole-branch review): listCrisisAlerts giờ chạy HAI truy vấn song song
    // (chưa-xử-lý + gần-đây) — cả hai vẫn phải đứng SAU ensureAuthReady.
    expect(order).toEqual(["ensureAuthReady", "getDocs", "getDocs"]);
  });

  // Guard load-bearing (task-9-brief.md, mục "Never {...(doc.data() as T)}"): document lệch
  // hình dạng (field lạ như messageText — thứ crisisAlertSchema CỐ Ý không có, design §3.4)
  // không được lọt qua nguyên văn vào bản ghi trả về. Object.keys() chỉ thật sự "canh" được
  // nếu fixture có field NGOÀI model — nếu không test này luôn xanh dù code dùng spread.
  it("trích field TƯỜNG MINH — field lạ trong doc (vd messageText) KHÔNG lọt vào bản ghi trả về", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([
        {
          id: "a1",
          data: {
            userId: "u1",
            severity: "concern",
            triggeredBy: "keyword",
            createdAt: fakeTimestamp(new Date("2026-08-24T10:00:00Z")),
            handledBy: null,
            handledAt: null,
            emailStatus: "sent",
            emailedAt: fakeTimestamp(new Date("2026-08-24T10:00:05Z")),
            // Field NGOÀI crisisAlertSchema — không bao giờ được phép xuất hiện ở đầu ra.
            messageText: "nội dung riêng tư của học sinh",
          },
        },
      ]),
    );

    const { alerts: result } = await listCrisisAlerts();

    expect(Object.keys(result[0]!).sort()).toEqual(
      [
        "createdAt", "emailStatus", "emailedAt", "handledAt", "handledBy", "id", "severity",
        "triggeredBy", "userId",
      ].sort(),
    );
  });

  // ExamCalm Spec #5, Task 3: hai field mới map TƯỜNG MINH, Timestamp -> Date — cùng kỷ luật
  // với handledAt/createdAt. Bốn trạng thái emailStatus phải phân biệt được (task-3-brief.md):
  // "sent"/"failed"/"skipped" đọc thẳng từ document, và field VẮNG MẶT (trigger Task 2 chưa
  // chạy, hoặc chết trước khi ghi lại được gì) map về null — "chưa rõ", KHÔNG phải một trong
  // ba trạng thái đã biết.
  describe("emailStatus / emailedAt", () => {
    it("emailStatus 'sent' kèm emailedAt -> map tường minh, Timestamp -> Date", async () => {
      const emailedAt = new Date("2026-08-24T10:00:05Z");
      mockedGetDocs.mockResolvedValue(
        fakeQuerySnap([
          {
            id: "a1",
            data: {
              userId: "u1", severity: "urgent", triggeredBy: "keyword",
              createdAt: fakeTimestamp(new Date("2026-08-24T10:00:00Z")),
              handledBy: null, handledAt: null,
              emailStatus: "sent", emailedAt: fakeTimestamp(emailedAt),
            },
          },
        ]),
      );

      const { alerts: result } = await listCrisisAlerts();

      expect(result[0]?.emailStatus).toBe("sent");
      expect(result[0]?.emailedAt).toEqual(emailedAt);
    });

    it.each(["failed", "skipped"] as const)("emailStatus '%s' -> map tường minh, emailedAt null", async (status) => {
      mockedGetDocs.mockResolvedValue(
        fakeQuerySnap([
          {
            id: "a1",
            data: {
              userId: "u1", severity: "concern", triggeredBy: "keyword",
              createdAt: fakeTimestamp(new Date("2026-08-24T10:00:00Z")),
              handledBy: null, handledAt: null,
              emailStatus: status, emailedAt: null,
            },
          },
        ]),
      );

      const { alerts: result } = await listCrisisAlerts();

      expect(result[0]?.emailStatus).toBe(status);
      expect(result[0]?.emailedAt).toBeNull();
    });

    it("emailStatus VẮNG MẶT trên document (trigger Task 2 chưa chạy hoặc chết trước khi ghi) -> map về null, KHÔNG phải 'skipped'/'failed'", async () => {
      mockedGetDocs.mockResolvedValue(
        fakeQuerySnap([
          {
            id: "a1",
            data: {
              userId: "u1", severity: "concern", triggeredBy: "keyword",
              createdAt: fakeTimestamp(new Date("2026-08-24T10:00:00Z")),
              handledBy: null, handledAt: null,
              // KHÔNG có emailStatus/emailedAt — đúng hình dạng document TRƯỚC KHI trigger Task 2
              // kịp chạy (chat.ts:47-55).
            },
          },
        ]),
      );

      const { alerts: result } = await listCrisisAlerts();

      expect(result[0]?.emailStatus).toBeNull();
      expect(result[0]?.emailedAt).toBeNull();
    });

    it("emailStatus sai kiểu/giá trị lạ -> fallback an toàn về null, KHÔNG throw", async () => {
      mockedGetDocs.mockResolvedValue(
        fakeQuerySnap([
          {
            id: "a1",
            data: {
              userId: "u1", severity: "concern", triggeredBy: "keyword",
              createdAt: fakeTimestamp(new Date("2026-08-24T10:00:00Z")),
              handledBy: null, handledAt: null,
              emailStatus: "linh-tinh", emailedAt: "khong-phai-timestamp",
            },
          },
        ]),
      );

      const { alerts: result } = await listCrisisAlerts();

      expect(result[0]?.emailStatus).toBeNull();
      expect(result[0]?.emailedAt).toBeNull();
    });
  });

  it("document lệch hình dạng (field sai kiểu/thiếu) -> fallback an toàn, KHÔNG throw", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([{ id: "bad1", data: { severity: "linh-tinh", triggeredBy: 123 } }]),
    );

    const { alerts: result } = await listCrisisAlerts();

    expect(result[0]).toMatchObject({
      id: "bad1", userId: "", severity: "concern", triggeredBy: "keyword",
      handledBy: null, handledAt: null,
    });
  });

  // Fix round 1, Finding 5: fallback KHÔNG được là new Date(0) (1970) — trông như một thời điểm
  // THẬT trên một dòng cảnh báo. Invalid Date là sentinel duy nhất CrisisAlertList.tsx phân biệt
  // được bằng Number.isNaN(d.getTime()).
  it("createdAt không đọc được -> fallback Invalid Date (NaN), KHÔNG PHẢI new Date(0)/1970", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([{ id: "bad-date", data: { userId: "u1", severity: "concern", triggeredBy: "keyword" } }]),
    );

    const { alerts: result } = await listCrisisAlerts();

    expect(Number.isNaN(result[0]!.createdAt.getTime())).toBe(true);
    expect(result[0]!.createdAt.getTime()).not.toBe(new Date(0).getTime());
  });

  it("chuyển Timestamp createdAt/handledAt thành Date", async () => {
    const createdAt = new Date("2026-08-24T10:00:00Z");
    const handledAt = new Date("2026-08-24T11:00:00Z");
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([
        {
          id: "a1",
          data: {
            userId: "u1", severity: "urgent", triggeredBy: "both",
            createdAt: fakeTimestamp(createdAt),
            handledBy: "admin-1", handledAt: fakeTimestamp(handledAt),
          },
        },
      ]),
    );

    const { alerts: result } = await listCrisisAlerts();

    expect(result[0]?.createdAt).toEqual(createdAt);
    expect(result[0]?.handledAt).toEqual(handledAt);
  });

  // task-9-brief.md, mục 1: "Liệt kê cảnh báo chưa xử lý trước, mới nhất trên cùng". Query giả
  // lập trả về ĐÚNG thứ tự Firestore thật sự trả (orderBy createdAt desc): đã-xử-lý (mới nhất)
  // trước rồi mới tới chưa-xử-lý (cũ hơn), để chứng minh listCrisisAlerts TỰ sắp lại thứ tự
  // (chưa xử lý lên đầu) — không dựa may vào thứ tự Firestore trả về sẵn khớp yêu cầu.
  it("sắp cảnh báo CHƯA xử lý lên đầu, mới nhất trên cùng trong mỗi nhóm", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([
        // Firestore trả desc theo createdAt: handled (mới nhất) -> unhandled-cũ -> unhandled-mới nhất
        // (cố tình KHÔNG theo đúng thứ tự mong muốn để chứng minh có sắp lại).
        {
          id: "handled-newest",
          data: {
            userId: "u1", severity: "concern", triggeredBy: "keyword",
            createdAt: fakeTimestamp(new Date("2026-08-24T12:00:00Z")),
            handledBy: "admin-1", handledAt: fakeTimestamp(new Date("2026-08-24T12:30:00Z")),
          },
        },
        {
          id: "unhandled-older",
          data: {
            userId: "u2", severity: "urgent", triggeredBy: "keyword",
            createdAt: fakeTimestamp(new Date("2026-08-24T09:00:00Z")),
            handledBy: null, handledAt: null,
          },
        },
        {
          id: "unhandled-newest",
          data: {
            userId: "u3", severity: "concern", triggeredBy: "model",
            createdAt: fakeTimestamp(new Date("2026-08-24T11:00:00Z")),
            handledBy: null, handledAt: null,
          },
        },
      ]),
    );

    const { alerts: result } = await listCrisisAlerts();

    expect(result.map((a) => a.id)).toEqual(["unhandled-newest", "unhandled-older", "handled-newest"]);
  });

  // task-9-brief.md, "Three details" mục 1 — LOAD-BEARING: khoá "đã xử lý" theo handledBy, KHÔNG
  // BAO GIỜ theo handledAt. Một admin mở lại cảnh báo bằng cách ghi handledBy: null trong khi
  // handledAt CŨ vẫn còn nguyên (rules chỉ bắt buộc handledBy đổi đúng, không bắt buộc xoá
  // handledAt cùng lúc) — nếu khoá nhầm theo handledAt, cảnh báo đã MỞ LẠI sẽ hiện như đã xử lý,
  // và một thầy cô sẽ ngừng để ý tới nó.
  it("cảnh báo đã MỞ LẠI (handledBy: null, handledAt CŨ còn sót) vẫn được coi là CHƯA xử lý", async () => {
    mockedGetDocs.mockResolvedValue(
      fakeQuerySnap([
        {
          id: "reopened",
          data: {
            userId: "u1", severity: "urgent", triggeredBy: "keyword",
            createdAt: fakeTimestamp(new Date("2026-08-24T08:00:00Z")),
            handledBy: null,
            handledAt: fakeTimestamp(new Date("2026-08-20T00:00:00Z")), // sót lại từ lần xử lý trước
          },
        },
        {
          id: "still-handled",
          data: {
            userId: "u2", severity: "concern", triggeredBy: "keyword",
            createdAt: fakeTimestamp(new Date("2026-08-24T09:00:00Z")),
            handledBy: "admin-2", handledAt: fakeTimestamp(new Date("2026-08-24T09:30:00Z")),
          },
        },
      ]),
    );

    const { alerts: result } = await listCrisisAlerts();

    expect(result.map((a) => a.id)).toEqual(["reopened", "still-handled"]);
    expect(isAlertUnhandled(result[0]!)).toBe(true);
  });

  // ==== I6 (final whole-branch review) — cảnh báo CHƯA xử lý không được rơi ra khỏi trần
  // `max` của truy vấn "gần đây" nữa: chạy HAI truy vấn song song, gộp lại.
  it("I6: gọi getDocs ĐÚNG HAI lần — một truy vấn lọc where(handledBy, ==, null), một truy vấn 'gần đây' không lọc theo trạng thái", async () => {
    mockedGetDocs.mockResolvedValue(fakeQuerySnap([]));

    await listCrisisAlerts();

    expect(mockedGetDocs).toHaveBeenCalledTimes(2);
    expect(mockedWhere).toHaveBeenCalledWith("handledBy", "==", null);
    expect(mockedWhere).toHaveBeenCalledTimes(1); // truy vấn "gần đây" KHÔNG lọc theo trạng thái
  });

  it("I6: cảnh báo CHƯA xử lý CŨ (rớt khỏi truy vấn 'gần đây' vì có limit) VẪN xuất hiện trong kết quả", async () => {
    const oldUnhandled = {
      id: "old-unhandled",
      data: {
        userId: "u-old", severity: "urgent", triggeredBy: "keyword",
        // Rất cũ — kịch bản đúng thứ I6 mô tả: một cảnh báo bị bỏ sót trong tuần thi cử bận rộn.
        createdAt: fakeTimestamp(new Date("2020-01-01T00:00:00Z")),
        handledBy: null, handledAt: null,
      },
    };
    const recentHandled = {
      id: "recent-handled",
      data: {
        userId: "u-new", severity: "concern", triggeredBy: "keyword",
        createdAt: fakeTimestamp(new Date("2026-08-24T12:00:00Z")),
        handledBy: "admin-1", handledAt: fakeTimestamp(new Date("2026-08-24T12:30:00Z")),
      },
    };
    // Lần gọi getDocs THỨ NHẤT = truy vấn chưa-xử-lý (trả về cảnh báo cũ đó, KHÔNG bị limit vì
    // đây chính là truy vấn RIÊNG cho trạng thái này). Lần THỨ HAI = truy vấn "gần đây" — cảnh
    // báo cũ đã rớt khỏi cửa sổ limit(max) của nó từ lâu, chỉ còn cảnh báo mới.
    mockedGetDocs
      .mockResolvedValueOnce(fakeQuerySnap([oldUnhandled]))
      .mockResolvedValueOnce(fakeQuerySnap([recentHandled]));

    const { alerts: result } = await listCrisisAlerts();

    expect(result.map((a) => a.id)).toContain("old-unhandled");
    expect(result.map((a) => a.id)).toEqual(["old-unhandled", "recent-handled"]);
  });

  it("I6: truncated=false khi cả hai truy vấn trả về ÍT HƠN max", async () => {
    mockedGetDocs.mockResolvedValue(fakeQuerySnap([{ id: "a1", data: { userId: "u1", severity: "concern", triggeredBy: "keyword", createdAt: fakeTimestamp(new Date()), handledBy: null, handledAt: null } }]));

    const result = await listCrisisAlerts(200);

    expect(result.truncated).toBe(false);
  });

  it("I6: truncated=true khi truy vấn 'gần đây' CHẠM ĐÚNG trần max (có thể còn cảnh báo đã xử lý cũ hơn chưa lấy được)", async () => {
    const makeDoc = (id: string) => ({
      id,
      data: {
        userId: "u1", severity: "concern", triggeredBy: "keyword",
        createdAt: fakeTimestamp(new Date()), handledBy: "admin-1", handledAt: fakeTimestamp(new Date()),
      },
    });
    mockedGetDocs
      .mockResolvedValueOnce(fakeQuerySnap([])) // truy vấn chưa-xử-lý: rỗng
      .mockResolvedValueOnce(fakeQuerySnap([makeDoc("a1"), makeDoc("a2")])); // "gần đây": đúng max=2

    const result = await listCrisisAlerts(2);

    expect(result.truncated).toBe(true);
  });

  it("I6: truncated=true khi truy vấn CHƯA XỬ LÝ chạm đúng trần max (bản thân số lượng chưa xử lý đã vượt max — khủng hoảng vận hành thật)", async () => {
    const makeUnhandled = (id: string) => ({
      id,
      data: {
        userId: "u1", severity: "urgent", triggeredBy: "keyword",
        createdAt: fakeTimestamp(new Date()), handledBy: null, handledAt: null,
      },
    });
    mockedGetDocs
      .mockResolvedValueOnce(fakeQuerySnap([makeUnhandled("a1"), makeUnhandled("a2")])) // đúng max=2
      .mockResolvedValueOnce(fakeQuerySnap([]));

    const result = await listCrisisAlerts(2);

    expect(result.truncated).toBe(true);
  });
});

describe("isAlertUnhandled", () => {
  it("khoá theo handledBy — handledBy null nghĩa là chưa xử lý DÙ handledAt khác null", () => {
    expect(isAlertUnhandled({ handledBy: null })).toBe(true);
  });

  it("handledBy khác null nghĩa là đã xử lý", () => {
    expect(isAlertUnhandled({ handledBy: "admin-1" })).toBe(false);
  });
});

describe("markCrisisAlertHandled", () => {
  it("gọi ensureAuthReady TRƯỚC updateDoc", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedUpdateDoc.mockImplementation(async () => {
      order.push("updateDoc");
    });

    await markCrisisAlertHandled("a1", "admin-1");

    expect(order).toEqual(["ensureAuthReady", "updateDoc"]);
  });

  // design spec §5: rule chỉ cho phép đổi ĐÚNG handledBy + handledAt, không field nào khác —
  // client phải tự kỷ luật gửi đúng payload đó, không phải vì rule sẽ chặn (client phải làm
  // đúng để KHÔNG bị rule từ chối) mà vì hai field này là TOÀN BỘ những gì hành động này nên ghi.
  it("chỉ ghi ĐÚNG handledBy + handledAt — không field nào khác", async () => {
    await markCrisisAlertHandled("a1", "admin-1");

    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    const payload = mockedUpdateDoc.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["handledAt", "handledBy"]);
    expect(payload.handledBy).toBe("admin-1");
  });

  // "Ba chi tiết" mục 3 (task-9-brief.md): admin chỉ tự nhận xử lý được bằng CHÍNH uid của
  // mình — hàm này không nhận uid nào khác ngoài adminUid truyền vào, không có đường nào gán
  // handledBy cho một admin khác.
  it("dùng ĐÚNG adminUid truyền vào — không đoán hay lấy từ nơi khác", async () => {
    await markCrisisAlertHandled("a1", "admin-xyz");

    const payload = mockedUpdateDoc.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(payload.handledBy).toBe("admin-xyz");
  });
});

describe("reopenCrisisAlert", () => {
  it("gọi ensureAuthReady TRƯỚC updateDoc", async () => {
    const order: string[] = [];
    vi.mocked(ensureAuthReady).mockImplementation(async () => {
      order.push("ensureAuthReady");
    });
    mockedUpdateDoc.mockImplementation(async () => {
      order.push("updateDoc");
    });

    await reopenCrisisAlert("a1");

    expect(order).toEqual(["ensureAuthReady", "updateDoc"]);
  });

  // "Ba chi tiết" mục 3: mở lại phải khả dụng cho BẤT KỲ admin nào (rule cho phép handledBy ==
  // null từ mọi admin, không chỉ người đã xử lý trước đó) — hàm này không nhận/gửi kèm uid nào,
  // tức không có ràng buộc "chỉ người xử lý mới mở lại được" bị cài cắm ở phía client.
  it("chỉ ghi handledBy: null, handledAt: null — không cần biết admin nào đang mở lại", async () => {
    await reopenCrisisAlert("a1");

    expect(mockedUpdateDoc).toHaveBeenCalledTimes(1);
    const payload = mockedUpdateDoc.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(payload).toEqual({ handledBy: null, handledAt: null });
  });
});
