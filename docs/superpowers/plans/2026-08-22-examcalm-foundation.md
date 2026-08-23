# ExamCalm — Spec #1 Implementation Plan (Nền tảng + Test + Mood Journal + Library)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng web app ExamCalm chạy được thật: Guest làm test lo âu và đọc thư viện, Student đăng ký để lưu lịch sử test + nhật ký cảm xúc, Admin quản trị nội dung — trên nền Next.js + Firebase với Security Rules được kiểm thử đầy đủ.

**Architecture:** Kiến trúc lai (Hướng C). Nội dung công khai đọc qua Server Component + Firebase Admin SDK (SEO, cache). Dữ liệu riêng của user đọc/ghi qua Firebase Web SDK và được chặn bởi Firestore Security Rules (realtime + offline persistence). Ghi có đặc quyền (gán role, xóa dữ liệu liên đới, audit) đi qua Cloud Functions callable. Middleware Next.js dựa trên session cookie chỉ là lớp UX; Security Rules mới là lớp bảo mật thật.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 · shadcn/ui · firebase 12 (Web SDK) · firebase-admin 14 · firebase-functions 7 (2nd gen) · zod 4 · Vitest + Testing Library · Playwright · @firebase/rules-unit-testing 5 · Firebase Emulator Suite · Firebase App Hosting

**Spec:** `docs/superpowers/specs/2026-08-22-examcalm-foundation-design.md`

## Global Constraints

Mọi task đều ngầm bao gồm các ràng buộc sau. Giá trị chép nguyên văn từ spec.

- **Ngôn ngữ giao diện:** tiếng Việt. Tên file, tên biến, tên hàm: tiếng Anh. **Không** cài i18n library — dùng `Intl` API cho ngày/giờ/số.
- **TypeScript `strict: true`.** Không dùng `any` trừ khi có comment giải thích.
- **Không bao giờ** import `firebase-admin` vào code chạy ở client. Mọi file dùng Admin SDK phải bắt đầu bằng `import "server-only"`.
- **Mọi trang public đọc Firestore phải có `export const dynamic = "force-dynamic"`.** Không dùng `revalidate`. Lý do: `revalidate` khiến Next prerender lúc build, nên `npm run build` sẽ đòi hỏi có database chạy được — hỏng ở CI (Task 24) và rủi ro ở Cloud Build (Task 25). Đổi lại mất CDN cache, nhưng với quy mô vài chục học sinh đọc vài chục bài thì không đáng kể, và SEO vẫn nguyên vì Next render HTML đầy đủ phía server mỗi request.
- **Security Rules là nguồn bảo mật duy nhất.** Middleware và điều kiện trong UI chỉ là UX, không được coi là bảo vệ.
- **Rules luôn đọc `request.auth.token.role`** (custom claim), **không bao giờ** đọc `resource.data.role`.
- **Không có màn hình nào** diễn đạt kết quả test như chẩn đoán y khoa/tâm lý. Mọi màn kết quả test phải hiển thị `disclaimer` của `testDefinition`.
- **Mọi test có `isSampleContent: true`** phải hiển thị banner: `Nội dung mẫu — chưa thẩm định chuyên môn, chỉ dùng để thử nghiệm.`
- **Guest không ghi Firestore.** Kết quả test của Guest chỉ nằm trong `sessionStorage`.
- **Không hiển thị streak** hay bất kỳ chỉ số nào tạo áp lực duy trì chuỗi ngày.
- **Accessibility:** semantic HTML, keyboard nav, contrast ≥ WCAG AA, tôn trọng `prefers-reduced-motion`.
- **Agent ĐƯỢC PHÉP** chạy `git commit`, `git push` và `firebase deploy` (user đã cấp quyền ngày 2026-08-23, `CLAUDE.md` đã cập nhật). Chỉ còn **[USER]** cho việc gắn thẻ thanh toán / nâng Blaze / đặt budget alert — cần tài khoản Google và thẻ của user.
- **Firebase project đã tồn tại** (tạo ngày 2026-08-23): `examcalm` (prod) và `examcalm-dev`. Không tạo lại.
- **TDD:** mỗi task viết test trước, chạy để thấy FAIL, rồi mới implement.
- **Commit sau mỗi task.** Agent soạn sẵn lệnh; user quyết định chạy.

---

## Cấu trúc file — trách nhiệm từng file

| File | Trách nhiệm |
|---|---|
| `src/lib/types/user.ts` | Zod schema + type cho `users/{uid}` |
| `src/lib/types/test.ts` | Zod schema cho `testDefinitions`, `testAttempts` |
| `src/lib/types/mood.ts` | Zod schema cho `moodLogs` |
| `src/lib/types/resource.ts` | Zod schema cho `resources`, `favorites` |
| `src/lib/scoring.ts` | Hàm thuần: tính điểm từ answers, ánh xạ điểm → level. Không phụ thuộc Firebase |
| `src/lib/firebase/client.ts` | Khởi tạo Web SDK + App Check + offline persistence |
| `src/lib/firebase/admin.ts` | Khởi tạo Admin SDK (server-only) |
| `src/lib/firebase/session.ts` | Tạo/đọc/xóa session cookie, giải mã role |
| `src/lib/firebase/queries-public.ts` | Truy vấn nội dung công khai bằng Admin SDK (Server Component) |
| `src/proxy.ts` | Chặn route `(student)` và `(admin)` theo session cookie |
| `src/components/mascot/CatMascot.tsx` | SVG mèo placeholder, tách riêng để thay asset thật |
| `src/components/mascot/MoodWidget.tsx` | Widget nổi: mở form mood check-in |
| `src/components/test/TestRunner.tsx` | Chạy bộ câu hỏi, thu answers |
| `src/components/test/TestResult.tsx` | Hiển thị điểm/level/diễn giải/disclaimer |
| `src/components/test/SampleContentBanner.tsx` | Banner "nội dung mẫu" |
| `src/components/library/ResourceCard.tsx` | Thẻ tài nguyên trong danh sách |
| `functions/src/admin/setUserRole.ts` | Callable: gán custom claim role |
| `functions/src/admin/deleteUserData.ts` | Callable: xóa user + dữ liệu liên đới |
| `functions/src/audit/writeAuditLog.ts` | Hàm dùng chung ghi `auditLogs` |
| `firestore.rules` | Toàn bộ Security Rules |
| `tests/rules/*.test.ts` | Test Rules, mỗi collection một file |
| `scripts/bootstrap-admin.ts` | Gán admin đầu tiên, chạy 1 lần ở local |
| `scripts/seed-dev.ts` | Seed dữ liệu mẫu |
| `scripts/export-research.ts` | Xuất dữ liệu ẩn danh cho nghiên cứu KHKT |

---

## Task 1: Khởi tạo repo và toolchain

**Files:**
- Create: `.gitignore`, `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Test: `src/lib/smoke.test.ts`

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces: dự án Next.js build được, `npm test` chạy được Vitest

- [ ] **Step 1: Khởi tạo git repo**

```bash
cd /e/PSY_KHKT
git init
git branch -M main
```

- [ ] **Step 2: Tạo Next.js app vào thư mục hiện tại**

```bash
npx create-next-app@latest examcalm \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --no-turbopack --use-npm
```

Sau đó chuyển nội dung `examcalm/` lên thư mục gốc `/e/PSY_KHKT` và xóa thư mục rỗng:

```bash
cd /e/PSY_KHKT
mv examcalm/* examcalm/.* . 2>/dev/null || true
rmdir examcalm
```

- [ ] **Step 3: Bật TypeScript strict**

Sửa `tsconfig.json`, đảm bảo trong `compilerOptions`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

- [ ] **Step 4: Viết `.gitignore`**

```gitignore
node_modules/
.next/
out/
build/
.env
.env.local
.env*.local
*.log
.DS_Store
.firebase/
firebase-debug.log
firestore-debug.log
ui-debug.log
serviceAccountKey.json
service-account*.json
coverage/
playwright-report/
test-results/
functions/lib/
functions/node_modules/
```

- [ ] **Step 5: Cài Vitest và cấu hình**

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Tạo `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

Tạo `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Thêm script vào `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 6: Viết smoke test cho hạ tầng test**

Tạo `src/lib/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("hạ tầng test", () => {
  it("chạy được Vitest", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Chạy test — phải PASS**

Run: `npm test`
Expected: 1 passed

- [ ] **Step 8: Chạy typecheck và build — phải sạch**

Run: `npm run typecheck && npm run build`
Expected: không lỗi TypeScript, build thành công

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: khởi tạo Next.js 16 + TypeScript strict + Tailwind 4 + Vitest"
```

---

## Task 2: Firebase project, config và Emulator Suite

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `storage.rules`
- Modify: `package.json` (scripts emulator)

**Interfaces:**
- Consumes: repo từ Task 1
- Produces: Emulator Suite chạy được ở `localhost` với Auth + Firestore + Functions; `npm run emu` khởi động toàn bộ

- [ ] **Step 1: Xác nhận 2 Firebase project (ĐÃ TẠO ngày 2026-08-23 — không tạo lại)**

`examcalm` và `examcalm-dev` đã được tạo. Chỉ cần xác nhận:

```bash
firebase projects:list | grep examcalm
```

Kỳ vọng: thấy cả `examcalm` và `examcalm-dev`.

**[USER] — phần duy nhất còn lại:** nâng Blaze plan cho từng project (cần thẻ thanh toán, agent không có quyền). Vào https://console.firebase.google.com/project/examcalm/usage/details và https://console.firebase.google.com/project/examcalm-dev/usage/details → **Modify plan** → **Blaze**.

Blaze **chưa cần** cho Task 1–24 (mọi thứ chạy trên Emulator, miễn phí). Chỉ Task 25 (deploy) mới cần. Nếu chưa nâng, cứ tiếp tục các task còn lại.

Rồi đặt **budget alert** (bắt buộc, rủi ro R2): Google Cloud Console → Billing → Budgets & alerts → Create budget → đặt ngưỡng, ví dụ 200.000đ/tháng, bật email cảnh báo ở 50%/90%/100%.

Xác nhận đã xong:

```bash
firebase projects:list
```

Kỳ vọng: thấy cả `examcalm` và `examcalm-dev` trong danh sách.

- [ ] **Step 2: Tạo `.firebaserc`**

```json
{
  "projects": {
    "default": "examcalm-dev",
    "dev": "examcalm-dev",
    "prod": "examcalm"
  }
}
```

- [ ] **Step 3: Tạo `firebase.json` với cấu hình Emulator**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs22"
    }
  ],
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "storage": { "port": 9199 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 4: Tạo `firestore.rules` khóa toàn bộ (điểm xuất phát an toàn)**

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 5: Tạo `storage.rules` khóa toàn bộ**

Spec §6 nói rõ: Spec #1 chưa có tính năng upload nào.

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 6: Tạo `firestore.indexes.json` theo spec §4.8**

```json
{
  "indexes": [
    {
      "collectionGroup": "testAttempts",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "moodLogs",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "resources",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "visibility", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "resources",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "resources",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "tags", "arrayConfig": "CONTAINS" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "updatedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 7: Tạo thư mục `functions` tối thiểu để Emulator khởi động được**

```bash
mkdir -p functions/src
```

`functions/package.json`:

```json
{
  "name": "functions",
  "private": true,
  "main": "lib/index.js",
  "engines": { "node": "22" },
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch"
  },
  "dependencies": {
    "firebase-admin": "^14.3.0",
    "firebase-functions": "^7.3.2"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

`functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2023",
    "moduleResolution": "node",
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

`functions/src/index.ts`:

```ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

// Các callable function được export ở Task 17.
export {};
```

Cài dependency:

```bash
cd functions && npm install && npm run build && cd ..
```

- [ ] **Step 8: Thêm script emulator vào `package.json` gốc**

```json
{
  "scripts": {
    "emu": "firebase emulators:start --only auth,firestore,functions,storage",
    "emu:exec": "firebase emulators:exec --only auth,firestore"
  }
}
```

- [ ] **Step 9: Khởi động Emulator để xác minh**

Run: `npm run emu`
Expected: Emulator UI mở được ở http://localhost:4000, thấy Auth + Firestore + Functions + Storage đều `running`. Dừng bằng Ctrl+C.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: cấu hình Firebase Emulator Suite, rules khóa mặc định, indexes"
```

---

## Task 3: Security Rules — `users` (TDD)

**Files:**
- Create: `tests/rules/helpers.ts`, `tests/rules/users.test.ts`, `vitest.rules.config.ts`
- Modify: `firestore.rules`, `package.json`

**Interfaces:**
- Consumes: `firestore.rules` từ Task 2
- Produces: `tests/rules/helpers.ts` export `withTestEnv(fn)`, `authedDb(env, uid, claims?)`, `unauthedDb(env)` — các task rules sau dùng lại

- [ ] **Step 1: Cài công cụ test rules và tạo config riêng**

```bash
npm install -D @firebase/rules-unit-testing firebase-tools tsx
```

Tạo `vitest.rules.config.ts` (môi trường `node`, không phải jsdom):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
```

Thêm script vào `package.json` gốc:

```json
{
  "scripts": {
    "test:rules": "firebase emulators:exec --only firestore \"vitest run --config vitest.rules.config.ts\""
  }
}
```

- [ ] **Step 2: Viết helper dùng chung cho mọi test rules**

Tạo `tests/rules/helpers.ts`:

```ts
import fs from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";

export async function createTestEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: "examcalm-rules-test",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
}

/** Client đã đăng nhập. Mặc định là student đã verify email. */
export function authedDb(
  env: RulesTestEnvironment,
  uid: string,
  claims: Record<string, unknown> = {},
): Firestore {
  return env
    .authenticatedContext(uid, { email_verified: true, ...claims })
    .firestore() as unknown as Firestore;
}

/** Client admin (custom claim role = "admin"). */
export function adminDb(env: RulesTestEnvironment, uid = "admin-1"): Firestore {
  return authedDb(env, uid, { role: "admin" });
}

/** Client chưa đăng nhập — mô phỏng Guest. */
export function guestDb(env: RulesTestEnvironment): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore;
}

/** Ghi dữ liệu setup, bỏ qua rules. */
export async function seed(
  env: RulesTestEnvironment,
  fn: (db: Firestore) => Promise<void>,
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await fn(ctx.firestore() as unknown as Firestore);
  });
}
```

- [ ] **Step 3: Viết test FAILING cho `users`**

Tạo `tests/rules/users.test.ts`:

```ts
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const PROFILE = {
  uid: "u1",
  role: "student",
  nickname: "Mèo con",
  gradeLevel: "12",
  school: "THPT Trần Phú",
  examGoals: ["Khối A"],
  privacySettings: { aiOptIn: false, shareImageWithAI: false },
  researchConsent: null,
  deletionRequestedAt: null,
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("users/{uid}", () => {
  it("chủ sở hữu tạo được hồ sơ của chính mình với role student", async () => {
    const db = authedDb(env, "u1");
    await assertSucceeds(setDoc(doc(db, "users/u1"), PROFILE));
  });

  it("KHÔNG tạo được hồ sơ với role admin", async () => {
    const db = authedDb(env, "u1");
    await assertFails(setDoc(doc(db, "users/u1"), { ...PROFILE, role: "admin" }));
  });

  it("KHÔNG tạo được hồ sơ cho uid người khác", async () => {
    const db = authedDb(env, "u1");
    await assertFails(setDoc(doc(db, "users/u2"), { ...PROFILE, uid: "u2" }));
  });

  it("chủ sở hữu đọc được hồ sơ của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "users/u1")));
  });

  it("user KHÔNG đọc được hồ sơ người khác", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "users/u1")));
  });

  it("admin đọc được hồ sơ bất kỳ", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(getDoc(doc(adminDb(env), "users/u1")));
  });

  it("Guest KHÔNG đọc được hồ sơ nào", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(getDoc(doc(guestDb(env), "users/u1")));
  });

  it("chủ sở hữu sửa được nickname của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(updateDoc(doc(authedDb(env, "u1"), "users/u1"), { nickname: "Mèo lớn" }));
  });

  it("chủ sở hữu KHÔNG tự nâng mình lên admin", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "users/u1"), { role: "admin" }));
  });

  it("chủ sở hữu tự cấp được researchConsent", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertSucceeds(
      updateDoc(doc(authedDb(env, "u1"), "users/u1"), {
        researchConsent: { granted: true, grantedAt: new Date(), version: "v1" },
      }),
    );
  });

  it("KHÔNG ai xóa được doc users trực tiếp (phải qua Cloud Function)", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1"), PROFILE); });
    await assertFails(deleteDoc(doc(authedDb(env, "u1"), "users/u1")));
    await assertFails(deleteDoc(doc(adminDb(env), "users/u1")));
  });
});
```

- [ ] **Step 4: Chạy test — phải FAIL toàn bộ**

Run: `npm run test:rules`
Expected: mọi test `assertSucceeds` FAIL, vì `firestore.rules` đang deny tất cả.

- [ ] **Step 5: Viết rules cho `users`**

Thay `firestore.rules`:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }
    function isAdmin()    { return isSignedIn() && request.auth.token.role == "admin"; }
    function isVerified() { return isSignedIn() && request.auth.token.email_verified == true; }

    match /users/{uid} {
      allow read:   if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid) && request.resource.data.role == "student";
      allow update: if (isOwner(uid) && request.resource.data.role == resource.data.role)
                    || isAdmin();
      allow delete: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 6: Chạy lại test — phải PASS**

Run: `npm run test:rules`
Expected: 11 passed

- [ ] **Step 7: Commit**

```bash
git add firestore.rules tests/rules vitest.rules.config.ts package.json package-lock.json
git commit -m "feat(rules): rules cho users + test suite Security Rules"
```

---

## Task 4: Security Rules — `testAttempts` và `moodLogs` (TDD)

**Files:**
- Create: `tests/rules/testAttempts.test.ts`, `tests/rules/moodLogs.test.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `tests/rules/helpers.ts` từ Task 3
- Produces: rules bảo vệ dữ liệu cá nhân — nền tảng cho Task 12, 13

- [ ] **Step 1: Viết test FAILING cho `testAttempts`**

Tạo `tests/rules/testAttempts.test.ts`:

```ts
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const ATTEMPT = {
  userId: "u1",
  testId: "t1",
  testVersion: 1,
  answers: { q1: 2, q2: 3 },
  score: 5,
  level: "nhe",
  createdAt: new Date(),
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("testAttempts/{id}", () => {
  it("student đã verify email tạo được lượt làm bài của mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "testAttempts/a1"), ATTEMPT));
  });

  it("student CHƯA verify email KHÔNG tạo được", async () => {
    const db = authedDb(env, "u1", { email_verified: false });
    await assertFails(setDoc(doc(db, "testAttempts/a1"), ATTEMPT));
  });

  it("KHÔNG tạo được lượt làm bài mang userId của người khác", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u2"), "testAttempts/a1"), ATTEMPT));
  });

  it("Guest KHÔNG tạo được lượt làm bài", async () => {
    await assertFails(setDoc(doc(guestDb(env), "testAttempts/a1"), ATTEMPT));
  });

  it("chủ sở hữu đọc được lượt làm bài của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "testAttempts/a1")));
  });

  it("user khác KHÔNG đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "testAttempts/a1")));
  });

  it("admin đọc được", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertSucceeds(getDoc(doc(adminDb(env), "testAttempts/a1")));
  });

  it("KHÔNG sửa được sau khi submit — kể cả chủ sở hữu", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertFails(updateDoc(doc(authedDb(env, "u1"), "testAttempts/a1"), { score: 99 }));
  });

  it("chủ sở hữu xóa được lượt làm bài của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testAttempts/a1"), ATTEMPT); });
    await assertSucceeds(deleteDoc(doc(authedDb(env, "u1"), "testAttempts/a1")));
  });
});
```

- [ ] **Step 2: Viết test FAILING cho `moodLogs`**

Tạo `tests/rules/moodLogs.test.ts`:

```ts
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const LOG = {
  userId: "u1",
  moodScore: 6,
  moodIcon: "calm",
  note: "Hôm nay ôn được 2 chương",
  tags: ["on-thi"],
  context: "standalone",
  linkedActivityRef: null,
  imageUrl: null,
  createdAt: new Date(),
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("moodLogs/{id}", () => {
  it("student đã verify tạo được nhật ký của mình", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "moodLogs/m1"), LOG));
  });

  it("student CHƯA verify KHÔNG tạo được", async () => {
    const db = authedDb(env, "u1", { email_verified: false });
    await assertFails(setDoc(doc(db, "moodLogs/m1"), LOG));
  });

  it("Guest KHÔNG tạo được nhật ký", async () => {
    await assertFails(setDoc(doc(guestDb(env), "moodLogs/m1"), LOG));
  });

  it("chủ sở hữu đọc, sửa, xóa được nhật ký của mình", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    const db = authedDb(env, "u1");
    await assertSucceeds(getDoc(doc(db, "moodLogs/m1")));
    await assertSucceeds(updateDoc(doc(db, "moodLogs/m1"), { note: "sửa lại" }));
    await assertSucceeds(deleteDoc(doc(db, "moodLogs/m1")));
  });

  it("user khác KHÔNG đọc được nhật ký", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "moodLogs/m1")));
  });

  it("ADMIN CŨNG KHÔNG đọc được nhật ký cảm xúc của học sinh", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "moodLogs/m1"), LOG); });
    await assertFails(getDoc(doc(adminDb(env), "moodLogs/m1")));
  });
});
```

Lưu ý test cuối: spec §6 cố ý **không** cho admin đọc `moodLogs`. Nhật ký cảm xúc là dữ liệu riêng tư nhất trong hệ thống; admin không có lý do chính đáng để đọc nội dung ghi chú của từng học sinh.

- [ ] **Step 3: Chạy test — phải FAIL**

Run: `npm run test:rules`
Expected: các test `assertSucceeds` của 2 file mới FAIL (catch-all deny đang chặn)

- [ ] **Step 4: Thêm rules cho `testAttempts` và `moodLogs`**

Chèn vào `firestore.rules`, **trước** khối `match /{document=**}`:

```js
    match /testAttempts/{id} {
      allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
      allow read:   if (isSignedIn() && resource.data.userId == request.auth.uid) || isAdmin();
      allow delete: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow update: if false;
    }

    match /moodLogs/{id} {
      allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }
```

- [ ] **Step 5: Chạy lại test — phải PASS**

Run: `npm run test:rules`
Expected: tất cả test của 3 file rules đều pass

- [ ] **Step 6: Commit**

```bash
git add firestore.rules tests/rules
git commit -m "feat(rules): rules cho testAttempts (immutable) và moodLogs (private tuyệt đối)"
```

---

## Task 5: Security Rules — nội dung, favorites, auditLogs, catch-all (TDD)

**Files:**
- Create: `tests/rules/content.test.ts`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `tests/rules/helpers.ts`
- Produces: bộ `firestore.rules` hoàn chỉnh cho Spec #1

- [ ] **Step 1: Viết test FAILING**

Tạo `tests/rules/content.test.ts`:

```ts
import { beforeAll, afterAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { createTestEnv, authedDb, adminDb, guestDb, seed } from "./helpers";

let env: RulesTestEnvironment;

const PUBLIC_RES = {
  title: "Kỹ thuật thở 4-7-8",
  slug: "ky-thuat-tho-4-7-8",
  type: "guide", category: "thu-gian", tags: ["tho"],
  content: "# Hít vào 4 nhịp", videoUrl: null,
  status: "published", visibility: "public",
  createdBy: "admin-1", createdAt: new Date(), updatedAt: new Date(),
};
const DRAFT_RES = { ...PUBLIC_RES, slug: "nhap", status: "draft" };
const STUDENT_RES = { ...PUBLIC_RES, slug: "chi-hoc-sinh", visibility: "student_only" };

const PUBLISHED_TEST = {
  title: "Test lo âu (mẫu)", version: 1, status: "published", isSampleContent: true,
  questions: [], scoring: { thresholds: [] },
  disclaimer: "Không phải chẩn đoán y khoa.",
  updatedBy: "admin-1", updatedAt: new Date(),
};

beforeAll(async () => { env = await createTestEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe("resources/{id}", () => {
  it("Guest đọc được resource public đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r1"), PUBLIC_RES); });
    await assertSucceeds(getDoc(doc(guestDb(env), "resources/r1")));
  });

  it("Guest KHÔNG đọc được resource draft", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r2"), DRAFT_RES); });
    await assertFails(getDoc(doc(guestDb(env), "resources/r2")));
  });

  it("Guest KHÔNG đọc được resource student_only", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r3"), STUDENT_RES); });
    await assertFails(getDoc(doc(guestDb(env), "resources/r3")));
  });

  it("Student đọc được resource student_only đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "resources/r3"), STUDENT_RES); });
    await assertSucceeds(getDoc(doc(authedDb(env, "u1"), "resources/r3")));
  });

  it("Student KHÔNG ghi được resource", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "resources/r9"), PUBLIC_RES));
  });

  it("Admin ghi được resource", async () => {
    await assertSucceeds(setDoc(doc(adminDb(env), "resources/r9"), PUBLIC_RES));
  });
});

describe("testDefinitions/{id}", () => {
  it("Guest đọc được test đã publish", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "testDefinitions/t1"), PUBLISHED_TEST); });
    await assertSucceeds(getDoc(doc(guestDb(env), "testDefinitions/t1")));
  });

  it("Guest KHÔNG đọc được test draft", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "testDefinitions/t2"), { ...PUBLISHED_TEST, status: "draft" });
    });
    await assertFails(getDoc(doc(guestDb(env), "testDefinitions/t2")));
  });

  it("Admin đọc được test draft", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "testDefinitions/t2"), { ...PUBLISHED_TEST, status: "draft" });
    });
    await assertSucceeds(getDoc(doc(adminDb(env), "testDefinitions/t2")));
  });

  it("Student KHÔNG ghi được testDefinition", async () => {
    await assertFails(setDoc(doc(authedDb(env, "u1"), "testDefinitions/t9"), PUBLISHED_TEST));
  });
});

describe("users/{uid}/favorites/{resourceId}", () => {
  const FAV = { resourceId: "r1", savedAt: new Date(), usedAt: null };

  it("chủ sở hữu lưu được yêu thích", async () => {
    await assertSucceeds(setDoc(doc(authedDb(env, "u1"), "users/u1/favorites/r1"), FAV));
  });

  it("user khác KHÔNG đọc được yêu thích của mình người ta", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "users/u1/favorites/r1"), FAV); });
    await assertFails(getDoc(doc(authedDb(env, "u2"), "users/u1/favorites/r1")));
  });
});

describe("auditLogs/{id}", () => {
  const LOG = {
    actorUid: "admin-1", action: "setUserRole", targetType: "user",
    targetId: "u1", before: null, after: { role: "admin" }, timestamp: new Date(),
  };

  it("Admin đọc được audit log", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "auditLogs/l1"), LOG); });
    await assertSucceeds(getDoc(doc(adminDb(env), "auditLogs/l1")));
  });

  it("Student KHÔNG đọc được audit log", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "auditLogs/l1"), LOG); });
    await assertFails(getDoc(doc(authedDb(env, "u1"), "auditLogs/l1")));
  });

  it("KHÔNG ai ghi được audit log trực tiếp — kể cả admin", async () => {
    await assertFails(setDoc(doc(adminDb(env), "auditLogs/l2"), LOG));
  });
});

describe("catch-all deny", () => {
  it("collection chưa khai báo bị chặn hoàn toàn", async () => {
    await seed(env, async (db) => { await setDoc(doc(db, "confessions/c1"), { text: "x" }); });
    await assertFails(getDoc(doc(adminDb(env), "confessions/c1")));
    await assertFails(setDoc(doc(adminDb(env), "confessions/c2"), { text: "y" }));
    await assertFails(deleteDoc(doc(adminDb(env), "confessions/c1")));
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm run test:rules`
Expected: các test `assertSucceeds` trong `content.test.ts` FAIL

- [ ] **Step 3: Hoàn thiện `firestore.rules`**

Chèn vào trước `match /{document=**}`:

```js
    match /users/{uid}/favorites/{resourceId} {
      allow read, write: if isOwner(uid);
    }

    match /resources/{id} {
      // Nhánh `|| isAdmin()` là BẮT BUỘC: Task 20 đọc cả bài draft qua client SDK
      // để Admin console sửa được. Thiếu nó, admin tạo draft xong không xem lại được.
      allow read: if (resource.data.status == "published" &&
                      (resource.data.visibility == "public" || isSignedIn()))
                  || isAdmin();
      allow write: if isAdmin();
    }

    match /testDefinitions/{id} {
      allow read:  if resource.data.status == "published" || isAdmin();
      allow write: if isAdmin();
    }

    match /auditLogs/{id} {
      allow read:  if isAdmin();
      allow write: if false;
    }
```

- [ ] **Step 4: Chạy lại test — phải PASS**

Run: `npm run test:rules`
Expected: toàn bộ 4 file rules pass

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules
git commit -m "feat(rules): hoàn thiện rules cho resources, testDefinitions, favorites, auditLogs + catch-all deny"
```

---

## Task 6: Zod schema dùng chung

**Files:**
- Create: `src/lib/types/user.ts`, `src/lib/types/test.ts`, `src/lib/types/mood.ts`, `src/lib/types/resource.ts`
- Test: `src/lib/types/types.test.ts`

**Interfaces:**
- Consumes: không có
- Produces:
  - `userProfileSchema`, type `UserProfile`
  - `testDefinitionSchema`, type `TestDefinition`; `testAttemptSchema`, type `TestAttempt`; `thresholdSchema`, type `Threshold`
  - `moodLogSchema`, type `MoodLog`, `MOOD_CONTEXTS`
  - `resourceSchema`, type `Resource`; `favoriteSchema`, type `Favorite`

- [ ] **Step 1: Cài zod**

```bash
npm install zod
```

- [ ] **Step 2: Viết test FAILING**

Tạo `src/lib/types/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { userProfileSchema } from "./user";
import { testDefinitionSchema, testAttemptSchema } from "./test";
import { moodLogSchema } from "./mood";
import { resourceSchema } from "./resource";

describe("userProfileSchema", () => {
  it("chấp nhận hồ sơ hợp lệ", () => {
    const r = userProfileSchema.safeParse({
      uid: "u1", role: "student", nickname: "Mèo con", gradeLevel: "12",
      school: "THPT Trần Phú", examGoals: ["Khối A"],
      privacySettings: { aiOptIn: false, shareImageWithAI: false },
      researchConsent: null, deletionRequestedAt: null,
    });
    expect(r.success).toBe(true);
  });

  it("từ chối gradeLevel không hợp lệ", () => {
    const r = userProfileSchema.safeParse({
      uid: "u1", role: "student", nickname: "A", gradeLevel: "9",
      school: "X", examGoals: [],
      privacySettings: { aiOptIn: false, shareImageWithAI: false },
      researchConsent: null, deletionRequestedAt: null,
    });
    expect(r.success).toBe(false);
  });

  it("từ chối nickname rỗng", () => {
    const r = userProfileSchema.safeParse({
      uid: "u1", role: "student", nickname: "", gradeLevel: "10",
      school: "X", examGoals: [],
      privacySettings: { aiOptIn: false, shareImageWithAI: false },
      researchConsent: null, deletionRequestedAt: null,
    });
    expect(r.success).toBe(false);
  });
});

describe("moodLogSchema", () => {
  it("chấp nhận moodScore trong khoảng 1..10", () => {
    const base = {
      userId: "u1", moodIcon: "calm", note: "", tags: [],
      context: "standalone", linkedActivityRef: null, imageUrl: null,
    };
    expect(moodLogSchema.safeParse({ ...base, moodScore: 1 }).success).toBe(true);
    expect(moodLogSchema.safeParse({ ...base, moodScore: 10 }).success).toBe(true);
  });

  it("từ chối moodScore ngoài khoảng", () => {
    const base = {
      userId: "u1", moodIcon: "calm", note: "", tags: [],
      context: "standalone", linkedActivityRef: null, imageUrl: null,
    };
    expect(moodLogSchema.safeParse({ ...base, moodScore: 0 }).success).toBe(false);
    expect(moodLogSchema.safeParse({ ...base, moodScore: 11 }).success).toBe(false);
    expect(moodLogSchema.safeParse({ ...base, moodScore: 5.5 }).success).toBe(false);
  });
});

describe("testDefinitionSchema", () => {
  it("bắt buộc có disclaimer không rỗng", () => {
    const r = testDefinitionSchema.safeParse({
      title: "T", version: 1, status: "draft", isSampleContent: true,
      questions: [], scoring: { thresholds: [] }, disclaimer: "", updatedBy: "a",
    });
    expect(r.success).toBe(false);
  });
});

describe("testAttemptSchema", () => {
  it("chấp nhận lượt làm bài hợp lệ", () => {
    const r = testAttemptSchema.safeParse({
      userId: "u1", testId: "t1", testVersion: 1,
      answers: { q1: 2 }, score: 2, level: "nhe",
    });
    expect(r.success).toBe(true);
  });
});

describe("resourceSchema", () => {
  it("từ chối slug có ký tự hoa hoặc dấu cách", () => {
    const base = {
      title: "A", type: "article", category: "c", tags: [],
      content: "x", videoUrl: null, status: "draft",
      visibility: "public", createdBy: "a",
    };
    expect(resourceSchema.safeParse({ ...base, slug: "Ky Thuat" }).success).toBe(false);
    expect(resourceSchema.safeParse({ ...base, slug: "ky-thuat-tho" }).success).toBe(true);
  });
});
```

- [ ] **Step 3: Chạy test — phải FAIL**

Run: `npm test`
Expected: FAIL — không tìm thấy module `./user`, `./test`, `./mood`, `./resource`

- [ ] **Step 4: Viết `src/lib/types/user.ts`**

```ts
import { z } from "zod";

export const researchConsentSchema = z.object({
  granted: z.boolean(),
  grantedAt: z.date().nullable(),
  version: z.string().min(1),
});

export const userProfileSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(["student", "admin"]),
  nickname: z.string().min(1).max(50),
  gradeLevel: z.enum(["10", "11", "12"]),
  school: z.string().min(1).max(120),
  examGoals: z.array(z.string().max(100)).max(10),
  privacySettings: z.object({
    aiOptIn: z.boolean(),
    shareImageWithAI: z.boolean(),
  }),
  researchConsent: researchConsentSchema.nullable(),
  deletionRequestedAt: z.date().nullable(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type ResearchConsent = z.infer<typeof researchConsentSchema>;

export const DEFAULT_PRIVACY_SETTINGS = {
  aiOptIn: false,
  shareImageWithAI: false,
} as const;
```

- [ ] **Step 5: Viết `src/lib/types/test.ts`**

```ts
import { z } from "zod";

export const optionSchema = z.object({
  label: z.string().min(1),
  score: z.number().int().min(0).max(100),
});

export const questionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(optionSchema).min(2),
});

export const thresholdSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
  level: z.string().min(1),
  interpretation: z.string().min(1),
});

export const testDefinitionSchema = z.object({
  title: z.string().min(1),
  version: z.number().int().min(1),
  status: z.enum(["draft", "published"]),
  isSampleContent: z.boolean(),
  questions: z.array(questionSchema),
  scoring: z.object({ thresholds: z.array(thresholdSchema) }),
  disclaimer: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const testAttemptSchema = z.object({
  userId: z.string().min(1),
  testId: z.string().min(1),
  testVersion: z.number().int().min(1),
  answers: z.record(z.string(), z.number().int()),
  score: z.number().int(),
  level: z.string().min(1),
});

export type Option = z.infer<typeof optionSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Threshold = z.infer<typeof thresholdSchema>;
export type TestDefinition = z.infer<typeof testDefinitionSchema>;
export type TestAttempt = z.infer<typeof testAttemptSchema>;
```

- [ ] **Step 6: Viết `src/lib/types/mood.ts`**

```ts
import { z } from "zod";

export const MOOD_CONTEXTS = ["standalone", "before", "after"] as const;

export const MOOD_ICONS = [
  "very_low", "low", "neutral", "calm", "happy",
] as const;

export const moodLogSchema = z.object({
  userId: z.string().min(1),
  moodScore: z.number().int().min(1).max(10),
  moodIcon: z.enum(MOOD_ICONS),
  note: z.string().max(2000),
  tags: z.array(z.string().max(40)).max(10),
  context: z.enum(MOOD_CONTEXTS),
  linkedActivityRef: z.string().nullable(),
  imageUrl: z.null(),
});

export type MoodLog = z.infer<typeof moodLogSchema>;
export type MoodContext = (typeof MOOD_CONTEXTS)[number];
export type MoodIcon = (typeof MOOD_ICONS)[number];
```

- [ ] **Step 7: Viết `src/lib/types/resource.ts`**

```ts
import { z } from "zod";

export const RESOURCE_TYPES = ["article", "tip", "video", "guide"] as const;

/** Chỉ chữ thường không dấu, số và dấu gạch ngang. */
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
  message: "slug chỉ gồm chữ thường không dấu, số và dấu gạch ngang",
});

export const resourceSchema = z.object({
  title: z.string().min(1).max(200),
  slug: slugSchema,
  type: z.enum(RESOURCE_TYPES),
  category: z.string().min(1).max(60),
  tags: z.array(z.string().max(40)).max(15),
  content: z.string().min(1),
  videoUrl: z.string().url().nullable(),
  status: z.enum(["draft", "published"]),
  visibility: z.enum(["public", "student_only"]),
  createdBy: z.string().min(1),
});

export const favoriteSchema = z.object({
  resourceId: z.string().min(1),
  usedAt: z.date().nullable(),
});

export type Resource = z.infer<typeof resourceSchema>;
export type Favorite = z.infer<typeof favoriteSchema>;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
```

- [ ] **Step 8: Chạy test — phải PASS**

Run: `npm test && npm run typecheck`
Expected: tất cả pass, không lỗi type

- [ ] **Step 9: Commit**

```bash
git add src/lib/types package.json package-lock.json
git commit -m "feat(types): Zod schema dùng chung cho user, test, mood, resource"
```

---

## Task 7: Engine tính điểm test (logic thuần, TDD)

**Files:**
- Create: `src/lib/scoring.ts`
- Test: `src/lib/scoring.test.ts`

**Interfaces:**
- Consumes: `Question`, `Threshold` từ `src/lib/types/test.ts`
- Produces:
  - `calculateScore(questions: Question[], answers: Record<string, number>): number`
  - `resolveLevel(score: number, thresholds: Threshold[]): Threshold | null`
  - `isComplete(questions: Question[], answers: Record<string, number>): boolean`
  - `IncompleteAnswersError`, `InvalidAnswerError`

**Quy ước quan trọng:** `answers` ánh xạ `questionId → chỉ số option đã chọn` (0-based), **không phải** điểm. Điểm luôn được tính lại từ `questions`, nên nếu client gửi sai thì cũng không giả mạo được điểm.

- [ ] **Step 1: Viết test FAILING**

Tạo `src/lib/scoring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  calculateScore, resolveLevel, isComplete,
  IncompleteAnswersError, InvalidAnswerError,
} from "./scoring";
import type { Question, Threshold } from "@/lib/types/test";

const QUESTIONS: Question[] = [
  { id: "q1", text: "Bạn có khó ngủ trước kỳ thi?", options: [
    { label: "Không bao giờ", score: 0 }, { label: "Thỉnh thoảng", score: 1 }, { label: "Thường xuyên", score: 2 },
  ]},
  { id: "q2", text: "Bạn có hay lo lắng quá mức?", options: [
    { label: "Không bao giờ", score: 0 }, { label: "Thỉnh thoảng", score: 1 }, { label: "Thường xuyên", score: 2 },
  ]},
];

const THRESHOLDS: Threshold[] = [
  { min: 0, max: 1, level: "thap", interpretation: "Mức lo âu thấp." },
  { min: 2, max: 3, level: "trung-binh", interpretation: "Mức lo âu trung bình." },
  { min: 4, max: 4, level: "cao", interpretation: "Mức lo âu cao." },
];

describe("calculateScore", () => {
  it("cộng đúng điểm của các option đã chọn", () => {
    expect(calculateScore(QUESTIONS, { q1: 2, q2: 1 })).toBe(3);
  });

  it("trả về 0 khi chọn toàn option điểm 0", () => {
    expect(calculateScore(QUESTIONS, { q1: 0, q2: 0 })).toBe(0);
  });

  it("ném IncompleteAnswersError khi thiếu câu trả lời", () => {
    expect(() => calculateScore(QUESTIONS, { q1: 1 })).toThrow(IncompleteAnswersError);
  });

  it("ném InvalidAnswerError khi chỉ số option vượt phạm vi", () => {
    expect(() => calculateScore(QUESTIONS, { q1: 5, q2: 0 })).toThrow(InvalidAnswerError);
  });

  it("ném InvalidAnswerError khi chỉ số option âm", () => {
    expect(() => calculateScore(QUESTIONS, { q1: -1, q2: 0 })).toThrow(InvalidAnswerError);
  });

  it("bỏ qua câu trả lời thừa không khớp câu hỏi nào", () => {
    expect(calculateScore(QUESTIONS, { q1: 1, q2: 1, qX: 9 })).toBe(2);
  });

  it("trả về 0 cho bộ câu hỏi rỗng", () => {
    expect(calculateScore([], {})).toBe(0);
  });
});

describe("resolveLevel", () => {
  it("khớp đúng ngưỡng ở giữa", () => {
    expect(resolveLevel(3, THRESHOLDS)?.level).toBe("trung-binh");
  });

  it("khớp đúng ở biên min", () => {
    expect(resolveLevel(2, THRESHOLDS)?.level).toBe("trung-binh");
  });

  it("khớp đúng ở biên max", () => {
    expect(resolveLevel(1, THRESHOLDS)?.level).toBe("thap");
  });

  it("khớp ngưỡng có min bằng max", () => {
    expect(resolveLevel(4, THRESHOLDS)?.level).toBe("cao");
  });

  it("trả về null khi điểm không rơi vào ngưỡng nào", () => {
    expect(resolveLevel(99, THRESHOLDS)).toBeNull();
  });

  it("trả về null khi danh sách ngưỡng rỗng", () => {
    expect(resolveLevel(0, [])).toBeNull();
  });

  it("lấy ngưỡng đầu tiên khớp khi các ngưỡng chồng lấn", () => {
    const overlapping: Threshold[] = [
      { min: 0, max: 5, level: "a", interpretation: "A" },
      { min: 3, max: 8, level: "b", interpretation: "B" },
    ];
    expect(resolveLevel(4, overlapping)?.level).toBe("a");
  });
});

describe("isComplete", () => {
  it("true khi mọi câu hỏi đều có câu trả lời", () => {
    expect(isComplete(QUESTIONS, { q1: 0, q2: 0 })).toBe(true);
  });

  it("false khi còn câu chưa trả lời", () => {
    expect(isComplete(QUESTIONS, { q1: 0 })).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- scoring`
Expected: FAIL, không tìm thấy module `./scoring`

- [ ] **Step 3: Viết `src/lib/scoring.ts`**

```ts
import type { Question, Threshold } from "@/lib/types/test";

export class IncompleteAnswersError extends Error {
  constructor(public readonly missingQuestionIds: string[]) {
    super(`Còn ${missingQuestionIds.length} câu chưa trả lời.`);
    this.name = "IncompleteAnswersError";
  }
}

export class InvalidAnswerError extends Error {
  constructor(public readonly questionId: string, public readonly optionIndex: number) {
    super(`Câu ${questionId} có lựa chọn không hợp lệ: ${optionIndex}.`);
    this.name = "InvalidAnswerError";
  }
}

export function isComplete(
  questions: Question[],
  answers: Record<string, number>,
): boolean {
  return questions.every((q) => q.id in answers);
}

/**
 * Tính tổng điểm từ chỉ số option đã chọn.
 * `answers` là questionId -> chỉ số option (0-based), KHÔNG phải điểm.
 */
export function calculateScore(
  questions: Question[],
  answers: Record<string, number>,
): number {
  const missing = questions.filter((q) => !(q.id in answers)).map((q) => q.id);
  if (missing.length > 0) throw new IncompleteAnswersError(missing);

  let total = 0;
  for (const question of questions) {
    const index = answers[question.id]!;
    const option = question.options[index];
    if (!Number.isInteger(index) || option === undefined) {
      throw new InvalidAnswerError(question.id, index);
    }
    total += option.score;
  }
  return total;
}

/** Trả về ngưỡng ĐẦU TIÊN khớp; null nếu không ngưỡng nào khớp. */
export function resolveLevel(
  score: number,
  thresholds: Threshold[],
): Threshold | null {
  return thresholds.find((t) => score >= t.min && score <= t.max) ?? null;
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `npm test -- scoring`
Expected: 16 passed

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat(scoring): engine tính điểm và ánh xạ ngưỡng, phủ hết ca biên"
```

---

## Task 8: Firebase Web SDK client + App Check + offline persistence

**Files:**
- Create: `src/lib/firebase/client.ts`, `.env.local.example`
- Modify: `.gitignore` (đã có `.env*.local`)

**Interfaces:**
- Consumes: không có
- Produces: `getFirebaseApp()`, `getFirebaseAuth()`, `getDb()` — mọi component client dùng các hàm này, không tự `initializeApp`

- [ ] **Step 1: Cài Firebase Web SDK**

```bash
npm install firebase
```

- [ ] **Step 2: [USER] Đăng ký Web App và lấy config**

Firebase Console → project `examcalm-dev` → ⚙️ Project settings → **Your apps** → **Add app** → Web → đặt tên `examcalm-web`. Copy đoạn `firebaseConfig`.

Cũng ở trang đó, mục **App Check** → **Register** cho web app, chọn **reCAPTCHA Enterprise**, lấy **site key**.

- [ ] **Step 3: Tạo `.env.local.example` (file mẫu, commit được)**

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=

# Bật khi phát triển local với Emulator
NEXT_PUBLIC_USE_EMULATOR=true

# Chỉ dùng ở server, KHÔNG có tiền tố NEXT_PUBLIC
FIREBASE_SERVICE_ACCOUNT_JSON=
```

Sao chép thành `.env.local` và điền giá trị thật (file này đã nằm trong `.gitignore`).

- [ ] **Step 4: Viết `src/lib/firebase/client.ts`**

```ts
"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

let dbInstance: Firestore | null = null;
let appCheckStarted = false;

export function getFirebaseApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseAuth(): Auth {
  const auth = getAuth(getFirebaseApp());
  if (useEmulator && !("__examcalmEmulator" in auth)) {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    Object.defineProperty(auth, "__examcalmEmulator", { value: true });
  }
  return auth;
}

/**
 * Firestore với offline persistence (spec §7.4): ghi vào IndexedDB trước,
 * SDK tự đồng bộ khi có mạng — submit test/mood không mất dữ liệu.
 */
export function getDb(): Firestore {
  if (dbInstance) return dbInstance;

  const app = getFirebaseApp();
  try {
    dbInstance = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    // CHỈ nuốt đúng trường hợp Firestore đã khởi tạo sẵn (Fast Refresh làm
    // module này chạy lại trong khi FirebaseApp vẫn là instance cũ).
    // Mọi lỗi khác phải ném tiếp: nếu nuốt hết, một lần persistentLocalCache
    // hỏng sẽ âm thầm trả về Firestore KHÔNG có offline persistence, và
    // Task 13/14 mất dữ liệu khi mạng chập chờn mà không có tín hiệu nào.
    if (!(error instanceof Error) || !error.message.includes("already been started")) {
      throw error;
    }
    dbInstance = getFirestore(app);
  }

  // Cờ đánh dấu phải nằm TRÊN CHÍNH instance, không nằm ở biến module:
  // Fast Refresh reset biến module nhưng instance Firestore thì vẫn là cái cũ.
  // Gọi connectFirestoreEmulator lần hai trên client đã khởi động sẽ ném lỗi.
  if (useEmulator && !("__examcalmEmulator" in dbInstance)) {
    connectFirestoreEmulator(dbInstance, "127.0.0.1", 8080);
    Object.defineProperty(dbInstance, "__examcalmEmulator", { value: true });
  }
  return dbInstance;
}

/**
 * App Check ở chế độ monitor-only cho Spec #1 (spec §5.3):
 * gắn token vào request để xem số liệu, nhưng CHƯA bật enforce ở Console.
 * Bỏ qua hoàn toàn khi chạy Emulator.
 */
export function startAppCheck(): void {
  if (appCheckStarted || useEmulator || typeof window === "undefined") return;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!siteKey) return;

  initializeAppCheck(getFirebaseApp(), {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckStarted = true;
}
```

- [ ] **Step 5: Gọi `startAppCheck()` một lần ở client root**

Tạo `src/components/FirebaseBootstrap.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { startAppCheck } from "@/lib/firebase/client";

export function FirebaseBootstrap() {
  useEffect(() => {
    startAppCheck();
  }, []);
  return null;
}
```

Thêm `<FirebaseBootstrap />` vào `<body>` trong `src/app/layout.tsx`.

- [ ] **Step 6: Xác minh build sạch**

Run: `npm run typecheck && npm run build`
Expected: không lỗi

- [ ] **Step 7: Commit**

```bash
git add src/lib/firebase/client.ts src/components/FirebaseBootstrap.tsx src/app/layout.tsx .env.local.example package.json package-lock.json
git commit -m "feat(firebase): khởi tạo Web SDK, offline persistence, App Check monitor-only"
```

---

## Task 9: Admin SDK (server-only) và truy vấn nội dung công khai

**Files:**
- Create: `src/lib/firebase/admin.ts`, `src/lib/firebase/queries-public.ts`
- Test: `tests/rules/…` không áp dụng — xác minh bằng Task 14 và E2E

**Interfaces:**
- Consumes: types từ Task 6
- Produces:
  - `getAdminApp()`, `adminDb()`, `adminAuth()`
  - `listPublishedResources(opts)`, `getResourceBySlug(slug)`, `getPublishedTest(testId)`, `listPublishedTests()`

- [ ] **Step 1: Cài Admin SDK và `server-only`**

```bash
npm install firebase-admin server-only
```

- [ ] **Step 2: Viết `src/lib/firebase/admin.ts`**

```ts
import "server-only";

import { getApps, initializeApp, cert, applicationDefault, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

const ADMIN_APP_NAME = "examcalm-admin";

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existing) return existing;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = raw
    ? cert(JSON.parse(raw) as Record<string, string>)
    : applicationDefault();

  return initializeApp(
    { credential, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
    ADMIN_APP_NAME,
  );
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}
```

**Ghi chú vận hành:** trên Firebase App Hosting, `applicationDefault()` tự lấy credential của service account gắn với backend — **không cần** đặt `FIREBASE_SERVICE_ACCOUNT_JSON` ở production. Biến đó chỉ dùng khi chạy local.

**Ghi chú Emulator:** khi `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` và `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` được đặt trong `.env.local`, Admin SDK tự kết nối Emulator, không cần code thêm.

- [ ] **Step 3: Viết `src/lib/firebase/queries-public.ts`**

```ts
import "server-only";

import { adminDb } from "./admin";
import type { Resource } from "@/lib/types/resource";
import type { TestDefinition } from "@/lib/types/test";

export type ResourceListItem = Resource & { id: string };
export type TestListItem = TestDefinition & { id: string };

export type ListResourcesOptions = {
  /** true khi người xem đã đăng nhập — mở thêm resource student_only */
  includeStudentOnly?: boolean;
  category?: string;
  tag?: string;
  limit?: number;
};

export async function listPublishedResources(
  opts: ListResourcesOptions = {},
): Promise<ResourceListItem[]> {
  const { includeStudentOnly = false, category, tag, limit = 50 } = opts;

  let query = adminDb()
    .collection("resources")
    .where("status", "==", "published");

  if (!includeStudentOnly) query = query.where("visibility", "==", "public");
  if (category) query = query.where("category", "==", category);
  if (tag) query = query.where("tags", "array-contains", tag);

  const snap = await query.orderBy("updatedAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Resource) }));
}

export async function getResourceBySlug(
  slug: string,
  includeStudentOnly = false,
): Promise<ResourceListItem | null> {
  const snap = await adminDb()
    .collection("resources")
    .where("slug", "==", slug)
    .where("status", "==", "published")
    .limit(1)
    .get();

  const docSnap = snap.docs[0];
  if (!docSnap) return null;

  const data = docSnap.data() as Resource;
  if (data.visibility === "student_only" && !includeStudentOnly) return null;

  return { id: docSnap.id, ...data };
}

export async function listPublishedTests(): Promise<TestListItem[]> {
  const snap = await adminDb()
    .collection("testDefinitions")
    .where("status", "==", "published")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TestDefinition) }));
}

export async function getPublishedTest(testId: string): Promise<TestListItem | null> {
  const docSnap = await adminDb().collection("testDefinitions").doc(testId).get();
  if (!docSnap.exists) return null;
  const data = docSnap.data() as TestDefinition;
  if (data.status !== "published") return null;
  return { id: docSnap.id, ...data };
}
```

- [ ] **Step 4: Thêm biến Emulator vào `.env.local.example`**

```bash
# Chỉ đặt khi phát triển local — Admin SDK sẽ tự trỏ vào Emulator
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

- [ ] **Step 5: Xác minh không rò Admin SDK vào client bundle**

Run: `npm run build`
Sau đó kiểm tra:

```bash
grep -rl "firebase-admin" .next/static 2>/dev/null && echo "LỖI: admin SDK lọt vào client bundle" || echo "OK: client bundle sạch"
```

Expected: `OK: client bundle sạch`

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase/admin.ts src/lib/firebase/queries-public.ts .env.local.example package.json package-lock.json
git commit -m "feat(firebase): Admin SDK server-only + truy vấn nội dung công khai cho Server Component"
```

---

## Task 10: Session cookie, middleware và route bảo vệ

**Files:**
- Create: `src/lib/firebase/session.ts`, `src/app/api/session/route.ts`, `src/proxy.ts`
- Test: `src/lib/firebase/session.test.ts`

**Interfaces:**
- Consumes: `adminAuth()` từ Task 9
- Produces:
  - `createSessionCookie(idToken)`, `getSessionUser()`, `requireUser()`, `requireAdmin()`, `clearSessionCookie()`
  - Route `POST /api/session` (đăng nhập), `DELETE /api/session` (đăng xuất)

**Bẫy kỹ thuật quan trọng:** `src/proxy.ts` chạy trên **Edge runtime**, nơi `firebase-admin` **không chạy được**. Vì vậy middleware **chỉ kiểm tra sự tồn tại của cookie** (lớp UX). Việc xác minh chữ ký và đọc custom claim `role` phải làm trong **Server Component layout** bằng Admin SDK. Đừng nhầm hai lớp này.

**Tên cookie bắt buộc là `__session`** — Firebase Hosting/App Hosting chỉ chuyển tiếp đúng cookie tên này qua CDN; cookie tên khác sẽ bị loại bỏ ở production.

- [ ] **Step 1: Viết test FAILING cho logic thuần của session**

Tạo `src/lib/firebase/session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS, sessionCookieOptions } from "./session-config";

describe("cấu hình session cookie", () => {
  it("dùng đúng tên __session mà Firebase Hosting yêu cầu", () => {
    expect(SESSION_COOKIE_NAME).toBe("__session");
  });

  it("hết hạn sau 5 ngày", () => {
    expect(SESSION_MAX_AGE_MS).toBe(5 * 24 * 60 * 60 * 1000);
  });

  it("là httpOnly và sameSite lax", () => {
    const opts = sessionCookieOptions(false);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  it("bật secure ở production, tắt ở local http", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- session`
Expected: FAIL, không tìm thấy `./session-config`

- [ ] **Step 3: Viết `src/lib/firebase/session-config.ts` (không phụ thuộc Admin SDK nên test được)**

```ts
export const SESSION_COOKIE_NAME = "__session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

export function sessionCookieOptions(isProduction: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  };
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `npm test -- session`
Expected: 4 passed

- [ ] **Step 5: Viết `src/lib/firebase/session.ts`**

```ts
import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "./admin";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  sessionCookieOptions,
} from "./session-config";

export type SessionUser = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: "student" | "admin";
};

export async function createSessionCookie(idToken: string): Promise<void> {
  const cookie = await adminAuth().createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });
  const store = await cookies();
  store.set(
    SESSION_COOKIE_NAME,
    cookie,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Trả về user đã xác minh, hoặc null. Không bao giờ ném lỗi. */
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    // cookies() PHẢI nằm trong try: nó ném lỗi khi được gọi ngoài ngữ cảnh
    // request (ví dụ lúc prerender tĩnh). Để ngoài là phá vỡ cam kết
    // "không bao giờ ném lỗi" mà 9 task sau đang dựa vào.
    const store = await cookies();
    const cookie = store.get(SESSION_COOKIE_NAME)?.value;
    if (!cookie) return null;

    // checkRevoked = true: đăng xuất mọi thiết bị có tác dụng ngay.
    const claims = await adminAuth().verifySessionCookie(cookie, true);
    return {
      uid: claims.uid,
      email: claims.email ?? null,
      emailVerified: claims.email_verified === true,
      role: claims.role === "admin" ? "admin" : "student",
    };
  } catch {
    return null;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/dang-nhap");
  if (user.role !== "admin") redirect("/");
  return user;
}
```

- [ ] **Step 6: Viết route handler `src/app/api/session/route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSessionCookie, clearSessionCookie } from "@/lib/firebase/session";

export const runtime = "nodejs";

const bodySchema = z.object({ idToken: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Thiếu idToken." }, { status: 400 });
  }

  try {
    await createSessionCookie(parsed.data.idToken);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Token không hợp lệ." }, { status: 401 });
  }
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Viết `src/proxy.ts` (chỉ là lớp UX)**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/session-config";

/**
 * Chỉ kiểm tra CÓ cookie hay không — Edge runtime không chạy được firebase-admin.
 * Xác minh chữ ký và kiểm tra role làm ở Server Component layout (requireUser/requireAdmin).
 * Đây KHÔNG phải lớp bảo mật; Security Rules mới là lớp bảo mật.
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/dang-nhap";
  url.searchParams.set("tiep-tuc", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/tien-trinh/:path*", "/nhat-ky/:path*", "/ho-so/:path*", "/admin/:path*"],
};
```

- [ ] **Step 8: Xác minh build và test**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 9: Commit**

```bash
git add src/lib/firebase/session.ts src/lib/firebase/session-config.ts src/lib/firebase/session.test.ts src/app/api/session src/proxy.ts
git commit -m "feat(auth): session cookie __session, middleware UX và guard bằng Admin SDK"
```

---

## Task 11: Đăng ký, đăng nhập, xác thực email và tạo hồ sơ

**Files:**
- Create: `src/lib/auth-client.ts`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SignInForm.tsx`, `src/components/auth/VerifyEmailNotice.tsx`, `src/app/(public)/dang-ky/page.tsx`, `src/app/(public)/dang-nhap/page.tsx`, `src/app/(public)/xac-thuc-email/page.tsx`, `src/app/(student)/layout.tsx`

> `src/app/(student)/ho-so/page.tsx` **không** thuộc task này — nó được tạo ở **Task 22** cùng với phiếu đồng ý nghiên cứu và mục xóa dữ liệu.
- Test: `src/components/auth/SignUpForm.test.tsx`

**Interfaces:**
- Consumes: `getFirebaseAuth()`, `getDb()` (Task 8); `userProfileSchema`, `DEFAULT_PRIVACY_SETTINGS` (Task 6); `POST /api/session` (Task 10)
- Produces:
  - `signUp({ email, password, profile })`, `signIn({ email, password })`, `signOutEverywhere()`, `resendVerificationEmail()` trong `src/lib/auth-client.ts`
  - `signUpInputSchema` — Zod schema cho form đăng ký

**Thứ tự bắt buộc khi đăng ký** (spec §5.1): tạo tài khoản Auth → ghi doc `users/{uid}` (rules **không** đòi verify cho bước này) → gửi email xác thực → đổi ID token lấy session cookie. Chỉ sau khi user bấm link xác thực thì mới ghi được `testAttempts`/`moodLogs`.

- [ ] **Step 1: Viết test FAILING cho validation form đăng ký**

Tạo `src/components/auth/SignUpForm.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { signUpInputSchema } from "@/lib/auth-client";

describe("signUpInputSchema", () => {
  const valid = {
    email: "hocsinh@example.com",
    password: "matkhau123",
    nickname: "Mèo con",
    gradeLevel: "12",
    school: "THPT Trần Phú",
    examGoals: ["Khối A"],
  };

  it("chấp nhận dữ liệu hợp lệ", () => {
    expect(signUpInputSchema.safeParse(valid).success).toBe(true);
  });

  it("từ chối email sai định dạng", () => {
    expect(signUpInputSchema.safeParse({ ...valid, email: "khong-phai-email" }).success).toBe(false);
  });

  it("từ chối mật khẩu dưới 8 ký tự", () => {
    expect(signUpInputSchema.safeParse({ ...valid, password: "1234567" }).success).toBe(false);
  });

  it("từ chối khối lớp ngoài 10/11/12", () => {
    expect(signUpInputSchema.safeParse({ ...valid, gradeLevel: "9" }).success).toBe(false);
  });

  it("từ chối biệt danh rỗng", () => {
    expect(signUpInputSchema.safeParse({ ...valid, nickname: "" }).success).toBe(false);
  });

  it("cho phép examGoals rỗng", () => {
    expect(signUpInputSchema.safeParse({ ...valid, examGoals: [] }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- SignUpForm`
Expected: FAIL, không tìm thấy `signUpInputSchema`

- [ ] **Step 3: Viết `src/lib/auth-client.ts`**

```ts
"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { z } from "zod";
import { getFirebaseAuth, getDb } from "@/lib/firebase/client";
import { DEFAULT_PRIVACY_SETTINGS } from "@/lib/types/user";

export const signUpInputSchema = z.object({
  email: z.string().email("Email không hợp lệ."),
  password: z.string().min(8, "Mật khẩu cần ít nhất 8 ký tự."),
  nickname: z.string().min(1, "Hãy nhập biệt danh.").max(50),
  gradeLevel: z.enum(["10", "11", "12"]),
  school: z.string().min(1, "Hãy nhập tên trường.").max(120),
  examGoals: z.array(z.string().max(100)).max(10),
});

export type SignUpInput = z.infer<typeof signUpInputSchema>;

/** Đổi ID token lấy session cookie để Server Component nhận diện được user. */
async function establishSession(user: User): Promise<void> {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error("Không tạo được phiên đăng nhập.");
}

export async function signUp(input: SignUpInput): Promise<void> {
  const parsed = signUpInputSchema.parse(input);
  const auth = getFirebaseAuth();

  const cred = await createUserWithEmailAndPassword(auth, parsed.email, parsed.password);

  // Ghi hồ sơ TRƯỚC khi verify — rules cho phép create users mà không đòi email_verified.
  await setDoc(doc(getDb(), "users", cred.user.uid), {
    uid: cred.user.uid,
    role: "student",
    nickname: parsed.nickname,
    gradeLevel: parsed.gradeLevel,
    school: parsed.school,
    examGoals: parsed.examGoals,
    privacySettings: { ...DEFAULT_PRIVACY_SETTINGS },
    researchConsent: null,
    deletionRequestedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await sendEmailVerification(cred.user);
  await establishSession(cred.user);
}

export async function signIn(email: string, password: string): Promise<void> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  await establishSession(cred.user);
}

export async function signOutEverywhere(): Promise<void> {
  await signOut(getFirebaseAuth());
  await fetch("/api/session", { method: "DELETE" });
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Chưa đăng nhập.");
  await sendEmailVerification(user);
}

/** Thông báo lỗi Firebase Auth bằng tiếng Việt, không lộ chi tiết kỹ thuật. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "Email này đã được đăng ký. Bạn thử đăng nhập nhé.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email hoặc mật khẩu chưa đúng.";
    case "auth/too-many-requests":
      return "Bạn thử lại sau ít phút nhé.";
    case "auth/network-request-failed":
      return "Mất kết nối mạng. Kiểm tra lại đường truyền giúp mình.";
    default:
      return "Có lỗi xảy ra. Bạn thử lại sau nhé.";
  }
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `npm test -- SignUpForm`
Expected: 6 passed

- [ ] **Step 5: Viết `src/components/auth/SignUpForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp, signUpInputSchema, authErrorMessage } from "@/lib/auth-client";

const GRADE_LEVELS = ["10", "11", "12"] as const;

export function SignUpForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signUpInputSchema.safeParse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      nickname: String(form.get("nickname") ?? ""),
      gradeLevel: String(form.get("gradeLevel") ?? ""),
      school: String(form.get("school") ?? ""),
      examGoals: String(form.get("examGoals") ?? "")
        .split(",").map((s) => s.trim()).filter(Boolean),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    setPending(true);
    try {
      await signUp(parsed.data);
      router.push("/xac-thuc-email");
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="rounded-lg border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        <span>Mật khẩu</span>
        <input name="password" type="password" required autoComplete="new-password" minLength={8} className="rounded-lg border px-3 py-2" />
        <span className="text-sm text-slate-500">Ít nhất 8 ký tự.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Biệt danh</span>
        <input name="nickname" type="text" required maxLength={50} className="rounded-lg border px-3 py-2" />
        <span className="text-sm text-slate-500">Bạn không cần dùng tên thật.</span>
      </label>

      <label className="flex flex-col gap-1">
        <span>Khối lớp</span>
        <select name="gradeLevel" required defaultValue="12" className="rounded-lg border px-3 py-2">
          {GRADE_LEVELS.map((g) => <option key={g} value={g}>Lớp {g}</option>)}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span>Trường</span>
        <input name="school" type="text" required maxLength={120} className="rounded-lg border px-3 py-2" />
      </label>

      <label className="flex flex-col gap-1">
        <span>Mục tiêu thi <span className="text-slate-500">(không bắt buộc)</span></span>
        <input name="examGoals" type="text" placeholder="Khối A, Đại học Bách khoa" className="rounded-lg border px-3 py-2" />
        <span className="text-sm text-slate-500">Cách nhau bằng dấu phẩy.</span>
      </label>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang tạo tài khoản…" : "Tạo tài khoản"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Viết `src/components/auth/SignInForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, authErrorMessage } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    try {
      await signIn(String(form.get("email") ?? ""), String(form.get("password") ?? ""));
      router.push(params.get("tiep-tuc") ?? "/tien-trinh");
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="rounded-lg border px-3 py-2" />
      </label>
      <label className="flex flex-col gap-1">
        <span>Mật khẩu</span>
        <input name="password" type="password" required autoComplete="current-password" className="rounded-lg border px-3 py-2" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
      </button>
    </form>
  );
}
```

- [ ] **Step 7: Viết các trang và layout**

`src/app/(public)/dang-ky/page.tsx`:

```tsx
import { SignUpForm } from "@/components/auth/SignUpForm";

export const metadata = { title: "Đăng ký · ExamCalm" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Tạo tài khoản</h1>
      <p className="mb-6 text-slate-600">
        Có tài khoản, bạn lưu được kết quả test và nhật ký cảm xúc để xem lại thay đổi theo thời gian.
      </p>
      <SignUpForm />
    </main>
  );
}
```

`src/app/(public)/dang-nhap/page.tsx`:

```tsx
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata = { title: "Đăng nhập · ExamCalm" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Đăng nhập</h1>
      <Suspense fallback={<p>Đang tải…</p>}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
```

`src/app/(public)/xac-thuc-email/page.tsx`:

```tsx
import { VerifyEmailNotice } from "@/components/auth/VerifyEmailNotice";

export const metadata = { title: "Xác thực email · ExamCalm" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">Kiểm tra hộp thư nhé</h1>
      <p className="mb-6 text-slate-600">
        Mình vừa gửi một email xác thực. Bấm vào link trong email rồi quay lại đây,
        bạn sẽ lưu được kết quả test và nhật ký cảm xúc.
      </p>
      <VerifyEmailNotice />
    </main>
  );
}
```

`src/components/auth/VerifyEmailNotice.tsx`:

```tsx
"use client";

import { useState } from "react";
import { resendVerificationEmail, authErrorMessage } from "@/lib/auth-client";

export function VerifyEmailNotice() {
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleResend() {
    try {
      await resendVerificationEmail();
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setMessage(authErrorMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button onClick={handleResend} className="rounded-lg border px-4 py-2">
        Gửi lại email xác thực
      </button>
      {status === "sent" && <p role="status" className="text-teal-700">Đã gửi lại. Bạn kiểm tra cả hộp thư spam nhé.</p>}
      {status === "error" && <p role="alert" className="text-rose-700">{message}</p>}
    </div>
  );
}
```

`src/app/(student)/layout.tsx` — đây mới là **lớp bảo vệ thật** ở phía server:

```tsx
import { requireUser } from "@/lib/firebase/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <>{children}</>;
}
```

- [ ] **Step 8: Kiểm thử thủ công trên Emulator**

Chạy `npm run emu` ở một terminal, `npm run dev` ở terminal khác. Mở http://localhost:3000/dang-ky, tạo một tài khoản.

Expected:
- Emulator UI (http://localhost:4000) → tab Authentication thấy user mới
- Tab Firestore thấy doc `users/{uid}` với `role: "student"`
- Tab Authentication → user → thấy link xác thực email (Emulator in link ra log thay vì gửi thật)
- Truy cập `/tien-trinh` khi chưa đăng nhập → bị chuyển về `/dang-nhap`

- [ ] **Step 9: Commit**

```bash
git add src/lib/auth-client.ts src/components/auth src/app/\(public\)/dang-ky src/app/\(public\)/dang-nhap src/app/\(public\)/xac-thuc-email src/app/\(student\)/layout.tsx
git commit -m "feat(auth): luồng đăng ký/đăng nhập/xác thực email và tạo hồ sơ học sinh"
```

---

## Task 12: Làm test lo âu — luồng Guest

**Files:**
- Create: `src/components/test/SampleContentBanner.tsx`, `src/components/test/TestRunner.tsx`, `src/components/test/TestResult.tsx`, `src/lib/guest-storage.ts`, `src/app/(public)/test/page.tsx`, `src/app/(public)/test/[testId]/page.tsx`
- Test: `src/components/test/TestRunner.test.tsx`, `src/lib/guest-storage.test.ts`

**Interfaces:**
- Consumes: `calculateScore`, `resolveLevel`, `isComplete` (Task 7); `getPublishedTest`, `listPublishedTests` (Task 9); `TestDefinition`, `Question` (Task 6)
- Produces:
  - `saveGuestResult(result)`, `loadGuestResult(testId)`, `clearGuestResults()` trong `src/lib/guest-storage.ts`
  - `<TestRunner test onComplete />`, `<TestResult ... />`, `<SampleContentBanner />`

- [ ] **Step 1: Viết test FAILING cho `guest-storage`**

Tạo `src/lib/guest-storage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { saveGuestResult, loadGuestResult, clearGuestResults } from "./guest-storage";

const RESULT = {
  testId: "t1", testVersion: 1, answers: { q1: 1 },
  score: 1, level: "thap", completedAt: "2026-08-22T10:00:00.000Z",
};

beforeEach(() => { sessionStorage.clear(); });

describe("guest-storage", () => {
  it("lưu và đọc lại được kết quả", () => {
    saveGuestResult(RESULT);
    expect(loadGuestResult("t1")).toEqual(RESULT);
  });

  it("trả về null khi chưa có kết quả cho test đó", () => {
    expect(loadGuestResult("khong-ton-tai")).toBeNull();
  });

  it("dùng sessionStorage chứ KHÔNG dùng localStorage", () => {
    saveGuestResult(RESULT);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBeGreaterThan(0);
  });

  it("xóa sạch được kết quả", () => {
    saveGuestResult(RESULT);
    clearGuestResults();
    expect(loadGuestResult("t1")).toBeNull();
  });

  it("trả về null khi dữ liệu trong storage bị hỏng", () => {
    sessionStorage.setItem("examcalm:guest-results", "{khong-phai-json");
    expect(loadGuestResult("t1")).toBeNull();
  });
});
```

- [ ] **Step 2: Viết test FAILING cho `TestRunner`**

Tạo `src/components/test/TestRunner.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestRunner } from "./TestRunner";
import type { TestDefinition } from "@/lib/types/test";

const TEST: TestDefinition & { id: string } = {
  id: "t1",
  title: "Test lo âu (mẫu)",
  version: 1,
  status: "published",
  isSampleContent: true,
  questions: [
    { id: "q1", text: "Bạn có khó ngủ?", options: [
      { label: "Không", score: 0 }, { label: "Có", score: 2 },
    ]},
    { id: "q2", text: "Bạn có hay lo lắng?", options: [
      { label: "Không", score: 0 }, { label: "Có", score: 2 },
    ]},
  ],
  scoring: { thresholds: [
    { min: 0, max: 1, level: "thap", interpretation: "Mức thấp." },
    { min: 2, max: 4, level: "cao", interpretation: "Mức cao." },
  ]},
  disclaimer: "Đây không phải chẩn đoán y khoa.",
  updatedBy: "admin-1",
};

describe("TestRunner", () => {
  it("hiển thị banner nội dung mẫu khi isSampleContent = true", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/Nội dung mẫu/i)).toBeInTheDocument();
  });

  it("KHÔNG hiển thị banner khi isSampleContent = false", () => {
    render(<TestRunner test={{ ...TEST, isSampleContent: false }} onComplete={vi.fn()} />);
    expect(screen.queryByText(/Nội dung mẫu/i)).not.toBeInTheDocument();
  });

  it("luôn hiển thị disclaimer", () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByText(/không phải chẩn đoán y khoa/i)).toBeInTheDocument();
  });

  it("vô hiệu hóa nút nộp khi chưa trả lời hết", async () => {
    render(<TestRunner test={TEST} onComplete={vi.fn()} />);
    expect(screen.getByRole("button", { name: /xem kết quả/i })).toBeDisabled();
  });

  it("gọi onComplete với điểm và mức đúng khi nộp bài", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<TestRunner test={TEST} onComplete={onComplete} />);

    // Chọn "Có" cho cả hai câu — mỗi câu là một nhóm radio riêng
    const yesOptions = screen.getAllByRole("radio", { name: "Có" });
    expect(yesOptions).toHaveLength(2);
    for (const option of yesOptions) await user.click(option);

    await user.click(screen.getByRole("button", { name: /xem kết quả/i }));

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ score: 4, level: "cao", testId: "t1", testVersion: 1 }),
    );
  });
});
```

- [ ] **Step 3: Chạy test — phải FAIL**

Run: `npm test -- test/TestRunner guest-storage`
Expected: FAIL, chưa có module

- [ ] **Step 4: Viết `src/lib/guest-storage.ts`**

```ts
const STORAGE_KEY = "examcalm:guest-results";

export type GuestTestResult = {
  testId: string;
  testVersion: number;
  answers: Record<string, number>;
  score: number;
  level: string;
  completedAt: string;
};

type GuestResultMap = Record<string, GuestTestResult>;

function readAll(): GuestResultMap {
  if (typeof sessionStorage === "undefined") return {};
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as GuestResultMap) : {};
  } catch {
    return {};
  }
}

/** Guest KHÔNG ghi Firestore (spec §7.1) — kết quả chỉ sống trong phiên trình duyệt. */
export function saveGuestResult(result: GuestTestResult): void {
  if (typeof sessionStorage === "undefined") return;
  const all = readAll();
  all[result.testId] = result;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function loadGuestResult(testId: string): GuestTestResult | null {
  return readAll()[testId] ?? null;
}

export function clearGuestResults(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 5: Viết `src/components/test/SampleContentBanner.tsx`**

```tsx
export function SampleContentBanner() {
  return (
    <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
      <strong className="font-semibold">Nội dung mẫu</strong> — chưa thẩm định chuyên môn,
      chỉ dùng để thử nghiệm. Kết quả không phản ánh tình trạng thật của bạn.
    </div>
  );
}
```

- [ ] **Step 6: Viết `src/components/test/TestRunner.tsx`**

```tsx
"use client";

import { useState } from "react";
import { calculateScore, resolveLevel, isComplete } from "@/lib/scoring";
import { SampleContentBanner } from "./SampleContentBanner";
import type { TestDefinition } from "@/lib/types/test";

export type CompletedTest = {
  testId: string;
  testVersion: number;
  answers: Record<string, number>;
  score: number;
  level: string;
  interpretation: string;
};

type Props = {
  test: TestDefinition & { id: string };
  onComplete: (result: CompletedTest) => void;
};

export function TestRunner({ test, onComplete }: Props) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const complete = isComplete(test.questions, answers);

  function handleSubmit() {
    const score = calculateScore(test.questions, answers);
    const threshold = resolveLevel(score, test.scoring.thresholds);
    onComplete({
      testId: test.id,
      testVersion: test.version,
      answers,
      score,
      level: threshold?.level ?? "khong-xac-dinh",
      interpretation: threshold?.interpretation ?? "Chưa có diễn giải cho mức điểm này.",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {test.isSampleContent && <SampleContentBanner />}

      <p className="rounded-xl bg-slate-100 px-4 py-3 text-slate-700">{test.disclaimer}</p>

      {test.questions.map((question, index) => (
        <fieldset key={question.id} className="flex flex-col gap-2">
          <legend className="mb-1 font-medium">
            {index + 1}. {question.text}
          </legend>
          {question.options.map((option, optionIndex) => (
            <label key={optionIndex} className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <input
                type="radio"
                name={question.id}
                value={optionIndex}
                checked={answers[question.id] === optionIndex}
                onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: optionIndex }))}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ))}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!complete}
        className="rounded-lg bg-teal-600 px-4 py-3 font-medium text-white disabled:opacity-50"
      >
        Xem kết quả
      </button>
      {!complete && (
        <p className="text-sm text-slate-500">Bạn trả lời hết các câu để xem kết quả nhé.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Viết `src/components/test/TestResult.tsx`**

```tsx
import Link from "next/link";
import type { CompletedTest } from "./TestRunner";

type Props = {
  result: CompletedTest;
  disclaimer: string;
  isSampleContent: boolean;
  /** Guest thấy CTA đăng ký; Student thấy thông báo đã lưu. */
  isSignedIn: boolean;
};

export function TestResult({ result, disclaimer, isSampleContent, isSignedIn }: Props) {
  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-2xl bg-teal-50 px-5 py-6">
        <p className="text-slate-600">Tổng điểm của bạn</p>
        <p className="text-4xl font-semibold text-teal-800">{result.score}</p>
        <p className="mt-3 text-slate-800">{result.interpretation}</p>
      </div>

      {isSampleContent && (
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          Đây là <strong>nội dung mẫu chưa thẩm định</strong>. Đừng dùng kết quả này để đánh giá bản thân.
        </p>
      )}

      <p className="rounded-xl bg-slate-100 px-4 py-3 text-slate-700">{disclaimer}</p>

      <div className="flex flex-col gap-2">
        <h2 className="font-medium">Bạn có thể làm gì tiếp</h2>
        <Link href="/thu-vien" className="rounded-lg border px-4 py-3">
          Đọc thư viện kỹ thuật thư giãn
        </Link>
        {!isSignedIn && (
          <Link href="/dang-ky" className="rounded-lg bg-teal-600 px-4 py-3 text-center font-medium text-white">
            Đăng ký để lưu kết quả và xem thay đổi theo thời gian
          </Link>
        )}
        {isSignedIn && (
          <p className="text-slate-600">Kết quả đã được lưu vào trang Tiến trình của bạn.</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 8: Viết trang danh sách và trang làm test**

`src/app/(public)/test/page.tsx` (Server Component — Hướng C, đọc bằng Admin SDK):

```tsx
import Link from "next/link";
import { listPublishedTests } from "@/lib/firebase/queries-public";

export const metadata = { title: "Bài test · ExamCalm" };
export const revalidate = 300;

export default async function Page() {
  const tests = await listPublishedTests();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Bài test</h1>
      <p className="mb-6 text-slate-600">
        Các bài test giúp bạn hiểu hơn trạng thái của mình. Đây là công cụ tự tìm hiểu,
        không phải công cụ chẩn đoán.
      </p>

      {tests.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
          Chưa có bài test nào được đăng.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tests.map((test) => (
            <li key={test.id}>
              <Link href={`/test/${test.id}`} className="block rounded-xl border px-4 py-4 hover:bg-slate-50">
                <span className="font-medium">{test.title}</span>
                <span className="block text-sm text-slate-500">{test.questions.length} câu hỏi</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

`src/app/(public)/test/[testId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getPublishedTest } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { TestSession } from "@/components/test/TestSession";

export const revalidate = 300;

export default async function Page({ params }: { params: Promise<{ testId: string }> }) {
  const { testId } = await params;
  const test = await getPublishedTest(testId);
  if (!test) notFound();

  const user = await getSessionUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">{test.title}</h1>
      <TestSession
        test={test}
        isSignedIn={Boolean(user)}
        canSave={Boolean(user?.emailVerified)}
      />
    </main>
  );
}
```

- [ ] **Step 9: Viết `src/components/test/TestSession.tsx` (bản Guest — Student thêm ở Task 13)**

```tsx
"use client";

import { useState } from "react";
import { TestRunner, type CompletedTest } from "./TestRunner";
import { TestResult } from "./TestResult";
import { saveGuestResult } from "@/lib/guest-storage";
import type { TestDefinition } from "@/lib/types/test";

type Props = {
  test: TestDefinition & { id: string };
  isSignedIn: boolean;
  canSave: boolean;
};

export function TestSession({ test, isSignedIn, canSave }: Props) {
  const [result, setResult] = useState<CompletedTest | null>(null);

  function handleComplete(completed: CompletedTest) {
    setResult(completed);
    if (!isSignedIn) {
      saveGuestResult({
        testId: completed.testId,
        testVersion: completed.testVersion,
        answers: completed.answers,
        score: completed.score,
        level: completed.level,
        completedAt: new Date().toISOString(),
      });
    }
    // Lưu vào Firestore cho Student: thêm ở Task 13.
    void canSave;
  }

  if (result) {
    return (
      <TestResult
        result={result}
        disclaimer={test.disclaimer}
        isSampleContent={test.isSampleContent}
        isSignedIn={isSignedIn}
      />
    );
  }

  return <TestRunner test={test} onComplete={handleComplete} />;
}
```

- [ ] **Step 10: Chạy test — phải PASS**

Run: `npm test && npm run typecheck`
Expected: tất cả pass

- [ ] **Step 11: Commit**

```bash
git add src/components/test src/lib/guest-storage.ts src/lib/guest-storage.test.ts src/app/\(public\)/test
git commit -m "feat(test): luồng làm test cho Guest, banner nội dung mẫu, kết quả chỉ lưu sessionStorage"
```

---

## Task 13: Lưu lượt làm bài cho Student

**Files:**
- Create: `src/lib/firestore/attempts.ts`
- Modify: `src/components/test/TestSession.tsx`, `src/components/test/TestResult.tsx`
- Test: `src/components/test/TestSession.test.tsx`

**Interfaces:**
- Consumes: `getDb()` (Task 8); `CompletedTest` (Task 12); `TestAttempt` (Task 6)
- Produces:
  - `saveTestAttempt(uid, completed): Promise<string>` — trả về **id** của doc `testAttempts` vừa tạo
  - `listMyAttempts(uid, max?): Promise<AttemptRecord[]>` với `AttemptRecord = TestAttempt & { id: string; createdAt: Date | null }`

**Về offline persistence:** `addDoc` trả về ngay khi ghi vào IndexedDB, chưa cần server phản hồi. Vì vậy **không** `await` việc đồng bộ lên server — UI hiển thị kết quả liền, SDK tự gửi khi có mạng (spec §7.4).

- [ ] **Step 1: Viết test FAILING cho `TestSession`**

Tạo `src/components/test/TestSession.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestSession } from "./TestSession";
import { saveTestAttempt } from "@/lib/firestore/attempts";
import { loadGuestResult } from "@/lib/guest-storage";
import type { TestDefinition } from "@/lib/types/test";

vi.mock("@/lib/firestore/attempts", () => ({
  saveTestAttempt: vi.fn().mockResolvedValue("attempt-1"),
  listMyAttempts: vi.fn().mockResolvedValue([]),
}));

const TEST: TestDefinition & { id: string } = {
  id: "t1", title: "Test mẫu", version: 1, status: "published", isSampleContent: false,
  questions: [{ id: "q1", text: "Bạn có lo lắng?", options: [
    { label: "Không", score: 0 }, { label: "Có", score: 2 },
  ]}],
  scoring: { thresholds: [
    { min: 0, max: 1, level: "thap", interpretation: "Mức thấp." },
    { min: 2, max: 2, level: "cao", interpretation: "Mức cao." },
  ]},
  disclaimer: "Không phải chẩn đoán.",
  updatedBy: "admin-1",
};

async function completeTest() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: "Có" }));
  await user.click(screen.getByRole("button", { name: /xem kết quả/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe("TestSession", () => {
  it("Guest: KHÔNG gọi saveTestAttempt và lưu vào sessionStorage", async () => {
    render(<TestSession test={TEST} uid={null} isSignedIn={false} canSave={false} />);
    await completeTest();

    expect(saveTestAttempt).not.toHaveBeenCalled();
    expect(loadGuestResult("t1")?.score).toBe(2);
  });

  it("Student đã verify: gọi saveTestAttempt và KHÔNG ghi sessionStorage", async () => {
    render(<TestSession test={TEST} uid="u1" isSignedIn canSave />);
    await completeTest();

    expect(saveTestAttempt).toHaveBeenCalledWith("u1", expect.objectContaining({ score: 2, level: "cao" }));
    expect(loadGuestResult("t1")).toBeNull();
  });

  it("Student CHƯA verify email: không lưu, hiện lời nhắc xác thực", async () => {
    render(<TestSession test={TEST} uid="u1" isSignedIn canSave={false} />);
    await completeTest();

    expect(saveTestAttempt).not.toHaveBeenCalled();
    expect(screen.getByText(/xác thực email/i)).toBeInTheDocument();
  });

  it("vẫn hiện kết quả cho Student ngay cả khi lưu thất bại", async () => {
    vi.mocked(saveTestAttempt).mockRejectedValueOnce(new Error("mạng lỗi"));
    render(<TestSession test={TEST} uid="u1" isSignedIn canSave />);
    await completeTest();

    expect(await screen.findByText("2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- TestSession`
Expected: FAIL — `TestSession` chưa nhận prop `uid`, chưa có module `attempts`

- [ ] **Step 3: Viết `src/lib/firestore/attempts.ts`**

```ts
"use client";

import {
  addDoc, collection, getDocs, limit as fbLimit,
  orderBy, query, serverTimestamp, where, Timestamp,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import type { TestAttempt } from "@/lib/types/test";
import type { CompletedTest } from "@/components/test/TestRunner";

export type AttemptRecord = TestAttempt & { id: string; createdAt: Date | null };

/**
 * Ghi lượt làm bài. Với offline persistence, promise này resolve ngay khi
 * dữ liệu vào IndexedDB — không đợi server.
 */
export async function saveTestAttempt(uid: string, completed: CompletedTest): Promise<string> {
  const ref = await addDoc(collection(getDb(), "testAttempts"), {
    userId: uid,
    testId: completed.testId,
    testVersion: completed.testVersion,
    answers: completed.answers,
    score: completed.score,
    level: completed.level,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listMyAttempts(uid: string, max = 50): Promise<AttemptRecord[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "testAttempts"),
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
      userId: data.userId as string,
      testId: data.testId as string,
      testVersion: data.testVersion as number,
      answers: data.answers as Record<string, number>,
      score: data.score as number,
      level: data.level as string,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}
```

- [ ] **Step 4: Cập nhật `src/components/test/TestSession.tsx`**

```tsx
"use client";

import { useState } from "react";
import { TestRunner, type CompletedTest } from "./TestRunner";
import { TestResult } from "./TestResult";
import { saveGuestResult } from "@/lib/guest-storage";
import { saveTestAttempt } from "@/lib/firestore/attempts";
import type { TestDefinition } from "@/lib/types/test";

type Props = {
  test: TestDefinition & { id: string };
  uid: string | null;
  isSignedIn: boolean;
  /** true khi user đã đăng nhập VÀ đã xác thực email — rules mới cho ghi. */
  canSave: boolean;
};

export function TestSession({ test, uid, isSignedIn, canSave }: Props) {
  const [result, setResult] = useState<CompletedTest | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  async function handleComplete(completed: CompletedTest) {
    setResult(completed);

    if (canSave && uid) {
      try {
        setAttemptId(await saveTestAttempt(uid, completed));
      } catch {
        // Kết quả vẫn hiện — mất kết nối không được làm hỏng trải nghiệm (spec §7.4).
        setSaveFailed(true);
      }
      return;
    }

    if (!isSignedIn) {
      saveGuestResult({
        testId: completed.testId,
        testVersion: completed.testVersion,
        answers: completed.answers,
        score: completed.score,
        level: completed.level,
        completedAt: new Date().toISOString(),
      });
    }
  }

  if (result) {
    return (
      <>
        <TestResult
          result={result}
          disclaimer={test.disclaimer}
          isSampleContent={test.isSampleContent}
          isSignedIn={isSignedIn}
          savedAttemptId={attemptId}
        />
        {isSignedIn && !canSave && (
          <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
            Bạn cần <strong>xác thực email</strong> thì kết quả mới được lưu lại.
          </p>
        )}
        {saveFailed && (
          <p role="status" className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-slate-700">
            Kết quả đang chờ đồng bộ. Khi có mạng trở lại, mình sẽ tự lưu giúp bạn.
          </p>
        )}
      </>
    );
  }

  return <TestRunner test={test} onComplete={handleComplete} />;
}
```

- [ ] **Step 5: Cập nhật `TestResult.tsx` nhận `savedAttemptId`**

Thêm vào type `Props`:

```tsx
  /** id của doc testAttempts đã lưu; null nếu chưa/không lưu. */
  savedAttemptId?: string | null;
```

Và thay khối `{isSignedIn && (<p …>)}` bằng:

```tsx
        {isSignedIn && savedAttemptId && (
          <p className="text-slate-600">Kết quả đã được lưu vào trang Tiến trình của bạn.</p>
        )}
```

- [ ] **Step 6: Truyền `uid` từ trang test**

Trong `src/app/(public)/test/[testId]/page.tsx`, sửa lời gọi:

```tsx
      <TestSession
        test={test}
        uid={user?.uid ?? null}
        isSignedIn={Boolean(user)}
        canSave={Boolean(user?.emailVerified)}
      />
```

- [ ] **Step 7: Chạy test — phải PASS**

Run: `npm test && npm run typecheck`
Expected: tất cả pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/firestore/attempts.ts src/components/test src/app/\(public\)/test
git commit -m "feat(test): Student lưu testAttempts, chịu được mất mạng, chặn khi chưa xác thực email"
```

---

## Task 14: Nhật ký cảm xúc và mascot mèo

**Files:**
- Create: `src/components/mascot/CatMascot.tsx`, `src/components/mascot/MoodWidget.tsx`, `src/components/mood/MoodForm.tsx`, `src/lib/firestore/moods.ts`, `src/app/(student)/nhat-ky/page.tsx`
- Modify: `src/app/layout.tsx` (gắn widget)
- Test: `src/components/mood/MoodForm.test.tsx`

**Interfaces:**
- Consumes: `getDb()` (Task 8); `moodLogSchema`, `MOOD_ICONS`, `MoodContext` (Task 6)
- Produces:
  - `saveMoodLog(uid, input): Promise<string>` với `input: { moodScore, moodIcon, note, tags, context, linkedActivityRef }`
  - `listMyMoodLogs(uid, max?): Promise<MoodRecord[]>`, `deleteMoodLog(id)`
  - `<CatMascot mood expression />`, `<MoodWidget uid canSave />`, `<MoodForm onSubmit />`

- [ ] **Step 1: Viết test FAILING cho `MoodForm`**

Tạo `src/components/mood/MoodForm.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoodForm } from "./MoodForm";

describe("MoodForm", () => {
  it("mặc định điểm cảm xúc là 5", () => {
    render(<MoodForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("slider", { name: /điểm cảm xúc/i })).toHaveValue("5");
  });

  it("gửi đúng dữ liệu khi lưu", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MoodForm onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: /ghi chú/i }), "Hôm nay ôn được 2 chương");
    await user.click(screen.getByRole("button", { name: /lưu/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ moodScore: 5, note: "Hôm nay ôn được 2 chương", context: "standalone" }),
    );
  });

  it("cho phép lưu khi ghi chú để trống", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MoodForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: /lưu/i }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it("KHÔNG hiển thị chuỗi ngày liên tiếp hay bất kỳ streak nào", () => {
    render(<MoodForm onSubmit={vi.fn()} />);
    expect(screen.queryByText(/streak|chuỗi ngày|ngày liên tiếp/i)).not.toBeInTheDocument();
  });

  it("truyền context và linkedActivityRef khi được cấu hình", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<MoodForm onSubmit={onSubmit} context="after" linkedActivityRef="testAttempts/a1" />);
    await user.click(screen.getByRole("button", { name: /lưu/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ context: "after", linkedActivityRef: "testAttempts/a1" }),
    );
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- MoodForm`
Expected: FAIL, chưa có module

- [ ] **Step 3: Viết `src/lib/firestore/moods.ts`**

```ts
"use client";

import {
  addDoc, collection, deleteDoc, doc, getDocs,
  limit as fbLimit, orderBy, query, serverTimestamp, Timestamp, where,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";
import { moodLogSchema, type MoodContext, type MoodIcon } from "@/lib/types/mood";

export type MoodInput = {
  moodScore: number;
  moodIcon: MoodIcon;
  note: string;
  tags: string[];
  context: MoodContext;
  linkedActivityRef: string | null;
};

export type MoodRecord = MoodInput & { id: string; createdAt: Date | null };

export async function saveMoodLog(uid: string, input: MoodInput): Promise<string> {
  const payload = moodLogSchema.parse({ ...input, userId: uid, imageUrl: null });
  const ref = await addDoc(collection(getDb(), "moodLogs"), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listMyMoodLogs(uid: string, max = 100): Promise<MoodRecord[]> {
  const snap = await getDocs(
    query(
      collection(getDb(), "moodLogs"),
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
      moodScore: data.moodScore as number,
      moodIcon: data.moodIcon as MoodIcon,
      note: data.note as string,
      tags: (data.tags ?? []) as string[],
      context: data.context as MoodContext,
      linkedActivityRef: (data.linkedActivityRef ?? null) as string | null,
      createdAt: createdAt instanceof Timestamp ? createdAt.toDate() : null,
    };
  });
}

export async function deleteMoodLog(logId: string): Promise<void> {
  await deleteDoc(doc(getDb(), "moodLogs", logId));
}
```

- [ ] **Step 4: Viết `src/components/mascot/CatMascot.tsx`**

Mascot thật là TBD ở spec §12 — component này tách riêng để thay asset mà không đụng logic.

```tsx
type Expression = "calm" | "cheer" | "listen";

type Props = {
  expression?: Expression;
  size?: number;
  className?: string;
};

const EAR_TILT: Record<Expression, number> = { calm: 0, cheer: -8, listen: 6 };

/**
 * Mascot placeholder. Tên và visual identity chính thức là TBD (spec §12).
 * Thay asset thật CHỈ cần sửa file này.
 */
export function CatMascot({ expression = "calm", size = 72, className }: Props) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 100 100"
      role="img" aria-label="Mèo đồng hành của ExamCalm"
      className={className}
    >
      <g transform={`rotate(${EAR_TILT[expression]} 50 50)`}>
        <path d="M22 34 L30 12 L46 26 Z" fill="#f6c9a8" />
        <path d="M78 34 L70 12 L54 26 Z" fill="#f6c9a8" />
      </g>
      <circle cx="50" cy="56" r="30" fill="#fbe0cd" />
      <circle cx="39" cy="52" r="4" fill="#3f3a36" />
      <circle cx="61" cy="52" r="4" fill="#3f3a36" />
      <path d="M44 64 Q50 70 56 64" stroke="#3f3a36" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M18 56 H32 M18 62 H32 M68 56 H82 M68 62 H82" stroke="#d9b49b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 5: Viết `src/components/mood/MoodForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { MOOD_ICONS, type MoodContext, type MoodIcon } from "@/lib/types/mood";
import type { MoodInput } from "@/lib/firestore/moods";

const ICON_LABELS: Record<MoodIcon, string> = {
  very_low: "Rất mệt",
  low: "Hơi xuống",
  neutral: "Bình thường",
  calm: "Dễ chịu",
  happy: "Vui",
};

type Props = {
  onSubmit: (input: MoodInput) => Promise<void>;
  context?: MoodContext;
  linkedActivityRef?: string | null;
};

export function MoodForm({ onSubmit, context = "standalone", linkedActivityRef = null }: Props) {
  const [moodScore, setMoodScore] = useState(5);
  const [moodIcon, setMoodIcon] = useState<MoodIcon>("neutral");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        moodScore,
        moodIcon,
        note: note.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        context,
        linkedActivityRef,
      });
      setNote("");
      setTags("");
    } catch {
      setError("Chưa lưu được. Mình sẽ thử lại khi có mạng.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Hôm nay bạn thấy thế nào?</legend>
        <div className="flex flex-wrap gap-2">
          {MOOD_ICONS.map((icon) => (
            <label key={icon} className="flex items-center gap-1 rounded-full border px-3 py-1">
              <input
                type="radio" name="moodIcon" value={icon}
                checked={moodIcon === icon}
                onChange={() => setMoodIcon(icon)}
              />
              <span>{ICON_LABELS[icon]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span>Điểm cảm xúc: {moodScore}/10</span>
        <input
          type="range" min={1} max={10} step={1} value={moodScore}
          aria-label="Điểm cảm xúc"
          onChange={(e) => setMoodScore(Number(e.target.value))}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Ghi chú <span className="text-slate-500">(không bắt buộc)</span></span>
        <textarea
          value={note} onChange={(e) => setNote(e.target.value)}
          maxLength={2000} rows={3} className="rounded-lg border px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span>Thẻ ngữ cảnh <span className="text-slate-500">(không bắt buộc)</span></span>
        <input
          type="text" value={tags} onChange={(e) => setTags(e.target.value)}
          placeholder="ôn thi, mất ngủ" className="rounded-lg border px-3 py-2"
        />
      </label>

      {error && <p role="alert" className="text-slate-700">{error}</p>}

      <button type="submit" disabled={pending} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white disabled:opacity-60">
        {pending ? "Đang lưu…" : "Lưu vào nhật ký"}
      </button>
    </form>
  );
}
```

- [ ] **Step 6: Viết `src/components/mascot/MoodWidget.tsx`**

```tsx
"use client";

import { useState } from "react";
import { CatMascot } from "./CatMascot";
import { MoodForm } from "@/components/mood/MoodForm";
import { saveMoodLog, type MoodInput } from "@/lib/firestore/moods";

type Props = {
  uid: string | null;
  /** đã đăng nhập và đã xác thực email */
  canSave: boolean;
};

/**
 * Widget nổi. Mobile: bám safe-area góc phải dưới (spec §8).
 * Guest bấm vào sẽ thấy lời mời đăng ký thay vì form lưu.
 */
export function MoodWidget({ uid, canSave }: Props) {
  const [open, setOpen] = useState(false);

  async function handleSubmit(input: MoodInput) {
    if (!uid || !canSave) return;
    await saveMoodLog(uid, input);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Mở nhật ký cảm xúc"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full bg-white p-2 shadow-lg motion-safe:transition-transform motion-safe:hover:scale-105"
      >
        <CatMascot expression={open ? "listen" : "calm"} size={56} />
      </button>

      {open && (
        <div
          role="dialog" aria-label="Nhật ký cảm xúc"
          className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-white p-4 shadow-xl"
        >
          {canSave ? (
            <MoodForm onSubmit={handleSubmit} />
          ) : (
            <div className="flex flex-col gap-3">
              <p>Ghi lại cảm xúc để xem nó thay đổi thế nào theo thời gian.</p>
              <a href="/dang-ky" className="rounded-lg bg-teal-600 px-4 py-2 text-center font-medium text-white">
                Đăng ký để lưu nhật ký
              </a>
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Gắn widget vào layout gốc**

Trong `src/app/layout.tsx`, biến layout thành async Server Component và truyền session xuống:

```tsx
import { getSessionUser } from "@/lib/firebase/session";
import { MoodWidget } from "@/components/mascot/MoodWidget";
import { FirebaseBootstrap } from "@/components/FirebaseBootstrap";
import "./globals.css";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <FirebaseBootstrap />
        {children}
        <MoodWidget uid={user?.uid ?? null} canSave={Boolean(user?.emailVerified)} />
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Viết trang nhật ký `src/app/(student)/nhat-ky/page.tsx`**

```tsx
import { requireUser } from "@/lib/firebase/session";
import { MoodHistory } from "@/components/mood/MoodHistory";

export const metadata = { title: "Nhật ký cảm xúc · ExamCalm" };

export default async function Page() {
  const user = await requireUser();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Nhật ký cảm xúc</h1>
      <p className="mb-6 text-slate-600">
        Chỉ mình bạn đọc được những gì ghi ở đây.
      </p>
      <MoodHistory uid={user.uid} />
    </main>
  );
}
```

`src/components/mood/MoodHistory.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { listMyMoodLogs, deleteMoodLog, type MoodRecord } from "@/lib/firestore/moods";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium", timeStyle: "short",
});

export function MoodHistory({ uid }: { uid: string }) {
  const [logs, setLogs] = useState<MoodRecord[] | null>(null);

  useEffect(() => {
    listMyMoodLogs(uid).then(setLogs).catch(() => setLogs([]));
  }, [uid]);

  async function handleDelete(id: string) {
    await deleteMoodLog(id);
    setLogs((prev) => prev?.filter((l) => l.id !== id) ?? null);
  }

  if (logs === null) {
    return <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />;
  }

  if (logs.length === 0) {
    return (
      <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
        Chưa có ghi chép nào. Bấm vào mèo ở góc màn hình để ghi lần đầu nhé.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {logs.map((log) => (
        <li key={log.id} className="rounded-xl border bg-white px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{log.moodScore}/10</span>
            <span className="text-sm text-slate-500">
              {log.createdAt ? dateFormatter.format(log.createdAt) : "Đang đồng bộ…"}
            </span>
          </div>
          {log.note && <p className="mt-1 text-slate-700">{log.note}</p>}
          {log.tags.length > 0 && (
            <p className="mt-1 text-sm text-slate-500">{log.tags.join(" · ")}</p>
          )}
          <button
            type="button" onClick={() => handleDelete(log.id)}
            className="mt-2 text-sm text-slate-500 underline"
          >
            Xóa ghi chép này
          </button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 9: Chạy test — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 10: Commit**

```bash
git add src/components/mascot src/components/mood src/lib/firestore/moods.ts src/app/\(student\)/nhat-ky src/app/layout.tsx
git commit -m "feat(mood): mascot mèo, widget nhật ký cảm xúc và trang lịch sử riêng tư"
```

---

## Task 15: Thư viện tài nguyên (public, Server Component)

**Files:**
- Create: `src/lib/video.ts`, `src/components/library/ResourceCard.tsx`, `src/components/library/VideoEmbed.tsx`, `src/app/(public)/thu-vien/page.tsx`, `src/app/(public)/thu-vien/[slug]/page.tsx`
- Test: `src/lib/video.test.ts`

**Interfaces:**
- Consumes: `listPublishedResources`, `getResourceBySlug` (Task 9); `getSessionUser` (Task 10)
- Produces: `getYouTubeEmbedUrl(url): string | null`, `<ResourceCard resource />`, `<VideoEmbed url title />`

**Allowlist domain** (spec §10.3 của PRD): chỉ nhúng từ `youtube.com`, `www.youtube.com`, `youtu.be`, `www.youtube-nocookie.com`. Mọi URL khác trả `null` và UI hiện link mở ngoài thay vì iframe.

- [ ] **Step 1: Viết test FAILING cho allowlist video**

Tạo `src/lib/video.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getYouTubeEmbedUrl } from "./video";

describe("getYouTubeEmbedUrl", () => {
  it("chuyển link watch thành link nhúng nocookie", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=abc123XYZ_-"))
      .toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
  });

  it("chấp nhận link rút gọn youtu.be", () => {
    expect(getYouTubeEmbedUrl("https://youtu.be/abc123XYZ_-"))
      .toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
  });

  it("chấp nhận sẵn link /embed/", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/embed/abc123XYZ_-"))
      .toBe("https://www.youtube-nocookie.com/embed/abc123XYZ_-");
  });

  it("từ chối domain ngoài allowlist", () => {
    expect(getYouTubeEmbedUrl("https://vimeo.com/12345")).toBeNull();
    expect(getYouTubeEmbedUrl("https://evil.com/watch?v=abc123XYZ_-")).toBeNull();
  });

  it("từ chối domain giả mạo chứa chuỗi youtube", () => {
    expect(getYouTubeEmbedUrl("https://youtube.com.evil.com/watch?v=abc123XYZ_-")).toBeNull();
  });

  it("từ chối javascript: và dữ liệu rác", () => {
    expect(getYouTubeEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(getYouTubeEmbedUrl("khong-phai-url")).toBeNull();
    expect(getYouTubeEmbedUrl("")).toBeNull();
  });

  it("từ chối video id sai định dạng", () => {
    expect(getYouTubeEmbedUrl("https://www.youtube.com/watch?v=qua-ngan")).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- video`
Expected: FAIL, chưa có module `./video`

- [ ] **Step 3: Viết `src/lib/video.ts`**

```ts
const ALLOWED_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

/** YouTube video id: đúng 11 ký tự trong [A-Za-z0-9_-]. */
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Trả về URL nhúng nocookie nếu URL thuộc allowlist và có video id hợp lệ.
 * Trả null cho mọi trường hợp còn lại — gọi bên ngoài phải xử lý null.
 */
export function getYouTubeEmbedUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  let id: string | null = null;
  if (url.hostname.toLowerCase().endsWith("youtu.be")) {
    id = url.pathname.slice(1);
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else if (url.pathname.startsWith("/embed/")) {
    id = url.pathname.slice("/embed/".length);
  }

  if (!id || !VIDEO_ID.test(id)) return null;
  return `https://www.youtube-nocookie.com/embed/${id}`;
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `npm test -- video`
Expected: 8 passed

- [ ] **Step 5: Cài trình render markdown**

```bash
npm install react-markdown remark-gfm
```

`react-markdown` **không** render raw HTML theo mặc định — đúng điều ta cần, vì nội dung do admin nhập.

- [ ] **Step 6: Viết `src/components/library/ResourceCard.tsx` và `VideoEmbed.tsx`**

```tsx
import Link from "next/link";
import type { ResourceListItem } from "@/lib/firebase/queries-public";

const TYPE_LABEL: Record<ResourceListItem["type"], string> = {
  article: "Bài viết",
  tip: "Mẹo nhỏ",
  video: "Video",
  guide: "Hướng dẫn",
};

export function ResourceCard({ resource }: { resource: ResourceListItem }) {
  return (
    <li>
      <Link href={`/thu-vien/${resource.slug}`} className="block rounded-xl border bg-white px-4 py-4 hover:bg-slate-50">
        <span className="text-sm text-slate-500">{TYPE_LABEL[resource.type]}</span>
        <span className="mt-1 block font-medium">{resource.title}</span>
        {resource.tags.length > 0 && (
          <span className="mt-1 block text-sm text-slate-500">{resource.tags.join(" · ")}</span>
        )}
      </Link>
    </li>
  );
}
```

```tsx
import { getYouTubeEmbedUrl } from "@/lib/video";

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const embedUrl = getYouTubeEmbedUrl(url);

  if (!embedUrl) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl border px-4 py-3 underline">
        Mở video ở tab mới
      </a>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl">
      <iframe
        src={embedUrl} title={title} loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen className="h-full w-full"
      />
    </div>
  );
}
```

- [ ] **Step 7: Viết trang danh sách `src/app/(public)/thu-vien/page.tsx`**

```tsx
import Link from "next/link";
import { listPublishedResources } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { ResourceCard } from "@/components/library/ResourceCard";

export const metadata = {
  title: "Thư viện · ExamCalm",
  description: "Bài viết, mẹo nhỏ và hướng dẫn giúp bạn bớt căng thẳng trước kỳ thi.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ chu_de?: string; the?: string }>;
}) {
  const { chu_de: category, the: tag } = await searchParams;
  const user = await getSessionUser();

  const resources = await listPublishedResources({
    includeStudentOnly: Boolean(user),
    category,
    tag,
  });

  const categories = [...new Set(resources.map((r) => r.category))].sort();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Thư viện</h1>
      <p className="mb-6 text-slate-600">
        Những kỹ thuật ngắn bạn có thể thử ngay hôm nay.
      </p>

      {categories.length > 0 && (
        <nav aria-label="Lọc theo chủ đề" className="mb-6 flex flex-wrap gap-2">
          <Link href="/thu-vien" className="rounded-full border px-3 py-1 text-sm">Tất cả</Link>
          {categories.map((c) => (
            <Link key={c} href={`/thu-vien?chu_de=${encodeURIComponent(c)}`} className="rounded-full border px-3 py-1 text-sm">
              {c}
            </Link>
          ))}
        </nav>
      )}

      {resources.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
          Chưa có nội dung nào ở mục này.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {resources.map((r) => <ResourceCard key={r.id} resource={r} />)}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Viết trang chi tiết `src/app/(public)/thu-vien/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getResourceBySlug } from "@/lib/firebase/queries-public";
import { getSessionUser } from "@/lib/firebase/session";
import { VideoEmbed } from "@/components/library/VideoEmbed";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = await getResourceBySlug(slug);
  return { title: resource ? `${resource.title} · ExamCalm` : "Không tìm thấy · ExamCalm" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  const resource = await getResourceBySlug(slug, Boolean(user));
  if (!resource) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">{resource.title}</h1>

      {resource.videoUrl && (
        <div className="mb-6">
          <VideoEmbed url={resource.videoUrl} title={resource.title} />
        </div>
      )}

      <div className="prose prose-slate max-w-none">
        <Markdown remarkPlugins={[remarkGfm]}>{resource.content}</Markdown>
      </div>
    </main>
  );
}
```

**Lưu ý:** nút "Lưu bài này" được thêm vào trang này ở **Task 16**. Task 15 cố ý chưa import `FavoriteButton` để mỗi task tự build được độc lập.

- [ ] **Step 9: Chạy test và build**

Run: `npm test && npm run typecheck`
Expected: pass (build sẽ pass sau khi có `FavoriteButton` ở Task 16)

- [ ] **Step 10: Commit**

```bash
git add src/lib/video.ts src/lib/video.test.ts src/components/library src/app/\(public\)/thu-vien package.json package-lock.json
git commit -m "feat(library): danh sách + chi tiết tài nguyên, markdown an toàn, nhúng YouTube theo allowlist"
```

---

## Task 16: Lưu tài nguyên yêu thích

**Files:**
- Create: `src/lib/firestore/favorites.ts`, `src/components/library/FavoriteButton.tsx`, `src/app/(student)/da-luu/page.tsx`
- Test: `src/components/library/FavoriteButton.test.tsx`

**Interfaces:**
- Consumes: `getDb()` (Task 8)
- Produces:
  - `toggleFavorite(uid, resourceId): Promise<boolean>` — trả về trạng thái mới (true = đang lưu)
  - `isFavorited(uid, resourceId): Promise<boolean>`, `listFavoriteIds(uid): Promise<string[]>`, `markUsed(uid, resourceId): Promise<void>`

- [ ] **Step 1: Viết test FAILING**

Tạo `src/components/library/FavoriteButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FavoriteButton } from "./FavoriteButton";
import { isFavorited, toggleFavorite } from "@/lib/firestore/favorites";

vi.mock("@/lib/firestore/favorites", () => ({
  isFavorited: vi.fn(),
  toggleFavorite: vi.fn(),
  listFavoriteIds: vi.fn(),
  markUsed: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe("FavoriteButton", () => {
  it("hiện trạng thái chưa lưu khi tải xong", async () => {
    vi.mocked(isFavorited).mockResolvedValue(false);
    render(<FavoriteButton uid="u1" resourceId="r1" />);
    expect(await screen.findByRole("button", { name: /lưu bài này/i })).toBeInTheDocument();
  });

  it("hiện trạng thái đã lưu", async () => {
    vi.mocked(isFavorited).mockResolvedValue(true);
    render(<FavoriteButton uid="u1" resourceId="r1" />);
    expect(await screen.findByRole("button", { name: /bỏ lưu/i })).toBeInTheDocument();
  });

  it("đổi trạng thái khi bấm", async () => {
    vi.mocked(isFavorited).mockResolvedValue(false);
    vi.mocked(toggleFavorite).mockResolvedValue(true);
    const user = userEvent.setup();

    render(<FavoriteButton uid="u1" resourceId="r1" />);
    await user.click(await screen.findByRole("button", { name: /lưu bài này/i }));

    expect(toggleFavorite).toHaveBeenCalledWith("u1", "r1");
    expect(await screen.findByRole("button", { name: /bỏ lưu/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- FavoriteButton`
Expected: FAIL

- [ ] **Step 3: Viết `src/lib/firestore/favorites.ts`**

```ts
"use client";

import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";

function favRef(uid: string, resourceId: string) {
  return doc(getDb(), "users", uid, "favorites", resourceId);
}

export async function isFavorited(uid: string, resourceId: string): Promise<boolean> {
  return (await getDoc(favRef(uid, resourceId))).exists();
}

/** Bật/tắt lưu. Trả về trạng thái SAU khi đổi. */
export async function toggleFavorite(uid: string, resourceId: string): Promise<boolean> {
  const ref = favRef(uid, resourceId);
  if ((await getDoc(ref)).exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { resourceId, savedAt: serverTimestamp(), usedAt: null });
  return true;
}

export async function listFavoriteIds(uid: string): Promise<string[]> {
  const snap = await getDocs(collection(getDb(), "users", uid, "favorites"));
  return snap.docs.map((d) => d.id);
}

/** Đánh dấu "đã dùng" — chỉ ghi khi bài đã được lưu. */
export async function markUsed(uid: string, resourceId: string): Promise<void> {
  const ref = favRef(uid, resourceId);
  if (!(await getDoc(ref)).exists()) return;
  await updateDoc(ref, { usedAt: serverTimestamp() });
}
```

- [ ] **Step 4: Viết `src/components/library/FavoriteButton.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { isFavorited, toggleFavorite } from "@/lib/firestore/favorites";

export function FavoriteButton({ uid, resourceId }: { uid: string; resourceId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    isFavorited(uid, resourceId).then(setSaved).catch(() => setSaved(false));
  }, [uid, resourceId]);

  if (saved === null) {
    return <div aria-busy="true" className="h-10 w-40 animate-pulse rounded-lg bg-slate-200" />;
  }

  async function handleClick() {
    setPending(true);
    try {
      setSaved(await toggleFavorite(uid, resourceId));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button" onClick={handleClick} disabled={pending}
      className="rounded-lg border px-4 py-2 disabled:opacity-60"
    >
      {saved ? "Bỏ lưu bài này" : "Lưu bài này"}
    </button>
  );
}
```

- [ ] **Step 4b: Gắn `FavoriteButton` vào trang chi tiết tài nguyên**

Task 15 cố ý để trống chỗ này. Trong `src/app/(public)/thu-vien/[slug]/page.tsx`, thêm import:

```tsx
import { FavoriteButton } from "@/components/library/FavoriteButton";
```

và chèn ngay sau khối `<div className="prose …">…</div>`:

```tsx
      {user && (
        <div className="mt-8">
          <FavoriteButton uid={user.uid} resourceId={resource.id} />
        </div>
      )}
```

- [ ] **Step 5: Viết trang `src/app/(student)/da-luu/page.tsx`**

```tsx
import { requireUser } from "@/lib/firebase/session";
import { listPublishedResources } from "@/lib/firebase/queries-public";
import { SavedResourceList } from "@/components/library/SavedResourceList";

export const metadata = { title: "Đã lưu · ExamCalm" };

export default async function Page() {
  const user = await requireUser();
  const all = await listPublishedResources({ includeStudentOnly: true, limit: 200 });
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Bài đã lưu</h1>
      <SavedResourceList uid={user.uid} allResources={all} />
    </main>
  );
}
```

`src/components/library/SavedResourceList.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { listFavoriteIds } from "@/lib/firestore/favorites";
import { ResourceCard } from "./ResourceCard";
import type { ResourceListItem } from "@/lib/firebase/queries-public";

export function SavedResourceList({
  uid, allResources,
}: { uid: string; allResources: ResourceListItem[] }) {
  const [ids, setIds] = useState<string[] | null>(null);

  useEffect(() => {
    listFavoriteIds(uid).then(setIds).catch(() => setIds([]));
  }, [uid]);

  if (ids === null) {
    return <div aria-busy="true" className="h-24 animate-pulse rounded-xl bg-slate-200" />;
  }

  const saved = allResources.filter((r) => ids.includes(r.id));
  if (saved.length === 0) {
    return <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Bạn chưa lưu bài nào.</p>;
  }

  return <ul className="flex flex-col gap-3">{saved.map((r) => <ResourceCard key={r.id} resource={r} />)}</ul>;
}
```

- [ ] **Step 6: Chạy test và build — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/firestore/favorites.ts src/components/library src/app/\(student\)/da-luu
git commit -m "feat(library): lưu bài yêu thích và trang danh sách đã lưu"
```

---

## Task 17: Trang Tiến trình

**Files:**
- Create: `src/app/(student)/tien-trinh/page.tsx`, `src/components/progress/ProgressView.tsx`, `src/lib/progress.ts`
- Test: `src/lib/progress.test.ts`

**Interfaces:**
- Consumes: `listMyAttempts` (Task 13), `listMyMoodLogs` (Task 14)
- Produces: `summarizeMood(logs): MoodSummary`, `pairBeforeAfter(logs): MoodPair[]`

**Nhắc lại phạm vi:** đây **không phải** Dashboard cá nhân hóa của PRD 7.2.9 (cần `dashboardRollups`, thuộc Spec #4). Đây là trang lịch sử đơn giản, query trực tiếp vì dữ liệu một user còn nhỏ.

- [ ] **Step 1: Viết test FAILING**

Tạo `src/lib/progress.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeMood, pairBeforeAfter } from "./progress";
import type { MoodRecord } from "@/lib/firestore/moods";

function log(over: Partial<MoodRecord>): MoodRecord {
  return {
    id: "m", moodScore: 5, moodIcon: "neutral", note: "", tags: [],
    context: "standalone", linkedActivityRef: null,
    createdAt: new Date("2026-08-20T10:00:00Z"), ...over,
  };
}

describe("summarizeMood", () => {
  it("trả về null cho danh sách rỗng", () => {
    expect(summarizeMood([])).toBeNull();
  });

  it("tính đúng trung bình và số lượng", () => {
    const s = summarizeMood([log({ moodScore: 4 }), log({ moodScore: 8 })]);
    expect(s).toEqual({ count: 2, average: 6, latest: 4, lowest: 4, highest: 8 });
  });

  it("làm tròn trung bình tới 1 chữ số thập phân", () => {
    const s = summarizeMood([log({ moodScore: 4 }), log({ moodScore: 5 }), log({ moodScore: 5 })]);
    expect(s?.average).toBe(4.7);
  });
});

describe("pairBeforeAfter", () => {
  it("ghép cặp before/after theo linkedActivityRef", () => {
    const pairs = pairBeforeAfter([
      log({ id: "a", context: "before", moodScore: 3, linkedActivityRef: "testAttempts/x" }),
      log({ id: "b", context: "after", moodScore: 6, linkedActivityRef: "testAttempts/x" }),
    ]);
    expect(pairs).toEqual([{ activityRef: "testAttempts/x", before: 3, after: 6, delta: 3 }]);
  });

  it("bỏ qua ghi chép lẻ không có cặp", () => {
    expect(pairBeforeAfter([
      log({ context: "before", linkedActivityRef: "testAttempts/x" }),
    ])).toEqual([]);
  });

  it("bỏ qua ghi chép standalone", () => {
    expect(pairBeforeAfter([log({ context: "standalone" })])).toEqual([]);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- progress`
Expected: FAIL

- [ ] **Step 3: Viết `src/lib/progress.ts`**

```ts
import type { MoodRecord } from "@/lib/firestore/moods";

export type MoodSummary = {
  count: number;
  average: number;
  latest: number;
  lowest: number;
  highest: number;
};

export type MoodPair = {
  activityRef: string;
  before: number;
  after: number;
  delta: number;
};

/** `logs` đã sắp xếp mới nhất trước. */
export function summarizeMood(logs: MoodRecord[]): MoodSummary | null {
  if (logs.length === 0) return null;
  const scores = logs.map((l) => l.moodScore);
  const sum = scores.reduce((a, b) => a + b, 0);
  return {
    count: scores.length,
    average: Math.round((sum / scores.length) * 10) / 10,
    latest: scores[0]!,
    lowest: Math.min(...scores),
    highest: Math.max(...scores),
  };
}

/**
 * Ghép cặp cảm xúc trước/sau cùng một hoạt động.
 * Đây là TƯƠNG QUAN, không phải bằng chứng hoạt động gây ra thay đổi (PRD 7.2.9).
 */
export function pairBeforeAfter(logs: MoodRecord[]): MoodPair[] {
  const before = new Map<string, number>();
  const after = new Map<string, number>();

  for (const log of logs) {
    if (!log.linkedActivityRef) continue;
    if (log.context === "before") before.set(log.linkedActivityRef, log.moodScore);
    if (log.context === "after") after.set(log.linkedActivityRef, log.moodScore);
  }

  const pairs: MoodPair[] = [];
  for (const [ref, beforeScore] of before) {
    const afterScore = after.get(ref);
    if (afterScore === undefined) continue;
    pairs.push({ activityRef: ref, before: beforeScore, after: afterScore, delta: afterScore - beforeScore });
  }
  return pairs;
}
```

- [ ] **Step 4: Viết `src/components/progress/ProgressView.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { listMyAttempts, type AttemptRecord } from "@/lib/firestore/attempts";
import { listMyMoodLogs, type MoodRecord } from "@/lib/firestore/moods";
import { summarizeMood, pairBeforeAfter } from "@/lib/progress";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium" });

export function ProgressView({ uid }: { uid: string }) {
  const [attempts, setAttempts] = useState<AttemptRecord[] | null>(null);
  const [moods, setMoods] = useState<MoodRecord[] | null>(null);

  useEffect(() => {
    listMyAttempts(uid).then(setAttempts).catch(() => setAttempts([]));
    listMyMoodLogs(uid).then(setMoods).catch(() => setMoods([]));
  }, [uid]);

  if (attempts === null || moods === null) {
    return <div aria-busy="true" className="h-40 animate-pulse rounded-xl bg-slate-200" />;
  }

  const summary = summarizeMood(moods);
  const pairs = pairBeforeAfter(moods);

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Cảm xúc gần đây</h2>
        {summary === null ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">
            Chưa có ghi chép nào. Bấm vào mèo ở góc màn hình để bắt đầu.
          </p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Gần nhất</dt><dd className="text-xl">{summary.latest}/10</dd></div>
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Trung bình</dt><dd className="text-xl">{summary.average}/10</dd></div>
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Thấp nhất</dt><dd className="text-xl">{summary.lowest}/10</dd></div>
            <div className="rounded-xl bg-white px-4 py-3"><dt className="text-sm text-slate-500">Số lần ghi</dt><dd className="text-xl">{summary.count}</dd></div>
          </dl>
        )}
      </section>

      {pairs.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-medium">Trước và sau hoạt động</h2>
          <p className="mb-3 text-sm text-slate-500">
            Đây là ghi nhận cảm xúc của chính bạn ở hai thời điểm, không phải bằng chứng
            rằng hoạt động đó tạo ra thay đổi.
          </p>
          <ul className="flex flex-col gap-2">
            {pairs.map((p) => (
              <li key={p.activityRef} className="rounded-xl bg-white px-4 py-3">
                {p.before}/10 → {p.after}/10
                <span className="ml-2 text-slate-500">
                  ({p.delta > 0 ? `+${p.delta}` : p.delta})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Lịch sử làm test</h2>
        {attempts.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Bạn chưa làm bài test nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {attempts.map((a) => (
              <li key={a.id} className="flex items-baseline justify-between rounded-xl bg-white px-4 py-3">
                <span>Điểm {a.score}</span>
                <span className="text-sm text-slate-500">
                  {a.createdAt ? dateFormatter.format(a.createdAt) : "Đang đồng bộ…"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Viết `src/app/(student)/tien-trinh/page.tsx`**

```tsx
import { requireUser } from "@/lib/firebase/session";
import { ProgressView } from "@/components/progress/ProgressView";

export const metadata = { title: "Tiến trình · ExamCalm" };

export default async function Page() {
  const user = await requireUser();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Tiến trình của bạn</h1>
      <p className="mb-8 text-slate-600">
        Đây là những gì bạn tự ghi lại. Không có xếp hạng, không có chuỗi ngày phải giữ.
      </p>
      <ProgressView uid={user.uid} />
    </main>
  );
}
```

- [ ] **Step 6: Chạy test và build — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/progress.ts src/lib/progress.test.ts src/components/progress src/app/\(student\)/tien-trinh
git commit -m "feat(progress): trang tiến trình với lịch sử test, tóm tắt cảm xúc và cặp trước/sau"
```

---

## Task 18: Cloud Functions — gán role, audit log, bootstrap admin

**Files:**
- Create: `functions/src/audit/writeAuditLog.ts`, `functions/src/admin/guards.ts`, `functions/src/admin/setUserRole.ts`, `functions/src/admin/guards.test.ts`, `scripts/bootstrap-admin.ts`
- Modify: `functions/src/index.ts`, `functions/package.json`

**Interfaces:**
- Consumes: Firebase Admin SDK trong `functions`
- Produces:
  - Callable `setUserRole({ targetUid, role })` — chỉ admin gọi được
  - `writeAuditLog(entry: AuditEntry): Promise<void>` dùng chung cho mọi function sau này
  - `assertCallerIsAdmin(auth)`, `setUserRoleInputSchema` — logic thuần, test được không cần Emulator

- [ ] **Step 1: Cài công cụ test cho `functions`**

```bash
cd functions
npm install zod
npm install -D vitest
cd ..
```

Thêm vào `functions/package.json`:

```json
{
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 2: Viết test FAILING cho logic phân quyền**

Tạo `functions/src/admin/guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertCallerIsAdmin, setUserRoleInputSchema, PermissionDeniedError } from "./guards";

describe("assertCallerIsAdmin", () => {
  it("cho phép khi custom claim role là admin", () => {
    expect(() => assertCallerIsAdmin({ uid: "a1", token: { role: "admin" } })).not.toThrow();
  });

  it("từ chối khi chưa đăng nhập", () => {
    expect(() => assertCallerIsAdmin(undefined)).toThrow(PermissionDeniedError);
  });

  it("từ chối student", () => {
    expect(() => assertCallerIsAdmin({ uid: "u1", token: { role: "student" } })).toThrow(PermissionDeniedError);
  });

  it("từ chối khi thiếu claim role", () => {
    expect(() => assertCallerIsAdmin({ uid: "u1", token: {} })).toThrow(PermissionDeniedError);
  });

  it("từ chối khi role là chuỗi gần giống", () => {
    expect(() => assertCallerIsAdmin({ uid: "u1", token: { role: "Admin" } })).toThrow(PermissionDeniedError);
    expect(() => assertCallerIsAdmin({ uid: "u1", token: { role: "admin " } })).toThrow(PermissionDeniedError);
  });
});

describe("setUserRoleInputSchema", () => {
  it("chấp nhận role hợp lệ", () => {
    expect(setUserRoleInputSchema.safeParse({ targetUid: "u1", role: "admin" }).success).toBe(true);
    expect(setUserRoleInputSchema.safeParse({ targetUid: "u1", role: "student" }).success).toBe(true);
  });

  it("từ chối role không nằm trong danh sách", () => {
    expect(setUserRoleInputSchema.safeParse({ targetUid: "u1", role: "superadmin" }).success).toBe(false);
  });

  it("từ chối targetUid rỗng", () => {
    expect(setUserRoleInputSchema.safeParse({ targetUid: "", role: "admin" }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Chạy test — phải FAIL**

Run: `cd functions && npm test && cd ..`
Expected: FAIL, chưa có `./guards`

- [ ] **Step 4: Viết `functions/src/admin/guards.ts`**

```ts
import { z } from "zod";

export class PermissionDeniedError extends Error {
  constructor(message = "Chỉ quản trị viên mới thực hiện được thao tác này.") {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

export type CallerAuth = { uid: string; token: Record<string, unknown> } | undefined;

/** Nguồn sự thật duy nhất là custom claim, khớp chính xác chuỗi "admin". */
export function assertCallerIsAdmin(auth: CallerAuth): void {
  if (!auth) throw new PermissionDeniedError("Bạn cần đăng nhập.");
  if (auth.token.role !== "admin") throw new PermissionDeniedError();
}

export const setUserRoleInputSchema = z.object({
  targetUid: z.string().min(1),
  role: z.enum(["student", "admin"]),
});

export type SetUserRoleInput = z.infer<typeof setUserRoleInputSchema>;
```

- [ ] **Step 5: Chạy test — phải PASS**

Run: `cd functions && npm test && cd ..`
Expected: 8 passed

- [ ] **Step 6: Viết `functions/src/audit/writeAuditLog.ts`**

```ts
import { getFirestore, FieldValue } from "firebase-admin/firestore";

export type AuditEntry = {
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
};

/**
 * Ghi audit log. Client KHÔNG ghi được collection này (rules deny mọi write) —
 * chỉ Admin SDK trong Cloud Function mới ghi được.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  await getFirestore().collection("auditLogs").add({
    ...entry,
    timestamp: FieldValue.serverTimestamp(),
  });
}
```

- [ ] **Step 7: Viết `functions/src/admin/setUserRole.ts`**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { assertCallerIsAdmin, setUserRoleInputSchema, PermissionDeniedError } from "./guards";
import { writeAuditLog } from "../audit/writeAuditLog";

export const setUserRole = onCall({ region: "asia-southeast1" }, async (request) => {
  try {
    assertCallerIsAdmin(
      request.auth ? { uid: request.auth.uid, token: request.auth.token } : undefined,
    );
  } catch (error) {
    if (error instanceof PermissionDeniedError) {
      throw new HttpsError("permission-denied", error.message);
    }
    throw error;
  }

  const parsed = setUserRoleInputSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Dữ liệu không hợp lệ.");
  }
  const { targetUid, role } = parsed.data;

  const actorUid = request.auth!.uid;
  if (targetUid === actorUid && role !== "admin") {
    // Chặn admin cuối cùng tự hạ quyền và khóa mình khỏi hệ thống.
    throw new HttpsError("failed-precondition", "Bạn không thể tự bỏ quyền quản trị của mình.");
  }

  const auth = getAuth();
  const targetUser = await auth.getUser(targetUid).catch(() => null);
  if (!targetUser) throw new HttpsError("not-found", "Không tìm thấy tài khoản.");

  const previousRole = (targetUser.customClaims?.role as string | undefined) ?? "student";

  await auth.setCustomUserClaims(targetUid, { ...targetUser.customClaims, role });
  // Thu hồi refresh token để claim mới có hiệu lực ngay ở phiên đang mở.
  await auth.revokeRefreshTokens(targetUid);

  await getFirestore().collection("users").doc(targetUid).set(
    { role, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  await writeAuditLog({
    actorUid,
    action: "setUserRole",
    targetType: "user",
    targetId: targetUid,
    before: { role: previousRole },
    after: { role },
  });

  return { ok: true, role };
});
```

- [ ] **Step 8: Export function trong `functions/src/index.ts`**

```ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { setUserRole } from "./admin/setUserRole";
```

- [ ] **Step 9: Viết `scripts/bootstrap-admin.ts`**

`setUserRole` đòi người gọi đã là admin, nên admin đầu tiên phải được gán ngoài luồng (spec §5.2).

```ts
/**
 * Gán quyền admin ĐẦU TIÊN. Chạy MỘT LẦN, ở máy local.
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
 *   npx tsx scripts/bootstrap-admin.ts <email>
 *
 * Sau khi chạy xong, nên thu hồi service account key.
 */
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
if (!email) {
  console.error("Cách dùng: npx tsx scripts/bootstrap-admin.ts <email>");
  process.exit(1);
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error("Thiếu biến môi trường FIREBASE_SERVICE_ACCOUNT_JSON.");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });

const user = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(user.uid, { ...user.customClaims, role: "admin" });
await getAuth().revokeRefreshTokens(user.uid);
await getFirestore().collection("users").doc(user.uid).set(
  { role: "admin", updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);

console.log(`Đã gán quyền admin cho ${email} (uid ${user.uid}).`);
console.log("Người dùng cần đăng xuất rồi đăng nhập lại để claim mới có hiệu lực.");
```

- [ ] **Step 10: Kiểm chứng trên Emulator**

Chạy `npm run emu`. Ở Emulator UI tạo một user, rồi dùng tab Authentication → user → **Custom claims** để đặt `{"role":"admin"}` thủ công (Emulator không cần service account). Đăng nhập bằng user đó, gọi thử `setUserRole` từ Admin console ở Task 21.

Expected: student bị `permission-denied`; admin gán được role và `auditLogs` có bản ghi mới.

- [ ] **Step 11: Commit**

```bash
git add functions/src scripts/bootstrap-admin.ts functions/package.json functions/package-lock.json
git commit -m "feat(functions): callable setUserRole với audit log, guard theo custom claim, script bootstrap admin"
```

---

## Task 19: Admin console — quản lý bài test

**Files:**
- Create: `src/app/(admin)/layout.tsx`, `src/app/(admin)/admin/page.tsx`, `src/app/(admin)/admin/tests/page.tsx`, `src/components/admin/TestEditor.tsx`, `src/lib/firestore/admin-tests.ts`
- Test: `src/components/admin/TestEditor.test.tsx`

**Interfaces:**
- Consumes: `requireAdmin()` (Task 10); `testDefinitionSchema` (Task 6); `getDb()` (Task 8)
- Produces:
  - `listAllTests()`, `saveTest(testId | null, data)`, `publishTest(testId, publish)` trong `src/lib/firestore/admin-tests.ts`
  - `parseTestDraft(json): { ok: true; value: TestDefinitionDraft } | { ok: false; error: string }`

**Cách nhập nội dung:** editor JSON có validate bằng Zod. Lý do: nội dung test là TBD chuyên môn (spec §12), sẽ được thay bằng thang đo đã thẩm định — một form kéo thả cầu kỳ ở giai đoạn này là công sức bỏ đi. JSON + validate chặt là mức vừa đủ.

- [ ] **Step 1: Viết test FAILING**

Tạo `src/components/admin/TestEditor.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { parseTestDraft } from "@/lib/firestore/admin-tests";

const VALID = JSON.stringify({
  title: "Test lo âu (mẫu)",
  version: 1,
  isSampleContent: true,
  disclaimer: "Đây không phải chẩn đoán y khoa.",
  questions: [{ id: "q1", text: "Bạn có khó ngủ?", options: [
    { label: "Không", score: 0 }, { label: "Có", score: 2 },
  ]}],
  scoring: { thresholds: [{ min: 0, max: 2, level: "thap", interpretation: "Mức thấp." }] },
});

describe("parseTestDraft", () => {
  it("chấp nhận JSON hợp lệ", () => {
    const r = parseTestDraft(VALID);
    expect(r.ok).toBe(true);
  });

  it("báo lỗi rõ ràng khi JSON sai cú pháp", () => {
    const r = parseTestDraft("{khong-phai-json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/JSON/i);
  });

  it("từ chối khi thiếu disclaimer", () => {
    const draft = JSON.parse(VALID);
    delete draft.disclaimer;
    expect(parseTestDraft(JSON.stringify(draft)).ok).toBe(false);
  });

  it("từ chối câu hỏi chỉ có 1 lựa chọn", () => {
    const draft = JSON.parse(VALID);
    draft.questions[0].options = [{ label: "Không", score: 0 }];
    expect(parseTestDraft(JSON.stringify(draft)).ok).toBe(false);
  });

  it("từ chối khi hai câu hỏi trùng id", () => {
    const draft = JSON.parse(VALID);
    draft.questions.push({ ...draft.questions[0] });
    const r = parseTestDraft(JSON.stringify(draft));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/trùng/i);
  });

  it("từ chối khi ngưỡng có min lớn hơn max", () => {
    const draft = JSON.parse(VALID);
    draft.scoring.thresholds = [{ min: 5, max: 1, level: "x", interpretation: "X" }];
    const r = parseTestDraft(JSON.stringify(draft));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ngưỡng/i);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- TestEditor`
Expected: FAIL

- [ ] **Step 3: Viết `src/lib/firestore/admin-tests.ts`**

```ts
"use client";

import {
  addDoc, collection, doc, getDocs, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { z } from "zod";
import { getDb } from "@/lib/firebase/client";
import { questionSchema, thresholdSchema, type TestDefinition } from "@/lib/types/test";

/** Phần admin nhập tay; status/updatedBy/updatedAt do hệ thống đặt. */
export const testDraftSchema = z.object({
  title: z.string().min(1),
  version: z.number().int().min(1),
  isSampleContent: z.boolean(),
  disclaimer: z.string().min(1),
  questions: z.array(questionSchema),
  scoring: z.object({ thresholds: z.array(thresholdSchema) }),
});

export type TestDefinitionDraft = z.infer<typeof testDraftSchema>;
export type TestRecord = TestDefinition & { id: string };
export type ParseResult =
  | { ok: true; value: TestDefinitionDraft }
  | { ok: false; error: string };

export function parseTestDraft(json: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "JSON sai cú pháp. Kiểm tra lại dấu ngoặc và dấu phẩy." };
  }

  const parsed = testDraftSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") || "dữ liệu"}: ${issue?.message}` };
  }

  const ids = parsed.data.questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: "Có câu hỏi trùng id. Mỗi câu cần một id riêng." };
  }

  const badThreshold = parsed.data.scoring.thresholds.find((t) => t.min > t.max);
  if (badThreshold) {
    return { ok: false, error: `Ngưỡng "${badThreshold.level}" có min lớn hơn max.` };
  }

  return { ok: true, value: parsed.data };
}

export async function listAllTests(): Promise<TestRecord[]> {
  const snap = await getDocs(collection(getDb(), "testDefinitions"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TestDefinition) }));
}

export async function saveTest(
  testId: string | null,
  draft: TestDefinitionDraft,
  adminUid: string,
): Promise<string> {
  const payload = { ...draft, updatedBy: adminUid, updatedAt: serverTimestamp() };

  if (testId) {
    await updateDoc(doc(getDb(), "testDefinitions", testId), payload);
    return testId;
  }
  const ref = await addDoc(collection(getDb(), "testDefinitions"), {
    ...payload,
    status: "draft",
  });
  return ref.id;
}

export async function publishTest(testId: string, publish: boolean): Promise<void> {
  await updateDoc(doc(getDb(), "testDefinitions", testId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `npm test -- TestEditor`
Expected: 6 passed

- [ ] **Step 5: Viết `src/app/(admin)/layout.tsx` — lớp bảo vệ thật cho khu vực admin**

```tsx
import Link from "next/link";
import { requireAdmin } from "@/lib/firebase/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <nav aria-label="Quản trị" className="mb-8 flex flex-wrap gap-3 border-b pb-4">
        <Link href="/admin/tests" className="underline">Bài test</Link>
        <Link href="/admin/thu-vien" className="underline">Thư viện</Link>
        <Link href="/admin/nguoi-dung" className="underline">Người dùng</Link>
        <Link href="/admin/nhat-ky-he-thong" className="underline">Nhật ký hệ thống</Link>
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Viết `src/components/admin/TestEditor.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  listAllTests, parseTestDraft, publishTest, saveTest, type TestRecord,
} from "@/lib/firestore/admin-tests";

const EMPTY_DRAFT = JSON.stringify(
  {
    title: "Test lo âu (mẫu)",
    version: 1,
    isSampleContent: true,
    disclaimer: "Kết quả chỉ mang tính tham khảo, không phải chẩn đoán y khoa hay tâm lý.",
    questions: [
      { id: "q1", text: "Câu hỏi mẫu 1", options: [
        { label: "Không bao giờ", score: 0 },
        { label: "Thỉnh thoảng", score: 1 },
        { label: "Thường xuyên", score: 2 },
      ]},
    ],
    scoring: { thresholds: [
      { min: 0, max: 1, level: "thap", interpretation: "Diễn giải mẫu cho mức thấp." },
      { min: 2, max: 2, level: "cao", interpretation: "Diễn giải mẫu cho mức cao." },
    ]},
  },
  null, 2,
);

export function TestEditor({ adminUid }: { adminUid: string }) {
  const [tests, setTests] = useState<TestRecord[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [json, setJson] = useState(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setTests(await listAllTests());
  }

  useEffect(() => { void reload(); }, []);

  async function handleSave() {
    setError(null);
    setMessage(null);

    const parsed = parseTestDraft(json);
    if (!parsed.ok) { setError(parsed.error); return; }

    try {
      const id = await saveTest(editingId, parsed.value, adminUid);
      setEditingId(id);
      setMessage("Đã lưu bản nháp.");
      await reload();
    } catch {
      setError("Không lưu được. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  function handleEdit(test: TestRecord) {
    setEditingId(test.id);
    setJson(JSON.stringify({
      title: test.title, version: test.version, isSampleContent: test.isSampleContent,
      disclaimer: test.disclaimer, questions: test.questions, scoring: test.scoring,
    }, null, 2));
  }

  async function handleTogglePublish(test: TestRecord) {
    await publishTest(test.id, test.status !== "published");
    await reload();
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Danh sách bài test</h2>
        {tests === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : tests.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có bài test nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <span className="font-medium">{t.title}</span>
                <span className="text-sm text-slate-500">v{t.version} · {t.status}</span>
                {t.isSampleContent && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">nội dung mẫu</span>
                )}
                <button type="button" onClick={() => handleEdit(t)} className="ml-auto underline">Sửa</button>
                <button type="button" onClick={() => handleTogglePublish(t)} className="underline">
                  {t.status === "published" ? "Gỡ đăng" : "Đăng"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">
          {editingId ? "Sửa bài test" : "Tạo bài test mới"}
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Nội dung chuyên môn nằm ở đây, không nằm trong code. Khi có thang đo đã thẩm định,
          chỉ cần dán vào ô này.
        </p>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Nội dung bài test dạng JSON</span>
          <textarea
            value={json} onChange={(e) => setJson(e.target.value)}
            rows={22} spellCheck={false}
            aria-label="Nội dung bài test dạng JSON"
            className="w-full rounded-lg border p-3 font-mono text-sm"
          />
        </label>

        {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{message}</p>}

        <div className="mt-3 flex gap-3">
          <button type="button" onClick={handleSave} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
            Lưu bản nháp
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setJson(EMPTY_DRAFT); }}
              className="rounded-lg border px-4 py-2"
            >
              Tạo bài mới
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Viết `src/app/(admin)/admin/tests/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/firebase/session";
import { TestEditor } from "@/components/admin/TestEditor";

export const metadata = { title: "Quản lý bài test · ExamCalm" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản lý bài test</h1>
      <TestEditor adminUid={admin.uid} />
    </>
  );
}
```

- [ ] **Step 8: Chạy test và build — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 9: Commit**

```bash
git add src/app/\(admin\) src/components/admin/TestEditor.tsx src/lib/firestore/admin-tests.ts
git commit -m "feat(admin): quản lý bài test bằng editor JSON có validate và publish/unpublish"
```

---

## Task 20: Admin console — quản lý thư viện

**Files:**
- Create: `src/app/(admin)/admin/thu-vien/page.tsx`, `src/components/admin/ResourceEditor.tsx`, `src/lib/firestore/admin-resources.ts`, `src/lib/slug.ts`
- Test: `src/lib/slug.test.ts`

**Interfaces:**
- Consumes: `resourceSchema` (Task 6); `requireAdmin()` (Task 10)
- Produces:
  - `toSlug(title): string`
  - `listAllResources()`, `saveResource(id | null, draft, adminUid)`, `publishResource(id, publish)`

- [ ] **Step 1: Viết test FAILING cho `toSlug`**

Tạo `src/lib/slug.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toSlug } from "./slug";

describe("toSlug", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(toSlug("Kỹ thuật thở 4-7-8")).toBe("ky-thuat-tho-4-7-8");
  });

  it("xử lý chữ đ và Đ", () => {
    expect(toSlug("Đi ngủ đúng giờ")).toBe("di-ngu-dung-gio");
  });

  it("chuyển về chữ thường", () => {
    expect(toSlug("THƯ GIÃN")).toBe("thu-gian");
  });

  it("gộp khoảng trắng và ký tự đặc biệt thành một dấu gạch", () => {
    expect(toSlug("Học  tập &  nghỉ ngơi!")).toBe("hoc-tap-nghi-ngoi");
  });

  it("bỏ dấu gạch thừa ở đầu và cuối", () => {
    expect(toSlug("  --Thiền--  ")).toBe("thien");
  });

  it("trả về chuỗi rỗng khi không còn ký tự hợp lệ", () => {
    expect(toSlug("!!!")).toBe("");
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- slug`
Expected: FAIL

- [ ] **Step 3: Viết `src/lib/slug.ts`**

```ts
/** Chuyển tiêu đề tiếng Việt thành slug URL: chữ thường không dấu, nối bằng dấu gạch. */
export function toSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")   // bỏ mọi dấu tổ hợp mà NFD vừa tách rời
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `npm test -- slug`
Expected: 6 passed

- [ ] **Step 5: Viết `src/lib/firestore/admin-resources.ts`**

```ts
"use client";

import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { z } from "zod";
import { getDb } from "@/lib/firebase/client";
import { RESOURCE_TYPES, slugSchema, type Resource } from "@/lib/types/resource";

export const resourceDraftSchema = z.object({
  title: z.string().min(1, "Hãy nhập tiêu đề.").max(200),
  slug: slugSchema,
  type: z.enum(RESOURCE_TYPES),
  category: z.string().min(1, "Hãy nhập chủ đề.").max(60),
  tags: z.array(z.string().max(40)).max(15),
  content: z.string().min(1, "Nội dung không được để trống."),
  videoUrl: z.string().url("Link video không hợp lệ.").nullable(),
  visibility: z.enum(["public", "student_only"]),
});

export type ResourceDraft = z.infer<typeof resourceDraftSchema>;
export type ResourceRecord = Resource & { id: string };

export async function listAllResources(): Promise<ResourceRecord[]> {
  const snap = await getDocs(collection(getDb(), "resources"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Resource) }));
}

/** Trả về true nếu slug đã được bài KHÁC sử dụng. */
export async function isSlugTaken(slug: string, exceptId: string | null): Promise<boolean> {
  const snap = await getDocs(query(collection(getDb(), "resources"), where("slug", "==", slug)));
  return snap.docs.some((d) => d.id !== exceptId);
}

export async function saveResource(
  resourceId: string | null,
  draft: ResourceDraft,
  adminUid: string,
): Promise<string> {
  if (await isSlugTaken(draft.slug, resourceId)) {
    throw new Error(`Slug "${draft.slug}" đã được dùng cho bài khác.`);
  }

  if (resourceId) {
    await updateDoc(doc(getDb(), "resources", resourceId), {
      ...draft, updatedAt: serverTimestamp(),
    });
    return resourceId;
  }

  const ref = await addDoc(collection(getDb(), "resources"), {
    ...draft,
    status: "draft",
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function publishResource(resourceId: string, publish: boolean): Promise<void> {
  await updateDoc(doc(getDb(), "resources", resourceId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 6: Viết `src/components/admin/ResourceEditor.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toSlug } from "@/lib/slug";
import { RESOURCE_TYPES } from "@/lib/types/resource";
import {
  listAllResources, publishResource, resourceDraftSchema, saveResource,
  type ResourceRecord,
} from "@/lib/firestore/admin-resources";

const EMPTY = {
  title: "", slug: "", type: "article" as const, category: "",
  tags: "", content: "", videoUrl: "", visibility: "public" as const,
};

export function ResourceEditor({ adminUid }: { adminUid: string }) {
  const [items, setItems] = useState<ResourceRecord[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() { setItems(await listAllResources()); }
  useEffect(() => { void reload(); }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setError(null); setMessage(null);

    const parsed = resourceDraftSchema.safeParse({
      title: form.title.trim(),
      slug: form.slug.trim() || toSlug(form.title),
      type: form.type,
      category: form.category.trim(),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      content: form.content,
      videoUrl: form.videoUrl.trim() || null,
      visibility: form.visibility,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    try {
      const id = await saveResource(editingId, parsed.data, adminUid);
      setEditingId(id);
      setMessage("Đã lưu bản nháp.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  function handleEdit(item: ResourceRecord) {
    setEditingId(item.id);
    setForm({
      title: item.title, slug: item.slug, type: item.type, category: item.category,
      tags: item.tags.join(", "), content: item.content,
      videoUrl: item.videoUrl ?? "", visibility: item.visibility,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Danh sách tài nguyên</h2>
        {items === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có tài nguyên nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-slate-500">{item.status} · {item.visibility}</span>
                <button type="button" onClick={() => handleEdit(item)} className="ml-auto underline">Sửa</button>
                <button
                  type="button"
                  onClick={async () => { await publishResource(item.id, item.status !== "published"); await reload(); }}
                  className="underline"
                >
                  {item.status === "published" ? "Gỡ đăng" : "Đăng"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{editingId ? "Sửa tài nguyên" : "Tạo tài nguyên mới"}</h2>

        <label className="flex flex-col gap-1">
          <span>Tiêu đề</span>
          <input
            value={form.title}
            onChange={(e) => {
              update("title", e.target.value);
              if (!editingId) update("slug", toSlug(e.target.value));
            }}
            className="rounded-lg border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>Slug (đường dẫn)</span>
          <input value={form.slug} onChange={(e) => update("slug", e.target.value)} className="rounded-lg border px-3 py-2 font-mono text-sm" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Loại</span>
          <select value={form.type} onChange={(e) => update("type", e.target.value as typeof form.type)} className="rounded-lg border px-3 py-2">
            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span>Chủ đề</span>
          <input value={form.category} onChange={(e) => update("category", e.target.value)} className="rounded-lg border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Thẻ (cách nhau bằng dấu phẩy)</span>
          <input value={form.tags} onChange={(e) => update("tags", e.target.value)} className="rounded-lg border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Link video (không bắt buộc — chỉ nhận YouTube)</span>
          <input value={form.videoUrl} onChange={(e) => update("videoUrl", e.target.value)} className="rounded-lg border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Ai xem được</span>
          <select value={form.visibility} onChange={(e) => update("visibility", e.target.value as typeof form.visibility)} className="rounded-lg border px-3 py-2">
            <option value="public">Công khai (cả khách chưa đăng nhập)</option>
            <option value="student_only">Chỉ học sinh đã đăng nhập</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span>Nội dung (Markdown)</span>
          <textarea
            value={form.content} onChange={(e) => update("content", e.target.value)}
            rows={16} className="rounded-lg border p-3 font-mono text-sm"
          />
        </label>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{message}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={handleSave} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
            Lưu bản nháp
          </button>
          {editingId && (
            <button type="button" onClick={() => { setEditingId(null); setForm({ ...EMPTY }); }} className="rounded-lg border px-4 py-2">
              Tạo bài mới
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Viết `src/app/(admin)/admin/thu-vien/page.tsx`**

```tsx
import { requireAdmin } from "@/lib/firebase/session";
import { ResourceEditor } from "@/components/admin/ResourceEditor";

export const metadata = { title: "Quản lý thư viện · ExamCalm" };

export default async function Page() {
  const admin = await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản lý thư viện</h1>
      <ResourceEditor adminUid={admin.uid} />
    </>
  );
}
```

- [ ] **Step 8: Chạy test và build — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 9: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts src/lib/firestore/admin-resources.ts src/components/admin/ResourceEditor.tsx src/app/\(admin\)/admin/thu-vien
git commit -m "feat(admin): CRUD thư viện với slug tiếng Việt tự sinh và kiểm tra trùng"
```

---

## Task 21: Admin console — người dùng và nhật ký hệ thống

**Files:**
- Create: `src/app/(admin)/admin/nguoi-dung/page.tsx`, `src/app/(admin)/admin/nhat-ky-he-thong/page.tsx`, `src/components/admin/UserRoleManager.tsx`, `src/lib/firestore/admin-users.ts`, `src/lib/firebase/functions-client.ts`
- Test: `src/components/admin/UserRoleManager.test.tsx`

**Interfaces:**
- Consumes: callable `setUserRole` (Task 18); `requireAdmin()` (Task 10)
- Produces:
  - `callSetUserRole(targetUid, role): Promise<void>` trong `src/lib/firebase/functions-client.ts`
  - `listUsers(max?)`, `listAuditLogs(max?)` trong `src/lib/firestore/admin-users.ts`

**Ràng buộc quyền riêng tư (spec §1.1 và §6):** trang này **không** hiển thị nội dung `moodLogs` hay `testAttempts` của học sinh. Rules đã chặn admin đọc `moodLogs`; UI cũng không được cố tình vòng qua.

- [ ] **Step 1: Viết test FAILING**

Tạo `src/components/admin/UserRoleManager.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserRoleManager } from "./UserRoleManager";
import { callSetUserRole } from "@/lib/firebase/functions-client";

vi.mock("@/lib/firebase/functions-client", () => ({
  callSetUserRole: vi.fn().mockResolvedValue(undefined),
}));

const USERS = [
  { uid: "u1", nickname: "Mèo con", school: "THPT A", gradeLevel: "12", role: "student" as const },
  { uid: "a1", nickname: "Quản trị", school: "THPT A", gradeLevel: "12", role: "admin" as const },
];

beforeEach(() => vi.clearAllMocks());

describe("UserRoleManager", () => {
  it("liệt kê người dùng cùng vai trò", () => {
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    expect(screen.getByText("Mèo con")).toBeInTheDocument();
    expect(screen.getByText("Quản trị")).toBeInTheDocument();
  });

  it("KHÔNG hiển thị nội dung nhật ký hay điểm test của học sinh", () => {
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    expect(screen.queryByText(/nhật ký|điểm test|mood/i)).not.toBeInTheDocument();
  });

  it("gọi callSetUserRole khi nâng quyền", async () => {
    const user = userEvent.setup();
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    await user.click(screen.getByRole("button", { name: /nâng thành quản trị/i }));
    expect(callSetUserRole).toHaveBeenCalledWith("u1", "admin");
  });

  it("không cho admin đang đăng nhập tự hạ quyền chính mình", () => {
    render(<UserRoleManager users={USERS} currentAdminUid="a1" />);
    expect(screen.queryByRole("button", { name: /hạ xuống học sinh/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `npm test -- UserRoleManager`
Expected: FAIL

- [ ] **Step 3: Viết `src/lib/firebase/functions-client.ts`**

```ts
"use client";

import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp } from "./client";

const REGION = "asia-southeast1";
let connected = false;

function functionsInstance() {
  const fns = getFunctions(getFirebaseApp(), REGION);
  if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !connected) {
    connectFunctionsEmulator(fns, "127.0.0.1", 5001);
    connected = true;
  }
  return fns;
}

export async function callSetUserRole(
  targetUid: string,
  role: "student" | "admin",
): Promise<void> {
  const fn = httpsCallable<{ targetUid: string; role: string }, { ok: boolean }>(
    functionsInstance(),
    "setUserRole",
  );
  await fn({ targetUid, role });
}
```

- [ ] **Step 4: Viết `src/lib/firestore/admin-users.ts`**

```ts
import "server-only";

import { adminDb } from "@/lib/firebase/admin";

export type UserSummary = {
  uid: string;
  nickname: string;
  school: string;
  gradeLevel: string;
  role: "student" | "admin";
};

export type AuditLogEntry = {
  id: string;
  actorUid: string;
  action: string;
  targetType: string;
  targetId: string;
  timestamp: Date | null;
};

/** Chỉ trả về trường hành chính — KHÔNG bao giờ trả nội dung nhật ký hay điểm test. */
export async function listUsers(max = 200): Promise<UserSummary[]> {
  const snap = await adminDb().collection("users").limit(max).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      uid: d.id,
      nickname: (data.nickname as string) ?? "(chưa đặt)",
      school: (data.school as string) ?? "",
      gradeLevel: (data.gradeLevel as string) ?? "",
      role: data.role === "admin" ? "admin" : "student",
    };
  });
}

export async function listAuditLogs(max = 100): Promise<AuditLogEntry[]> {
  const snap = await adminDb()
    .collection("auditLogs")
    .orderBy("timestamp", "desc")
    .limit(max)
    .get();

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      actorUid: data.actorUid as string,
      action: data.action as string,
      targetType: data.targetType as string,
      targetId: data.targetId as string,
      timestamp: data.timestamp?.toDate?.() ?? null,
    };
  });
}
```

- [ ] **Step 5: Viết `src/components/admin/UserRoleManager.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { callSetUserRole } from "@/lib/firebase/functions-client";
import type { UserSummary } from "@/lib/firestore/admin-users";

export function UserRoleManager({
  users, currentAdminUid,
}: { users: UserSummary[]; currentAdminUid: string }) {
  const router = useRouter();
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(uid: string, role: "student" | "admin") {
    setPendingUid(uid);
    setError(null);
    try {
      await callSetUserRole(uid, role);
      router.refresh();
    } catch {
      setError("Không đổi được vai trò. Kiểm tra lại quyền quản trị của bạn.");
    } finally {
      setPendingUid(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}

      <ul className="flex flex-col gap-2">
        {users.map((u) => (
          <li key={u.uid} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
            <span className="font-medium">{u.nickname}</span>
            <span className="text-sm text-slate-500">Lớp {u.gradeLevel} · {u.school}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-sm">{u.role}</span>

            {u.role === "student" && (
              <button
                type="button" disabled={pendingUid === u.uid}
                onClick={() => handleChange(u.uid, "admin")}
                className="ml-auto underline disabled:opacity-50"
              >
                Nâng thành quản trị
              </button>
            )}

            {u.role === "admin" && u.uid !== currentAdminUid && (
              <button
                type="button" disabled={pendingUid === u.uid}
                onClick={() => handleChange(u.uid, "student")}
                className="ml-auto underline disabled:opacity-50"
              >
                Hạ xuống học sinh
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Viết hai trang admin**

`src/app/(admin)/admin/nguoi-dung/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/firebase/session";
import { listUsers } from "@/lib/firestore/admin-users";
import { UserRoleManager } from "@/components/admin/UserRoleManager";

export const metadata = { title: "Người dùng · ExamCalm" };

export default async function Page() {
  const admin = await requireAdmin();
  const users = await listUsers();

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">Người dùng</h1>
      <p className="mb-6 text-slate-600">
        Trang này chỉ hiển thị thông tin hành chính. Nhật ký cảm xúc và kết quả test
        của học sinh là dữ liệu riêng tư, quản trị viên không đọc được.
      </p>
      <UserRoleManager users={users} currentAdminUid={admin.uid} />
    </>
  );
}
```

`src/app/(admin)/admin/nhat-ky-he-thong/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/firebase/session";
import { listAuditLogs } from "@/lib/firestore/admin-users";

export const metadata = { title: "Nhật ký hệ thống · ExamCalm" };

const formatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" });

export default async function Page() {
  await requireAdmin();
  const logs = await listAuditLogs();

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Nhật ký hệ thống</h1>
      {logs.length === 0 ? (
        <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có hoạt động nào được ghi.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {logs.map((log) => (
            <li key={log.id} className="rounded-xl border bg-white px-4 py-3">
              <span className="font-mono text-sm">{log.action}</span>
              <span className="ml-2 text-slate-600">{log.targetType}/{log.targetId}</span>
              <span className="block text-sm text-slate-500">
                bởi {log.actorUid} · {log.timestamp ? formatter.format(log.timestamp) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

- [ ] **Step 7: Viết `src/app/(admin)/admin/page.tsx`**

```tsx
import Link from "next/link";

export const metadata = { title: "Quản trị · ExamCalm" };

const SECTIONS = [
  { href: "/admin/tests", label: "Bài test", desc: "Soạn câu hỏi, ngưỡng điểm, diễn giải" },
  { href: "/admin/thu-vien", label: "Thư viện", desc: "Bài viết, mẹo, video hướng dẫn" },
  { href: "/admin/nguoi-dung", label: "Người dùng", desc: "Xem danh sách và gán vai trò" },
  { href: "/admin/nhat-ky-he-thong", label: "Nhật ký hệ thống", desc: "Lịch sử hành động quản trị" },
];

export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Quản trị</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <li key={s.href}>
            <Link href={s.href} className="block rounded-xl border bg-white px-4 py-4 hover:bg-slate-50">
              <span className="font-medium">{s.label}</span>
              <span className="mt-1 block text-sm text-slate-500">{s.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
```

- [ ] **Step 8: Chạy test và build — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 9: Commit**

```bash
git add src/app/\(admin\)/admin src/components/admin/UserRoleManager.tsx src/lib/firestore/admin-users.ts src/lib/firebase/functions-client.ts
git commit -m "feat(admin): quản lý vai trò người dùng và xem nhật ký hệ thống"
```

---

## Task 22: Xóa dữ liệu và đồng ý tham gia nghiên cứu

**Files:**
- Create: `functions/src/admin/deleteUserData.ts`, `functions/src/admin/deleteUserData.test.ts`, `src/components/settings/ResearchConsentForm.tsx`, `src/components/settings/DeleteAccountSection.tsx`, `src/app/(student)/ho-so/page.tsx`, `scripts/export-research.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `writeAuditLog` (Task 18); `researchConsentSchema` (Task 6)
- Produces:
  - Callable `deleteUserData({ targetUid })` — user tự xóa mình, hoặc admin xóa
  - `collectDeletionTargets(uid): string[]` — logic thuần liệt kê collection cần dọn, test được
  - `RESEARCH_CONSENT_VERSION`

**Yêu cầu spec §11:** xuất dữ liệu nghiên cứu chỉ lấy user đã đồng ý, ẩn danh hóa, và **loại bỏ hoàn toàn** trường `note` của `moodLogs`.

- [ ] **Step 1: Viết test FAILING cho danh sách cần xóa**

Tạo `functions/src/admin/deleteUserData.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectDeletionTargets, canDelete } from "./deleteUserData.logic";

describe("collectDeletionTargets", () => {
  it("liệt kê đủ mọi nơi chứa dữ liệu cá nhân", () => {
    expect(collectDeletionTargets()).toEqual([
      "testAttempts", "moodLogs", "users/{uid}/favorites", "users/{uid}",
    ]);
  });

  it("xóa doc users SAU CÙNG để không mất mốc kiểm tra quyền giữa chừng", () => {
    const targets = collectDeletionTargets();
    expect(targets[targets.length - 1]).toBe("users/{uid}");
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
```

- [ ] **Step 2: Chạy test — phải FAIL**

Run: `cd functions && npm test && cd ..`
Expected: FAIL

- [ ] **Step 3: Viết `functions/src/admin/deleteUserData.logic.ts`**

```ts
import type { CallerAuth } from "./guards";

/**
 * Thứ tự xóa. `users/{uid}` phải nằm CUỐI: các bước trước còn cần doc đó tồn tại
 * để đối chiếu, và nếu dừng giữa chừng thì doc user còn lại là dấu hiệu cần chạy lại.
 */
export function collectDeletionTargets(): string[] {
  return ["testAttempts", "moodLogs", "users/{uid}/favorites", "users/{uid}"];
}

export function canDelete(auth: CallerAuth, targetUid: string): boolean {
  if (!auth) return false;
  return auth.uid === targetUid || auth.token.role === "admin";
}
```

- [ ] **Step 4: Chạy test — phải PASS**

Run: `cd functions && npm test && cd ..`
Expected: 6 passed

- [ ] **Step 5: Viết `functions/src/admin/deleteUserData.ts`**

```ts
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { z } from "zod";
import { canDelete } from "./deleteUserData.logic";
import { writeAuditLog } from "../audit/writeAuditLog";

const inputSchema = z.object({ targetUid: z.string().min(1) });
const BATCH_SIZE = 300;

async function deleteQueryInBatches(
  build: () => FirebaseFirestore.Query,
): Promise<number> {
  const db = getFirestore();
  let deleted = 0;

  for (;;) {
    const snap = await build().limit(BATCH_SIZE).get();
    if (snap.empty) return deleted;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < BATCH_SIZE) return deleted;
  }
}

export const deleteUserData = onCall({ region: "asia-southeast1" }, async (request) => {
  const auth = request.auth
    ? { uid: request.auth.uid, token: request.auth.token as Record<string, unknown> }
    : undefined;

  const parsed = inputSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "Thiếu targetUid.");

  const { targetUid } = parsed.data;
  if (!canDelete(auth, targetUid)) {
    throw new HttpsError("permission-denied", "Bạn không có quyền xóa dữ liệu này.");
  }

  const db = getFirestore();

  const attempts = await deleteQueryInBatches(() =>
    db.collection("testAttempts").where("userId", "==", targetUid),
  );
  const moods = await deleteQueryInBatches(() =>
    db.collection("moodLogs").where("userId", "==", targetUid),
  );
  const favorites = await deleteQueryInBatches(() =>
    db.collection("users").doc(targetUid).collection("favorites"),
  );

  await db.collection("users").doc(targetUid).delete();
  await getAuth().deleteUser(targetUid).catch(() => {
    // Tài khoản Auth có thể đã bị xóa trước đó — dữ liệu Firestore vẫn phải được dọn.
  });

  await writeAuditLog({
    actorUid: auth!.uid,
    action: "deleteUserData",
    targetType: "user",
    targetId: targetUid,
    before: { attempts, moods, favorites },
    after: null,
  });

  return { ok: true, deleted: { attempts, moods, favorites } };
});
```

Cập nhật `functions/src/index.ts`:

```ts
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { setUserRole } from "./admin/setUserRole";
export { deleteUserData } from "./admin/deleteUserData";
```

- [ ] **Step 6: Viết `src/components/settings/ResearchConsentForm.tsx`**

```tsx
"use client";

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase/client";

export const RESEARCH_CONSENT_VERSION = "v1-2026-08";

export function ResearchConsentForm({
  uid, initialGranted,
}: { uid: string; initialGranted: boolean }) {
  const [granted, setGranted] = useState(initialGranted);
  const [message, setMessage] = useState<string | null>(null);

  async function handleChange(next: boolean) {
    setGranted(next);
    await updateDoc(doc(getDb(), "users", uid), {
      researchConsent: next
        ? { granted: true, grantedAt: serverTimestamp(), version: RESEARCH_CONSENT_VERSION }
        : { granted: false, grantedAt: null, version: RESEARCH_CONSENT_VERSION },
      updatedAt: serverTimestamp(),
    });
    setMessage(next ? "Cảm ơn bạn đã đồng ý." : "Đã ghi nhận. Dữ liệu của bạn sẽ không được dùng cho nghiên cứu.");
  }

  return (
    <section className="rounded-xl border bg-white px-4 py-4">
      <h2 className="mb-2 font-medium">Tham gia nghiên cứu (không bắt buộc)</h2>
      <p className="mb-3 text-slate-600">
        Nhóm nghiên cứu muốn dùng dữ liệu ở dạng <strong>ẩn danh</strong> để phân tích cho
        đề tài khoa học kỹ thuật. Nếu bạn đồng ý, chỉ điểm cảm xúc, thẻ ngữ cảnh và thời gian
        được sử dụng — <strong>nội dung ghi chú của bạn không bao giờ được lấy ra</strong>.
        Bạn từ chối thì vẫn dùng đầy đủ mọi tính năng, và có thể đổi ý bất cứ lúc nào.
      </p>

      <label className="flex items-start gap-2">
        <input
          type="checkbox" checked={granted}
          onChange={(e) => handleChange(e.target.checked)}
          className="mt-1"
        />
        <span>Tôi đồng ý cho dùng dữ liệu ẩn danh của mình vào nghiên cứu.</span>
      </label>

      {message && <p role="status" className="mt-2 text-teal-800">{message}</p>}

      <p className="mt-3 text-sm text-slate-500">
        Nếu bạn dưới 18 tuổi, hãy trao đổi với phụ huynh hoặc thầy cô trước khi đồng ý.
      </p>
    </section>
  );
}
```

- [ ] **Step 7: Viết `src/components/settings/DeleteAccountSection.tsx`**

```tsx
"use client";

import { useState } from "react";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getFirebaseApp } from "@/lib/firebase/client";
import { signOutEverywhere } from "@/lib/auth-client";

const CONFIRM_PHRASE = "XOA DU LIEU";
let connected = false;

export function DeleteAccountSection({ uid }: { uid: string }) {
  const [phrase, setPhrase] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const fns = getFunctions(getFirebaseApp(), "asia-southeast1");
      if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true" && !connected) {
        connectFunctionsEmulator(fns, "127.0.0.1", 5001);
        connected = true;
      }
      await httpsCallable(fns, "deleteUserData")({ targetUid: uid });
      await signOutEverywhere();
      window.location.href = "/";
    } catch {
      setError("Chưa xóa được. Bạn thử lại sau ít phút nhé.");
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4">
      <h2 className="mb-2 font-medium text-rose-900">Xóa toàn bộ dữ liệu của tôi</h2>
      <p className="mb-3 text-rose-900">
        Thao tác này xóa vĩnh viễn tài khoản, toàn bộ nhật ký cảm xúc, lịch sử test
        và danh sách bài đã lưu. Không khôi phục lại được.
      </p>

      <label className="flex flex-col gap-1">
        <span>Gõ <code className="font-mono">{CONFIRM_PHRASE}</code> để xác nhận</span>
        <input
          value={phrase} onChange={(e) => setPhrase(e.target.value)}
          className="rounded-lg border px-3 py-2"
        />
      </label>

      {error && <p role="alert" className="mt-2 text-rose-800">{error}</p>}

      <button
        type="button" onClick={handleDelete}
        disabled={phrase !== CONFIRM_PHRASE || pending}
        className="mt-3 rounded-lg bg-rose-700 px-4 py-2 font-medium text-white disabled:opacity-40"
      >
        {pending ? "Đang xóa…" : "Xóa vĩnh viễn"}
      </button>
    </section>
  );
}
```

- [ ] **Step 8: Viết `src/app/(student)/ho-so/page.tsx`**

```tsx
import { requireUser } from "@/lib/firebase/session";
import { adminDb } from "@/lib/firebase/admin";
import { ResearchConsentForm } from "@/components/settings/ResearchConsentForm";
import { DeleteAccountSection } from "@/components/settings/DeleteAccountSection";

export const metadata = { title: "Hồ sơ · ExamCalm" };

export default async function Page() {
  const user = await requireUser();
  const snap = await adminDb().collection("users").doc(user.uid).get();
  const granted = snap.data()?.researchConsent?.granted === true;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Hồ sơ và quyền riêng tư</h1>
      <ResearchConsentForm uid={user.uid} initialGranted={granted} />
      <DeleteAccountSection uid={user.uid} />
    </main>
  );
}
```

- [ ] **Step 9: Viết `scripts/export-research.ts`**

```ts
/**
 * Xuất dữ liệu ẩn danh cho phân tích KHKT (spec §11).
 *
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
 *   RESEARCH_SALT="<chuoi-bi-mat-luu-rieng>" \
 *   npx tsx scripts/export-research.ts > research-export.json
 *
 * QUY TẮC BẤT DI BẤT DỊCH:
 *   1. Chỉ lấy user có researchConsent.granted === true
 *   2. userId thay bằng hash có salt; salt KHÔNG lưu cùng file xuất
 *   3. TUYỆT ĐỐI không xuất moodLogs.note, nickname, school, email
 */
import { createHash } from "node:crypto";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const salt = process.env.RESEARCH_SALT;
if (!raw || !salt) {
  console.error("Cần cả FIREBASE_SERVICE_ACCOUNT_JSON và RESEARCH_SALT.");
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

function anonymize(uid: string): string {
  return createHash("sha256").update(`${salt}:${uid}`).digest("hex").slice(0, 16);
}

const consented = await db.collection("users").where("researchConsent.granted", "==", true).get();
const consentedUids = consented.docs.map((d) => d.id);

const moodRows: unknown[] = [];
const testRows: unknown[] = [];

for (const uid of consentedUids) {
  const pid = anonymize(uid);

  const moods = await db.collection("moodLogs").where("userId", "==", uid).get();
  for (const d of moods.docs) {
    const data = d.data();
    // KHÔNG lấy data.note — đó là văn bản tự do có thể chứa thông tin nhận dạng.
    moodRows.push({
      participantId: pid,
      moodScore: data.moodScore,
      tags: data.tags ?? [],
      context: data.context,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  }

  const attempts = await db.collection("testAttempts").where("userId", "==", uid).get();
  for (const d of attempts.docs) {
    const data = d.data();
    testRows.push({
      participantId: pid,
      testId: data.testId,
      testVersion: data.testVersion,
      score: data.score,
      level: data.level,
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
    });
  }
}

console.log(JSON.stringify({
  exportedAt: new Date().toISOString(),
  participantCount: consentedUids.length,
  moodLogs: moodRows,
  testAttempts: testRows,
}, null, 2));
```

- [ ] **Step 10: Kiểm chứng trên Emulator**

Chạy Emulator, tạo user, ghi vài mood log, rồi gọi xóa từ `/ho-so`.

Expected: Firestore Emulator không còn `moodLogs`/`testAttempts`/`favorites`/`users` của uid đó; `auditLogs` có bản ghi `deleteUserData`; user biến mất khỏi tab Authentication.

- [ ] **Step 11: Commit**

```bash
git add functions/src/admin src/components/settings src/app/\(student\)/ho-so scripts/export-research.ts functions/src/index.ts
git commit -m "feat(privacy): xóa dữ liệu liên đới, phiếu đồng ý nghiên cứu và xuất dữ liệu ẩn danh"
```

---

## Task 23: Trang chủ, giới thiệu và dữ liệu mẫu

**Files:**
- Create: `src/app/(public)/page.tsx`, `src/app/(public)/gioi-thieu/page.tsx`, `src/components/SiteHeader.tsx`, `scripts/seed-dev.ts`
- Modify: `src/app/layout.tsx` (gắn header), `package.json`

**Interfaces:**
- Consumes: `CatMascot` (Task 14); `getSessionUser` (Task 10)
- Produces: `npm run seed` nạp 1 bài test mẫu + 4 tài nguyên mẫu vào Emulator hoặc `examcalm-dev`

- [ ] **Step 1: Viết `src/components/SiteHeader.tsx`**

```tsx
import Link from "next/link";
import { getSessionUser } from "@/lib/firebase/session";
import { CatMascot } from "@/components/mascot/CatMascot";

export async function SiteHeader() {
  const user = await getSessionUser();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CatMascot size={32} />
          ExamCalm
        </Link>

        <nav aria-label="Chính" className="flex flex-wrap items-center gap-4">
          <Link href="/test">Bài test</Link>
          <Link href="/thu-vien">Thư viện</Link>
          {user && <Link href="/tien-trinh">Tiến trình</Link>}
          {user?.role === "admin" && <Link href="/admin">Quản trị</Link>}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {user ? (
            <Link href="/ho-so">Hồ sơ</Link>
          ) : (
            <>
              <Link href="/dang-nhap">Đăng nhập</Link>
              <Link href="/dang-ky" className="rounded-lg bg-teal-600 px-3 py-1.5 text-white">Đăng ký</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
```

Gắn vào `src/app/layout.tsx`, ngay trước `{children}`:

```tsx
        <SiteHeader />
```

- [ ] **Step 2: Viết `src/app/(public)/page.tsx`**

```tsx
import Link from "next/link";
import { CatMascot } from "@/components/mascot/CatMascot";

export const metadata = {
  title: "ExamCalm — Bớt lo âu trước kỳ thi",
  description:
    "Công cụ tự tìm hiểu cảm xúc dành cho học sinh THPT: bài test tham khảo, nhật ký cảm xúc và thư viện kỹ thuật thư giãn.",
};

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <CatMascot size={96} expression="cheer" />
        <div>
          <h1 className="text-3xl font-semibold">Kỳ thi đang tới. Bạn ổn chứ?</h1>
          <p className="mt-2 text-slate-600">
            ExamCalm giúp bạn gọi tên cảm xúc của mình và tìm một việc nhỏ có thể làm ngay.
          </p>
        </div>
      </div>

      <div className="mb-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/test" className="flex-1 rounded-xl bg-teal-600 px-4 py-3 text-center font-medium text-white">
          Làm thử bài test
        </Link>
        <Link href="/thu-vien" className="flex-1 rounded-xl border px-4 py-3 text-center">
          Xem thư viện
        </Link>
      </div>

      <p className="mb-8 rounded-xl bg-slate-100 px-4 py-3 text-slate-700">
        Bạn dùng được ngay mà không cần tài khoản. Đăng ký chỉ cần khi bạn muốn lưu lại
        để xem thay đổi theo thời gian.
      </p>

      <section className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-amber-900">
        <h2 className="mb-1 font-medium">Một điều quan trọng</h2>
        <p>
          ExamCalm là công cụ tự tìm hiểu, <strong>không chẩn đoán và không thay thế
          chuyên gia tâm lý</strong>. Nếu bạn đang thấy rất khó khăn, hãy nói với người
          bạn tin tưởng: phụ huynh, thầy cô, hoặc cán bộ tâm lý học đường.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Viết `src/app/(public)/gioi-thieu/page.tsx`**

```tsx
import { CatMascot } from "@/components/mascot/CatMascot";

export const metadata = { title: "Giới thiệu · ExamCalm" };

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Về ExamCalm</h1>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">ExamCalm là gì</h2>
        <p className="text-slate-700">
          Một trang web giúp học sinh THPT hiểu hơn trạng thái cảm xúc của mình trước kỳ thi
          và chủ động chọn một hoạt động phù hợp để điều chỉnh tâm trạng.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">ExamCalm không phải là gì</h2>
        <ul className="list-disc pl-5 text-slate-700">
          <li>Không phải công cụ chẩn đoán y khoa hay tâm lý.</li>
          <li>Không thay thế việc gặp chuyên gia.</li>
          <li>Không xếp hạng hay so sánh sức khỏe tinh thần giữa các bạn.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-medium">Dữ liệu của bạn</h2>
        <p className="text-slate-700">
          Nhật ký cảm xúc và kết quả test là <strong>riêng tư</strong>. Quản trị viên
          không đọc được nội dung bạn ghi. Bạn xóa được từng ghi chép, hoặc xóa toàn bộ
          dữ liệu bất cứ lúc nào ở trang Hồ sơ.
        </p>
      </section>

      <section className="flex items-center gap-4 rounded-xl bg-white px-4 py-4">
        <CatMascot size={72} expression="listen" />
        <p className="text-slate-700">
          Bạn mèo đồng hành xuất hiện ở góc màn hình. Bấm vào để ghi lại cảm xúc bất cứ lúc nào.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Viết `scripts/seed-dev.ts`**

```ts
/**
 * Nạp dữ liệu MẪU. Mọi nội dung ở đây là GIẢ, chưa qua thẩm định chuyên môn (spec §1.1).
 *
 * Với Emulator:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=examcalm-dev npx tsx scripts/seed-dev.ts
 *
 * Với project dev thật:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" npx tsx scripts/seed-dev.ts
 */
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
initializeApp({
  credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
  projectId: process.env.GCLOUD_PROJECT ?? "examcalm-dev",
});

const db = getFirestore();
const SEED_ADMIN = "seed-script";

const SAMPLE_TEST = {
  title: "Bài test tham khảo về căng thẳng trước kỳ thi (MẪU)",
  version: 1,
  status: "published",
  isSampleContent: true,
  disclaimer:
    "Đây là công cụ tự tìm hiểu, không phải chẩn đoán y khoa hay tâm lý. " +
    "Nếu bạn đang thấy rất khó khăn, hãy nói với phụ huynh, thầy cô hoặc cán bộ tâm lý học đường.",
  questions: [
    { id: "q1", text: "Trong hai tuần qua, bạn có khó đi vào giấc ngủ vì nghĩ đến kỳ thi?" },
    { id: "q2", text: "Bạn có thấy khó tập trung khi ngồi vào bàn học?" },
    { id: "q3", text: "Bạn có hay lo rằng mình sẽ làm bài không tốt?" },
    { id: "q4", text: "Bạn có thấy căng cơ, đau đầu hoặc khó chịu ở bụng khi nghĩ đến kỳ thi?" },
    { id: "q5", text: "Bạn có né tránh việc ôn tập vì cảm thấy quá tải?" },
  ].map((q) => ({
    ...q,
    options: [
      { label: "Không bao giờ", score: 0 },
      { label: "Thỉnh thoảng", score: 1 },
      { label: "Khá thường xuyên", score: 2 },
      { label: "Gần như mỗi ngày", score: 3 },
    ],
  })),
  scoring: {
    thresholds: [
      { min: 0, max: 4, level: "thap", interpretation: "Bạn đang khá ổn. Giữ nhịp sinh hoạt hiện tại nhé." },
      { min: 5, max: 9, level: "trung-binh", interpretation: "Có vài dấu hiệu căng thẳng. Thử một kỹ thuật thư giãn ngắn trong thư viện." },
      { min: 10, max: 15, level: "cao", interpretation: "Bạn đang chịu khá nhiều áp lực. Hãy cân nhắc chia sẻ với người bạn tin tưởng." },
    ],
  },
  updatedBy: SEED_ADMIN,
  updatedAt: FieldValue.serverTimestamp(),
};

const SAMPLE_RESOURCES = [
  {
    title: "Kỹ thuật thở 4-7-8",
    slug: "ky-thuat-tho-4-7-8",
    type: "guide", category: "Thư giãn", tags: ["thở", "trước khi ngủ"],
    content:
      "## Làm thế nào\n\n1. Hít vào bằng mũi, đếm thầm tới 4.\n2. Giữ hơi, đếm tới 7.\n3. Thở ra bằng miệng, đếm tới 8.\n4. Lặp lại 4 vòng.\n\n## Khi nào dùng\n\nTrước khi ngủ, hoặc ngay trước khi bước vào phòng thi.",
    videoUrl: null, visibility: "public",
  },
  {
    title: "Chia nhỏ buổi ôn thành 25 phút",
    slug: "chia-nho-buoi-on-25-phut",
    type: "tip", category: "Học tập", tags: ["tập trung", "quản lý thời gian"],
    content:
      "Ngồi vào bàn với ý định học 3 tiếng thường khiến ta trì hoãn.\n\nThử đặt hẹn giờ 25 phút, học một việc duy nhất, rồi nghỉ 5 phút. Sau 4 vòng thì nghỉ dài hơn.",
    videoUrl: null, visibility: "public",
  },
  {
    title: "Khi đầu óc trắng xóa lúc làm bài",
    slug: "khi-dau-oc-trang-xoa-luc-lam-bai",
    type: "article", category: "Chuẩn bị thi", tags: ["phòng thi", "lo âu"],
    content:
      "Đầu óc trắng xóa là phản ứng bình thường của cơ thể khi căng thẳng, không phải dấu hiệu bạn không biết gì.\n\n**Thử theo thứ tự này:**\n\n1. Đặt bút xuống, thở ra thật chậm ba lần.\n2. Bỏ qua câu đang mắc, làm câu bạn chắc chắn nhất.\n3. Quay lại câu khó sau khi đã lấy lại nhịp.",
    videoUrl: null, visibility: "public",
  },
  {
    title: "Ghi lại ba điều đã làm được hôm nay",
    slug: "ghi-lai-ba-dieu-da-lam-duoc-hom-nay",
    type: "tip", category: "Thư giãn", tags: ["nhật ký"],
    content:
      "Cuối ngày, viết ra ba việc bạn đã làm được — dù nhỏ tới đâu.\n\nMục tiêu không phải là thấy mình giỏi, mà là nhìn thấy ngày hôm nay không trống rỗng như cảm giác đang có.",
    videoUrl: null, visibility: "student_only",
  },
];

await db.collection("testDefinitions").doc("sample-exam-stress-v1").set(SAMPLE_TEST);

for (const resource of SAMPLE_RESOURCES) {
  await db.collection("resources").doc(resource.slug).set({
    ...resource,
    status: "published",
    createdBy: SEED_ADMIN,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

console.log(`Đã nạp 1 bài test mẫu và ${SAMPLE_RESOURCES.length} tài nguyên mẫu.`);
console.log("Lưu ý: bài test được đánh dấu isSampleContent = true và sẽ hiển thị banner cảnh báo.");
```

Thêm script:

```json
{
  "scripts": {
    "seed": "tsx scripts/seed-dev.ts"
  }
}
```

- [ ] **Step 5: Chạy seed và kiểm chứng bằng mắt**

```bash
npm run emu          # terminal 1
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=examcalm-dev npm run seed   # terminal 2
npm run dev          # terminal 3
```

Expected: mở http://localhost:3000 → thấy trang chủ; `/test` có 1 bài; làm thử thấy **banner "Nội dung mẫu"**; `/thu-vien` có 3 bài (Guest) và 4 bài (sau khi đăng nhập).

- [ ] **Step 6: Chạy test và build — phải PASS**

Run: `npm test && npm run typecheck && npm run build`
Expected: tất cả pass

- [ ] **Step 7: Commit**

```bash
git add src/app/\(public\)/page.tsx src/app/\(public\)/gioi-thieu src/components/SiteHeader.tsx src/app/layout.tsx scripts/seed-dev.ts package.json
git commit -m "feat(site): trang chủ, giới thiệu, header và script seed dữ liệu mẫu"
```

---

## Task 24: E2E Playwright và CI

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/guest.spec.ts`, `tests/e2e/student.spec.ts`, `.github/workflows/ci.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: toàn bộ ứng dụng đã dựng
- Produces: `npm run test:e2e`; CI chạy lint → typecheck → unit → rules → e2e → build trên mọi PR

- [ ] **Step 1: Cài Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Viết `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

Thêm script:

```json
{
  "scripts": {
    "test:e2e": "firebase emulators:exec --only auth,firestore,functions \"playwright test\""
  }
}
```

- [ ] **Step 3: Viết `tests/e2e/guest.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("Khách chưa đăng nhập", () => {
  test("làm được test và thấy kết quả mà không cần tài khoản", async ({ page }) => {
    await page.goto("/test");
    await page.getByRole("link", { name: /MẪU/ }).click();

    const radios = page.getByRole("radio", { name: "Không bao giờ" });
    const count = await radios.count();
    for (let i = 0; i < count; i++) await radios.nth(i).click();

    await page.getByRole("button", { name: /xem kết quả/i }).click();

    await expect(page.getByText(/tổng điểm của bạn/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /đăng ký để lưu kết quả/i })).toBeVisible();
  });

  test("kết quả được giữ trong sessionStorage chứ không ghi Firestore", async ({ page }) => {
    await page.goto("/test");
    await page.getByRole("link", { name: /MẪU/ }).click();

    const radios = page.getByRole("radio", { name: "Không bao giờ" });
    const count = await radios.count();
    for (let i = 0; i < count; i++) await radios.nth(i).click();
    await page.getByRole("button", { name: /xem kết quả/i }).click();

    const stored = await page.evaluate(() => sessionStorage.getItem("examcalm:guest-results"));
    expect(stored).toContain("score");
    const local = await page.evaluate(() => localStorage.length);
    expect(local).toBe(0);
  });

  test("luôn thấy banner nội dung mẫu", async ({ page }) => {
    await page.goto("/test");
    await page.getByRole("link", { name: /MẪU/ }).click();
    await expect(page.getByText(/nội dung mẫu/i)).toBeVisible();
  });

  test("bị chuyển về trang đăng nhập khi vào khu vực học sinh", async ({ page }) => {
    await page.goto("/tien-trinh");
    await expect(page).toHaveURL(/\/dang-nhap/);
  });

  test("bị chuyển về trang đăng nhập khi vào khu vực quản trị", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dang-nhap/);
  });

  test("đọc được thư viện công khai", async ({ page }) => {
    await page.goto("/thu-vien");
    await expect(page.getByRole("link", { name: /kỹ thuật thở/i })).toBeVisible();
  });
});
```

- [ ] **Step 4: Viết `tests/e2e/student.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

/** Emulator chấp nhận mọi email; mỗi lần chạy dùng một email khác để tránh trùng. */
function uniqueEmail(): string {
  return `hs-${process.env.PW_RUN_ID ?? "local"}-${Math.floor(Math.random() * 1e9)}@example.com`;
}

test.describe("Học sinh", () => {
  test("đăng ký được và tạo hồ sơ", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/dang-ky");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill("matkhau12345");
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();

    await expect(page).toHaveURL(/\/xac-thuc-email/);
    await expect(page.getByText(/kiểm tra hộp thư/i)).toBeVisible();
  });

  test("vào được trang tiến trình sau khi đăng ký", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/dang-ky");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill("matkhau12345");
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();
    await expect(page).toHaveURL(/\/xac-thuc-email/);

    await page.goto("/tien-trinh");
    await expect(page.getByRole("heading", { name: /tiến trình của bạn/i })).toBeVisible();
  });

  test("KHÔNG hiển thị chuỗi ngày hay streak ở trang tiến trình", async ({ page }) => {
    const email = uniqueEmail();

    await page.goto("/dang-ky");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mật khẩu").fill("matkhau12345");
    await page.getByLabel("Biệt danh").fill("Mèo thử nghiệm");
    await page.getByLabel("Trường").fill("THPT Thử Nghiệm");
    await page.getByRole("button", { name: /tạo tài khoản/i }).click();

    await page.goto("/tien-trinh");
    await expect(page.getByText(/streak|chuỗi ngày|ngày liên tiếp/i)).toHaveCount(0);
  });
});
```

- [ ] **Step 5: Chạy E2E — phải PASS**

```bash
npm run emu                                    # terminal 1
npm run seed                                   # terminal 2, một lần
npx playwright test                            # terminal 2
```

Expected: 9 test pass

- [ ] **Step 6: Viết `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main, dev]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Cài dependency
        run: |
          npm ci
          npm ci --prefix functions

      - name: Lint
        run: npm run lint

      - name: Kiểm tra kiểu
        run: npm run typecheck

      - name: Unit test
        run: npm test

      - name: Test Cloud Functions
        run: npm test --prefix functions

      - name: Build functions
        run: npm run build --prefix functions

      - name: Test Security Rules
        run: npm run test:rules

      - name: Cài Playwright
        run: npx playwright install --with-deps chromium

      - name: E2E
        run: npm run test:e2e
        env:
          NEXT_PUBLIC_USE_EMULATOR: "true"
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: examcalm-dev
          NEXT_PUBLIC_FIREBASE_API_KEY: fake-api-key-for-emulator
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: examcalm-dev.firebaseapp.com
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: examcalm-dev.appspot.com
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000"
          NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:0000000000000000000000"

      - name: Build production
        run: npm run build

      - name: Chặn firebase-admin lọt vào client bundle
        run: |
          if grep -rl "firebase-admin" .next/static 2>/dev/null; then
            echo "LỖI: firebase-admin xuất hiện trong client bundle"
            exit 1
          fi
          echo "OK: client bundle sạch"
```

- [ ] **Step 7: [USER] Đẩy code lên GitHub lần đầu**

Agent không chạy `git push` (theo `CLAUDE.md`). Anh Hải Anh chạy:

```bash
git remote add origin https://github.com/luonghaianh1208/examcalm.git
git push -u origin main
```

Expected: tab **Actions** trên GitHub chạy workflow CI và pass toàn bộ.

- [ ] **Step 8: Commit**

```bash
git add playwright.config.ts tests/e2e .github/workflows/ci.yml package.json package-lock.json
git commit -m "test: E2E Playwright cho luồng Guest/Student và pipeline CI đầy đủ"
```

---

## Task 25: Triển khai lên Firebase App Hosting và domain

**Files:**
- Create: `apphosting.yaml`, `apphosting.dev.yaml`
- Modify: `firebase.json` (thêm site Hosting để redirect)

**Interfaces:**
- Consumes: toàn bộ ứng dụng
- Produces: backend App Hosting chạy trên `examcalm-dev` và `examcalm`; `examcalm.web.app` redirect sang backend prod

- [ ] **Step 1: Xác minh rủi ro R1 — App Hosting có nhận Next.js 16 không**

**Đây là việc phải làm TRƯỚC khi tin vào phần còn lại của plan.** Nếu bước này báo `preview` hoặc lỗi build, hạ Next.js về 15.x rồi chạy lại toàn bộ test.

```bash
firebase use dev
firebase apphosting:backends:create --project examcalm-dev --location asia-southeast1
```

CLI sẽ hỏi kết nối GitHub repo `luonghaianh1208/examcalm` và branch triển khai — chọn `dev`.

Expected: build log không có cảnh báo framework `preview`; backend deploy thành công và trả về URL dạng `<backend>--examcalm-dev.asia-southeast1.hosted.app`.

Nếu thấy `preview` hoặc build fail:

```bash
npm install next@15 --save-exact
npm test && npm run typecheck && npm run build
```

rồi deploy lại.

- [ ] **Step 2: Viết `apphosting.yaml` (cấu hình prod)**

```yaml
runConfig:
  minInstances: 0
  maxInstances: 4
  concurrency: 80
  cpu: 1
  memoryMiB: 512

env:
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: examcalm
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    value: examcalm.firebaseapp.com
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    value: examcalm.firebasestorage.app
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_USE_EMULATOR
    value: "false"
    availability: [BUILD, RUNTIME]

  # Giá trị nhạy cảm lấy từ Secret Manager, KHÔNG ghi thẳng vào file này
  - variable: NEXT_PUBLIC_FIREBASE_API_KEY
    secret: examcalm-web-api-key
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    secret: examcalm-messaging-sender-id
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_APP_ID
    secret: examcalm-web-app-id
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    secret: examcalm-recaptcha-site-key
    availability: [BUILD, RUNTIME]
```

**Không cần** `FIREBASE_SERVICE_ACCOUNT_JSON`: trên App Hosting, `applicationDefault()` tự lấy credential của service account gắn với backend (Task 9).

- [ ] **Step 2b: [USER] Nạp secret vào Secret Manager**

```bash
firebase apphosting:secrets:set examcalm-web-api-key --project examcalm
firebase apphosting:secrets:set examcalm-messaging-sender-id --project examcalm
firebase apphosting:secrets:set examcalm-web-app-id --project examcalm
firebase apphosting:secrets:set examcalm-recaptcha-site-key --project examcalm
```

Lặp lại với `--project examcalm-dev` cho môi trường dev.

- [ ] **Step 3: Triển khai Rules và Indexes lên cả hai project**

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project examcalm-dev
firebase deploy --only firestore:rules,firestore:indexes,storage --project examcalm
```

Expected: deploy thành công; Console → Firestore → Rules hiển thị đúng nội dung `firestore.rules`.

- [ ] **Step 4: Thêm rule chỉ-có-ở-prod chặn publish nội dung mẫu (rủi ro R5)**

Tạo `firestore.prod.rules` — sao chép nguyên `firestore.rules` và **thay** khối `testDefinitions` bằng:

```js
    match /testDefinitions/{id} {
      allow read:  if resource.data.status == "published" || isAdmin();
      // Ở production, KHÔNG cho publish nội dung mẫu chưa thẩm định.
      allow write: if isAdmin() &&
                   !(request.resource.data.status == "published" &&
                     request.resource.data.isSampleContent == true);
    }
```

Deploy riêng cho prod:

```bash
firebase deploy --only firestore:rules --project examcalm --config firebase.prod.json
```

Với `firebase.prod.json` trỏ `firestore.rules` sang `firestore.prod.rules`:

```json
{
  "firestore": { "rules": "firestore.prod.rules", "indexes": "firestore.indexes.json" },
  "storage": { "rules": "storage.rules" }
}
```

- [ ] **Step 5: Triển khai Cloud Functions**

```bash
firebase deploy --only functions --project examcalm-dev
firebase deploy --only functions --project examcalm
```

Expected: `setUserRole` và `deleteUserData` xuất hiện ở Console → Functions, region `asia-southeast1`.

- [ ] **Step 6: Bootstrap admin đầu tiên trên prod**

Đăng ký một tài khoản qua giao diện web trên prod, rồi:

```bash
FIREBASE_SERVICE_ACCOUNT_JSON="$(cat serviceAccountKey.json)" \
  npx tsx scripts/bootstrap-admin.ts luonghaianh1208@gmail.com
```

Đăng xuất và đăng nhập lại để claim có hiệu lực. Kiểm tra vào được `/admin`.

Sau khi xong, thu hồi service account key ở Google Cloud Console → IAM → Service Accounts → Keys.

- [ ] **Step 7: Tạo site Hosting giữ chỗ `examcalm.web.app` và redirect**

Backend App Hosting cấp domain `.hosted.app`; `.web.app` thuộc Firebase Hosting (spec §3.4). Tạo một site tĩnh chỉ để redirect:

```bash
firebase hosting:sites:create examcalm --project examcalm
```

Tạo `redirect-site/index.html` (nội dung tối thiểu, không bao giờ hiển thị thật):

```html
<meta charset="utf-8">
<title>ExamCalm</title>
<p>Đang chuyển hướng tới ExamCalm…</p>
```

Thêm vào `firebase.json`:

```json
{
  "hosting": {
    "site": "examcalm",
    "public": "redirect-site",
    "redirects": [
      {
        "source": "/**",
        "destination": "https://REPLACE_WITH_APP_HOSTING_URL/:splat",
        "type": 301
      }
    ]
  }
}
```

Thay `REPLACE_WITH_APP_HOSTING_URL` bằng URL thật của backend prod ở Step 1, rồi:

```bash
firebase deploy --only hosting --project examcalm
```

Expected: mở https://examcalm.web.app → chuyển sang backend App Hosting.

- [ ] **Step 8: Bật App Check ở chế độ monitor-only**

Firebase Console → App Check → chọn web app → reCAPTCHA Enterprise đã đăng ký ở Task 8.
**Không bấm Enforce.** Chỉ theo dõi số liệu (spec §5.3); bật enforce ở Spec #2 khi có AI call tốn tiền.

- [ ] **Step 9: Bật backup Firestore trên prod**

Google Cloud Console → Firestore → **Backups** → tạo lịch backup hằng ngày, giữ 7 ngày.

- [ ] **Step 10: Rà lại toàn bộ tiêu chí hoàn thành**

Đối chiếu từng mục ở spec §13:

1. `npm test` xanh (unit + component)
2. `npm run test:rules` xanh, đủ cả allow và deny cho mọi collection
3. `npm run typecheck` và `npm run build` sạch
4. `npx playwright test` xanh
5. Deploy được lên `examcalm-dev`, truy cập được qua domain App Hosting
6. `examcalm.web.app` redirect đúng
7. Bootstrap được admin, Admin console CRUD được test và thư viện
8. Seed data hiển thị banner "nội dung mẫu"
9. Budget alert đã bật trên cả hai project

- [ ] **Step 11: Commit**

```bash
git add apphosting.yaml firebase.json firebase.prod.json firestore.prod.rules redirect-site
git commit -m "chore: cấu hình App Hosting, rules riêng cho prod và redirect examcalm.web.app"
```

---

## Tự rà soát plan (đã thực hiện)

**Đối chiếu với spec — mọi mục đều có task tương ứng:**

| Mục spec | Task |
|---|---|
| §1.1 ràng buộc đạo đức (1) disclaimer | Task 12 (TestRunner luôn render `disclaimer`), Task 23 (trang chủ) |
| §1.1 (2) private by default | Task 3, 4, 5 (Security Rules + test) |
| §1.1 (3) nhãn nội dung mẫu | Task 12 (`SampleContentBanner`), Task 23 (seed), Task 25 Step 4 (rule prod) |
| §1.1 (4) consent nghiên cứu + ẩn danh | Task 22 |
| §3.1 Hướng C | Task 8 (client), Task 9 (server), Task 18 (functions) |
| §3.2 cấu trúc thư mục | Task 1, 2 |
| §3.3 tech stack | Task 1, 6, 8, 9, 24 |
| §3.4 hosting + domain | Task 25 |
| §3.5 môi trường | Task 2 Step 1, Task 25 |
| §4.1–4.7 data model | Task 6 (Zod), Task 3–5 (rules) |
| §4.8 indexes | Task 2 Step 6 |
| §5.1 auth + verify email | Task 11 |
| §5.1 session cookie | Task 10 |
| §5.2 RBAC + bootstrap admin | Task 18, Task 25 Step 6 |
| §5.3 App Check monitor-only | Task 8, Task 25 Step 8 |
| §6 Security Rules | Task 3, 4, 5 |
| §7.1 luồng Guest | Task 12 |
| §7.2 luồng Student | Task 11, 13, 14, 16, 17 |
| §7.3 luồng Admin | Task 19, 20, 21 |
| §7.4 chống mất dữ liệu | Task 8 (persistence), Task 13 (không chặn UI khi lỗi) |
| §8 UI/UX | Task 11–23 (mobile-first, pastel, a11y, `Intl`, không streak) |
| §9 chiến lược test | Task 3–5, 7, 24 |
| §10 R1 Next.js 16 | Task 25 Step 1 (xác minh trước tiên) |
| §10 R2 budget alert | Task 2 Step 1 |
| §10 R3 service account key | Task 18 Step 9, Task 25 Step 6 |
| §10 R4 rò admin SDK | Task 9 Step 5, Task 24 (chặn trong CI) |
| §10 R5 nội dung mẫu | Task 12, 19, 23, 25 Step 4 |
| §10 R6 chưa có git repo | Task 1 Step 1 |
| §10 R7 dữ liệu nghiên cứu | Task 22 |
| §11 xuất dữ liệu nghiên cứu | Task 22 Step 9 |
| §13 tiêu chí hoàn thành | Task 25 Step 10 |

**Nhất quán kiểu dữ liệu:** `CompletedTest` (Task 12) được `saveTestAttempt` (Task 13) dùng đúng tên trường; `MoodInput`/`MoodRecord` (Task 14) được `summarizeMood`/`pairBeforeAfter` (Task 17) dùng đúng; `ResourceListItem` (Task 9) dùng lại ở Task 15, 16; `CallerAuth` (Task 18) dùng lại ở Task 22.

**Điểm cần lưu ý khi thực thi:** Task 25 Step 1 là **cổng chặn** — nếu App Hosting chưa hỗ trợ Next.js 16 ở mức `active`, phải hạ về 15.x và chạy lại toàn bộ test trước khi tiếp tục.

---

*Hết Implementation Plan — ExamCalm Spec #1*
