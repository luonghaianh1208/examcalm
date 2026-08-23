# Design Spec — ExamCalm, Spec #1: Nền tảng + Test + Mood Journal + Library

**Ngày:** 2026-08-22
**Phạm vi:** Phase 0 + Phase 1 của `PRD_Web_Ho_Tro_Giam_Lo_Au_Thi_Cu_THPT_v3.0_Firebase.md`
**Trạng thái:** Chờ duyệt
**Spec tiếp theo (chưa viết):** #2 AI Journal · #3 CBT + Confession/Moderation · #4 Music Hub + Dashboard

---

## 1. Bối cảnh và quyết định đã chốt

| Hạng mục | Quyết định | Nguồn |
|---|---|---|
| Tên sản phẩm | **ExamCalm** | User chốt (gỡ TBD mục 13 PRD) |
| Mục đích sử dụng | Sản phẩm thật, quy mô người dùng vừa phải, **thu thập dữ liệu để dự thi KHKT** | User chốt |
| Phạm vi Spec #1 | Nền tảng · Test lo âu · Mood Journal (chưa AI) · Library | User chốt |
| Kiến trúc truy cập dữ liệu | **Hướng C — lai** (xem §3.1) | User chốt |
| Nội dung chuyên môn | Dữ liệu **mẫu có nhãn "GIẢ"**, nội dung thật nhập sau qua Admin | User chốt |
| Môi trường | 2 Firebase project: `examcalm` (prod), `examcalm-dev` | User chốt |
| Backup source | GitHub `luonghaianh1208/examcalm` — **user tự push**, agent không chạy `git push` | CLAUDE.md |
| Domain | `examcalm.web.app` giữ chỗ + redirect → App Hosting backend | Xem §3.4 |

### 1.1. Ràng buộc đạo đức bắt buộc

Sản phẩm phục vụ **trẻ vị thành niên**, chạm vào dữ liệu sức khỏe tinh thần, và dữ liệu sẽ được dùng cho **mục đích nghiên cứu**. Bốn ràng buộc không được vi phạm ở bất kỳ giai đoạn nào:

1. Không màn hình nào được diễn đạt kết quả như **chẩn đoán y khoa/tâm lý**. Mọi kết quả test kèm disclaimer.
2. Dữ liệu cá nhân (`moodLogs`, `testAttempts`) **private by default**, thực thi bằng Firestore Security Rules chứ không phải bằng UI.
3. Dữ liệu test mẫu ở Spec #1 phải hiển thị nhãn **"Nội dung mẫu — chưa thẩm định chuyên môn"** trên UI, không chỉ trong code.
4. Vì dữ liệu dùng cho nghiên cứu KHKT: cần **phiếu đồng ý tham gia nghiên cứu riêng** (khác điều khoản sử dụng), và mọi dữ liệu trích xuất để phân tích phải **ẩn danh hóa** — xem §11.

---

## 2. Ngoài phạm vi Spec #1

Ghi rõ để tránh scope creep. Các collection/tính năng sau **không code** ở spec này; data model đã được PRD định nghĩa nên spec sau ghép vào không phải viết lại:

- AI layer: Genkit, `aiJournalOutputs`, `promptTemplates`, `systemConfig/aiConfig`, `guestQuota`
- CBT: `cbtModules`, `cbtSessions`
- Confession + moderation: `confessions`, `confessionsPublic`, `moderationRules`, `moderationLogs`
- Music Hub: `mediaAssets`, `playlists`
- Dashboard rollup: `dashboardRollups`, `analyticsDaily`, scheduled functions, GA4
- Export Personal Report (PRD ghi rõ Phase 2+)
- Firebase Anonymous Auth — chỉ cần khi có quota AI cho Guest (Spec #2)

**Lưu ý về Dashboard:** Spec #1 có trang **"Tiến trình"** đơn giản (lịch sử test + lịch sử mood, query trực tiếp, dữ liệu nhỏ). Đây **không phải** Dashboard cá nhân hóa của PRD 7.2.9 — cái đó cần `dashboardRollups`, thuộc Spec #4.

---

## 3. Kiến trúc

### 3.1. Nguyên tắc truy cập dữ liệu (Hướng C — lai)

Chia theo **tính chất dữ liệu**, không chia theo tầng. Đây là quy tắc kỷ luật của toàn bộ codebase:

| Loại dữ liệu | Đường đi | Lý do |
|---|---|---|
| Nội dung công khai đã publish (`resources` public, `testDefinitions` published, trang tĩnh) | **Server Component + Admin SDK**, có cache | SEO, tải nhanh, Guest không cần đăng nhập |
| Dữ liệu riêng của user (`moodLogs`, `testAttempts`, `favorites`, `users/{uid}`) | **Client SDK + Security Rules** | Realtime, offline persistence, optimistic UI (PRD 10.6) |
| Ghi có đặc quyền (`setUserRole`, xóa dữ liệu liên đới, audit) | **Cloud Functions callable** | Client không bao giờ được ghi trực tiếp |
| Admin CRUD nội dung (`testDefinitions`, `resources`) | **Client SDK + Rules** (`isAdmin()`), ghi `auditLogs` qua Function | Rules đủ mạnh; audit cần Admin SDK |

**Quy tắc kiểm tra:** nếu một truy vấn cần dữ liệu của user khác → phải đi qua Cloud Function. Không ngoại lệ.

### 3.2. Cấu trúc thư mục

Lệch khỏi PRD §4.3: bỏ tầng `/apps` vì chỉ có một web app. Cần app thứ hai thì tách sau vẫn kịp.

```
examcalm/
  src/
    app/
      (public)/          # /, /gioi-thieu, /test, /thu-vien, /thu-vien/[slug]
      (student)/         # /tien-trinh, /nhat-ky, /ho-so   (bọc bởi auth guard)
      (admin)/           # /admin/tests, /admin/thu-vien, /admin/nguoi-dung
      api/               # route handlers khi cần (session login/logout)
      layout.tsx
    components/
      ui/                # shadcn/ui
      mascot/            # mascot mèo + floating mood widget
      test/  library/  mood/
    lib/
      firebase/client.ts     # Web SDK init + App Check
      firebase/admin.ts      # Admin SDK (server-only)
      firebase/session.ts    # session cookie helpers
      types/                 # Zod schema dùng chung client + server
  functions/
    src/
      admin/setUserRole.ts
      admin/deleteUserData.ts
      audit/writeAuditLog.ts
      index.ts
  tests/
    rules/               # Security Rules test suite (Emulator)
    e2e/                 # Playwright
  firestore.rules   firestore.indexes.json   storage.rules
  firebase.json     apphosting.yaml    .firebaserc
  scripts/
    bootstrap-admin.ts   # gán admin đầu tiên (chạy 1 lần, local)
    seed-dev.ts          # seed dữ liệu mẫu vào Emulator/dev
    export-research.ts   # xuất dữ liệu ẩn danh cho phân tích KHKT (§11)
```

### 3.3. Tech stack chốt (phiên bản thực tế, kiểm tra 2026-08-22)

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Next.js | **16.3.x** (App Router) | ⚠️ Xem rủi ro R1 §10 — phải xác minh App Hosting đánh dấu `active` chứ không phải `preview`; nếu `preview` → hạ về 15.x |
| React | 19.2.x | |
| TypeScript | 5.x, `strict: true` | |
| Tailwind CSS | 4.3.x | |
| shadcn/ui | latest | Dựng UI nhanh, accessible sẵn |
| firebase (Web SDK) | 12.18.x | |
| firebase-admin | 14.3.x | Server-only, không bao giờ vào client bundle |
| firebase-functions | 7.3.x | 2nd gen |
| zod | 4.4.x | Validate input + chia sẻ type client/server |
| @firebase/rules-unit-testing | 5.0.x | Test Security Rules |
| Vitest + Testing Library | latest | Unit/component |
| Playwright | latest | E2E trên Emulator |
| Node.js runtime | 22 | App Hosting hỗ trợ Node 20+ |

### 3.4. Hosting và domain

Xác minh từ docs Firebase: `.web.app` thuộc **Firebase Hosting**; **App Hosting** cấp domain riêng dạng `<backend>--<project>.<region>.hosted.app` và không nhận `.web.app` làm custom domain.

**Giải pháp:**
1. Next.js SSR chạy trên **Firebase App Hosting** (đúng PRD §4.2 — GA, hỗ trợ đầy đủ App Router/Server Components, CI/CD gắn GitHub).
2. Tạo thêm site Firebase Hosting `examcalm` → giữ chỗ `examcalm.web.app`, cấu hình **redirect 301** sang backend App Hosting. Miễn phí, giữ URL thương hiệu.
3. Khi mua domain thật (`examcalm.vn` / `examcalm.app`) → gắn thẳng làm custom domain của App Hosting, bỏ redirect.

**Hệ quả chấp nhận:** URL chính tắc cho SEO là domain `.hosted.app` cho tới khi có domain thật. Với quy mô thử nghiệm KHKT, điều này không ảnh hưởng.

### 3.5. Môi trường

| Env | Firebase project | Branch | Ghi chú |
|---|---|---|---|
| Local | Firebase Emulator Suite | — | Nơi phát triển và chạy test chính. Miễn phí. |
| Dev | `examcalm-dev` | `dev` | Chỉ dùng khi cần kiểm chứng thật trên cloud |
| Prod | `examcalm` | `main` | Blaze plan, budget alert, backup Firestore định kỳ |

Cả hai project cần Blaze plan (bắt buộc cho Cloud Functions 2nd gen + App Hosting). **Việc tạo project và nâng Blaze do user thực hiện** — cần đăng nhập tài khoản Google và gắn thẻ thanh toán; agent không có quyền, và đây là hành động phát sinh chi phí thật.

---

## 4. Mô hình dữ liệu (tập con của PRD §5)

Chỉ những collection thuộc Spec #1. Schema giữ nguyên PRD để spec sau ghép vào không phải migrate.

### 4.1. `users/{uid}`

```ts
{
  uid: string,
  role: "student" | "admin",        // mirror của custom claim, CHỈ để query/hiển thị
  nickname: string,
  gradeLevel: "10" | "11" | "12",
  school: string,
  examGoals: string[],
  privacySettings: { aiOptIn: boolean, shareImageWithAI: boolean },  // giữ field, chưa dùng ở Spec #1
  researchConsent: { granted: boolean, grantedAt: Timestamp | null, version: string } | null,  // THÊM — §11
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletionRequestedAt: Timestamp | null,
}
```

**Bẫy bảo mật:** Security Rules **luôn** đọc `request.auth.token.role` (custom claim), **không bao giờ** đọc `resource.data.role`. Field `role` trong doc chỉ để hiển thị danh sách user ở Admin console.

### 4.2. `testDefinitions/{testId}` — admin quản lý, có version

```ts
{
  title: string,
  version: number,
  status: "draft" | "published",
  isSampleContent: boolean,          // THÊM so với PRD — bắt buộc cho Spec #1
  questions: [{ id: string, text: string, options: [{ label: string, score: number }] }],
  scoring: { thresholds: [{ min: number, max: number, level: string, interpretation: string }] },
  disclaimer: string,
  updatedBy: string,
  updatedAt: Timestamp,
}
```

`isSampleContent: true` → UI **bắt buộc** hiển thị banner "Nội dung mẫu — chưa thẩm định chuyên môn, chỉ dùng để thử nghiệm". Đây là ràng buộc đạo đức §1.1, không phải tùy chọn.

### 4.3. `testAttempts/{attemptId}` — chỉ Student

```ts
{ userId, testId, testVersion, answers: Record<string, number>, score, level, createdAt }
```

Immutable sau khi submit (`allow update: if false`). Guest không ghi — kết quả lưu `sessionStorage`.

### 4.4. `moodLogs/{logId}`

```ts
{
  userId: string,
  moodScore: number,                 // 1..10
  moodIcon: string,
  note: string,
  tags: string[],
  context: "standalone" | "before" | "after",
  linkedActivityRef: string | null,  // path tới testAttempts/{id}
  imageUrl: null,                    // giữ field, feature tắt ở Spec #1
  createdAt: Timestamp,
}
```

### 4.5. `resources/{resourceId}` — Library

```ts
{
  title, slug: string, type: "article" | "tip" | "video" | "guide",
  category: string, tags: string[],
  content: string,                   // markdown
  videoUrl: string | null,           // chỉ allowlist domain (YouTube)
  status: "draft" | "published",
  visibility: "public" | "student_only",
  createdBy, createdAt, updatedAt,
}
```

`slug` là field **thêm** so với PRD, cần cho URL đọc được (`/thu-vien/ky-thuat-tho-4-7-8`) và SEO.

### 4.6. `users/{uid}/favorites/{resourceId}`

```ts
{ resourceId: string, savedAt: Timestamp, usedAt: Timestamp | null }
```

### 4.7. `auditLogs/{logId}`

```ts
{ actorUid, action, targetType, targetId, before: any, after: any, timestamp }
```

Chỉ Cloud Function ghi. Spec #1 audit các hành động: `setUserRole`, publish/unpublish `testDefinitions`, publish/unpublish `resources`, `deleteUserData`.

### 4.8. Index cần khai báo (`firestore.indexes.json`)

- `testAttempts`: `userId` ASC + `createdAt` DESC
- `moodLogs`: `userId` ASC + `createdAt` DESC
- `resources`: `status` ASC + `visibility` ASC + `updatedAt` DESC
- `resources`: `status` ASC + `category` ASC + `updatedAt` DESC
- `resources`: `tags` ARRAY_CONTAINS + `status` ASC + `updatedAt` DESC

---

## 5. Auth và phân quyền

### 5.1. Xác thực

- Firebase Auth **email/password**. Bắt buộc verify email trước khi ghi dữ liệu cá nhân (`testAttempts`, `moodLogs`). Riêng việc tạo doc `users/{uid}` **không** yêu cầu verify — hồ sơ được tạo ngay sau đăng ký, trước khi user bấm link xác thực.
- Google Sign-In: để sau, không thuộc Spec #1.
- Anonymous Auth: **không** ở Spec #1 (chỉ cần khi có quota AI — Spec #2). Guest ở Spec #1 hoàn toàn không ghi server.
- **Session cookie**: sau khi đăng nhập ở client, đổi ID token lấy session cookie (`httpOnly`, `secure`, `sameSite=lax`) để Server Component và middleware nhận diện user + role. Đây là mảnh ghép làm Hướng C chạy được.

### 5.2. RBAC

- Nguồn sự thật duy nhất: **custom claim** `role`.
- `setUserRole` — Cloud Function callable, kiểm tra `request.auth.token.role === "admin"`, set claim, mirror field `role` vào `users/{uid}`, ghi `auditLogs`.
- **Bootstrap admin đầu tiên**: `setUserRole` yêu cầu người gọi đã là admin → không tự khởi động được. Giải bằng `scripts/bootstrap-admin.ts` chạy **một lần, local**, dùng service account key set claim cho uid đầu tiên. Script không deploy lên server; service account key nằm trong `.gitignore`.
- Middleware Next.js chặn `/(admin)/**` nếu session cookie không có `role === "admin"`; chặn `/(student)/**` nếu chưa đăng nhập. Middleware là lớp UX, **không phải** lớp bảo mật — Security Rules mới là lớp bảo mật.

### 5.3. App Check

Bật App Check với reCAPTCHA Enterprise ở chế độ **monitor-only** (chưa enforce) trong Spec #1: wiring xong sẵn, xem được số liệu traffic hợp lệ, không nguy cơ chặn nhầm user thật. Chuyển sang **enforce** ở Spec #2 khi có AI call tốn tiền — đúng lúc nó thực sự cần.

---

## 6. Firestore Security Rules (phạm vi Spec #1)

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
      allow update: if (isOwner(uid) && request.resource.data.role == resource.data.role) || isAdmin();
      allow delete: if false;   // xóa đi qua Cloud Function deleteUserData
    }

    match /testAttempts/{id} {
      allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
      allow read:   if (isSignedIn() && resource.data.userId == request.auth.uid) || isAdmin();
      allow delete: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow update: if false;   // immutable sau submit
    }

    match /moodLogs/{id} {
      allow create: if isVerified() && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }

    match /users/{uid}/favorites/{resourceId} {
      allow read, write: if isOwner(uid);
    }

    match /resources/{id} {
      allow read: if (resource.data.status == "published" &&
                      (resource.data.visibility == "public" || isSignedIn()))
                  || isAdmin();
      allow write: if isAdmin();
    }

    match /testDefinitions/{id} {
      allow read:  if resource.data.status == "published" || isAdmin();
      allow write: if isAdmin();
    }

    match /auditLogs/{id} { allow read: if isAdmin(); allow write: if false; }

    match /{document=**} { allow read, write: if false; }   // deny mọi thứ chưa khai báo
  }
}
```

**Khác biệt có chủ đích so với PRD §6:**
- `resources` read có thêm nhánh `|| isAdmin()`. PRD §6 thiếu nhánh này, khiến admin không đọc được bài draft của chính mình qua client SDK — mâu thuẫn với yêu cầu Admin CRUD ở §7.3. `testDefinitions` trong PRD vốn đã có nhánh này, nên đây là sơ suất chứ không phải chủ ý. An toàn: admin vốn đã có `write` toàn collection, cho đọc draft không mở thêm đặc quyền nào.
- Thêm `isVerified()` cho `create` dữ liệu cá nhân — chặn tài khoản email rác.
- `users` update: chặn user tự sửa field `role` của chính mình.
- Thêm catch-all `deny` ở cuối — PRD không có, nhưng bắt buộc để collection tương lai không vô tình mở.
- `users` delete: `false` thay vì `isAdmin()`, vì xóa user phải kéo theo xóa `testAttempts`/`moodLogs`/`favorites` — chỉ Cloud Function làm đúng được.

`storage.rules` ở Spec #1: **deny toàn bộ** (chưa có tính năng upload). Mở dần ở spec sau.

---

## 7. Luồng người dùng

### 7.1. Guest
```
Trang chủ (mascot chào)
  → Làm test lo âu (banner "nội dung mẫu")
  → Kết quả + diễn giải + disclaimer   [lưu sessionStorage, KHÔNG ghi Firestore]
  → CTA theo ngữ cảnh: "Đăng ký để lưu kết quả và theo dõi thay đổi"
  → Đọc Library public / Mood check-in trong phiên (chỉ hiển thị, không lưu)
```
Không pop-up ép đăng nhập khi vừa vào web (PRD 7.1.2).

### 7.2. Student
```
Đăng ký (email/password) → verify email → tạo hồ sơ (nickname, khối, trường, mục tiêu thi)
  → Phiếu đồng ý nghiên cứu (tùy chọn, từ chối vẫn dùng app bình thường)   [§11]
  → Trang Tiến trình
  → Mood check-in qua widget mèo (nổi, safe-area trên mobile)
  → Làm Test: Mood Before → làm test → lưu testAttempts → Mood After (linkedActivityRef)
  → Đọc Library, lưu yêu thích, đánh dấu đã dùng
  → Xem lại lịch sử test + mood theo thời gian
```
Ghi chú: check-in đều đặn **không** hiển thị streak gây áp lực (PRD 7.2.10).

### 7.3. Admin
```
Đăng nhập (đã có custom claim) → /admin
  → CRUD testDefinitions: soạn draft, tăng version, publish/unpublish
  → CRUD resources: markdown editor, tag/category, publish
  → Danh sách user, gán role (gọi setUserRole)
  → Xem auditLogs
```

### 7.4. Chống mất dữ liệu (PRD 10.6)

Bật Firestore offline persistence (IndexedDB) cho client SDK. Submit test và mood log dùng optimistic UI: ghi local trước, SDK tự đồng bộ khi có mạng. Trạng thái "đang chờ đồng bộ" hiển thị rõ cho user.

---

## 8. UI/UX

- **Mobile-first**, breakpoint desktop sau. Widget mèo trên mobile bám safe-area, desktop kéo thả được.
- **Pastel, calm** — không dùng đỏ cảnh báo cho điểm test cao; dùng thang màu trung tính ấm. Ngôn ngữ không phán xét, không gây áp lực.
- **Mascot**: TBD ở PRD §13 → Spec #1 dùng SVG mèo placeholder, tách thành component riêng để thay bằng asset thật mà không sửa logic.
- **Trạng thái đầy đủ**: skeleton / loading / error / empty cho mọi màn hình có fetch.
- **Accessibility**: semantic HTML, keyboard nav, contrast ≥ WCAG AA, tôn trọng `prefers-reduced-motion` (animation mascot phải tắt được).
- **Ngôn ngữ**: tiếng Việt. Dùng `Intl` API cho ngày/giờ/số — **không** cài i18n library (theo CLAUDE.md: chỉ setup i18n khi app thật sự đa ngôn ngữ).

---

## 9. Chiến lược kiểm thử

Theo TDD: test viết trước, đặc biệt cho Security Rules.

| Tầng | Công cụ | Nội dung bắt buộc |
|---|---|---|
| Security Rules | `@firebase/rules-unit-testing` + Vitest trên Emulator | Mỗi collection ở §6 phải có cả case **cho phép** và case **từ chối**. Bắt buộc có: user A không đọc được `moodLogs` của user B; user không tự set `role: "admin"`; `testAttempts` không update được sau khi tạo; Guest không đọc được `resources` `student_only`; mọi collection chưa khai báo đều bị từ chối. |
| Logic thuần | Vitest | Tính điểm test + ánh xạ threshold → level (dễ sai, phải test kỹ, gồm cả biên min/max) |
| Component | Vitest + Testing Library | Form test, mood widget, thẻ resource, banner "nội dung mẫu" |
| Cloud Functions | Vitest + Emulator | `setUserRole` từ chối người gọi không phải admin; `deleteUserData` xóa đủ dữ liệu liên đới |
| E2E | Playwright trên Emulator | Đăng ký → verify → làm test → xem lịch sử; Guest làm test **không** ghi Firestore |

**CI (GitHub Actions):** lint → typecheck → unit → rules test (Emulator) → build. Chạy trên mọi PR. Chưa auto-deploy từ CI — deploy do App Hosting tự làm khi push branch.

---

## 10. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|---|---|
| R1 | Firebase App Hosting có thể chưa đánh dấu Next.js 16 là `active` (phiên bản mới bắt đầu ở trạng thái `preview`) | **Việc đầu tiên của Phase 0**: deploy hello-world lên `examcalm-dev` và xác minh. Nếu `preview` → hạ về Next.js 15.x. Không viết feature nào trước khi xác minh xong. |
| R2 | Blaze plan → chi phí ngoài dự kiến | Đặt budget alert trên cả 2 project ngay khi tạo. Spec #1 chưa có AI nên chi phí chủ yếu là App Hosting + Firestore reads. |
| R3 | Bootstrap admin cần service account key trên máy local | Key vào `.gitignore` + `.env.local`; chạy một lần rồi revoke key. |
| R4 | `firebase-admin` lỡ bị import vào client bundle → lộ credential | Dùng `import "server-only"` trong `lib/firebase/admin.ts`; thêm bước kiểm tra bundle trong CI. |
| R5 | Dữ liệu test mẫu bị hiểu nhầm là thang đo thật | Ba lớp: (a) cờ `isSampleContent` trong doc; (b) banner bắt buộc trên UI mọi nơi hiển thị test đó; (c) `firestore.rules` của **riêng project `examcalm` (prod)** thêm điều kiện `request.resource.data.isSampleContent == false` cho `testDefinitions` khi `status == "published"` — rules deploy theo từng project nên ràng buộc này chỉ tồn tại ở prod. |
| R6 | `e:\PSY_KHKT` **chưa có git repo** | Việc đầu tiên: `git init`, `.gitignore` chuẩn Next.js + Firebase, rồi mới viết code. |
| R7 | Dữ liệu nghiên cứu bị dùng khi user chưa đồng ý | `export-research.ts` chỉ lấy user có `researchConsent.granted === true`, và ẩn danh hóa trước khi xuất — xem §11. |

---

## 11. Dữ liệu cho nghiên cứu KHKT

Vì mục đích của bản này bao gồm **thu thập dữ liệu để dự thi**, cần tách bạch rõ hai thứ:

- **Điều khoản sử dụng** — điều kiện để dùng app.
- **Phiếu đồng ý tham gia nghiên cứu** — riêng biệt, **tùy chọn**. Từ chối vẫn dùng đầy đủ app. Lưu ở `users/{uid}.researchConsent` kèm version của phiếu.

Quy tắc xuất dữ liệu (`scripts/export-research.ts`, chạy local bởi admin):
1. Chỉ lấy user có `researchConsent.granted === true`.
2. Thay `userId` bằng mã ẩn danh (hash có salt, salt không lưu cùng file xuất).
3. **Loại bỏ hoàn toàn** `note` trong `moodLogs` — đây là văn bản tự do có thể chứa thông tin nhận dạng. Chỉ xuất `moodScore`, `tags`, `context`, `createdAt`.
4. Không xuất `nickname`, `school`, email.

**Học sinh dưới 18 tuổi:** đồng ý tham gia nghiên cứu về sức khỏe tinh thần thường cần cả phụ huynh/nhà trường. Đây là mục **cần tư vấn pháp lý/nhà trường**, không tự quyết trong code — xem §12.

---

## 12. TBD còn lại (kế thừa PRD §13)

- Tên và visual identity mascot mèo → dùng placeholder
- Thang đo test, scoring, threshold, diễn giải → **cần chuyên gia tâm lý thẩm định**
- Privacy Policy, Terms, consent cho người vị thành niên → **cần tư vấn pháp lý/nhà trường**
- Nội dung và quy trình phiếu đồng ý nghiên cứu (§11) → **cần nhà trường/giáo viên hướng dẫn duyệt**
- Chính sách retention/xóa dữ liệu cụ thể

**Ràng buộc:** các mục trên phải xong trước khi mở prod cho học sinh thật. Code không bị chặn — nội dung nằm trong `testDefinitions`/`resources`, cập nhật qua Admin console mà không sửa code.

---

## 13. Tiêu chí hoàn thành Spec #1

1. `npm run test` xanh: unit + component + **rules test đủ cả allow và deny cho mọi collection ở §6**
2. `npm run build` không lỗi TypeScript (`strict: true`)
3. Playwright pass luồng Guest làm test và Student đăng ký → làm test → xem lịch sử
4. Deploy thành công lên `examcalm-dev`, truy cập được qua domain App Hosting
5. `examcalm.web.app` redirect đúng sang backend
6. Bootstrap được admin đầu tiên; Admin console CRUD được `testDefinitions` + `resources`
7. Seed dữ liệu mẫu hiển thị đúng banner "nội dung mẫu"
8. Budget alert đã bật trên cả 2 Firebase project

---

*Hết Design Spec #1 — ExamCalm*
