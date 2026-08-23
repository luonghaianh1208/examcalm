"use client";

import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { z } from "zod";
import { getDb, ensureAuthReady } from "@/lib/firebase/client";
import { RESOURCE_TYPES, slugSchema, type Resource } from "@/lib/types/resource";

export const resourceDraftSchema = z.object({
  title: z.string().min(1, "Hãy nhập tiêu đề.").max(200),
  slug: slugSchema,
  type: z.enum(RESOURCE_TYPES),
  category: z.string().min(1, "Hãy nhập chủ đề.").max(60),
  tags: z.array(z.string().max(40)).max(15),
  content: z.string().min(1, "Nội dung không được để trống."),
  videoUrl: z.string().url("Link video không hợp lệ.").nullable(),
  visibility: z.enum(["public", "student_only"]),
});

export type ResourceDraft = z.infer<typeof resourceDraftSchema>;
export type ResourceRecord = Resource & { id: string };

/**
 * Liệt kê tường minh từng field thay vì spread `d.data()` — xem giải thích
 * ở toResourceListItem() trong queries-public.ts: document đọc về từ SDK có
 * thể mang theo field không nằm trong type (vd: `createdAt`/`updatedAt` là
 * Firestore `Timestamp`, một class instance) mà spread sẽ vô tình mang theo.
 */
function toResourceRecord(id: string, data: Resource): ResourceRecord {
  return {
    id,
    title: data.title,
    slug: data.slug,
    type: data.type,
    category: data.category,
    tags: data.tags,
    content: data.content,
    videoUrl: data.videoUrl,
    status: data.status,
    visibility: data.visibility,
    createdBy: data.createdBy,
  };
}

export async function listAllResources(): Promise<ResourceRecord[]> {
  const snap = await getDocs(collection(getDb(), "resources"));
  return snap.docs.map((d) => toResourceRecord(d.id, d.data() as Resource));
}

/** Trả về true nếu slug đã được bài KHÁC sử dụng. */
export async function isSlugTaken(slug: string, exceptId: string | null): Promise<boolean> {
  const snap = await getDocs(query(collection(getDb(), "resources"), where("slug", "==", slug)));
  return snap.docs.some((d) => d.id !== exceptId);
}

export async function saveResource(
  resourceId: string | null,
  draft: ResourceDraft,
  adminUid: string,
): Promise<string> {
  // Đóng race giống saveTest/saveMoodLog — xem giải thích ensureAuthReady() ở client.ts.
  // Không có bước này, isSlugTaken() bên dưới có thể chạy trước khi Firestore gắn được
  // ID token vào request (ngay sau khi vừa đăng nhập lại để nhận custom claim mới), và
  // bị Rules từ chối dù admin đã đăng nhập thật.
  await ensureAuthReady();

  // Biết và chấp nhận: kiểm tra rồi mới ghi (check-then-act), không có transaction, nên
  // hai admin bấm lưu cùng lúc với cùng slug lý thuyết vẫn có thể lọt cả hai. Đội quản trị
  // nhỏ và ít khi trùng thời điểm — đánh đổi này là cố ý, không phải bị bỏ sót.
  if (await isSlugTaken(draft.slug, resourceId)) {
    throw new Error(`Slug "${draft.slug}" đã được dùng cho bài khác.`);
  }

  if (resourceId) {
    await updateDoc(doc(getDb(), "resources", resourceId), {
      ...draft, updatedAt: serverTimestamp(),
    });
    return resourceId;
  }

  const ref = await addDoc(collection(getDb(), "resources"), {
    ...draft,
    status: "draft",
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function publishResource(resourceId: string, publish: boolean): Promise<void> {
  // Đóng race giống saveResource ở trên — publish/unpublish cũng là một lần ghi.
  await ensureAuthReady();
  await updateDoc(doc(getDb(), "resources", resourceId), {
    status: publish ? "published" : "draft",
    updatedAt: serverTimestamp(),
  });
}
