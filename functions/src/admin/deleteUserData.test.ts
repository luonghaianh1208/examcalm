import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { collectDeletionTargets, canDelete, isAuthAlreadyDeleted } from "./deleteUserData.logic";
import { DELETION_TARGET_HANDLERS } from "./deleteUserData";

describe("collectDeletionTargets", () => {
  // C1 (final whole-branch review): bản cũ của test này so khớp collectDeletionTargets() với
  // một MẢNG CHÉP TAY — tên là "liệt kê đủ mọi nơi chứa dữ liệu cá nhân" nhưng không kiểm tra
  // được điều đó: khi Spec #3 thêm aiJournalOutputs/aiUsage mà QUÊN cập nhật danh sách, mảng
  // chép tay chỉ cần chép SAI GIỐNG NHAU là test vẫn xanh. Test dưới đây so khớp với
  // DELETION_TARGET_HANDLERS — nơi deleteUserData.ts THẬT SỰ dùng để xóa dữ liệu — nên thêm một
  // collection dữ liệu cá nhân mới mà quên đăng ký handler (hoặc quên thêm vào danh sách) sẽ làm
  // MỘT TRONG HAI chiều dưới đây đỏ, không phụ thuộc vào việc ai đó chép tay đúng hay sai.
  it("mọi target (trừ users/{uid}) đều có handler xóa thật trong DELETION_TARGET_HANDLERS", () => {
    const targets = collectDeletionTargets().filter((t) => t !== "users/{uid}");
    for (const target of targets) {
      expect(DELETION_TARGET_HANDLERS).toHaveProperty(target);
    }
  });

  it("mọi handler đã đăng ký đều nằm trong collectDeletionTargets() — không có handler mồ côi", () => {
    const targets = new Set(collectDeletionTargets());
    for (const key of Object.keys(DELETION_TARGET_HANDLERS)) {
      expect(targets.has(key)).toBe(true);
    }
  });

  it("xóa doc users SAU CÙNG để không mất mốc kiểm tra quyền giữa chừng", () => {
    const targets = collectDeletionTargets();
    expect(targets[targets.length - 1]).toBe("users/{uid}");
  });
});

// Residual 2 / Finding 2 (re-review vòng cuối, final whole-branch review): hai test ở
// describe() trên chỉ bắt được LỆCH giữa collectDeletionTargets() và DELETION_TARGET_HANDLERS —
// nếu ai đó thêm một collection dữ liệu cá nhân MỚI mà quên đăng ký ở CẢ HAI nơi, cả hai chiều
// vẫn xanh (không có gì để so lệch). Đây đúng là kiểu lỗi đã xảy ra BA LẦN: cbtSessions
// (59289ed), rồi aiJournalOutputs/aiUsage bị bỏ sót nguyên một spec, chỉ final whole-branch
// review mới bắt được. Test dưới đây lấy nguồn sự thật ĐỘC LẬP với cả hai nơi trên: quét thẳng
// firestore.rules tìm mọi collection có rule owner-scope theo `resource.data.userId` — đúng
// hình dạng của MỌI collection dữ liệu cá nhân hiện có (testAttempts, testAnswers, moodLogs,
// cbtSessions, aiJournalOutputs) — rồi đòi nó phải có mặt trong collectDeletionTargets(). Thêm
// một collection owner-scoped kiểu này vào rules mà quên đăng ký xóa sẽ tự làm test đỏ, không
// cần ai nhớ cập nhật một danh sách chép tay ở đây nữa.
// Task 10 (final task của Spec #4) — reviewer chỉ ra bộ quét firestore.rules dưới đây có một
// ĐIỂM MÙ NGHIÊM TRỌNG: nó chỉ tìm chuỗi "resource.data.userId" trong THÂN rule. `crisisAlerts`
// — collection NHẠY CẢM NHẤT trong toàn bộ spec này — có rule "allow read: if isAdmin()" (không
// hề nhắc userId, vì học sinh KHÔNG được đọc collection này, kể cả cảnh báo về chính mình — xem
// firestore.rules) nên bộ quét rules IM LẶNG với đúng collection quan trọng nhất. Sửa bằng cách
// thêm một bộ quét ĐỘC LẬP THỨ HAI, đọc `src/lib/types/*.ts` tìm mọi `z.object({...})` khai báo
// field `userId` — `crisisAlertSchema` (chat.ts) có field đó dù rule của nó thì không, nên bộ
// quét schema THẤY được đúng cái bộ quét rules KHÔNG thấy. Hai bộ quét UNION với nhau (không
// thay thế lẫn nhau) — mỗi bộ có điểm mù riêng bộ kia bù được: rules-scan thấy được field sở
// hữu tên khác "userId" nếu rule dùng nó lộ liễu, nhưng mù với rule "if false"/admin-only kiểu
// crisisAlerts; schema-scan thấy được đúng những collection đó (schema Zod luôn khai báo field
// thật, bất kể rule ẩn nó thế nào) nhưng mù với field sở hữu không tên "userId" (vd `aiUsage`
// dùng "uid") HOẶC collection không có schema Zod nào cả.
describe("collectDeletionTargets() không bỏ sót collection dữ liệu cá nhân nào (đối chiếu độc lập với firestore.rules)", () => {
  const RULES_PATH = path.join(import.meta.dirname, "../../../firestore.rules");

  /**
   * Trích từng khối `match /X {...}` nằm TRỰC TIẾP dưới `match /databases/{database}/documents`
   * (không đệ quy vào match lồng nhau bên trong — cấu trúc firestore.rules của dự án này phẳng,
   * không có match nào lồng match khác ngoài khối documents gốc). Dùng đếm ngoặc nhọn thay vì
   * regex đơn dòng vì thân mỗi khối trải nhiều dòng và có thể chứa `{`/`}` của chính điều kiện
   * (vd object literal `{ moodReflection: ... }` trong comment hoặc biểu thức).
   */
  function extractTopLevelMatchBlocks(rulesText: string): { header: string; body: string }[] {
    const marker = "match /databases/{database}/documents {";
    const markerIdx = rulesText.indexOf(marker);
    if (markerIdx === -1) {
      throw new Error(
        "Không tìm thấy 'match /databases/{database}/documents' trong firestore.rules — " +
          "cấu trúc file đã đổi, cần cập nhật lại parser này.",
      );
    }

    const blocks: { header: string; body: string }[] = [];
    let depth = 0; // độ sâu ngoặc TÍNH TỪ ngay sau dấu { của khối documents
    let i = markerIdx + marker.length;

    while (i < rulesText.length) {
      if (depth === 0 && rulesText.startsWith("match /", i)) {
        // Header luôn nằm gọn TRÊN MỘT DÒNG kết thúc bằng dấu "{" mở khối (đúng định dạng
        // hiện tại của firestore.rules — vd "match /aiJournalOutputs/{id} {"). KHÔNG dùng
        // indexOf("{", i) đơn giản: path có thể chứa wildcard dạng "{id}"/"{uid}" NGAY SAU
        // "match /", và "{" của wildcard đó luôn đứng TRƯỚC dấu "{" mở khối thật — lấy nhầm
        // cái đó làm braceIdx cắt cụt header và làm lệch toàn bộ phép đếm độ sâu phía sau.
        const lineEndIdx = rulesText.indexOf("\n", i);
        const lineEnd = lineEndIdx === -1 ? rulesText.length : lineEndIdx;
        const braceIdx = i + rulesText.slice(i, lineEnd).lastIndexOf("{");
        const header = rulesText.slice(i, braceIdx).trim();
        let localDepth = 1;
        let j = braceIdx + 1;
        while (j < rulesText.length && localDepth > 0) {
          if (rulesText[j] === "{") localDepth++;
          else if (rulesText[j] === "}") localDepth--;
          j++;
        }
        blocks.push({ header, body: rulesText.slice(braceIdx + 1, j - 1) });
        i = j;
        continue;
      }
      if (rulesText[i] === "{") depth++;
      else if (rulesText[i] === "}") {
        if (depth === 0) break; // dấu } đóng khối documents gốc — dừng quét
        depth--;
      }
      i++;
    }
    return blocks;
  }

  /** Tên collection (đoạn path đầu tiên sau "match /") từ một header khối, vd
   *  "match /aiJournalOutputs/{id}" -> "aiJournalOutputs", "match /systemConfig/aiPublic" ->
   *  "systemConfig". */
  function topLevelCollectionName(header: string): string {
    return /^match\s+\/([^/{]+)/.exec(header)?.[1] ?? "";
  }

  // Collection có rule owner-scope theo field KHÁC "userId" (vd "uid"), hoặc hoàn toàn không
  // client nào chạm tới được ("if false") — quét văn bản rules KHÔNG phát hiện được các
  // collection này vì rule của chúng không hề nhắc tới field sở hữu theo mẫu chung, VÀ (Task 10)
  // schema Zod của chúng không khai báo field tên đúng "userId" nên bộ quét schema bên dưới cũng
  // không thấy. Danh sách này PHẢI ngắn và mỗi dòng PHẢI có lý do — nếu dài ra nghĩa là cách quy
  // ước đặt tên field sở hữu đang trôi dạt, nên xem lại thay vì cứ thêm vào đây. Forcing function:
  // test "OWNER_SCOPED_BUT_UNSCANNABLE chỉ chứa collection THẬT SỰ không quét được..." bên dưới
  // đòi mọi entry ở đây phải THẬT SỰ nằm ngoài kết quả của CẢ HAI bộ quét — một entry trở nên
  // scannable (rules hoặc schema đổi để lộ field sở hữu) mà không gỡ khỏi đây sẽ làm test đó đỏ.
  const OWNER_SCOPED_BUT_UNSCANNABLE = [
    // field sở hữu là "uid" (không phải "userId"), rule "allow read, write: if false" — chỉ
    // Cloud Function (Admin SDK) chạm tới, xem functions/src/ai/quota.ts. Không có schema Zod
    // nào định nghĩa hình dạng document này (aiUsage chỉ có type ngầm định trong quota.ts) nên
    // bộ quét schema cũng không thấy được.
    "aiUsage",
  ];

  // Cửa thoát tường minh: một collection quét ra khớp mẫu "owner-scoped theo
  // resource.data.userId" nhưng KHÔNG phải dữ liệu cá nhân cần xóa cascade khi tài khoản bị
  // xóa. Hiện chưa có trường hợp nào — để trống có chủ đích, không xóa mảng này.
  const EXEMPT_NOT_PERSONAL_DATA: string[] = [];

  function scanOwnerScopedCollections(): string[] {
    const rulesText = fs.readFileSync(RULES_PATH, "utf8");
    const blocks = extractTopLevelMatchBlocks(rulesText);
    return blocks
      .map((b) => ({ name: topLevelCollectionName(b.header), body: b.body }))
      .filter((b) => b.name !== "" && b.body.includes("resource.data.userId"))
      .map((b) => b.name);
  }

  // Sanity CỦA CHÍNH BỘ QUÉT, tách riêng khỏi test đăng ký xóa bên dưới — nếu firestore.rules
  // đổi cấu trúc và parser không còn bắt được gì (hoặc bắt sai), test dưới sẽ xanh RỖNG (vacuous)
  // mà không ai để ý nếu không có khẳng định riêng này. Danh sách 5 collection dưới đây PHẢI
  // cập nhật khi thêm một collection owner-scoped theo resource.data.userId THẬT SỰ mới — đó là
  // chi phí chấp nhận được để giữ bộ quét trung thực, khác hẳn chép tay TOÀN BỘ registry xóa.
  it("bộ quét tìm đúng các collection owner-scoped theo resource.data.userId đã biết (sanity của parser)", () => {
    expect(new Set(scanOwnerScopedCollections())).toEqual(
      new Set([
        "testAttempts", "testAnswers", "moodLogs", "cbtSessions", "aiJournalOutputs",
        "chatSessions", "chatMessages",
      ]),
    );
  });

  const TYPES_DIR = path.join(import.meta.dirname, "../../../src/lib/types");

  /**
   * Trích mọi khối `export const XxxSchema = z.object({ ... })` cấp cao nhất trong một file
   * `src/lib/types/*.ts` — cùng kỹ thuật đếm ngoặc nhọn với `extractTopLevelMatchBlocks` ở trên
   * (thân schema có thể chứa `z.object({...})` LỒNG NHAU, vd `aiConfigSchema.killSwitch` —
   * không thể cắt bằng regex một dòng). `name` là tên biến TRỪ hậu tố "Schema" (vd
   * "chatSessionSchema" -> "chatSession") — dùng để suy ra tên collection ở
   * `schemaNameToCollectionName` bên dưới.
   */
  function extractSchemaBlocks(fileText: string): { name: string; body: string }[] {
    const blocks: { name: string; body: string }[] = [];
    const headerPattern = /export const (\w+)Schema = z\.object\(\{/g;
    let match: RegExpExecArray | null;
    while ((match = headerPattern.exec(fileText)) !== null) {
      const name = match[1];
      const braceStart = headerPattern.lastIndex - 1; // vị trí dấu "{" vừa khớp ở cuối pattern
      let depth = 1;
      let j = braceStart + 1;
      while (j < fileText.length && depth > 0) {
        if (fileText[j] === "{") depth++;
        else if (fileText[j] === "}") depth--;
        j++;
      }
      blocks.push({ name, body: fileText.slice(braceStart + 1, j - 1) });
    }
    return blocks;
  }

  /**
   * Tên biến schema (đã bỏ hậu tố "Schema") -> tên collection Firestore thật. Quy ước số nhiều
   * DUY NHẤT dùng trong toàn bộ dự án cho các schema owner-scoped hiện có: thêm "s" trừ khi đã
   * kết thúc bằng "s" — khớp ĐÚNG cả 8 trường hợp thật (testAttempt->testAttempts,
   * testAnswer->testAnswers, moodLog->moodLogs, cbtSession->cbtSessions,
   * aiJournalOutput->aiJournalOutputs, chatSession->chatSessions, chatMessage->chatMessages,
   * crisisAlert->crisisAlerts) — xác nhận bằng chính test sanity ngay bên dưới, không phải một
   * giả định chưa kiểm chứng: quy tắc SAI cho bất kỳ trường hợp nào trong 8 trường hợp đó sẽ
   * làm test sanity đỏ ngay lập tức.
   */
  function schemaNameToCollectionName(schemaName: string): string {
    return schemaName.endsWith("s") ? schemaName : `${schemaName}s`;
  }

  /**
   * Quét mọi `src/lib/types/*.ts` (trừ `*.test.ts`) tìm schema Zod cấp cao nhất có khai báo field
   * `userId` — hình dạng CHUNG của mọi document sở hữu-bởi-một-học-sinh trong dự án này, độc lập
   * hoàn toàn với việc rule Firestore của nó có nhắc "resource.data.userId" hay không (đó chính
   * là lý do bộ quét này tồn tại — xem comment đầu describe() này về `crisisAlerts`).
   */
  function scanUserIdSchemaCollections(): string[] {
    const files = fs.readdirSync(TYPES_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    const collections: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(path.join(TYPES_DIR, file), "utf8");
      for (const block of extractSchemaBlocks(text)) {
        if (/^\s*userId:\s*z\./m.test(block.body)) {
          collections.push(schemaNameToCollectionName(block.name));
        }
      }
    }
    return collections;
  }

  // Sanity CỦA CHÍNH BỘ QUÉT SCHEMA, tách riêng khỏi test đăng ký xóa — cùng lý do sanity của bộ
  // quét rules ở trên: nếu src/lib/types/ đổi cấu trúc (vd đổi từ `z.object({` sang một cách viết
  // khác) và parser không còn bắt được gì, test đăng ký bên dưới sẽ xanh RỖNG mà không ai để ý
  // nếu thiếu khẳng định riêng này.
  it("bộ quét Zod tìm đúng các schema khai báo field userId đã biết (sanity của parser)", () => {
    expect(new Set(scanUserIdSchemaCollections())).toEqual(
      new Set([
        "testAttempts", "testAnswers", "moodLogs", "cbtSessions", "aiJournalOutputs",
        "chatSessions", "chatMessages", "crisisAlerts",
      ]),
    );
  });

  it("mọi collection owner-scoped theo rules HOẶC theo schema Zod đều có mặt trong collectDeletionTargets()", () => {
    const required = [
      ...scanOwnerScopedCollections(),
      ...scanUserIdSchemaCollections(),
      ...OWNER_SCOPED_BUT_UNSCANNABLE,
    ].filter((name) => !EXEMPT_NOT_PERSONAL_DATA.includes(name));

    const registry = new Set(collectDeletionTargets());
    for (const name of required) {
      expect(registry.has(name)).toBe(true);
    }
  });

  // Forcing function cho OWNER_SCOPED_BUT_UNSCANNABLE (Task 10): trước đây danh sách này không
  // có gì buộc nó phải NGẮN hay TRUNG THỰC — một collection mới lẽ ra quét được (bởi rules HOẶC
  // schema) vẫn có thể bị thêm nhầm vào đây mà không ai phát hiện. Test này khẳng định NGƯỢC LẠI
  // hai test sanity ở trên: mọi entry trong danh sách PHẢI thật sự không nằm trong kết quả của
  // CẢ HAI bộ quét — nếu sau này ai đó thêm field `userId` (thay vì `uid`) cho `aiUsage`, hoặc
  // sửa rule của nó để lộ `resource.data.userId`, entry "aiUsage" trở nên THỪA và test này sẽ đỏ,
  // buộc phải gỡ nó khỏi danh sách hand-maintained thay vì để nó âm thầm trôi dạt.
  it("OWNER_SCOPED_BUT_UNSCANNABLE chỉ chứa collection THẬT SỰ không quét được bởi cả hai bộ quét (forcing function)", () => {
    const scannable = new Set([...scanOwnerScopedCollections(), ...scanUserIdSchemaCollections()]);
    for (const name of OWNER_SCOPED_BUT_UNSCANNABLE) {
      expect(scannable.has(name)).toBe(false);
    }
  });
});

describe("canDelete", () => {
  it("cho phép user tự xóa dữ liệu của mình", () => {
    expect(canDelete({ uid: "u1", token: { role: "student" } }, "u1")).toBe(true);
  });

  it("cho phép admin xóa dữ liệu người khác", () => {
    expect(canDelete({ uid: "a1", token: { role: "admin" } }, "u1")).toBe(true);
  });

  it("từ chối student xóa dữ liệu người khác", () => {
    expect(canDelete({ uid: "u2", token: { role: "student" } }, "u1")).toBe(false);
  });

  it("từ chối khi chưa đăng nhập", () => {
    expect(canDelete(undefined, "u1")).toBe(false);
  });
});

describe("isAuthAlreadyDeleted", () => {
  it("coi là đã xóa khi đúng mã lỗi auth/user-not-found", () => {
    expect(isAuthAlreadyDeleted("auth/user-not-found")).toBe(true);
  });

  it("KHÔNG coi là đã xóa với lỗi khác — quyền, quota, mất kết nối...", () => {
    expect(isAuthAlreadyDeleted("auth/insufficient-permission")).toBe(false);
    expect(isAuthAlreadyDeleted("auth/internal-error")).toBe(false);
    expect(isAuthAlreadyDeleted("auth/network-request-failed")).toBe(false);
  });

  it("KHÔNG coi là đã xóa khi không có mã lỗi", () => {
    expect(isAuthAlreadyDeleted(undefined)).toBe(false);
  });
});
