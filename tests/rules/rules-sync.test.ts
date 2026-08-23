import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// I2: C1/C2 đều phải sửa CẢ HAI file firestore.rules và firestore.prod.rules,
// và trước đây không có gì kiểm tra việc đó — chỉ dựa vào người sửa nhớ đúng cả
// hai chỗ. Hai file chỉ được phép khác nhau đúng khối `testDefinitions` (rule
// production siết chặt hơn — chặn publish nội dung mẫu chưa thẩm định, spec R5).
// Test này thay thế khối lệch DUY NHẤT đã biết bằng bản dev tương ứng rồi so
// sánh toàn bộ nội dung còn lại — bất kỳ lệch nào khác sẽ làm assertion cuối
// thất bại và in ra diff đầy đủ giữa hai file.
describe("firestore.rules và firestore.prod.rules đồng bộ", () => {
  const devContent = fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8");
  const prodContent = fs.readFileSync(path.join(process.cwd(), "firestore.prod.rules"), "utf8");

  const DEV_TEST_DEFINITIONS_WRITE = `      allow write: if isAdmin();`;
  const PROD_TEST_DEFINITIONS_WRITE = `      // Ở production, KHÔNG cho publish nội dung mẫu chưa thẩm định.
      allow write: if isAdmin() &&
                   !(request.resource.data.status == "published" &&
                     request.resource.data.isSampleContent == true);`;

  it("firestore.prod.rules chứa đúng khối testDefinitions siết chặt hơn đã biết", () => {
    expect(prodContent).toContain(PROD_TEST_DEFINITIONS_WRITE);
  });

  it("firestore.rules KHÔNG chứa khối siết chặt chỉ dành cho production", () => {
    expect(devContent).not.toContain(PROD_TEST_DEFINITIONS_WRITE);
  });

  it("sau khi thay khối testDefinitions của prod bằng bản dev, hai file phải giống hệt nhau", () => {
    const normalizedProdContent = prodContent.replace(
      PROD_TEST_DEFINITIONS_WRITE,
      DEV_TEST_DEFINITIONS_WRITE,
    );
    expect(normalizedProdContent).toBe(devContent);
  });
});
