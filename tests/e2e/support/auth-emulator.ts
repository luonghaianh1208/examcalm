/**
 * Gọi thẳng REST API của Auth Emulator để xác thực email — thay cho việc gửi/đọc
 * email thật. Emulator không gửi email; nó lưu lại "oobCode" (out-of-band code) mà
 * một email thật sẽ mang trong link xác thực. Gọi `accounts:update` với đúng
 * oobCode đó tương đương về mặt tác dụng với việc học sinh bấm vào link trong
 * email — đây là cách chính thức Google khuyến nghị để test luồng xác thực email
 * với Emulator mà không cần dịch vụ gửi email thật.
 */

type OobCodeEntry = {
  email: string;
  requestType: string;
  oobCode: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Thiếu biến môi trường ${name} — cần để gọi REST API của Auth Emulator.`);
  }
  return value;
}

function emulatorAuthBaseUrl(): string {
  return `http://${requireEnv("FIREBASE_AUTH_EMULATOR_HOST")}`;
}

/**
 * Xác thực email của một tài khoản vừa đăng ký trên Auth Emulator.
 * Giả định: `sendEmailVerification()` đã được gọi cho email này (SignUpForm gọi
 * hàm này ngay sau khi tạo tài khoản), nên Emulator đã có sẵn một oobCode loại
 * VERIFY_EMAIL đang chờ.
 */
export async function verifyEmailViaEmulator(email: string): Promise<void> {
  const base = emulatorAuthBaseUrl();
  const projectId = requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const apiKey = requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY");

  const listRes = await fetch(`${base}/emulator/v1/projects/${projectId}/oobCodes`);
  if (!listRes.ok) {
    throw new Error(`Không đọc được danh sách oobCodes từ Emulator (${listRes.status}).`);
  }
  const { oobCodes } = (await listRes.json()) as { oobCodes: OobCodeEntry[] };

  // Lấy oobCode MỚI NHẤT của đúng email này — nhiều test trong suite có thể tạo
  // nhiều tài khoản, nên danh sách có thể chứa oobCode của các email khác.
  const match = [...oobCodes]
    .reverse()
    .find((o) => o.email === email && o.requestType === "VERIFY_EMAIL");
  if (!match) {
    throw new Error(`Không tìm thấy oobCode xác thực email đang chờ cho ${email}.`);
  }

  const updateRes = await fetch(
    `${base}/identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oobCode: match.oobCode }),
    },
  );
  if (!updateRes.ok) {
    throw new Error(`Xác thực email thất bại (${updateRes.status}).`);
  }
}
