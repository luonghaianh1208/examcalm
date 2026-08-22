# PRD — WEB APP HỖ TRỢ GIẢM LO ÂU TRƯỚC KỲ THI CHO HỌC SINH THPT

**Phiên bản:** 3.0 (Firebase Edition — chuẩn hóa để AI coding agent triển khai)
**Ngày cập nhật:** 2026-08-22
**Nguồn gốc:** Chuyển thể từ `PRD_Web_Ho_Tro_Giam_Lo_Au_Thi_Cu_THPT_v2.0.docx` (v2.0, stack gốc đề xuất Supabase/Vercel). Tài liệu này giữ nguyên toàn bộ phạm vi sản phẩm, tính năng, nguyên tắc thiết kế và KPI của v2.0, nhưng **thiết kế lại toàn bộ kiến trúc kỹ thuật, mô hình dữ liệu, bảo mật và hạ tầng triển khai để chạy 100% trên Firebase** (Firestore làm database, Firebase Auth, Firebase Storage, Cloud Functions/Genkit cho AI, Firebase App Hosting để deploy).
**Đối tượng đọc:** AI coding agent / lập trình viên triển khai sản phẩm. Tài liệu viết theo hướng đặc tả kỹ thuật có thể code trực tiếp — mọi entity đều có schema Firestore cụ thể, mọi luồng nhạy cảm đều có rule bảo mật mẫu.

> **Định vị sản phẩm:** Psychoeducation + self-help + personalized wellbeing companion. Sản phẩm **không chẩn đoán, không trị liệu, không thay thế chuyên gia tâm lý**. Toàn bộ output AI phải được gắn nhãn "nội dung hỗ trợ, không phải kết luận y khoa/tâm lý".

---

## 0. Thay đổi chính so với bản v2.0 (giữ nội dung, đổi hạ tầng)

| Hạng mục | v2.0 (gốc) | v3.0 (bản này) |
|---|---|---|
| Database | Supabase (PostgreSQL) | **Cloud Firestore** (NoSQL document) |
| Auth | Supabase Auth | **Firebase Authentication** |
| Storage | Supabase Storage | **Firebase Storage (Cloud Storage for Firebase)** |
| Backend logic | Supabase RLS + Edge Functions | **Cloud Functions for Firebase (2nd gen) + Genkit flows** |
| Hosting/Deploy | Vercel | **Firebase App Hosting** (Next.js SSR, GA từ 04/2025) |
| Row-level security | Postgres RLS | **Firestore Security Rules** (đặc tả mẫu ở mục 6) |
| Analytics | Tự xây dashboard | **Google Analytics for Firebase (GA4)** + Firestore aggregation collections |
| Phạm vi tính năng, UX, nguyên tắc thiết kế, KPI | — | **Không đổi**, giữ nguyên toàn bộ so với v2.0 |

---

## 1. Tầm nhìn sản phẩm

Xây dựng một nền tảng hỗ trợ sức khỏe tinh thần học đường thân thiện, dễ tiếp cận, tương tác cao, giúp học sinh THPT hiểu trạng thái cảm xúc của mình trước kỳ thi và chủ động chọn hoạt động phù hợp để điều chỉnh tâm trạng.

Các trụ cột sản phẩm:

- **Public-first**: cho phép trải nghiệm nhiều tính năng ngay cả khi chưa đăng nhập (Guest), tạo giá trị trước rồi mới thúc đẩy đăng ký.
- **Mascot-first**: một mascot mèo là điểm nhận diện xuyên suốt, gắn chặt với Nhật ký cảm xúc (Mood Journal) ứng dụng AI để phản chiếu cảm xúc và tạo nội dung cá nhân hóa.
- **Cá nhân hóa hành trình**: Nhận diện → Ghi nhận cảm xúc → Sử dụng tài nguyên → Ghi nhận sau hoạt động → Xem báo cáo → Nhận gợi ý tiếp theo.
- **Community an toàn**: Confession ẩn danh có AI moderation để giảm tải kiểm duyệt thủ công mà vẫn an toàn.
- **Music Hub đa nguồn**: kho nhạc nội bộ, Epidemic Sound (có giấy phép), media tự upload, YouTube link hợp lệ — quản lý chặt metadata bản quyền.
- **Dashboard cá nhân hóa**: chỉ số, xu hướng, tiến trình theo thời gian, không mang tính chẩn đoán.

Tên sản phẩm & tên/visual mascot: **TBD** (xem mục 13 — cần chốt trước production).

---

## 2. Nhóm người dùng

### 2.1. Vai trò

| Vai trò | Mô tả | Cơ chế xác thực Firebase |
|---|---|---|
| **Guest** | Khách chưa đăng ký, dùng được phần lớn tính năng công khai trong phiên | Không cần đăng nhập, hoặc dùng **Firebase Anonymous Auth** để có `uid` tạm phục vụ rate-limit/quota theo device |
| **Student** | Học sinh THPT có tài khoản | `Firebase Auth` (email/password), custom claim `role: "student"` |
| **Admin** | Quản trị nội dung, AI moderation, media, user, báo cáo | `Firebase Auth`, custom claim `role: "admin"` set qua Cloud Function bảo vệ, không tự đăng ký được |

Không có vai trò Tư vấn viên/Counselor và không có module "Hỗ trợ kết nối" trong phiên bản này.

### 2.2. Phạm vi người dùng

- Truyền thông & thử nghiệm ban đầu ưu tiên học sinh THPT tại Hải Phòng.
- Đăng ký trường học không giới hạn Hải Phòng; người dùng nhập/chọn trường trên toàn quốc.

---

## 3. Nguyên tắc thiết kế

1. **Mobile-first** — tối ưu trải nghiệm điện thoại trước desktop.
2. **Public-first** — Guest phải nhận giá trị thật trước khi bị yêu cầu đăng nhập.
3. **Progressive conversion** — chỉ yêu cầu tài khoản khi người dùng muốn lưu lịch sử, mở báo cáo sâu, cá nhân hóa hoặc tạo nội dung.
4. **Mascot-first interaction** — mèo là điểm nhận diện xuyên suốt, đặc biệt gắn với Nhật ký cảm xúc.
5. **Private by default** — test, nhật ký, AI reflection, báo cáo cá nhân là dữ liệu riêng tư (thực thi bằng Firestore Security Rules, không chỉ ở UI).
6. **AI as assistant, not authority** — AI phản chiếu/gợi ý/tạo nội dung, không khẳng định chẩn đoán hay kết luận tâm lý.
7. **Safe community by design** — Confession phải qua moderation engine trước khi public.
8. **Calm & friendly** — pastel, nhẹ nhàng, sinh động nhưng không trẻ con; tránh ngôn ngữ gây áp lực/phán xét.
9. **Actionable** — mỗi kết quả nên dẫn tới một bước tiếp theo có thể thực hiện ngay.
10. **Explainable AI** — nội dung AI tạo phải được nhận diện rõ (badge "AI tạo"); người dùng có quyền bỏ qua/chỉnh sửa/xóa.

---

## 4. Kiến trúc hệ thống (Firebase)

### 4.1. Sơ đồ lớp hệ thống

| Lớp | Thành phần chính | Công nghệ Firebase/Google Cloud |
|---|---|---|
| Experience Layer | Public pages, Student app, Admin console, mascot mèo, Mood Journal widget | Next.js (App Router) + TypeScript + Tailwind CSS |
| Core Product Layer | Test, CBT, Library, Confession, Music Hub, Progress, Dashboard | Next.js server actions/route handlers + Cloud Functions callable |
| AI Layer | Mood reflection/generation, journal content cá nhân hóa, confession moderation, rule suggestion, recommendation | **Genkit flows** chạy trên Cloud Functions, gọi Vertex AI (Gemini) hoặc provider khác qua abstraction layer |
| Data Layer | User profile, test attempts, mood logs, AI outputs, CBT sessions, resources, moderation logs, playlists, usage analytics | **Cloud Firestore** |
| Media Layer | Upload media, metadata quyền sử dụng, external link adapter | **Firebase Storage** + Firestore metadata + YouTube/Epidemic embed adapter |
| Security Layer | Auth, RBAC, rate limit, audit log, privacy controls, AI safety rules | **Firebase Auth** (custom claims) + **Firestore Security Rules** + **App Check** |
| Hosting/Deploy | SSR frontend + API + CI/CD | **Firebase App Hosting** (Next.js) + **Firebase Hosting** (nếu tách static) |

### 4.2. Tech stack chốt

- **Frontend**: Next.js 14+ (App Router) + TypeScript + Tailwind CSS + shadcn/ui (khuyến nghị cho tốc độ dựng UI).
- **Backend/Data/Auth**: **Firebase** — Cloud Firestore (DB chính), Firebase Authentication, Cloud Storage for Firebase, Cloud Functions for Firebase (2nd gen, Node.js/TypeScript).
- **AI orchestration**: **Genkit** (framework AI chính thức của Firebase) — quản lý flow, prompt versioning, structured output (JSON schema), dễ đổi model provider (Gemini/Vertex AI mặc định, có thể thêm OpenAI qua plugin) mà không viết lại feature.
- **Hosting**: **Firebase App Hosting** cho Next.js SSR (GA từ 04/2025, hỗ trợ đầy đủ App Router/Server Components, tích hợp Cloud Build + GitHub). Đây là lựa chọn "deploy luôn trên Firebase" thay cho Vercel.
- **Bảo mật tầng edge**: **Firebase App Check** (chặn traffic không hợp lệ gọi Cloud Functions/Firestore từ ngoài app thật) — đặc biệt quan trọng vì có AI calls tốn chi phí.
- **Source control**: GitHub, CI/CD qua GitHub Actions + Firebase App Hosting auto-deploy theo branch.
- **Analytics**: Google Analytics for Firebase (GA4) cho funnel/KPI aggregate; Firestore aggregation collections cho dashboard cá nhân hóa theo user.

### 4.3. Cấu trúc project đề xuất

```
/apps
  /web                     # Next.js app (App Router)
    /app
      /(public)/...        # Trang chủ, About, Test, Library, Confession public, Playlist public
      /(student)/...       # Dashboard, Mood Journal, CBT, Music Hub cá nhân, Progress
      /(admin)/...         # Admin console
    /components
    /lib/firebase           # firebase client SDK init (web)
/functions                  # Cloud Functions (2nd gen) + Genkit flows
  /src
    /ai                    # Genkit flows: moodReflection, storyGeneration, moderation, ruleMining
    /moderation             # Pipeline: normalize -> hard-rule -> AI classify -> risk score -> decision
    /aggregation            # Scheduled functions: rollup dashboard, retention, KPI
    /admin                  # Callable functions: setUserRole, overrideModeration, manageRules
/firestore.rules
/firestore.indexes.json
/storage.rules
/firebase.json
/apphosting.yaml
```

### 4.4. Môi trường (Firebase Projects)

Tạo **3 Firebase project riêng biệt** (không dùng chung 1 project cho nhiều env, tránh rò rỉ dữ liệu thật sang dev):

- `<app>-dev` — phát triển, seed data giả, AI dùng model rẻ/free tier.
- `<app>-staging` — UAT trước khi release, dữ liệu test, bật đầy đủ moderation.
- `<app>-prod` — production, bật App Check bắt buộc, backup Firestore định kỳ, budget alert cho AI/Cloud Functions.

---

## 5. Mô hình dữ liệu Firestore

> Firestore là NoSQL document-oriented — không có JOIN hay RLS kiểu Postgres. Nguyên tắc thiết kế: **denormalize vừa đủ** để đọc rẻ, **subcollection** cho quan hệ 1-nhiều gắn chặt owner, **top-level collection** cho dữ liệu cần query cross-user (moderation queue, analytics, admin content).

### 5.1. `users/{uid}`

```ts
{
  uid: string,
  role: "student" | "admin",           // set qua custom claim, đồng bộ vào doc để query
  nickname: string,
  gradeLevel: "10" | "11" | "12",
  school: string,
  examGoals: string[],                 // multi-select + free text
  privacySettings: {
    aiOptIn: boolean,                  // cho phép gửi note sang AI provider ngoài
    shareImageWithAI: boolean,
  },
  createdAt: Timestamp,
  updatedAt: Timestamp,
  deletionRequestedAt: Timestamp | null,
}
```

### 5.2. `testDefinitions/{testId}` (admin-managed, versioned)

```ts
{
  title: string,
  version: number,
  status: "draft" | "published",
  questions: [{ id, text, options: [{ label, score }] }],
  scoring: { thresholds: [{ min, max, level, interpretation }] },
  disclaimer: string,
  updatedBy: string,   // admin uid
  updatedAt: Timestamp,
}
```

### 5.3. `testAttempts/{attemptId}` (Student only; Guest không lưu server-side)

```ts
{
  userId: string,          // owner, phải == request.auth.uid
  testId: string,
  testVersion: number,
  answers: Record<string, number>,
  score: number,
  level: string,
  createdAt: Timestamp,
}
```

### 5.4. `cbtModules/{moduleId}` (admin content, versioned — cấu trúc tương tự `testDefinitions`)

### 5.5. `cbtSessions/{sessionId}`

```ts
{
  userId: string,
  moduleId: string,
  moduleVersion: number,
  moodBefore: number | null,   // 1-10
  moodAfter: number | null,
  answers: Record<string, any>,
  summary: string,
  createdAt: Timestamp,
}
```

### 5.6. `moodLogs/{logId}`

```ts
{
  userId: string,               // owner-only read/write
  moodScore: number,            // 1-10
  moodIcon: string,
  note: string,
  tags: string[],
  context: "standalone" | "before" | "after",
  linkedActivityRef: string | null,   // path tới testAttempt/cbtSession/resource
  imageUrl: string | null,      // optional, feature-flagged
  createdAt: Timestamp,
}
```

### 5.7. `aiJournalOutputs/{outputId}`

```ts
{
  userId: string,
  moodLogId: string,
  reflectionText: string,          // 2-4 câu, ngôn ngữ không chắc chắn ("có vẻ", "từ những gì bạn chia sẻ")
  catStoryText: string,            // "Câu chuyện của mèo hôm nay"
  journalPrompt: string,
  suggestedResourceIds: string[],
  promptTemplateId: string,
  promptVersion: number,
  modelProvider: string,
  modelVersion: string,
  userFeedback: "helpful" | "not_helpful" | null,
  regeneratedFrom: string | null,  // outputId gốc nếu regenerate
  createdAt: Timestamp,
}
```

### 5.8. `resources/{resourceId}` (Library)

```ts
{
  title: string, type: "article" | "tip" | "video" | "guide",
  category: string, tags: string[],
  content: string,          // markdown hoặc rich text
  videoUrl: string | null,
  status: "draft" | "published",
  visibility: "public" | "student_only",
  createdBy: string, createdAt: Timestamp, updatedAt: Timestamp,
}
```

- `users/{uid}/favorites/{resourceId}` — subcollection lưu resource đã lưu/đã dùng của từng student.

### 5.9. `confessions/{confessionId}`

```ts
{
  authorUid: string,             // KHÔNG BAO GIỜ trả về trong public read — che ở API layer/Cloud Function
  textContent: string,
  status: "pending" | "auto_approved" | "hold" | "rejected" | "hidden",
  moderationResult: {
    ruleMatches: string[], aiRiskScore: number,
    decision: "auto_approve" | "hold" | "reject",
    decidedAt: Timestamp,
  },
  reportCount: number,
  createdAt: Timestamp,
  publishedAt: Timestamp | null,
}
```

> **Quan trọng**: Client KHÔNG được đọc trực tiếp field `authorUid` của confession người khác. Dùng Cloud Function/Firestore Rules để expose một **view collection** riêng cho public: `confessionsPublic/{confessionId}` (chỉ chứa `textContent`, `createdAt`, `status`) được Cloud Function ghi sang sau khi `status` chuyển `auto_approved` — tách biệt hoàn toàn khỏi `authorUid`.

### 5.10. `moderationLogs/{logId}` (audit trail — admin/system only)

```ts
{ confessionId, decision, ruleMatchesSnapshot, aiScore, actor: "system" | adminUid, note, timestamp }
```

### 5.11. `moderationRules/{ruleId}`

```ts
{
  category: "pii" | "bullying" | "spam" | "inappropriate" | "priority_review" | "custom",
  keywords: string[], pattern: string | null,
  threshold: number,
  status: "active" | "pending_admin_review" | "disabled",
  source: "admin" | "ai_suggested",
  version: number, createdBy: string, updatedAt: Timestamp,
}
```

### 5.12. `mediaAssets/{assetId}`

```ts
{
  title: string,
  sourceType: "internal" | "epidemic_sound" | "user_upload" | "youtube",
  sourceUrl: string,             // storage path hoặc external URL
  ownerUploader: string,
  licenseSource: string,
  rightsStatus: "cleared" | "pending" | "restricted",
  rightsExpiry: Timestamp | null,
  visibility: "public" | "private",
  moderationStatus: "approved" | "pending" | "rejected",
  durationSec: number | null,
  thumbnailUrl: string | null,
  createdAt: Timestamp,
}
```

### 5.13. `playlists/{playlistId}`

```ts
{
  ownerId: string,   // uid hoặc "admin"
  title: string, purpose: string,   // "thư giãn" | "tập trung" | "trước giờ ôn thi" | ...
  trackAssetIds: string[],
  visibility: "public" | "personal",
  createdAt: Timestamp,
}
```

- `users/{uid}/playlistFavorites/{playlistId}` — subcollection.

### 5.14. `promptTemplates/{templateId}`

```ts
{ name: "mood_reflection" | "story_generation" | "moderation", version: number,
  templateText: string, status: "draft" | "published", modelConfig: {...}, updatedBy, updatedAt }
```

### 5.15. `systemConfig/aiConfig`

```ts
{
  provider: string, model: string,
  quotaGuestPerDay: number, quotaStudentPerDay: number, rateLimitPerMinute: number,
  killSwitch: { moodReflection: boolean, storyGeneration: boolean, moderationAI: boolean, ruleMining: boolean },
}
```

### 5.16. `auditLogs/{logId}` (admin action audit)

```ts
{ actorUid, action, targetType, targetId, before: any, after: any, timestamp }
```

### 5.17. Aggregation collections (cho Dashboard, tránh query nặng client-side)

- `users/{uid}/dashboardRollups/{period}` (period = `7d` | `30d` | `90d` | `all`), field: `testTrend[]`, `moodTrend[]`, `moodBeforeAfterPairs[]`, `resourceUsageCount`, `cbtSessionsCount`, `topHelpingActivities[]`. Được ghi bởi **scheduled Cloud Function** chạy hằng ngày (Cloud Scheduler + Functions) hoặc on-write trigger nhẹ.
- `analyticsDaily/{date}` — số liệu KPI aggregate toàn hệ thống (guest→register conversion, activation, retention...) cho Admin Analytics, tính từ GA4 export + Firestore counters, **không chứa nội dung nhật ký/confession**.

### 5.18. `guestQuota/{deviceOrSessionId}` (kiểm soát chi phí AI cho Guest)

```ts
{ aiCallsToday: number, lastReset: Timestamp, ip: string | null }
```

---

## 6. Firestore Security Rules (RBAC / thay thế RLS)

Nguyên tắc: **private by default**, chỉ owner đọc/ghi dữ liệu cá nhân; admin có quyền qua custom claim `role == "admin"`; mọi ghi dữ liệu nhạy cảm (AI output, moderation decision) đi qua Cloud Function (Admin SDK), client không được ghi trực tiếp.

```js
// firestore.rules (trích các rule cốt lõi — agent code triển khai đầy đủ theo schema mục 5)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function isOwner(uid) { return isSignedIn() && request.auth.uid == uid; }
    function isAdmin() { return isSignedIn() && request.auth.token.role == "admin"; }

    match /users/{uid} {
      allow read: if isOwner(uid) || isAdmin();
      allow create: if isOwner(uid);
      allow update: if isOwner(uid) || isAdmin();
      allow delete: if isAdmin();
    }

    match /testAttempts/{id} {
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow read, delete: if isSignedIn() && resource.data.userId == request.auth.uid || isAdmin();
      allow update: if false; // immutable sau khi submit
    }

    match /moodLogs/{id} {
      allow create: if isSignedIn() && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if isSignedIn() && resource.data.userId == request.auth.uid;
    }

    match /aiJournalOutputs/{id} {
      // CHỈ Cloud Function (Admin SDK, bỏ qua rules) được ghi; client chỉ đọc của chính mình
      allow read: if isSignedIn() && resource.data.userId == request.auth.uid;
      allow write: if false;
    }

    match /confessions/{id} {
      allow create: if isSignedIn() && request.resource.data.authorUid == request.auth.uid
                     && request.resource.data.status == "pending";
      allow read: if isSignedIn() && resource.data.authorUid == request.auth.uid || isAdmin();
      allow update: if isAdmin();
    }

    match /confessionsPublic/{id} {
      allow read: if true;      // Guest + Student đều đọc được, không chứa authorUid
      allow write: if false;    // chỉ Cloud Function ghi qua Admin SDK
    }

    match /moderationLogs/{id} { allow read, write: if isAdmin(); }
    match /moderationRules/{id} { allow read: if isAdmin(); allow write: if isAdmin(); }
    match /auditLogs/{id} { allow read: if isAdmin(); allow write: if false; }

    match /resources/{id} {
      allow read: if resource.data.status == "published" &&
                     (resource.data.visibility == "public" || isSignedIn());
      allow write: if isAdmin();
    }

    match /testDefinitions/{id} { allow read: if resource.data.status == "published"; allow write: if isAdmin(); }
    match /cbtModules/{id} { allow read: if resource.data.status == "published"; allow write: if isAdmin(); }

    match /playlists/{id} {
      allow read: if resource.data.visibility == "public" ||
                     (isSignedIn() && resource.data.ownerId == request.auth.uid);
      allow write: if isSignedIn() && request.resource.data.ownerId == request.auth.uid || isAdmin();
    }

    match /mediaAssets/{id} {
      allow read: if resource.data.visibility == "public" && resource.data.moderationStatus == "approved";
      allow write: if isAdmin();
    }

    match /systemConfig/{id} { allow read: if isAdmin(); allow write: if isAdmin(); }
    match /guestQuota/{id} { allow read, write: if false; } // chỉ Cloud Function
  }
}
```

`storage.rules` áp dụng tương tự: media upload cá nhân vào `users/{uid}/uploads/**` chỉ owner ghi được; media public đọc mở, ghi chỉ Cloud Function/Admin.

---

## 7. Chức năng chi tiết

### 7.1. GUEST

**7.1.1. Trải nghiệm công khai mở rộng**
- Xem Trang chủ, About us, hướng dẫn sử dụng, giới thiệu mascot.
- Làm đầy đủ bài test lo âu công khai, nhận kết quả cơ bản **trong phiên** (không ghi Firestore, chỉ xử lý client-side hoặc lưu tạm trong `sessionStorage`).
- Truy cập thư viện tài nguyên công khai (`resources` có `visibility == public`).
- Xem Confession đã duyệt/public (`confessionsPublic`).
- Nghe playlist công khai (`playlists.visibility == public`).
- Dùng Mood Check-in cơ bản với mascot trong phiên; có thể nhận 1 AI reflection ngắn nếu còn quota Guest (`guestQuota`).
- Xem preview dashboard mẫu để hiểu lợi ích đăng ký (dữ liệu tĩnh/demo, không phải data thật).

**7.1.2. Cơ chế tạo động lực đăng nhập** — CTA theo ngữ cảnh (sau test, sau mood check-in, khi xem resource/playlist), không dùng pop-up ép đăng nhập ngay khi vào web.

**7.1.3. Giới hạn Guest**
- Không lưu lịch sử dài hạn trên server (Firestore không lưu `testAttempts`/`moodLogs` cho Guest — chặn bằng Security Rule yêu cầu `isSignedIn()`).
- Không xem dashboard cá nhân hóa thật, không tạo Confession/playlist cá nhân/favorites.
- AI quota giới hạn theo `guestQuota` (keyed theo Firebase Anonymous Auth `uid` + kiểm tra IP ở Cloud Function) để chống abuse/chi phí.

### 7.2. HỌC SINH (Student)

**7.2.1. Tài khoản & hồ sơ** — Đăng ký/đăng nhập email + mật khẩu qua Firebase Auth; hồ sơ lưu ở `users/{uid}`; cài đặt quyền riêng tư (`privacySettings`), yêu cầu xóa dữ liệu (`deletionRequestedAt` → Cloud Function xử lý xóa/anonymize theo policy).

**7.2.2. Mascot mèo – AI Companion** — Xuất hiện linh hoạt (Trang chủ, Dashboard, Test, CBT, Library, Mini-activities); vai trò: tăng tương tác, hướng dẫn UI, nhắc bước tiếp theo, gắn với Mood Journal; ngôn ngữ ấm áp, không tự xưng chuyên gia, không chẩn đoán.

**7.2.3. Nhật ký cảm xúc ứng dụng AI**
- Floating widget hình mèo (mobile: vị trí safe-area cố định; desktop: kéo thả).
- Input: mood icon, điểm 1–10, ghi chú, tag ngữ cảnh, ảnh tùy chọn (feature flag `privacySettings.shareImageWithAI`).
- Mood Before (trước Test/CBT/resource) và Mood After (sau hoạt động) tạo cặp so sánh — lưu `linkedActivityRef`.
- **Genkit flow `moodReflectionFlow`**: input = `moodLog` + context được phép; output = structured JSON (`reflectionText`, `catStoryText`, `journalPrompt`, `suggestedResourceIds`) ghi vào `aiJournalOutputs` qua Cloud Function (client không ghi trực tiếp).
- Regenerate / chỉnh sửa ghi chú gốc / đánh giá output (`userFeedback`) / tắt AI Journal (`privacySettings`).
- Ngôn ngữ AI output bắt buộc dùng hedge language ("có vẻ", "từ những gì bạn chia sẻ"); safety post-processing rule chặn nhãn chẩn đoán.
- Không gửi ảnh/nội dung nhạy cảm cho AI provider ngoài nếu chưa `aiOptIn = true`.

**7.2.4. Test đánh giá mức độ lo âu** — Disclaimer trước khi bắt đầu; hiển thị điểm/mức độ/diễn giải/gợi ý hành động; Student lưu lịch sử (`testAttempts`), Guest chỉ xem kết quả phiên; Admin quản lý câu hỏi/scoring/threshold/version (`testDefinitions`); **nội dung test/scoring chính thức cần thẩm định chuyên môn trước production (xem mục 13)**.

**7.2.5. CBT** — Bộ câu hỏi nhận diện suy nghĩ tiêu cực liên quan lo âu thi cử; có Mood Before/After; kết quả có rationale + link tới Library/Music Hub liên quan; Admin quản lý nội dung/version (`cbtModules`), không hard-code nội dung chuyên môn trong code.

**7.2.6. Thư viện giảm lo âu** — Bài viết/tips/video/hướng dẫn thư giãn-thiền-chánh niệm-quản lý căng thẳng-học tập-chuẩn bị thi; search/filter theo type/category/tags; draft/published; Student lưu yêu thích + đánh dấu đã dùng + nhận recommendations cá nhân hóa; Guest truy cập phần public.

**7.2.7. Confession / Blog ẩn danh với AI moderation** — Xem pipeline chi tiết ở mục 8.2. Public view (`confessionsPublic`) không lộ `authorUid`/email. Người dùng có nút Report với bài đã public (tăng `reportCount`, đưa lại vào queue nếu vượt ngưỡng).

**7.2.8. Music Hub / Playlist** — Tạo playlist cá nhân theo mood/mục đích; nguồn media: (1) kho nội bộ, (2) Epidemic Sound có giấy phép, (3) upload có quyền sử dụng, (4) YouTube embed hợp lệ (allowlist domain). Ưu tiên kho nội bộ. Mỗi asset bắt buộc có metadata quyền sử dụng (`mediaAssets`, mục 5.12). Không autoplay mặc định; lazy-load; fallback mở link ngoài nếu embed lỗi.

**7.2.9. Dashboard cá nhân hóa & báo cáo chi tiết** — Trang trung tâm sau đăng nhập; hiển thị kết quả test gần nhất, trend test, mood trend, theme cảm xúc AI tổng hợp, cặp Before/After, CBT sessions, resource usage, playlist/favorites, hoạt động gần đây; filter 7/30/90 ngày/toàn bộ (đọc từ `dashboardRollups`, không query raw collection lớn ở client); AI Weekly/Monthly Reflection; mục "Điều đang giúp bạn nhiều nhất" diễn đạt là correlation/pattern, **không phải causal efficacy**; Export Personal Report — giai đoạn sau (Phase 2+).

**7.2.10. Tiến trình & cá nhân hóa** — Lưu lịch sử Test/CBT/Mood/resource/playlist; theo dõi đều đặn check-in **không tạo streak gây áp lực**; cá nhân hóa recommendation theo exam goal + mood pattern + activity history + preference; người dùng xóa được từng log/lịch sử theo policy (Cloud Function xử lý xóa liên đới, ví dụ xóa `moodLog` kéo theo `aiJournalOutputs` liên quan).

### 7.3. ADMIN

- **7.3.1. Quản trị nội dung** — Test/CBT/Library/About-news/playlist gợi ý/media assets; draft/published/version; quản lý tags/categories/recommendation mapping.
- **7.3.2. AI Moderation Console** — Xem queue (`confessions.status == "hold"`), AI decision/category/risk score/explanation; Approve/Reject/Hide/Override (ghi `moderationLogs` + `auditLogs`); quản lý `moderationRules` (keyword/threshold/version); duyệt rule do AI đề xuất (`source == "ai_suggested"` → `status: pending_admin_review`).
- **7.3.3. AI Content & Prompt Management** — Quản lý `promptTemplates` (Mood Reflection, Story, Moderation), version + test trước publish; cấu hình model/provider theo env (`systemConfig/aiConfig`); cấu hình quota Guest/Student + rate limit; **kill switch** tắt riêng từng AI feature khi lỗi/chi phí bất thường.
- **7.3.4. Music & Media Management** — Upload/quản lý audio-video-thumbnail (Firebase Storage); theo dõi nguồn + metadata quyền sử dụng; quản lý playlist public/recommended; ẩn/gỡ asset hết quyền; theo dõi dung lượng storage.
- **7.3.5. User & System Management** — Quản lý tài khoản/role (set custom claim qua Cloud Function callable `setUserRole`, chỉ admin gọi được); theo dõi hoạt động hệ thống mức aggregate; **không hiển thị nội dung nhật ký/test cá nhân trong analytics thông thường**; audit action nhạy cảm (`auditLogs`).
- **7.3.6. Analytics** — Guest→Register conversion, activation, test completion, mood check-in, AI journal usage, CBT/resource usage, confession moderation rates (auto-approve/hold/reject/override), music hub engagement, 7/30-day retention, dashboard engagement/report views (nguồn: GA4 + `analyticsDaily`).

---

## 8. AI Layer (Genkit trên Cloud Functions)

### 8.1. Nguyên tắc

- Tách **AI Service layer** khỏi UI (Genkit flows trong `/functions/src/ai`) để đổi provider/model không phải viết lại feature.
- **Prompt versioning**: mỗi flow đọc `promptTemplates` theo `status == "published"` mới nhất; admin test prompt ở môi trường staging trước khi publish.
- **Structured output**: mọi flow trả JSON theo schema cố định (Genkit hỗ trợ output schema qua Zod) để UI render ổn định, tránh parse text tự do.
- **Rate limiting & quota** riêng Guest/Student/Admin (`systemConfig/aiConfig`, thực thi trong Cloud Function trước khi gọi model).
- **Gắn nhãn** mọi nội dung AI-generated trên UI ("Nội dung do AI tạo").
- **Fallback khi AI lỗi**: Mood Journal vẫn lưu được (ghi `moodLogs` độc lập với việc gọi AI thành công hay không); core feature không phụ thuộc AI layer.
- **Không dùng AI output như chẩn đoán** — safety prompt (system instruction cấm ngôn ngữ chẩn đoán) + post-processing rule (regex/checklist chặn từ khóa chẩn đoán trước khi lưu).
- **Không dùng raw private journal/test data để train model ngoài** nếu chưa có policy/consent — cấu hình provider phải tắt "data retention for training" (ví dụ Vertex AI theo mặc định không dùng dữ liệu khách hàng để train).

### 8.2. AI Moderation Engine (Confession)

Pipeline (Cloud Function trigger `onCreate` của `confessions/{id}`):

```
normalize (chuẩn hóa text, ẩn PII pattern)
  → hard-rule scan (đối chiếu moderationRules đang active)
    → AI classification (Genkit moderation flow: category, riskScore 0-1, explanation ngắn)
      → risk scoring (kết hợp rule match + AI score theo trọng số cấu hình)
        → decision:
            - risk thấp & không match rule nghiêm trọng → auto_approved → ghi confessionsPublic
            - không chắc chắn → hold (vào Admin queue)
            - vi phạm rõ / risk cao → rejected/hidden
          → moderationLogs (ghi toàn bộ input/output/quyết định — audit trail)
```

- **Fail-safe**: khi model unavailable hoặc confidence thấp → luôn chuyển `hold`, không bao giờ auto-public khi không chắc chắn.
- **Rule mining**: scheduled Genkit flow định kỳ phân tích pattern từ `moderationLogs` + admin feedback, đề xuất rule mới vào `moderationRules` với `status: pending_admin_review` — **không tự động kích hoạt**, admin phải duyệt trước khi `status: active` (trừ khi policy tương lai cho phép auto-activate có kiểm soát).
- Threshold configurable theo version; rollout rule mới cần version + test set + khả năng rollback (giữ lịch sử version trong `moderationRules` hoặc collection `moderationRuleHistory`).

### 8.3. Output mẫu AI Journal

Mood label gợi ý • Reflection 2–4 câu • "Câu chuyện của mèo hôm nay" • 1 journal prompt • 1–3 hoạt động/tài nguyên gợi ý. Tất cả là nội dung hỗ trợ, không phải kết luận tâm lý.

---

## 9. User Flow

**Guest**: Trang chủ → Mascot giới thiệu → Làm test / Mood Check-in / Xem Library / Nghe Playlist / Đọc Confession → Nhận giá trị cơ bản → Thấy preview lịch sử & báo cáo → Đăng ký để lưu tiến trình và mở cá nhân hóa.

**Học sinh – Core flow**: Đăng nhập → Dashboard cá nhân hóa → Mood Check-in với mèo → Chọn Test / CBT / Library / Music Hub → Mood After → AI Reflection + Câu chuyện → Cập nhật Progress → Nhận Recommendation → Xem báo cáo 7/30/90 ngày.

**Học sinh – Confession flow**: Đăng nhập → Viết Confession → AI Moderation → Auto-approve hoặc Hold/Reject theo policy → Public ẩn danh nếu được duyệt → Community có thể Report → Admin review khi cần.

**Học sinh – Music flow**: Đăng nhập → Music Hub → Chọn playlist gợi ý / tạo playlist → Thêm asset nội bộ / media được phép / YouTube link → Nghe → Lưu yêu thích → Dashboard ghi nhận activity nếu user cho phép.

**Admin**: Đăng nhập → Admin Dashboard → Quản trị nội dung / AI prompts / moderation rules / media rights → Xem queues & analytics → Override/điều chỉnh rule → Theo dõi audit và KPI.

---

## 10. Yêu cầu kỹ thuật phi chức năng

### 10.1. Auth & phân quyền
- Firebase Auth email/password (+ có thể thêm Google Sign-In sau); Anonymous Auth cho Guest cần quota tracking.
- Custom claims `role` set qua Cloud Function `setUserRole` (chỉ admin gọi được, kiểm tra `context.auth.token.role == "admin"`); đồng bộ field `role` vào `users/{uid}` để query nhưng **rules luôn dựa vào custom claim, không dựa vào field trong doc** (field có thể bị client giả mạo nếu không kiểm soát chặt).
- Firestore Security Rules bắt buộc cho mọi collection nhạy cảm (mục 6); public API (Cloud Functions HTTPS/callable) chỉ trả dữ liệu public/approved, không lộ `authorUid` qua confession public.
- **Firebase App Check** bật cho Web (reCAPTCHA Enterprise hoặc App Check debug token cho dev) để chặn gọi trực tiếp Cloud Functions/Firestore từ ngoài app.

### 10.2. AI Layer — xem mục 8.

### 10.3. Media & Music
- Firebase Storage cho upload audio/video, security rules theo owner; public asset qua signed URL hoặc public read có kiểm soát qua `mediaAssets.visibility`.
- Validate file type/size khi upload (Cloud Function `onFinalize` trigger kiểm tra + có thể tích hợp malware scan nếu có hạ tầng, ví dụ Cloud Storage + ClamAV service riêng — Phase 2).
- External embed chỉ render từ allowlist domain (YouTube, Epidemic Sound player).
- Không lưu/tải nội dung YouTube trái điều khoản provider (chỉ embed, không download).

### 10.4. Dashboard & Analytics
- Đọc dashboard từ `dashboardRollups` (đã precompute), không query raw `moodLogs`/`testAttempts` lớn ở client.
- Scheduled Cloud Function (Cloud Scheduler, chạy hằng ngày) tính rollup theo `7d/30d/90d/all`.
- Không gửi raw journal/confession content vào GA4 hay analytics platform ngoài — chỉ gửi event tên (vd. `mood_checkin_completed`) không kèm nội dung.
- Biểu đồ responsive; nhãn giải thích rõ dữ liệu self-report.

### 10.5. Security, Privacy & Safety
- Dữ liệu riêng tư mặc định (private by default — thực thi bằng rules, không chỉ UI).
- Audit log cho admin moderation, rule changes, media rights changes (`auditLogs`).
- Privacy Policy, Terms, retention/deletion, consent cho người dùng vị thành niên: **TBD — cần thẩm định pháp lý** (mục 13).
- Nội dung chuyên môn Test/CBT/disclaimer: **TBD — cần thẩm định chuyên môn tâm lý** (mục 13).
- Kill switch tắt AI feature riêng lẻ không gián đoạn toàn hệ thống (`systemConfig/aiConfig.killSwitch`).

### 10.6. Performance & UX
- Mobile & tablet optimized; lazy-load video/audio/AI panel.
- Skeleton/loading/error/empty state đầy đủ.
- Submit Test/Mood/Confession không mất dữ liệu khi network retry (dùng offline persistence của Firestore SDK + optimistic UI + queue retry).
- Accessibility: semantic HTML, keyboard nav, contrast, reduced motion.

---

## 11. KPI

### 11.1. Nguyên tắc sử dụng KPI

- Không dùng "AI mood score" như điểm sức khỏe tâm thần.
- Không tuyên bố Mood Before/After chứng minh web chữa/điều trị lo âu.
- Không so sánh xếp hạng sức khỏe tinh thần giữa học sinh.

### 11.2. Bảng KPI

| Nhóm KPI | Chỉ số |
|---|---|
| Guest Value | Tỷ lệ Guest hoàn thành ≥1 hoạt động công khai |
| Guest → Register | Tỷ lệ đăng ký sau khi Guest nhận kết quả/test/mood/library value |
| Activation | Tỷ lệ user mới tạo Mood Log hoặc hoàn thành Test trong phiên đầu |
| Mood Journal Adoption | WAU có ≥1 Mood Check-in; tỷ lệ dùng AI Reflection/Story |
| Pre/Post Coverage | Tỷ lệ activity có đủ Mood Before + After |
| Dashboard Engagement | Tỷ lệ user xem báo cáo 7/30/90 ngày; số phiên dashboard/user |
| Resource Engagement | Tỷ lệ mở/dùng Library, CBT, Music Hub sau recommendation |
| Retention | 7-day và 30-day return rate |
| Confession Automation | Tỷ lệ auto-approve; hold rate; admin override rate; false-positive/negative trên tập review mẫu |
| Moderation Efficiency | Thời gian trung bình từ submit tới public/decision |
| Music Hub | Số playlist tạo, saves, plays/opens, tỷ lệ dùng nguồn nội bộ |
| Self-report Trend | Thay đổi Mood Before/After mức aggregate/cá nhân; không diễn giải như hiệu quả lâm sàng |

---

## 12. Kế hoạch triển khai đề xuất (cho AI coding agent)

> Đây là gợi ý thứ tự build theo phase để agent có thể triển khai tăng dần, không nằm trong PRD gốc — thêm vào để hỗ trợ coding thực tế.

**Phase 0 — Nền tảng**
1. Khởi tạo 3 Firebase project (dev/staging/prod), cấu hình `firebase.json`, `firestore.rules`, `storage.rules`, `apphosting.yaml`.
2. Setup Next.js app + Firebase Web SDK + Firebase Auth (email/password + anonymous).
3. Custom claims (`setUserRole` callable) + middleware kiểm tra role trong Next.js.
4. CI/CD: GitHub → Firebase App Hosting auto-deploy theo branch (dev branch → staging project, main → prod project).

**Phase 1 — Core Guest + Student MVP**
5. Trang chủ, About, mascot tĩnh.
6. Test đánh giá lo âu (Guest phiên + Student lưu `testAttempts`), admin CRUD `testDefinitions`.
7. Mood Journal cơ bản (không AI) — `moodLogs` CRUD, mascot widget UI.
8. Library (`resources`) — CRUD admin + hiển thị public/student.

**Phase 2 — AI Layer**
9. Setup Genkit trong `/functions`, cấu hình provider (Vertex AI/Gemini mặc định).
10. `moodReflectionFlow` + `storyGenerationFlow` → ghi `aiJournalOutputs`.
11. Prompt template management (`promptTemplates`) + admin UI test/publish prompt.
12. Quota/rate limit Guest/Student (`guestQuota`, `systemConfig/aiConfig`) + App Check.

**Phase 3 — CBT, Confession & Moderation**
13. CBT module (`cbtModules`, `cbtSessions`).
14. Confession submit + moderation pipeline (hard-rule + AI classify) + `confessionsPublic` view + Admin Moderation Console.
15. Rule mining flow (đề xuất rule, admin duyệt) + audit log.

**Phase 4 — Music Hub & Dashboard**
16. `mediaAssets` upload/metadata, playlist CRUD, player (internal + YouTube embed + Epidemic).
17. Scheduled aggregation function → `dashboardRollups`; Dashboard UI (chart, filter 7/30/90/all).
18. GA4 integration + `analyticsDaily` cho Admin Analytics.

**Phase 5 — Hardening trước production**
19. Rà soát toàn bộ Firestore Rules + Storage Rules bằng test suite (Firebase Emulator + `@firebase/rules-unit-testing`).
20. Load test AI quota/kill switch; kiểm tra backup Firestore; hoàn tất TBD ở mục 13 (pháp lý + chuyên môn) trước khi mở production thật.

---

## 13. TBD trước Production (cần chốt/thẩm định — không tự code cứng)

- Tên sản phẩm và tên/visual identity mascot mèo.
- Thang đo Test, scoring, threshold và diễn giải chuyên môn — **cần chuyên gia tâm lý thẩm định**.
- Nội dung CBT và disclaimer chính thức — **cần chuyên gia thẩm định**.
- AI provider/model chính thức, data processing terms và consent.
- Policy Confession + moderation taxonomy + threshold chính thức.
- Quy trình pháp lý/consent/retention cho người dùng vị thành niên — **cần tư vấn pháp lý**.
- Giấy phép/quyền sử dụng nguồn Epidemic Sound và media public — xác nhận hợp đồng/license cụ thể.
- Quota AI cho Guest/Student và ngân sách vận hành (chi phí Vertex AI/Gemini theo traffic dự kiến).

**Lưu ý cho AI coding agent**: những mục trên đều đã có model dữ liệu sẵn sàng (versioned content trong `testDefinitions`, `cbtModules`, `moderationRules`) để khi nội dung chuyên môn/pháp lý được chốt, chỉ cần cập nhật dữ liệu qua Admin console mà **không cần sửa code**.

---

*KẾT THÚC PRD — VERSION 3.0 (Firebase Edition)*
