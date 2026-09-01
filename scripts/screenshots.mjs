/**
 * Chụp ảnh màn hình ở ba breakpoint để soát giao diện bằng mắt.
 *
 *   npm run build && npm run start        # cửa sổ khác
 *   node scripts/screenshots.mjs <thư-mục-đích> [đường-dẫn...]
 *
 * Ví dụ:
 *   node scripts/screenshots.mjs ./tmp / /thu-vien /admin
 *
 * Vì sao cần: build xanh và test xanh KHÔNG chứng minh giao diện đúng. Lần
 * dựng lại vỏ app theo Brand Guideline, ba lỗi chỉ lộ ra khi nhìn ảnh chụp —
 * nhãn "Sắp ra mắt" vỡ ba dòng ở tablet, widget Meo đè lên thanh điều hướng
 * dưới, và footer bị che mất số 111.
 *
 * LƯU Ý trên Windows: nếu vừa chạy `npm run build` lại thì PHẢI khởi động lại
 * server trước khi chụp. Tiến trình cũ tham chiếu tên file CSS theo hash cũ,
 * mà bản build mới đã ghi đè — trang sẽ hiện ra không có CSS và trông như vỡ
 * hoàn toàn. `pkill` không giết được tiến trình Node trên Windows; dùng
 * PowerShell: Get-NetTCPConnection -LocalPort 3000 | Stop-Process -Force
 */
import { chromium } from "@playwright/test";

const [outDir = ".", ...paths] = process.argv.slice(2);
const routes = paths.length > 0 ? paths : ["/"];
const BASE = process.env.SCREENSHOT_BASE_URL ?? "http://localhost:3000";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1100 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch();
for (const route of routes) {
  const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // Chờ font web tải xong: chụp sớm thì bắt được font dự phòng, chữ tiếng
    // Việt trông khác hẳn bản thật và dễ báo động giả.
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${outDir}/${slug}-${vp.name}.png` });
    console.log(`${slug}-${vp.name}.png`);
    await page.close();
  }
}
await browser.close();
