# Vá hồ sơ `users/{uid}` thiếu cho tài khoản bootstrap ngoài app

Ngày: 2026-08-25

## Vấn đề

`src/lib/auth-client.ts:53` chỉ tạo document `users/{uid}` khi đăng ký QUA APP
(`signUp()`). Một tài khoản tạo bằng cách khác — Firebase Console, Auth Admin
API, hay CLI (cách DUY NHẤT dùng để bootstrap tài khoản admin trong dự án này)
— không có document này.

Hậu quả không chỉ là cosmetic. `AiConsentSection.tsx` (dòng 72, 115) và
`ResearchConsentForm.tsx` (dòng 20) đều dùng `updateDoc`, ném lỗi `not-found`
khi document không tồn tại. Một admin bootstrap qua CLI:

- ghi được mood log, làm test, làm bài CBT — các luồng này không đụng tới
  `users/{uid}`
- mở được `/ho-so` (dùng optional chaining nên không crash)
- **không bật được AI consent** — công tắc báo lỗi "Không thể lưu thay đổi"
- vì vậy **không bao giờ vào được tính năng chat**, vì chat đòi hỏi AI consent

Chủ dự án là admin và muốn dùng app với vai trò học sinh để tự test — lỗi này
chặn đúng việc đó.

## Cách vá

Vá ở **lúc đăng nhập**, phía server, nơi Admin SDK sẵn có (bỏ qua Security
Rules) và role claim đã được xác minh.

### File mới: `src/lib/firestore/ensure-user-profile.ts`

Hàm `ensureUserProfile(uid, role, email)`:

1. Đọc `users/{uid}` bằng Admin SDK (`adminDb().collection("users").doc(uid).get()`).
2. Nếu **đã tồn tại** → return ngay, không đụng gì cả.
3. Nếu **chưa tồn tại** → tạo bằng `ref.create(...)` (không phải `set()`) —
   `create()` tự ném lỗi `ALREADY_EXISTS` nếu có race giữa lúc `get()` và lúc
   ghi, nên hồ sơ thật của học sinh không bao giờ bị đường vá này ghi đè kể cả
   trong race condition.
4. Toàn bộ hàm nằm trong `try/catch` — lỗi được `console.error` rồi NUỐT, không
   bao giờ ném ra ngoài. Vá hồ sơ thất bại không được chặn đăng nhập; người
   dùng chỉ quay lại đúng vấn đề hiện tại (updateDoc not-found), không tệ hơn.

### File sửa: `src/lib/firebase/session.ts`

`createSessionCookie(idToken)` trước đây chỉ gọi
`adminAuth().createSessionCookie(idToken, {...})` — hàm Admin SDK này verify
token nội bộ nhưng KHÔNG trả về claims đã decode cho caller. Để lấy `uid` và
role claim đã xác minh, phải gọi thêm `adminAuth().verifyIdToken(idToken)`
trước khi mint cookie:

```ts
const decoded = await adminAuth().verifyIdToken(idToken);
const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
// ...store.set(...)...
await ensureUserProfile(
  decoded.uid,
  decoded.role === "admin" ? "admin" : "student",
  decoded.email ?? null,
);
```

Token không hợp lệ vẫn ném lỗi ở đây như cũ — `POST /api/session` vẫn trả 401
qua catch có sẵn ở `route.ts`, hành vi không đổi.

Chi phí thêm: một lần verify token (JWKS đã cache, rẻ) + một lần đọc Firestore.
Không thêm request nào khác — phù hợp yêu cầu "không làm chậm đăng nhập đáng kể".

### Các trường không có giá trị trung thực ở bước đăng nhập

`nickname`, `gradeLevel`, `school` bắt buộc theo `userProfileSchema`, nhưng đó
là schema TYPE — không có nơi nào trong `src/` hay `functions/` thực sự gọi
`userProfileSchema.parse()` lên một document Firestore thật (chỉ dùng làm
nguồn kiểu dữ liệu tĩnh, xem `src/lib/types/types.test.ts` — nơi DUY NHẤT nó
được `.parse()`, và đó là dữ liệu test bịa, không phải dữ liệu đọc từ
Firestore). Vì vậy hồ sơ vá **được phép bỏ trống các field không có giá trị
thật**, không bắt buộc phải điền đủ mọi field trong type:

- **`nickname`**: VẪN ghi — lấy phần trước `@` của email (vd
  `quan.tri@truong.edu.vn` → `quan.tri`). Đây KHÔNG phải bịa — là một phần dữ
  liệu thật của chính người dùng (email của họ). Nếu không có email, fallback
  `chua-dat-ten-{6 ký tự đầu uid}`.
- **`gradeLevel`, `school`**: **KHÔNG ghi vào document** (bỏ hẳn field, không
  phải chuỗi rỗng hay placeholder). Phiên bản đầu của lần vá này từng thử điền
  placeholder — `gradeLevel: "10"`, `school: "(chưa cập nhật trường)"` — nhưng
  bị revert NGAY TRONG NGÀY: `gradeLevel: "10"` **đọc như dữ liệu thật** trên
  `/admin/nguoi-dung` (`UserRoleManager.tsx`) và trang cảnh báo khủng hoảng
  (`CrisisAlertList.tsx`) — một giáo viên bootstrap qua CLI sẽ thấy chính mình
  "Lớp 10", một khẳng định sai. Một placeholder ĐỌC NHƯ PLACEHOLDER là trung
  thực; một placeholder đọc như dữ liệu thì không — đây chính xác là ràng buộc
  ban đầu (school không được bịa tên trường) nhưng áp dụng luôn cho gradeLevel.
  `gradeLevel` là `z.enum(["10","11","12"])` — không có giá trị "chưa rõ" hợp
  lệ trong enum để bịa một cách trung thực, nên cách đúng là KHÔNG GHI, để hai
  nơi hiển thị tự coi field vắng mặt là "chưa rõ" (xem mục dưới).

### Hai nơi hiển thị `gradeLevel`/`school` phải hiểu "vắng mặt" một cách trung thực

`src/lib/firestore/admin-users.ts` (`listUsers()`, dùng bởi cả hai nơi hiển
thị bên dưới) đã sẵn có quy ước đổ field vắng mặt về chuỗi rỗng
(`(data.gradeLevel as string) ?? ""`, `(data.school as string) ?? ""`) — quy
ước này có TRƯỚC lần vá này, không phải do lần vá này tạo ra. Từ khi hồ sơ vá
không còn ghi hai field này, một tài khoản bootstrap qua CLI sẽ có
`gradeLevel === ""` và `school === ""` khi đọc qua `listUsers()`. Hai nơi
render trực tiếp `Lớp {gradeLevel} · {school}` mà không kiểm tra rỗng sẽ hiện
mảnh vỡ `"Lớp  · "` — trông như document lỗi, không phải "chưa có dữ liệu":

- `src/components/admin/CrisisAlertList.tsx` — `StudentIdentity()`
- `src/components/admin/UserRoleManager.tsx` — dòng liệt kê người dùng

Cả hai được sửa để thay thế chuỗi rỗng bằng `"Không rõ"`
(`student.gradeLevel || "Không rõ"`, tương tự cho `school`) — **khớp đúng chữ**
mà mail cảnh báo khủng hoảng (`functions/src/email/onCrisisAlertCreated.ts`,
hàm `buildEmailBody`) đã dùng từ trước cho đúng tình huống này
(`` `Lớp: ${fields.gradeLevel ?? "Không rõ"}` ``). Trước lần sửa này, trang và
mail đã XỬ LÝ KHÁC NHAU cho cùng một giá trị vắng mặt — trang render mảnh vỡ
rỗng, mail hiện "Không rõ" — giờ cả hai nói cùng một điều.

Không đổi type `UserSummary.gradeLevel`/`school` (vẫn là `string`, không phải
`string | null`) — chuỗi rỗng làm sentinel "vắng mặt" đã là quy ước sẵn có của
`admin-users.ts` cho field này (khác `nickname`, vốn đã có fallback riêng
`"(chưa đặt)"` ngay tại `listUsers()`); đổi type sẽ là refactor rộng hơn phạm
vi lần vá này.

### `privacySettings` — dòng quan trọng nhất

`privacySettings: { ...DEFAULT_PRIVACY_SETTINGS }` — tức `aiOptIn: false,
shareImageWithAI: false`. Tài khoản này CHƯA TỪNG đồng ý gì; hồ sơ vá KHÔNG
được ngầm coi như đã đồng ý. Sau khi vá, admin (hay bất kỳ ai) vẫn phải tự bấm
bật AI consent qua `/ho-so` như học sinh bình thường — đúng luồng, chỉ khác là
giờ `updateDoc` không còn ném `not-found` nữa.

### `role` — lấy từ custom claim, không mặc định

`decoded.role === "admin" ? "admin" : "student"` — CÙNG logic với
`getSessionUser()` hiện có (fail-closed: claim không phải `"admin"` → coi là
`student`). Hồ sơ vá của admin ghi đúng `role: "admin"`, nếu không `/admin` và
`listUsers()` (dùng để duyệt danh sách người dùng trong trang quản trị) sẽ báo
sai vai trò.

## Rà soát các nơi khác ghi `users/{uid}`

Tìm toàn bộ `updateDoc`/`setDoc` nhắm vào document gốc `users/{uid}` (không
tính subcollection `users/{uid}/favorites/*`) trong `src/`:

| File | Hàm | `updateDoc`/`setDoc` | Có bị ảnh hưởng bởi thiếu hồ sơ? |
|---|---|---|---|
| `src/lib/auth-client.ts:53` | `signUp()` | `setDoc` (tạo mới) | Không — đây là nơi TẠO hồ sơ, không phải nơi phụ thuộc nó tồn tại. |
| `src/components/settings/AiConsentSection.tsx:72,115` | `handleConfirmOn/Off` | `updateDoc` | **Có** — chính là triệu chứng của bug. Đã được vá gián tiếp: hồ sơ được đảm bảo tồn tại NGAY LÚC đăng nhập, trước khi người dùng có cơ hội mở `/ho-so` và bấm công tắc này. |
| `src/components/settings/ResearchConsentForm.tsx:20` | `handleChange` | `updateDoc` | **Có**, cùng lý do — vá gián tiếp cùng cách. |
| `src/lib/firestore/onboarding.ts:43-47,58-62` | `markWelcomeSeen`, `setHideTooltips` | `setDoc(..., {merge:true})` | Có khả năng bị ảnh hưởng về mặt lý thuyết (document chưa tồn tại + `merge:true` tạo document mới thiếu field `role` → Security Rule `create` đòi `role == "student"` từ chối request), nhưng **cả hai hàm đã tự bắt và nuốt lỗi từ trước** (comment sẵn trong code: "Ghi thất bại không được chặn học sinh dùng app"), nên đây chưa từng là lỗi hiển thị cho người dùng — chỉ là ghi âm thầm thất bại. Sau khi vá ở login, hồ sơ đã tồn tại trước khi các hàm này có cơ hội chạy (chúng chỉ được gọi sau khi trang đã tải, tức là sau khi session/login đã xong), nên vấn đề lý thuyết này cũng biến mất. **Không sửa gì thêm** — đã được vá gián tiếp giống hai file trên. |
| `src/lib/firestore/favorites.ts:51` | `markUsed` | `updateDoc` | Không — đây là document trong SUBCOLLECTION `users/{uid}/favorites/{resourceId}`, không phải document gốc `users/{uid}`. Firestore không yêu cầu document cha tồn tại để subcollection document tồn tại. Hàm đã tự kiểm tra `exists()` trước khi `updateDoc` (dòng 50), nên an toàn độc lập với bug này. |

**Kết luận**: không có nơi nào khác cần sửa code riêng — mọi writer khác vào
`users/{uid}` chỉ chạy được SAU KHI người dùng đã đăng nhập thành công qua
`POST /api/session`, và điểm đó giờ đã đảm bảo hồ sơ tồn tại trước khi bất kỳ
`updateDoc`/`setDoc` nào khác có cơ hội chạy.

## Giới hạn đã biết

- Chỉ áp dụng cho các lần đăng nhập MỚI sau khi deploy fix này. Một session
  cookie đã tồn tại trước đó (đăng nhập trước khi deploy) sẽ không kích hoạt
  vá lại — người dùng cần đăng nhập lại (hoặc đợi session hết hạn sau 5 ngày
  rồi đăng nhập lại) để hồ sơ được tạo.
- **Một hồ sơ vá là hồ sơ THƯA (sparse) một cách CÓ CHỦ Ý** — nếu bạn đọc thấy
  một document `users/{uid}` không có `gradeLevel`/`school`, đó không phải dữ
  liệu bị hỏng hay migration dở dang: đó là một tài khoản bootstrap ngoài app
  (Console/CLI) chưa từng có nguồn dữ liệu thật cho hai field này, và lần vá
  cố tình không bịa. Bất kỳ nơi đọc `users/{uid}` nào thêm sau này PHẢI coi
  `gradeLevel`/`school` vắng mặt là hợp lệ (không throw, không giả định luôn
  có), giống hai nơi hiển thị đã sửa ở trên và mail cảnh báo khủng hoảng.
- Không có UI để người dùng tự điền lại `gradeLevel`/`school` sau khi hồ sơ
  được vá — ngoài phạm vi lần vá này (theo đúng chỉ dẫn "Do NOT add a
  profile-editing UI").

## Không đổi

- `firestore.rules` — không đụng vào. Admin SDK bỏ qua Rules nên không cần sửa
  rule; rule `create` vẫn giữ nguyên ràng buộc `role == "student"` ngăn học
  sinh tự phong admin qua client SDK.
- Không thêm UI sửa hồ sơ.

## Kiểm chứng

```
npx vitest run          # 621 passed (baseline 608 + 13 test mới)
npm run typecheck        # sạch
npm run build             # thành công
npm run test:rules        # 180 passed (baseline 180, không đổi — không sửa rules)
```

Test mới:
- `src/lib/firestore/ensure-user-profile.test.ts` (8 test) — unit test hàm vá:
  role lấy từ tham số (không mặc định student), privacySettings mặc định,
  nickname từ email, KHÔNG ghi `gradeLevel`/`school` vào document, KHÔNG ghi
  đè hồ sơ đã có, lỗi Firestore không ném ra ngoài.
- `src/lib/firebase/session.test.ts` (+3 test) — tích hợp qua
  `createSessionCookie()`: đăng nhập uid chưa có hồ sơ → hồ sơ được tạo đúng
  role/privacySettings; đăng nhập uid đã có hồ sơ → không ghi gì; vá lỗi →
  đăng nhập vẫn thành công (cookie vẫn được set).
- `src/components/admin/CrisisAlertList.test.tsx` (+1 test) và
  `src/components/admin/UserRoleManager.test.tsx` (+1 test) — `gradeLevel`/
  `school` rỗng hiện đúng "Không rõ" ở cả hai nơi, không hiện mảnh vỡ
  `"Lớp  · "`.

Test đầu tiên (`đăng nhập với uid CHƯA có hồ sơ...`) được viết TRƯỚC khi sửa
`session.ts`, chạy và xác nhận fail đúng lý do (`writes` rỗng vì
`ensureUserProfile` chưa được gọi), rồi mới implement.

## Follow-up cùng ngày: bỏ placeholder `gradeLevel`/`school`

Bản đầu của lần vá này ghi placeholder cho `gradeLevel` (`"10"`) và `school`
(`"(chưa cập nhật trường)"`). Vấn đề: `gradeLevel: "10"` không đọc như
placeholder — nó đọc như một khối lớp THẬT trên hai trang admin
(`/admin/nguoi-dung`, trang cảnh báo khủng hoảng), khiến một giáo viên
bootstrap qua CLI hiện ra như đang học "Lớp 10" — một khẳng định sai, đúng
điều mà yêu cầu ban đầu của lần vá này (không bịa tên trường trông như dữ liệu
thật) đã cấm, chỉ là chưa áp dụng hết cho `gradeLevel`.

Sau khi xác nhận `userProfileSchema` không hề được `.parse()` lên document
Firestore thật ở bất kỳ đâu trong `src/`/`functions/` (chỉ dùng làm nguồn
type), đã đổi sang **bỏ hẳn hai field này khỏi document được vá** thay vì bịa
giá trị. Nickname vẫn được giữ (lấy từ phần trước `@` của email) vì đó là dữ
liệu thật của người dùng, không phải suy đoán.

Hai nơi hiển thị (`CrisisAlertList.tsx`, `UserRoleManager.tsx`) được sửa để
hiện "Không rõ" khi gặp `gradeLevel`/`school` rỗng — khớp đúng chữ mail cảnh
báo khủng hoảng đã dùng từ trước. Chi tiết đầy đủ ở hai mục phía trên.
