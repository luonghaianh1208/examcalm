import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

/**
 * `firebase deploy` dong goi source bang readdirRecursive() cua firebase-tools,
 * ap dung `apphosting[].ignore` qua minimatch voi { matchBase: true } — nghia la
 * mot mau KHONG chua dau "/" duoc so voi BASENAME cua moi duong dan, o bat ky do
 * sau nao. Mau "tests" (nham loai tests/e2e cua Playwright) vi vay loai luon
 * src/app/(admin)/admin/tests/, khien route /admin/tests bien mat khoi ban build
 * tren server va tra 404 toan man hinh — trong khi `next build` va `next dev` o
 * may van hoan toan binh thuong, nen loi nay VO HINH khi phat trien local.
 *
 * Phai duyet TU GOC REPO dung nhu firebase lam: neu duyet tu trong src/app hay
 * tests thi chinh thu muc goc do khong bao gio di qua bo loc, va bai test se cho
 * ket qua sai.
 */

const requireCjs = createRequire(import.meta.url);
const { readdirRecursive } = requireCjs("firebase-tools/lib/fsAsync.js") as {
  readdirRecursive: (o: { path: string; ignoreStrings: string[] }) => Promise<{ name: string }[]>;
};

const ROOT = path.resolve(import.meta.dirname, "..");
const ignore: string[] = JSON.parse(
  readFileSync(path.join(ROOT, "firebase.json"), "utf8"),
).apphosting[0].ignore;

const walk = async (dir: string, ignoreStrings: string[]): Promise<string[]> =>
  (await readdirRecursive({ path: path.join(ROOT, dir), ignoreStrings })).map((f) => f.name);

/** Duyet mot lan, dung chung cho ca hai bai — mot lan duyet ca repo la du cham. */
const daDongGoi = walk(".", ignore).then((files) => new Set(files));

describe("apphosting.ignore trong firebase.json", () => {
  it("khong loai bo file nao trong src/app — moi file o do co the la mot route", async () => {
    const [dongGoi, fileTrongApp] = await Promise.all([daDongGoi, walk("src/app", ["node_modules"])]);
    expect(fileTrongApp.filter((f) => !dongGoi.has(f))).toEqual([]);
  });

  it("van loai bo toan bo thu muc tests/ — khong day test len server", async () => {
    const dongGoi = await daDongGoi;
    const thuMucTests = path.join(ROOT, "tests");
    expect([...dongGoi].filter((f) => f.startsWith(thuMucTests))).toEqual([]);
  });
});
