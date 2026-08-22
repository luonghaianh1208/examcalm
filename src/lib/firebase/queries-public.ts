import "server-only";

import { adminDb } from "./admin";
import type { Resource } from "@/lib/types/resource";
import type { TestDefinition } from "@/lib/types/test";

export type ResourceListItem = Resource & { id: string };
export type TestListItem = TestDefinition & { id: string };

export type ListResourcesOptions = {
  /** true khi người xem đã đăng nhập — mở thêm resource student_only */
  includeStudentOnly?: boolean;
  category?: string;
  tag?: string;
  limit?: number;
};

export async function listPublishedResources(
  opts: ListResourcesOptions = {},
): Promise<ResourceListItem[]> {
  const { includeStudentOnly = false, category, tag, limit = 50 } = opts;

  let query = adminDb()
    .collection("resources")
    .where("status", "==", "published");

  if (!includeStudentOnly) query = query.where("visibility", "==", "public");
  if (category) query = query.where("category", "==", category);
  if (tag) query = query.where("tags", "array-contains", tag);

  const snap = await query.orderBy("updatedAt", "desc").limit(limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Resource) }));
}

export async function getResourceBySlug(
  slug: string,
  includeStudentOnly = false,
): Promise<ResourceListItem | null> {
  const snap = await adminDb()
    .collection("resources")
    .where("slug", "==", slug)
    .where("status", "==", "published")
    .limit(1)
    .get();

  const docSnap = snap.docs[0];
  if (!docSnap) return null;

  const data = docSnap.data() as Resource;
  if (data.visibility === "student_only" && !includeStudentOnly) return null;

  return { id: docSnap.id, ...data };
}

export async function listPublishedTests(): Promise<TestListItem[]> {
  const snap = await adminDb()
    .collection("testDefinitions")
    .where("status", "==", "published")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TestDefinition) }));
}

export async function getPublishedTest(testId: string): Promise<TestListItem | null> {
  const docSnap = await adminDb().collection("testDefinitions").doc(testId).get();
  if (!docSnap.exists) return null;
  const data = docSnap.data() as TestDefinition;
  if (data.status !== "published") return null;
  return { id: docSnap.id, ...data };
}
