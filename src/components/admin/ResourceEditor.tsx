"use client";

import { useCallback, useEffect, useState } from "react";
import { toSlug } from "@/lib/slug";
import { RESOURCE_TYPES, type ResourceType } from "@/lib/types/resource";
import {
  listAllResources, publishResource, resourceDraftSchema, saveResource,
  type ResourceRecord,
} from "@/lib/firestore/admin-resources";

// Kiểu tường minh cho form: `type`/`visibility` phải rộng bằng cả union (không
// chỉ giá trị khởi tạo), nếu không handleEdit() sẽ không gán được item.type
// của một tài nguyên khác "article" (vd: "tip") vào state form.
type FormState = {
  title: string; slug: string; type: ResourceType; category: string;
  tags: string; content: string; tryThis: string; videoUrl: string; visibility: "public" | "student_only";
};

const EMPTY: FormState = {
  title: "", slug: "", type: "article", category: "",
  tags: "", content: "", tryThis: "", videoUrl: "", visibility: "public",
};

export function ResourceEditor({ adminUid }: { adminUid: string }) {
  const [items, setItems] = useState<ResourceRecord[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Ba trạng thái tách biệt (đang tải / lỗi / rỗng thật) giống TestEditor —
  // nuốt lỗi bằng `void reload()` sẽ khiến admin nhìn mãi khung xám, không
  // biết vì sao và không có cách thử lại. Hàm này cũng được gọi lại SAU khi
  // lưu/đăng: nếu lần tải lại đó thất bại, listFailed chuyển sang true và
  // danh sách cũ (có thể đã lỗi thời) không còn được vẽ như thể vẫn còn đúng.
  const load = useCallback(() => {
    listAllResources()
      .then((result) => {
        setItems(result);
        setListFailed(false);
      })
      .catch(() => setListFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setError(null); setMessage(null);

    // Slug rỗng CHỈ được tự sinh lại từ tiêu đề khi TẠO MỚI. Khi đang sửa một
    // bài đã có, tự sinh lại slug ở đây sẽ âm thầm đổi đường dẫn của một bài
    // có thể đã được học sinh lưu — phải chặn lại và bắt nhập tay, không đoán hộ.
    const trimmedSlug = form.slug.trim();
    if (editingId && !trimmedSlug) {
      setError(
        "Slug không được để trống khi sửa bài đã có — học sinh có thể đã lưu đường dẫn cũ, " +
          "xoá đi sẽ làm hỏng đường dẫn đó. Hãy nhập lại slug (có thể giữ nguyên slug cũ).",
      );
      return;
    }

    const parsed = resourceDraftSchema.safeParse({
      title: form.title.trim(),
      slug: trimmedSlug || toSlug(form.title),
      type: form.type,
      category: form.category.trim(),
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      content: form.content,
      tryThis: form.tryThis.trim(),
      videoUrl: form.videoUrl.trim() || null,
      visibility: form.visibility,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    try {
      const id = await saveResource(editingId, parsed.data, adminUid);
      setEditingId(id);
      setMessage("Đã lưu bản nháp.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không lưu được.");
    }
  }

  function handleEdit(item: ResourceRecord) {
    setEditingId(item.id);
    setMessage(null);
    setError(null);
    setForm({
      title: item.title, slug: item.slug, type: item.type, category: item.category,
      tags: item.tags.join(", "), content: item.content, tryThis: item.tryThis,
      videoUrl: item.videoUrl ?? "", visibility: item.visibility,
    });
  }

  async function handleTogglePublish(item: ResourceRecord) {
    setError(null); setMessage(null);
    try {
      await publishResource(item.id, item.status !== "published");
      load();
    } catch {
      setError("Không đổi được trạng thái đăng. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Danh sách tài nguyên</h2>
        {listFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>
              Chưa tải được danh sách tài nguyên lúc này — có thể do mạng chập chờn thôi.
              Các bài đã lưu vẫn còn nguyên trên hệ thống, không mất đâu.
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
            >
              Thử tải lại
            </button>
          </div>
        ) : items === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : items.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có tài nguyên nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <span className="font-medium">{item.title}</span>
                <span className="text-sm text-slate-500">{item.status} · {item.visibility}</span>
                <button type="button" onClick={() => handleEdit(item)} className="ml-auto underline">Sửa</button>
                <button type="button" onClick={() => void handleTogglePublish(item)} className="underline">
                  {item.status === "published" ? "Gỡ đăng" : "Đăng"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{editingId ? "Sửa tài nguyên" : "Tạo tài nguyên mới"}</h2>

        <label className="flex flex-col gap-1">
          <span>Tiêu đề</span>
          <input
            value={form.title}
            onChange={(e) => {
              update("title", e.target.value);
              if (!editingId) update("slug", toSlug(e.target.value));
            }}
            className="rounded-lg border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>
            Slug (đường dẫn)
            {editingId && <span className="text-rose-700"> — bắt buộc, không được để trống</span>}
          </span>
          <input
            value={form.slug}
            onChange={(e) => update("slug", e.target.value)}
            required={!!editingId}
            aria-required={!!editingId}
            className="rounded-lg border px-3 py-2 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>Loại</span>
          <select value={form.type} onChange={(e) => update("type", e.target.value as typeof form.type)} className="rounded-lg border px-3 py-2">
            {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span>Chủ đề</span>
          <input value={form.category} onChange={(e) => update("category", e.target.value)} className="rounded-lg border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Thẻ (cách nhau bằng dấu phẩy)</span>
          <input value={form.tags} onChange={(e) => update("tags", e.target.value)} className="rounded-lg border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Link video (không bắt buộc — chỉ nhận YouTube)</span>
          <input value={form.videoUrl} onChange={(e) => update("videoUrl", e.target.value)} className="rounded-lg border px-3 py-2" />
        </label>

        <label className="flex flex-col gap-1">
          <span>Ai xem được</span>
          <select value={form.visibility} onChange={(e) => update("visibility", e.target.value as typeof form.visibility)} className="rounded-lg border px-3 py-2">
            <option value="public">Công khai (cả khách chưa đăng nhập)</option>
            <option value="student_only">Chỉ học sinh đã đăng nhập</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span>Nội dung (Markdown)</span>
          <textarea
            value={form.content} onChange={(e) => update("content", e.target.value)}
            rows={16} className="rounded-lg border p-3 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>Một việc có thể thử ngay</span>
          <textarea
            value={form.tryThis} onChange={(e) => update("tryThis", e.target.value)}
            rows={2} maxLength={300}
            placeholder="Ví dụ: Đặt hẹn giờ 5 phút và chỉ tập trung vào một câu hỏi duy nhất."
            className="rounded-lg border p-3"
          />
          <span className="text-sm text-muted">
            Hiện ở cuối bài, dưới dạng một hành động cụ thể học sinh làm được ngay. Để
            trống thì khối này không hiện — đừng viết câu chung chung cho có.
          </span>
        </label>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{message}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => void handleSave()} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
            Lưu bản nháp
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm({ ...EMPTY }); setMessage(null); setError(null); }}
              className="rounded-lg border px-4 py-2"
            >
              Tạo bài mới
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
