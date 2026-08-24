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
  // collection này vì rule của chúng không hề nhắc tới field sở hữu theo mẫu chung. Danh sách
  // này PHẢI ngắn và mỗi dòng PHẢI có lý do — nếu dài ra nghĩa là cách quy ước đặt tên field sở
  // hữu đang trôi dạt, nên xem lại thay vì cứ thêm vào đây.
  const OWNER_SCOPED_BUT_UNSCANNABLE = [
    // field sở hữu là "uid" (không phải "userId"), rule "allow read, write: if false" — chỉ
    // Cloud Function (Admin SDK) chạm tới, xem functions/src/ai/quota.ts.
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
      new Set(["testAttempts", "testAnswers", "moodLogs", "cbtSessions", "aiJournalOutputs"]),
    );
  });

  it("mọi collection owner-scoped theo resource.data.userId trong firestore.rules đều có mặt trong collectDeletionTargets()", () => {
    const required = [...scanOwnerScopedCollections(), ...OWNER_SCOPED_BUT_UNSCANNABLE].filter(
      (name) => !EXEMPT_NOT_PERSONAL_DATA.includes(name),
    );

    const registry = new Set(collectDeletionTargets());
    for (const name of required) {
      expect(registry.has(name)).toBe(true);
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
