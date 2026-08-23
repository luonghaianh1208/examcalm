# ExamCalm Spec #2 — CBT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học sinh làm được một bài tập CBT ngắn có ghi cảm xúc trước/sau, và admin quản lý được nội dung bài tập mà không cần sửa code.

**Architecture:** Sao chép nguyên khuôn đã chạy tốt ở Spec #1 — nội dung versioned trong Firestore, đọc công khai qua Admin SDK ở Server Component, ghi dữ liệu riêng tư qua client SDK dưới sự canh gác của Security Rules. Điểm mới duy nhất là **sinh id session ở client trước khi ghi**, để cảm xúc "trước" trỏ được vào một session chưa tồn tại.

**Tech Stack:** Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · Firebase (Firestore, Auth, Cloud Functions) · Zod 4 · Vitest + Testing Library · `@firebase/rules-unit-testing`

**Spec:** `docs/superpowers/specs/2026-08-23-examcalm-cbt-design.md`

## Global Constraints

- UI tiếng Việt; tên file/biến/hàm tiếng Anh; comment tiếng Việt.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Không dùng `any` nếu không có comment giải thích.
- Không cài thư viện i18n. Dùng `Intl` cho ngày/số.
- Output test phải sạch — không cảnh báo.
- **Mọi hàm ghi Firestore hoặc gọi callable từ client phải `await ensureAuthReady()` ở dòng đầu.** Race này đã bị phát hiện lại 5 lần trong Spec #1.
- **Không bao giờ `{...(d.data() as T)}`** — liệt kê từng field tường minh. Spread mang theo `Timestamp` (class instance) làm sập Client Component.
- **Tải hỏng phải có trạng thái riêng**, không gộp thành danh sách rỗng. Đọc `src/components/progress/ProgressView.tsx` để theo đúng khuôn.
- Trang public đọc Firestore dùng `export const dynamic = "force-dynamic"`, **không** dùng `revalidate`.
- `firebase-admin` không bao giờ được lọt vào code client. File dùng Admin SDK bắt đầu bằng `import "server-only"`.
- Không tạo cơ chế chuỗi ngày, nhắc nhở, hay đếm ngày liên tiếp.
- Agent được phép `git commit`. Không `git push`, không deploy.
- Không sửa `firestore.rules` ngoài Task 2.

---

### Task 1: Kiểu dữ liệu và schema CBT

**Files:**
- Create: `src/lib/types/cbt.ts`
- Test: `src/lib/types/cbt.test.ts`

**Interfaces:**
- Consumes: không
- Produces: `cbtStepSchema`, `cbtModuleSchema`, `cbtSessionSchema`, types `CbtStep`, `CbtModule`, `CbtSession`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/lib/types/cbt.test.ts
import { describe, expect, it } from "vitest";
import { cbtModuleSchema, cbtSessionSchema } from "@/lib/types/cbt";

const MODULE = {
  title: "Nhận diện suy nghĩ tiêu cực",
  version: 1,
  status: "draft" as const,
  isSampleContent: true,
  disclaimer: "Bài tập tự nhận thức, không thay thế chuyên gia.",
  intro: "Bài này giúp bạn nhìn lại một suy nghĩ đang làm bạn lo.",
  steps: [{ id: "s1", prompt: "Suy nghĩ nào đang lặp lại?", hint: "Viết đúng câu bạn nghĩ." }],
  closingText: "Cảm ơn bạn đã dành thời gian.",
  suggestedResourceSlugs: ["ky-thuat-tho-4-7-8"],
  updatedBy: "admin-uid",
};

describe("cbtModuleSchema", () => {
  it("chấp nhận module hợp lệ", () => {
    expect(cbtModuleSchema.safeParse(MODULE).success).toBe(true);
  });

  it("từ chối disclaimer rỗng", () => {
    expect(cbtModuleSchema.safeParse({ ...MODULE, disclaimer: "" }).success).toBe(false);
  });

  it("từ chối module không có bước nào", () => {
    expect(cbtModuleSchema.safeParse({ ...MODULE, steps: [] }).success).toBe(false);
  });

  it("từ chối id bước rỗng", () => {
    const bad = { ...MODULE, steps: [{ id: "", prompt: "a", hint: "b" }] };
    expect(cbtModuleSchema.safeParse(bad).success).toBe(false);
  });
});

describe("cbtSessionSchema", () => {
  it("chấp nhận session hợp lệ", () => {
    const ok = {
      userId: "u1", moduleId: "m1", moduleVersion: 1,
      answers: { s1: "Mình sợ trượt." }, summary: "Mình đang khắt khe với bản thân.",
    };
    expect(cbtSessionSchema.safeParse(ok).success).toBe(true);
  });

  it("chấp nhận summary rỗng — học sinh được quyền bỏ qua", () => {
    const ok = {
      userId: "u1", moduleId: "m1", moduleVersion: 1,
      answers: { s1: "a" }, summary: "",
    };
    expect(cbtSessionSchema.safeParse(ok).success).toBe(true);
  });

  it("từ chối userId rỗng", () => {
    const bad = { userId: "", moduleId: "m1", moduleVersion: 1, answers: {}, summary: "" };
    expect(cbtSessionSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- cbt`
Kỳ vọng: FAIL — không tìm thấy module `@/lib/types/cbt`.

- [ ] **Step 3: Viết `src/lib/types/cbt.ts`**

```ts
import { z } from "zod";

export const cbtStepSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  hint: z.string(),
});

export const cbtModuleSchema = z.object({
  title: z.string().min(1).max(200),
  version: z.number().int().min(1),
  status: z.enum(["draft", "published"]),
  isSampleContent: z.boolean(),
  disclaimer: z.string().min(1),
  intro: z.string(),
  steps: z.array(cbtStepSchema).min(1).max(12),
  closingText: z.string(),
  suggestedResourceSlugs: z.array(z.string()).max(5),
  updatedBy: z.string(),
});

export const cbtSessionSchema = z.object({
  userId: z.string().min(1),
  moduleId: z.string().min(1),
  moduleVersion: z.number().int().min(1),
  // Câu trả lời tự luận ngắn. PRD §5.5 ghi `any`; ở đây là `string` vì mọi
  // bước trong spec này đều là câu hỏi mở — xem design spec §4.2.
  answers: z.record(z.string(), z.string().max(2000)),
  // Học sinh tự viết, được phép để trống — xem design spec §9 điểm 5.
  summary: z.string().max(2000),
});

export type CbtStep = z.infer<typeof cbtStepSchema>;
export type CbtModule = z.infer<typeof cbtModuleSchema>;
export type CbtSession = z.infer<typeof cbtSessionSchema>;
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm test -- cbt`
Kỳ vọng: PASS 7/7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/cbt.ts src/lib/types/cbt.test.ts
git commit -m "feat(cbt): schema cho cbtModules va cbtSessions"
```

---

### Task 2: Security Rules cho `cbtModules` và `cbtSessions` (TDD)

**Files:**
- Modify: `firestore.rules`
- Test: `tests/rules/cbt.test.ts`

**Interfaces:**
- Consumes: `tests/rules/helpers.ts` — `createTestEnv`, `authedDb`, `adminDb`, `guestDb`, `seed`
- Produces: rules cho hai collection mới

**Ghi chú quan trọng:** `helpers.ts` tạo user đã verify email. Đọc `tests/rules/moodLogs.test.ts` trước để theo đúng khuôn — đặc biệt cách nó chứng minh **admin KHÔNG đọc được**.

- [ ] **Step 1: Viết test thất bại**

```ts
// tests/rules/cbt.test.ts
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: Awaited<ReturnType<typeof createTestEnv>>;

const SESSION = {
  userId: "u1", moduleId: "m1", moduleVersion: 1,
  answers: { s1: "Mình sợ trượt." }, summary: "",
};

const MODULE_PUBLISHED = { title: "Bài mẫu", version: 1, status: "published", isSampleContent: true };
const MODULE_DRAFT = { title: "Bài nháp", version: 1, status: "draft", isSampleContent: true };

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("cbtModules", () => {
  it("Guest đọc được module đã publish", async () => {
    await seed(env, "cbtModules/m1", MODULE_PUBLISHED);
    await assertSucceeds(getDoc(doc(guestDb(env), "cbtModules/m1")));
  });

  it("Guest KHÔNG đọc được module draft", async () => {
    await seed(env, "cbtModules/m2", MODULE_DRAFT);
    await assertFails(getDoc(doc(guestDb(env), "cbtModules/m2")));
  });

  it("Admin đọc được module draft", async () => {
    await seed(env, "cbtModules/m2", MODULE_DRAFT);
    await assertSucceeds(getDoc(doc(adminDb(env), "cbtModules/m2")));
  });

  it("Admin ghi được module", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "cbtModules/m3"), MODULE_DRAFT));
  });

  it("Student KHÔNG ghi được module", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "cbtModules/m3"), MODULE_DRAFT));
  });
});

describe("cbtSessions", () => {
  it("Student tạo được session của chính mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "cbtSessions/s1"), SESSION));
  });

  it("Student KHÔNG tạo được session mang userId người khác", async () => {
    await assertFails(
      setDoc(doc(authedDb(env, "u1"), "cbtSessions/s1"), { ...SESSION, userId: "u2" }),
    );
  });

  it("Guest KHÔNG tạo được session", async () => {
    await assertFails(setDoc(doc(guestDb(env), "cbtSessions/s1"), SESSION));
  });

  it("Student đọc được session của mình", async () => {
    await seed(env, "cbtSessions/s1", SESSION);
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "cbtSessions/s1")));
  });

  it("Student KHÔNG đọc được session người khác", async () => {
    await seed(env, "cbtSessions/s1", SESSION);
    await assertFails(getDoc(doc(authedDb(env, "u2"), "cbtSessions/s1")));
  });

  it("ADMIN KHÔNG đọc được session — riêng tư như moodLogs", async () => {
    await seed(env, "cbtSessions/s1", SESSION);
    await assertFails(getDoc(doc(adminDb(env), "cbtSessions/s1")));
  });

  it("KHÔNG sửa được session sau khi ghi", async () => {
    await seed(env, "cbtSessions/s1", SESSION);
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "cbtSessions/s1"), { summary: "x" }));
  });

  it("Student xóa được session của mình", async () => {
    await seed(env, "cbtSessions/s1", SESSION);
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "cbtSessions/s1")));
  });

  it("Student KHÔNG xóa được session người khác", async () => {
    await seed(env, "cbtSessions/s1", SESSION);
    await assertFails(deleteDoc(doc(authedDb(env, "u2"), "cbtSessions/s1")));
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm run test:rules`
Kỳ vọng: các ca `assertSucceeds` FAIL (catch-all deny chặn hết). Các ca `assertFails` sẽ pass một cách rỗng — ghi nhận điều đó trong báo cáo, đừng nhận là bằng chứng RED.

- [ ] **Step 3: Thêm rules vào `firestore.rules`**

Chèn **ngay trước** khối catch-all `match /{document=**}`:

```js
    match /cbtModules/{id} {
      allow read:  if resource.data.status == "published" || isAdmin();
      allow write: if isAdmin();
    }

    match /cbtSessions/{id} {
      allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
      // Admin KHÔNG đọc được — nội dung học sinh viết về suy nghĩ tiêu cực của
      // mình còn riêng tư hơn điểm số. Cố ý khác testAttempts.
      allow read:   if isSignedIn() && resource.data.userId == request.auth.uid;
      allow update: if false;
      allow delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm run test:rules`
Kỳ vọng: toàn bộ test rules pass (61 cũ + 13 mới = 74).

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/cbt.test.ts
git commit -m "feat(rules): cbtModules cong khai khi publish, cbtSessions rieng tu tuyet doi"
```

---

### Task 3: Truy vấn công khai cho `cbtModules`

**Files:**
- Modify: `src/lib/firebase/queries-public.ts`
- Test: `src/lib/firebase/queries-public.test.ts`

**Interfaces:**
- Consumes: `CbtModule` từ Task 1
- Produces: `listPublishedCbtModules(): Promise<CbtModuleListItem[]>`, `getPublishedCbtModule(id: string): Promise<CbtModuleListItem | null>`, type `CbtModuleListItem = CbtModule & { id: string }`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/lib/firebase/queries-public.test.ts`, theo đúng khuôn regression guard đã có:

```ts
it("toCbtModuleListItem chỉ trả field khai báo, không mang Timestamp", () => {
  const raw = {
    title: "Bài mẫu", version: 1, status: "published", isSampleContent: true,
    disclaimer: "d", intro: "i", steps: [{ id: "s1", prompt: "p", hint: "h" }],
    closingText: "c", suggestedResourceSlugs: [], updatedBy: "admin",
    updatedAt: new FakeTimestamp(), createdAt: new FakeTimestamp(),
  };
  const item = toCbtModuleListItem("m1", raw as never);
  expect(Object.keys(item).sort()).toEqual([
    "closingText", "disclaimer", "id", "intro", "isSampleContent", "status",
    "steps", "suggestedResourceSlugs", "title", "updatedBy", "version",
  ]);
});
```

Ghi chú: `FakeTimestamp` đã có sẵn trong file test này từ Task 19. `toCbtModuleListItem` phải được export để test gọi được.

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- queries-public`
Kỳ vọng: FAIL — `toCbtModuleListItem` chưa tồn tại.

- [ ] **Step 3: Thêm vào `queries-public.ts`**

```ts
import type { CbtModule } from "@/lib/types/cbt";

export type CbtModuleListItem = CbtModule & { id: string };

/** Liệt kê tường minh — xem giải thích ở toResourceListItem(). */
export function toCbtModuleListItem(id: string, data: CbtModule): CbtModuleListItem {
  return {
    id,
    title: data.title,
    version: data.version,
    status: data.status,
    isSampleContent: data.isSampleContent,
    disclaimer: data.disclaimer,
    intro: data.intro,
    steps: data.steps,
    closingText: data.closingText,
    suggestedResourceSlugs: data.suggestedResourceSlugs,
    updatedBy: data.updatedBy,
  };
}

export async function listPublishedCbtModules(): Promise<CbtModuleListItem[]> {
  const snap = await adminDb()
    .collection("cbtModules")
    .where("status", "==", "published")
    .get();
  return snap.docs.map((d) => toCbtModuleListItem(d.id, d.data() as CbtModule));
}

export async function getPublishedCbtModule(id: string): Promise<CbtModuleListItem | null> {
  const snap = await adminDb().collection("cbtModules").doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data() as CbtModule;
  if (data.status !== "published") return null;
  return toCbtModuleListItem(snap.id, data);
}
```

Không thêm `orderBy` — truy vấn chỉ có một equality filter nên không cần composite index. Đây là lý do có ghi chú ở Task 9 của Spec #1.

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm test -- queries-public` rồi `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add src/lib/firebase/queries-public.ts src/lib/firebase/queries-public.test.ts
git commit -m "feat(cbt): truy van cbtModules da publish cho Server Component"
```

---

### Task 4: Ghi `cbtSessions` từ client

**Files:**
- Create: `src/lib/firestore/cbt-sessions.ts`
- Test: `src/lib/firestore/cbt-sessions.test.ts`

**Interfaces:**
- Consumes: `getDb`, `ensureAuthReady` từ `@/lib/firebase/client`; `cbtSessionSchema` từ Task 1
- Produces: `newSessionRef(): { id: string; path: string }`, `saveCbtSession(uid, sessionId, input): Promise<void>`, `listMyCbtSessions(uid, max?): Promise<CbtSessionRecord[]>`, type `CbtSessionInput`, `CbtSessionRecord`

- [ ] **Step 1: Viết test thất bại**

```ts
// src/lib/firestore/cbt-sessions.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const ensureAuthReady = vi.fn(async () => {});
const setDocMock = vi.fn(async () => {});

vi.mock("@/lib/firebase/client", () => ({
  getDb: () => ({}),
  ensureAuthReady,
}));

vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({ id: "generated-id", path: "cbtSessions/generated-id" }),
  setDoc: setDocMock,
  getDocs: async () => ({ docs: [] }),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  serverTimestamp: () => "SERVER_TS",
  Timestamp: class {},
}));

const { newSessionRef, saveCbtSession } = await import("@/lib/firestore/cbt-sessions");

beforeEach(() => { ensureAuthReady.mockClear(); setDocMock.mockClear(); });

describe("newSessionRef", () => {
  it("trả về id và path dùng được cho linkedActivityRef", () => {
    const ref = newSessionRef();
    expect(ref.id).toBe("generated-id");
    expect(ref.path).toBe("cbtSessions/generated-id");
  });
});

describe("saveCbtSession", () => {
  const INPUT = { moduleId: "m1", moduleVersion: 1, answers: { s1: "a" }, summary: "" };

  it("gọi ensureAuthReady TRƯỚC khi ghi", async () => {
    await saveCbtSession("u1", "s1", INPUT);
    expect(ensureAuthReady.mock.invocationCallOrder[0]).toBeLessThan(
      setDocMock.mock.invocationCallOrder[0]!,
    );
  });

  it("ghi userId từ tham số, không lấy từ input", async () => {
    await saveCbtSession("u1", "s1", INPUT);
    const written = setDocMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(written.userId).toBe("u1");
  });

  it("từ chối answers vượt quá giới hạn schema", async () => {
    const bad = { ...INPUT, answers: { s1: "x".repeat(2001) } };
    await expect(saveCbtSession("u1", "s1", bad)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- cbt-sessions`
Kỳ vọng: FAIL — module chưa tồn tại.

- [ ] **Step 3: Viết `src/lib/firestore/cbt-sessions.ts`**

```ts
"use client";

import {
  collection, doc, getDocs, limit as fbLimit, orderBy, query,
  serverTimestamp, setDoc, Timestamp, where,
} from "firebase/firestore";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { cbtSessionSchema } from "@/lib/types/cbt";

export type CbtSessionInput = {
  moduleId: string;
  moduleVersion: number;
  answers: Record<string, string>;
  summary: string;
};

export type CbtSessionRecord = CbtSessionInput & { id: string; createdAt: Date | null };

/**
 * Sinh id TRƯỚC khi ghi. Cảm xúc "trước" cần trỏ vào session chưa tồn tại,
 * nên phải biết id từ đầu — xem design spec §5.
 */
export function newSessionRef(): { id: string; path: string } {
  const ref = doc(collection(getDb(), "cbtSessions"));
  return { id: ref.id, path: `cbtSessions/${ref.id}` };
}

export async function saveCbtSession(
  uid: string,
  sessionId: string,
  input: CbtSessionInput,
): Promise<void> {
  await ensureAuthReady();
  const payload = cbtSessionSchema.parse({ ...input, userId: uid });
  await setDoc(doc(getDb(), "cbtSessions", sessionId), {
    ...payload,
    createdAt: serverTimestamp(),
  });
}

export async function listMyCbtSessions(uid: string, max = 50): Promise<CbtSessionRecord[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "cbtSessions"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      fbLimit(max),
    ),
  );

  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt;
    return {
      id: d.id,
      moduleId: data.moduleId as string,
      moduleVersion: data.moduleVersion as number,
      answers: (data.answers ?? {}) as Record<string, string>,
      summary: (data.summary ?? "") as string,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm test -- cbt-sessions`

- [ ] **Step 5: Thêm composite index**

`listMyCbtSessions` dùng `where("userId") + orderBy("createdAt")`, cần composite index. Thêm vào mảng `indexes` trong `firestore.indexes.json`:

```json
{
  "collectionGroup": "cbtSessions",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "userId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/firestore/cbt-sessions.ts src/lib/firestore/cbt-sessions.test.ts firestore.indexes.json
git commit -m "feat(cbt): ghi va doc cbtSessions, sinh id truoc de ghep cam xuc truoc/sau"
```

---

### Task 5: `CbtRunner` — luồng làm bài có cảm xúc trước/sau

**Files:**
- Create: `src/components/cbt/CbtRunner.tsx`
- Test: `src/components/cbt/CbtRunner.test.tsx`

**Interfaces:**
- Consumes: `CbtModuleListItem` (Task 3); `newSessionRef`, `saveCbtSession` (Task 4); `saveMoodLog`, `MoodInput` từ `@/lib/firestore/moods`; `MoodForm` từ `@/components/mood/MoodForm`; `SampleContentBanner` từ `@/components/test/SampleContentBanner`
- Produces: `<CbtRunner module={...} uid={...} canSave={...} />`

**Ghi chú then chốt:** `MoodForm` **đã** nhận props `context` và `linkedActivityRef` từ Spec #1 — không cần sửa nó. Chỉ cần truyền đúng giá trị.

Các pha: `intro` → `before` → `steps` → `summary` → `after` → `done`. Guest và học sinh chưa xác thực email dừng ở `intro` với lời mời tương ứng, không thấy form.

- [ ] **Step 1: Viết test thất bại**

```tsx
// src/components/cbt/CbtRunner.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const saveCbtSession = vi.fn(async () => {});
const saveMoodLog = vi.fn(async () => "mood-id");

vi.mock("@/lib/firestore/cbt-sessions", () => ({
  newSessionRef: () => ({ id: "sess-1", path: "cbtSessions/sess-1" }),
  saveCbtSession,
}));
vi.mock("@/lib/firestore/moods", () => ({ saveMoodLog }));

const { CbtRunner } = await import("@/components/cbt/CbtRunner");

const MODULE = {
  id: "m1", title: "Bài mẫu", version: 1, status: "published" as const,
  isSampleContent: true, disclaimer: "Không thay thế chuyên gia.",
  intro: "Giới thiệu", steps: [{ id: "s1", prompt: "Bạn đang nghĩ gì?", hint: "" }],
  closingText: "Cảm ơn bạn.", suggestedResourceSlugs: [], updatedBy: "admin",
};

beforeEach(() => { saveCbtSession.mockClear(); saveMoodLog.mockClear(); });

describe("CbtRunner", () => {
  it("luôn hiện disclaimer", () => {
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    expect(screen.getByText(/không thay thế chuyên gia/i)).toBeInTheDocument();
  });

  it("hiện banner nội dung mẫu khi isSampleContent", () => {
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("Guest thấy lời mời đăng ký, không thấy nút bắt đầu", () => {
    render(<CbtRunner module={MODULE} uid={null} canSave={false} />);
    expect(screen.getByRole("link", { name: /đăng ký/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /bắt đầu/i })).not.toBeInTheDocument();
  });

  it("học sinh chưa xác thực email thấy lời mời xác thực, không phải đăng ký", () => {
    render(<CbtRunner module={MODULE} uid="u1" canSave={false} />);
    expect(screen.getByRole("link", { name: /xác thực email/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^đăng ký/i })).not.toBeInTheDocument();
  });

  it("cảm xúc trước gắn linkedActivityRef trỏ vào session sắp ghi", async () => {
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /lưu cảm xúc/i }));

    expect(saveMoodLog).toHaveBeenCalledWith("u1", expect.objectContaining({
      context: "before",
      linkedActivityRef: "cbtSessions/sess-1",
    }));
  });

  it("bỏ qua được bước cảm xúc trước", async () => {
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));

    expect(saveMoodLog).not.toHaveBeenCalled();
    expect(screen.getByText("Bạn đang nghĩ gì?")).toBeInTheDocument();
  });

  it("ghi session với id đã sinh từ đầu", async () => {
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "Mình sợ trượt");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));

    expect(saveCbtSession).toHaveBeenCalledWith("u1", "sess-1", expect.objectContaining({
      moduleId: "m1", moduleVersion: 1, answers: { s1: "Mình sợ trượt" },
    }));
  });

  it("ghi session hỏng vẫn hiện lời kết, không mất bài của học sinh", async () => {
    saveCbtSession.mockRejectedValueOnce(new Error("offline"));
    const user = userEvent.setup();
    render(<CbtRunner module={MODULE} uid="u1" canSave />);
    await user.click(screen.getByRole("button", { name: /bắt đầu/i }));
    await user.click(screen.getByRole("button", { name: /bỏ qua/i }));
    await user.type(screen.getByLabelText("Bạn đang nghĩ gì?"), "a");
    await user.click(screen.getByRole("button", { name: /tiếp tục/i }));
    await user.click(screen.getByRole("button", { name: /hoàn thành/i }));

    expect(await screen.findByText(/cảm ơn bạn/i)).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/chờ đồng bộ/i);
  });

  it("không có ngôn ngữ chuỗi ngày ở bất kỳ đâu", () => {
    const { container } = render(<CbtRunner module={MODULE} uid="u1" canSave />);
    expect(container.textContent).not.toMatch(/chuỗi|liên tiếp|streak|bỏ lỡ/i);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- CbtRunner`

- [ ] **Step 3: Viết `src/components/cbt/CbtRunner.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { MoodForm } from "@/components/mood/MoodForm";
import { SampleContentBanner } from "@/components/test/SampleContentBanner";
import { newSessionRef, saveCbtSession } from "@/lib/firestore/cbt-sessions";
import { saveMoodLog, type MoodInput } from "@/lib/firestore/moods";
import type { CbtModuleListItem } from "@/lib/firebase/queries-public";

type Phase = "intro" | "before" | "steps" | "summary" | "after" | "done";

type Props = {
  module: CbtModuleListItem;
  uid: string | null;
  /** đã đăng nhập và đã xác thực email */
  canSave: boolean;
};

export function CbtRunner({ module: mod, uid, canSave }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [session, setSession] = useState<{ id: string; path: string } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [summary, setSummary] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  function start() {
    setSession(newSessionRef());
    setPhase("before");
  }

  async function handleMood(input: MoodInput) {
    if (!uid) return;
    // Cảm xúc không lưu được thì vẫn cho đi tiếp — bài tập quan trọng hơn.
    try {
      await saveMoodLog(uid, input);
    } catch {
      // Nuốt có chủ đích: xem design spec §9.
    }
    setPhase(phase === "before" ? "steps" : "done");
  }

  async function finish() {
    setPhase("done");
    if (!uid || !session) return;
    try {
      await saveCbtSession(uid, session.id, {
        moduleId: mod.id,
        moduleVersion: mod.version,
        answers,
        summary,
      });
    } catch {
      setSaveFailed(true);
    }
  }

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold text-slate-900">{mod.title}</h1>

      {mod.isSampleContent && <SampleContentBanner />}

      <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{mod.disclaimer}</p>

      {phase === "intro" && (
        <section className="flex flex-col gap-4">
          <p className="text-slate-700">{mod.intro}</p>
          {canSave ? (
            <button
              type="button" onClick={start}
              className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
            >
              Bắt đầu
            </button>
          ) : uid ? (
            <Link href="/xac-thuc-email" className="rounded-lg bg-teal-600 px-4 py-2 text-center font-medium text-white">
              Xác thực email để làm bài
            </Link>
          ) : (
            <Link href="/dang-ky" className="rounded-lg bg-teal-600 px-4 py-2 text-center font-medium text-white">
              Đăng ký để làm bài
            </Link>
          )}
        </section>
      )}

      {(phase === "before" || phase === "after") && session && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium text-slate-900">
            {phase === "before" ? "Bạn đang thấy thế nào?" : "Sau bài tập, bạn thấy thế nào?"}
          </h2>
          <MoodForm
            onSubmit={handleMood}
            context={phase}
            linkedActivityRef={session.path}
          />
          <button
            type="button"
            onClick={() => setPhase(phase === "before" ? "steps" : "done")}
            className="self-start text-sm text-slate-500 underline"
          >
            Bỏ qua bước này
          </button>
        </section>
      )}

      {phase === "steps" && (
        <section className="flex flex-col gap-5">
          {mod.steps.map((step) => (
            <label key={step.id} className="flex flex-col gap-1">
              <span className="font-medium text-slate-900">{step.prompt}</span>
              {step.hint && <span className="text-sm text-slate-500">{step.hint}</span>}
              <textarea
                rows={3} maxLength={2000}
                value={answers[step.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [step.id]: e.target.value }))}
                className="rounded-lg border border-slate-300 p-2"
              />
            </label>
          ))}
          <button
            type="button" onClick={() => setPhase("summary")}
            className="self-start rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
          >
            Tiếp tục
          </button>
        </section>
      )}

      {phase === "summary" && (
        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-medium text-slate-900">
              Nếu tóm lại trong một câu, bạn muốn nói gì với chính mình?
            </span>
            <span className="text-sm text-slate-500">Không bắt buộc.</span>
            <textarea
              rows={2} maxLength={2000} value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="rounded-lg border border-slate-300 p-2"
            />
          </label>
          <button
            type="button" onClick={finish}
            className="self-start rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
          >
            Hoàn thành
          </button>
        </section>
      )}

      {phase === "done" && (
        <section className="flex flex-col gap-4">
          <p className="text-slate-700">{mod.closingText}</p>
          {saveFailed && (
            <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Bài của bạn đang chờ đồng bộ. Khi có mạng lại, nó sẽ tự lưu.
            </p>
          )}
          {mod.suggestedResourceSlugs.length > 0 && (
            <nav className="flex flex-col gap-2">
              <h2 className="font-medium text-slate-900">Có thể bạn muốn đọc thêm</h2>
              {mod.suggestedResourceSlugs.map((slug) => (
                <Link key={slug} href={`/thu-vien/${slug}`} className="text-teal-700 underline">
                  {slug}
                </Link>
              ))}
            </nav>
          )}
          <Link href="/tien-trinh" className="text-teal-700 underline">Xem tiến trình của bạn</Link>
        </section>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm test -- CbtRunner`
Kỳ vọng: PASS 9/9.

- [ ] **Step 5: Commit**

```bash
git add src/components/cbt/CbtRunner.tsx src/components/cbt/CbtRunner.test.tsx
git commit -m "feat(cbt): luong lam bai voi cam xuc truoc/sau, bo qua duoc"
```

---

### Task 6: Trang công khai `/cbt` và `/cbt/[moduleId]`

**Files:**
- Create: `src/app/(public)/cbt/page.tsx`
- Create: `src/app/(public)/cbt/[moduleId]/page.tsx`

**Interfaces:**
- Consumes: `listPublishedCbtModules`, `getPublishedCbtModule` (Task 3); `getSessionUser` từ `@/lib/firebase/session`; `CbtRunner` (Task 5)
- Produces: hai route công khai

- [ ] **Step 1: Viết `src/app/(public)/cbt/page.tsx`**

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedCbtModules } from "@/lib/firebase/queries-public";

// force-dynamic: trang đọc Firestore, không được prerender lúc build vì build
// sẽ đòi có database — hỏng CI và Cloud Build. Xem Global Constraints.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Bài tập CBT · ExamCalm" };

export default async function CbtListPage() {
  const modules = await listPublishedCbtModules();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold text-slate-900">Bài tập nhận diện suy nghĩ</h1>
      <p className="text-slate-700">
        Những bài tập ngắn giúp bạn nhìn lại một suy nghĩ đang làm bạn lo. Làm lúc nào cũng được,
        bỏ dở giữa chừng cũng không sao.
      </p>

      {modules.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-4 text-slate-600">
          Chưa có bài tập nào. Bạn quay lại sau nhé.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {modules.map((m) => (
            <li key={m.id}>
              <Link
                href={`/cbt/${m.id}`}
                className="block rounded-xl border border-slate-200 p-4 hover:border-teal-400"
              >
                <span className="font-medium text-slate-900">{m.title}</span>
                <span className="block text-sm text-slate-500">{m.steps.length} bước</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Viết `src/app/(public)/cbt/[moduleId]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedCbtModule } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { CbtRunner } from "@/components/cbt/CbtRunner";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: PageProps<"/cbt/[moduleId]">,
): Promise<Metadata> {
  const { moduleId } = await params;
  const mod = await getPublishedCbtModule(moduleId);
  return { title: mod ? `${mod.title} · ExamCalm` : "Không tìm thấy · ExamCalm" };
}

export default async function CbtModulePage({ params }: PageProps<"/cbt/[moduleId]">) {
  const { moduleId } = await params;
  const mod = await getPublishedCbtModule(moduleId);
  if (!mod) notFound();

  const user = await getSessionUser();

  return (
    <main>
      <CbtRunner
        module={mod}
        uid={user?.uid ?? null}
        canSave={Boolean(user?.emailVerified)}
      />
    </main>
  );
}
```

- [ ] **Step 3: Kiểm tra**

Run: `npm run typecheck && npm run lint && npm run build`
Kỳ vọng: sạch, và build chạy được **khi emulator đã tắt**. Xác nhận cả hai route hiện `ƒ` (dynamic) trong output build.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(public)/cbt"
git commit -m "feat(cbt): trang danh sach va trang lam bai"
```

---

### Task 7: Admin console quản lý `cbtModules`

**Files:**
- Create: `src/lib/firestore/admin-cbt.ts`
- Create: `src/components/admin/CbtEditor.tsx`
- Create: `src/app/(admin)/admin/cbt/page.tsx`
- Test: `src/components/admin/CbtEditor.test.tsx`

**Interfaces:**
- Consumes: `cbtStepSchema`, `CbtModule` (Task 1); `getDb`, `ensureAuthReady`
- Produces: `parseCbtDraft(json)`, `listAllCbtModules()`, `saveCbtModule(id, draft, adminUid)`, `publishCbtModule(id, publish)`, types `CbtModuleDraft`, `CbtModuleRecord`, `CbtParseResult`

**Ghi chú:** đây là bản sao gần như nguyên vẹn của `src/lib/firestore/admin-tests.ts` và `src/components/admin/TestEditor.tsx`. **Đọc cả hai file đó trước khi viết** — đặc biệt cách `TestEditor` xử lý ba trạng thái loading/error/rỗng, và cách nó không để reload hỏng hiển thị dữ liệu cũ như dữ liệu hiện tại.

- [ ] **Step 1: Viết test thất bại**

```ts
// src/components/admin/CbtEditor.test.tsx
import { describe, expect, it } from "vitest";
import { parseCbtDraft } from "@/lib/firestore/admin-cbt";

const VALID = JSON.stringify({
  title: "Bài mẫu", version: 1, isSampleContent: true,
  disclaimer: "Không thay thế chuyên gia.", intro: "Giới thiệu",
  steps: [{ id: "s1", prompt: "Bạn nghĩ gì?", hint: "" }],
  closingText: "Cảm ơn.", suggestedResourceSlugs: [],
});

describe("parseCbtDraft", () => {
  it("chấp nhận JSON hợp lệ", () => {
    expect(parseCbtDraft(VALID).ok).toBe(true);
  });

  it("báo lỗi cú pháp trước lỗi schema", () => {
    const r = parseCbtDraft("{ title: }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cú pháp/i);
  });

  it("báo đường dẫn field khi sai schema", () => {
    const r = parseCbtDraft(JSON.stringify({ title: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/title/);
  });

  it("từ chối bước trùng id", () => {
    const bad = JSON.parse(VALID);
    bad.steps = [{ id: "s1", prompt: "a", hint: "" }, { id: "s1", prompt: "b", hint: "" }];
    const r = parseCbtDraft(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trùng id/i);
  });

  it("từ chối module không có bước nào", () => {
    const bad = JSON.parse(VALID);
    bad.steps = [];
    expect(parseCbtDraft(JSON.stringify(bad)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- CbtEditor`

- [ ] **Step 3: Viết `src/lib/firestore/admin-cbt.ts`**

```ts
"use client";

import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { cbtStepSchema, type CbtModule } from "@/lib/types/cbt";

/** Phần admin nhập tay; status/updatedBy/updatedAt do hệ thống đặt. */
export const cbtDraftSchema = z.object({
  title: z.string().min(1).max(200),
  version: z.number().int().min(1),
  isSampleContent: z.boolean(),
  disclaimer: z.string().min(1),
  intro: z.string(),
  steps: z.array(cbtStepSchema).min(1).max(12),
  closingText: z.string(),
  suggestedResourceSlugs: z.array(z.string()).max(5),
});

export type CbtModuleDraft = z.infer<typeof cbtDraftSchema>;
export type CbtModuleRecord = CbtModule & { id: string };
export type CbtParseResult =
  | { ok: true; value: CbtModuleDraft }
  | { ok: false; error: string };

export function parseCbtDraft(json: string): CbtParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON sai cú pháp. Kiểm tra lại dấu ngoặc và dấu phẩy." };
  }

  const parsed = cbtDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "dữ liệu"}: ${issue?.message}` };
  }

  const ids = parsed.data.steps.map((s) => s.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Có bước trùng id. Mỗi bước cần một id riêng." };
  }

  return { ok: true, value: parsed.data };
}

/** Liệt kê tường minh — xem giải thích ở toResourceListItem() trong queries-public.ts. */
function toCbtRecord(id: string, data: CbtModule): CbtModuleRecord {
  return {
    id,
    title: data.title,
    version: data.version,
    status: data.status,
    isSampleContent: data.isSampleContent,
    disclaimer: data.disclaimer,
    intro: data.intro,
    steps: data.steps,
    closingText: data.closingText,
    suggestedResourceSlugs: data.suggestedResourceSlugs,
    updatedBy: data.updatedBy,
  };
}

export async function listAllCbtModules(): Promise<CbtModuleRecord[]> {
  const snap = await getDocs(collection(getDb(), "cbtModules"));
  return snap.docs.map((d) => toCbtRecord(d.id, d.data() as CbtModule));
}

export async function saveCbtModule(
  moduleId: string | null,
  draft: CbtModuleDraft,
  adminUid: string,
): Promise<string> {
  await ensureAuthReady();
  const payload = { ...draft, updatedBy: adminUid, updatedAt: serverTimestamp() };

  if (moduleId) {
    await updateDoc(doc(getDb(), "cbtModules", moduleId), payload);
    return moduleId;
  }
  const ref = await addDoc(collection(getDb(), "cbtModules"), { ...payload, status: "draft" });
  return ref.id;
}

export async function publishCbtModule(moduleId: string, publish: boolean): Promise<void> {
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "cbtModules", moduleId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 4: Viết `CbtEditor.tsx` và trang admin**

Sao chép cấu trúc của `src/components/admin/TestEditor.tsx`, thay `parseTestDraft`→`parseCbtDraft`, `listAllTests`→`listAllCbtModules`, `saveTest`→`saveCbtModule`, `publishTest`→`publishCbtModule`, và nhãn "bài test"→"bài tập CBT". Giữ nguyên ba trạng thái loading/error/rỗng và cách xử lý reload hỏng sau khi lưu.

`src/app/(admin)/admin/cbt/page.tsx` sao chép `src/app/(admin)/admin/tests/page.tsx`, đổi component và tiêu đề. `(admin)/layout.tsx` đã gọi `requireAdmin()` — **không thêm guard thứ hai**, chỉ gọi `requireAdmin()` để lấy `admin.uid`.

- [ ] **Step 5: Chạy test, xác nhận XANH**

Run: `npm test && npm run typecheck && npm run lint`

- [ ] **Step 6: Commit**

```bash
git add src/lib/firestore/admin-cbt.ts src/components/admin/CbtEditor.tsx src/components/admin/CbtEditor.test.tsx "src/app/(admin)/admin/cbt"
git commit -m "feat(admin): quan ly bai tap CBT bang editor JSON co validate"
```

---

### Task 8: Thêm `cbtSessions` vào cascade xóa dữ liệu

**Files:**
- Modify: `functions/src/admin/deleteUserData.ts`
- Test: `functions/src/admin/deleteUserData.test.ts`

**Interfaces:**
- Consumes: `deleteQueryInBatches` đã có trong file
- Produces: response trả thêm `cbtSessions` trong `deleted`

**Vì sao quan trọng:** học sinh viết suy nghĩ tiêu cực của mình vào `cbtSessions`. Xóa tài khoản mà để lại chúng là đúng loại thất bại mà Task 22 của Spec #1 sinh ra để chặn.

- [ ] **Step 1: Thêm test thất bại**

Thêm vào `functions/src/admin/deleteUserData.test.ts`:

```ts
it("đếm cbtSessions trong kết quả xóa", () => {
  // Test này pin hình dạng response; logic xóa test bằng emulator ở Step 4.
  const deleted = { attempts: 1, moods: 2, favorites: 3, cbtSessions: 4 };
  expect(Object.keys(deleted).sort()).toEqual(
    ["attempts", "cbtSessions", "favorites", "moods"],
  );
});
```

- [ ] **Step 2: Sửa `deleteUserData.ts`**

Thêm một lần gọi `deleteQueryInBatches` cho `cbtSessions`, **trước** bước xóa `users/{uid}`:

```ts
const cbtSessions = await deleteQueryInBatches(
  db.collection("cbtSessions").where("userId", "==", targetUid),
);
```

và đưa `cbtSessions` vào object `deleted` của cả audit log lẫn giá trị trả về.

- [ ] **Step 3: Chạy test functions**

Run: `npm test --prefix functions && npm run build --prefix functions`

- [ ] **Step 4: Kiểm chứng bằng emulator**

Tạo một học sinh đã xác thực email có: 1 `testAttempt`, 2 `moodLog`, 1 `favorite`, 1 `cbtSession`. Gọi `deleteUserData`. Xác nhận **cả năm** vị trí trống sạch và Auth user biến mất. Dán lại những gì quan sát được.

- [ ] **Step 5: Commit**

```bash
git add functions/src/admin/deleteUserData.ts functions/src/admin/deleteUserData.test.ts
git commit -m "feat(privacy): cascade xoa them cbtSessions"
```

---

### Task 9: Trang Tiến trình hiển thị CBT và cặp cảm xúc thật

**Files:**
- Modify: `src/components/progress/ProgressView.tsx`
- Test: `src/components/progress/ProgressView.test.tsx`

**Interfaces:**
- Consumes: `listMyCbtSessions`, `CbtSessionRecord` (Task 4); `pairBeforeAfter` từ `@/lib/progress` — **đã có, không sửa**
- Produces: mục "Bài tập CBT đã làm" trên trang Tiến trình

**Đây là lúc `pairBeforeAfter` chạy thật lần đầu.** Hàm đã viết và test từ Spec #1 nhưng chưa có dữ liệu. Sau Task 5, `moodLogs` đã có cặp `before`/`after` cùng `linkedActivityRef` — mục "trước/sau" trên trang Tiến trình sẽ tự có nội dung mà **không cần sửa `pairBeforeAfter`**.

- [ ] **Step 1: Thêm test thất bại**

```tsx
it("hiện danh sách CBT đã làm", async () => {
  listMyCbtSessions.mockResolvedValueOnce([
    { id: "s1", moduleId: "m1", moduleVersion: 1, answers: {}, summary: "Mình khắt khe quá", createdAt: new Date("2026-08-20") },
  ]);
  render(<ProgressView uid="u1" />);
  expect(await screen.findByText(/mình khắt khe quá/i)).toBeInTheDocument();
});

it("tải CBT hỏng hiện lỗi riêng, không hiện như chưa làm bài nào", async () => {
  listMyCbtSessions.mockRejectedValueOnce(new Error("offline"));
  render(<ProgressView uid="u1" />);
  expect(await screen.findByText(/chưa tải được/i)).toBeInTheDocument();
  expect(screen.queryByText(/chưa làm bài tập nào/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Chạy test, xác nhận ĐỎ**

Run: `npm test -- ProgressView`

- [ ] **Step 3: Thêm fetch và section**

Thêm state `cbtSessions` với **cùng ba trạng thái** loading/error/rỗng mà hai fetch hiện có đang dùng, và một `loadCbt` riêng có nút thử lại — theo đúng khuôn đã có trong file. Render danh sách hiển thị `summary` (hoặc "Không có ghi chú" nếu rỗng) và ngày qua `Intl.DateTimeFormat("vi-VN", ...)`, xử lý `createdAt === null` bằng "Đang đồng bộ…".

- [ ] **Step 4: Chạy test, xác nhận XANH**

Run: `npm test -- ProgressView`

- [ ] **Step 5: Commit**

```bash
git add src/components/progress/ProgressView.tsx src/components/progress/ProgressView.test.tsx
git commit -m "feat(progress): hien thi CBT da lam va cap cam xuc truoc/sau"
```

---

### Task 10: Seed bài CBT mẫu và kiểm chứng toàn luồng

**Files:**
- Modify: `scripts/seed.mts` (script seed của Spec #1 Task 23)
- Modify: `src/components/layout/SiteHeader.tsx` (thêm link `/cbt`)

**Interfaces:**
- Consumes: mọi thứ ở trên
- Produces: một `cbtModules` mẫu đã publish, có `isSampleContent: true`

- [ ] **Step 1: Thêm module mẫu vào seed**

Nội dung mẫu, **bắt buộc** `isSampleContent: true`:

```ts
const SAMPLE_CBT = {
  title: "Nhìn lại một suy nghĩ đang làm bạn lo",
  version: 1,
  status: "published",
  isSampleContent: true,
  disclaimer:
    "Đây là bài tập tự nhận thức, không phải trị liệu và không thay thế chuyên gia tâm lý. " +
    "Nếu bạn thấy quá tải, hãy nói với người lớn mà bạn tin tưởng.",
  intro:
    "Bài này mất khoảng 5 phút. Không có câu trả lời đúng hay sai, và bạn dừng lúc nào cũng được.",
  steps: [
    { id: "s1", prompt: "Suy nghĩ nào về kỳ thi đang lặp lại trong đầu bạn?", hint: "Viết đúng câu bạn nghĩ, không cần sửa cho hay." },
    { id: "s2", prompt: "Điều gì khiến bạn tin suy nghĩ đó là đúng?", hint: "" },
    { id: "s3", prompt: "Có điều gì cho thấy nó không hoàn toàn đúng không?", hint: "Kể cả một chi tiết nhỏ cũng được." },
    { id: "s4", prompt: "Nếu một người bạn nói câu đó với bạn, bạn sẽ đáp lại thế nào?", hint: "" },
  ],
  closingText:
    "Nhận ra một suy nghĩ không có nghĩa là nó biến mất. Nhưng nhìn thẳng vào nó một lần " +
    "thường làm nó bớt nặng hơn.",
  suggestedResourceSlugs: [],
  updatedBy: "seed",
};
```

- [ ] **Step 2: Thêm link vào header**

Thêm `{ href: "/cbt", label: "Bài tập" }` vào mảng nav của `SiteHeader`.

- [ ] **Step 3: Chạy seed và kiểm chứng toàn luồng trên emulator**

Với emulator đang chạy, làm đủ các bước sau và dán lại quan sát:

1. Guest vào `/cbt` — thấy bài mẫu trong danh sách
2. Guest mở bài — thấy disclaimer, banner nội dung mẫu, và lời mời đăng ký (**không** thấy nút Bắt đầu)
3. Học sinh đã xác thực email mở bài — bấm Bắt đầu, ghi cảm xúc trước, trả lời 4 bước, viết tóm tắt, Hoàn thành, ghi cảm xúc sau
4. Emulator UI: đúng **một** `cbtSessions` document, và **hai** `moodLogs` có cùng `linkedActivityRef`, một `context: "before"` một `context: "after"`
5. `/tien-trinh` — hiện bài CBT vừa làm **và** cặp cảm xúc trước/sau
6. Admin vào `/admin/cbt` — sửa được bài, unpublish thì bài biến mất khỏi `/cbt`
7. Xóa tài khoản học sinh đó — `cbtSessions` trống sạch

- [ ] **Step 4: Kiểm tra cuối**

Run: `npm test && npm test --prefix functions && npm run test:rules && npm run typecheck && npm run lint && npm run build`
Build phải chạy được **khi emulator đã tắt**.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed.mts src/components/layout/SiteHeader.tsx
git commit -m "feat(cbt): seed bai tap mau va them link vao header"
```

---

## Tự rà soát plan

**Phủ spec:** §6 mô hình dữ liệu → Task 1, 4. §7 rules → Task 2. §5 thứ tự ghi → Task 4, 5. §8 cascade xóa → Task 8. §9 ràng buộc đạo đức → Task 5 (disclaimer vô điều kiện, banner, bỏ qua được, không streak), Task 10 (nội dung mẫu có nhãn). §11 tiêu chí hoàn thành → Task 10 Step 3. §3 làm sống `pairBeforeAfter` → Task 9.

**Nhất quán kiểu:** `CbtModuleListItem` (Task 3) dùng ở Task 5, 6. `CbtSessionRecord` (Task 4) dùng ở Task 9. `CbtModuleDraft`/`CbtModuleRecord` (Task 7) chỉ dùng nội bộ admin. `newSessionRef()` trả `{id, path}` — Task 5 dùng `path` cho `linkedActivityRef` và `id` cho `saveCbtSession`.

**Phụ thuộc giữa task:** Task 10 sửa `scripts/seed.mts` và `SiteHeader.tsx`, cả hai do **Spec #1 Task 23** tạo ra. Nếu Task 23 chưa xong, Task 10 bị chặn — làm Task 1–9 trước cũng được.
