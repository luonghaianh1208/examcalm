import fs from "node:fs";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { Firestore } from "firebase/firestore";

export async function createTestEnv(
  rulesPath = "firestore.rules",
  projectId = "examcalm-rules-test",
): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId,
    firestore: {
      rules: fs.readFileSync(rulesPath, "utf8"),
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
