import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.mts không bật `test.globals`, nên @testing-library/react
// không tự động unmount cây component sau mỗi test — phải gọi cleanup thủ công,
// nếu không các bài test render() nhiều lần trong cùng 1 file sẽ chồng DOM lên nhau.
afterEach(() => {
  cleanup();
});
