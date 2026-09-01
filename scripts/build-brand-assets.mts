/**
 * Xuất asset thương hiệu từ bản gốc trong BRAND GUIDELINE sang public/.
 *
 *   npx tsx scripts/build-brand-assets.mts
 *
 * Chạy LẠI ĐƯỢC nhiều lần, kết quả như nhau (ghi đè). Chỉ cần chạy khi bản gốc
 * trong BRAND GUIDELINE thay đổi, không phải mỗi lần build.
 *
 * Vì sao phải copy sang public/ thay vì trỏ thẳng vào BRAND GUIDELINE:
 * thư mục đó nằm trong danh sách ignore của App Hosting (firebase.json) — 6 MB
 * tài liệu thiết kế không đi theo bản build. Trỏ thẳng vào đó thì local chạy
 * được nhưng production 404.
 *
 * Đuôi .mts là bắt buộc: tsx cần .mts để chấp nhận top-level await.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const SRC = "BRAND GUIDELINE/assets";
const OUT = "public/brand";

/**
 * 512 px cho cả logo lẫn Meo. Kích thước hiển thị lớn nhất theo guideline là
 * logo 120 px (desktop) và coach mark 320 px, nên 512 px vẫn còn dư cho màn
 * hình 2x mà không phình dung lượng — bản gốc PNG 1.1 MB xuống còn vài chục KB.
 */
const SIZE = 512;

/** Tên file đích cố ý ngắn và không dấu: chúng đi vào URL công khai. */
const MEO: Array<[string, string]> = [
  ["01_Meo_Home_Dashboard.png", "home"],
  ["02_Meo_Welcome_Onboarding.png", "welcome"],
  ["03_Meo_Listening.png", "listen"],
  ["04_Meo_Encouragement.png", "cheer"],
  ["05_Meo_Music_Resting.png", "rest"],
  // Góc Cây Bình Yên đang pending (guideline mục 1). Xuất sẵn asset nhưng KHÔNG
  // đưa vào navigation — xem AppShell.
  ["06_Meo_Goc_Cay_Binh_Yen_Watering.png", "garden"],
  ["07_Meo_Nhat_Ky_Cam_Xuc_Avatar.png", "journal"],
];

await mkdir(`${OUT}/meo`, { recursive: true });

// fit: "contain" + nền trong suốt: giữ nguyên tỉ lệ, không crop. Guideline cấm
// crop/kéo méo logo, và bộ Meo vốn đã vuông nên đây chỉ là lớp bảo hiểm.
const resize = { width: SIZE, height: SIZE, fit: "contain" as const, background: { r: 0, g: 0, b: 0, alpha: 0 } };

await sharp(`${SRC}/logo/LOGO EXAMCALM.png`)
  .resize(resize)
  .webp({ quality: 92 })
  .toFile(`${OUT}/logo.webp`);
console.log("logo.webp");

for (const [src, name] of MEO) {
  await sharp(`${SRC}/meo/${src}`)
    .resize(resize)
    .webp({ quality: 88 })
    .toFile(`${OUT}/meo/${name}.webp`);
  console.log(`meo/${name}.webp`);
}

console.log("Xong.");
