"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAllCbtModules, parseCbtDraft, publishCbtModule, saveCbtModule, validateCbtDraft,
  type CbtModuleRecord,
} from "@/lib/firestore/admin-cbt";
import {
  CbtModuleForm, cbtFormToDraft, draftToCbtForm, type CbtFormValue,
} from "./CbtModuleForm";
import { JsonFallbackSection } from "./JsonFallbackSection";

/** Bản mẫu cho bài mới — giữ đúng nội dung mà ô JSON trước đây điền sẵn. */
const MAU: CbtFormValue = draftToCbtForm({
  title: "Bài tập CBT (mẫu)",
  version: 1,
  isSampleContent: true,
  disclaimer: "Không thay thế chuyên gia. Kết quả chỉ mang tính tham khảo.",
  intro: "Giới thiệu mẫu",
  steps: [{ id: "s1", prompt: "Câu hỏi mẫu 1", hint: "" }],
  closingText: "Cảm ơn bạn đã hoàn thành.",
  suggestedResourceSlugs: [],
});

export function CbtEditor({ adminUid }: { adminUid: string }) {
  const [modules, setModules] = useState<CbtModuleRecord[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CbtFormValue>(MAU);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ba trạng thái tách biệt (đang tải / lỗi / rỗng thật) giống TestEditor —
  // nuốt lỗi bằng `void reload()` sẽ khiến admin nhìn mãi khung xám, không
  // biết vì sao và không có cách thử lại. Hàm này cũng được gọi lại SAU khi
  // lưu/đăng: nếu lần tải lại đó thất bại, listFailed chuyển sang true và
  // danh sách cũ (có thể đã lỗi thời) không còn được vẽ như thể vẫn còn đúng.
  const load = useCallback(() => {
    listAllCbtModules()
      .then((result) => {
        setModules(result);
        setListFailed(false);
      })
      .catch(() => setListFailed(true));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setError(null);
    setMessage(null);

    // Cùng bộ luật với ô "Dán JSON" — validateCbtDraft() là nguồn duy nhất.
    const parsed = validateCbtDraft(cbtFormToDraft(form));
    if (!parsed.ok) { setError(parsed.error); return; }

    try {
      const id = await saveCbtModule(editingId, parsed.value, adminUid);
      setEditingId(id);
      setMessage("Đã lưu bản nháp.");
      load();
    } catch {
      setError("Không lưu được. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  function handleApplyJson(json: string) {
    setError(null);
    setMessage(null);

    const parsed = parseCbtDraft(json);
    if (!parsed.ok) { setError(parsed.error); return; }

    setForm(draftToCbtForm(parsed.value));
    setMessage("Đã nạp JSON vào form. Kiểm tra lại rồi bấm Lưu bản nháp.");
  }

  function handleEdit(mod: CbtModuleRecord) {
    setEditingId(mod.id);
    setMessage(null);
    setError(null);
    setForm(draftToCbtForm(mod));
  }

  async function handleTogglePublish(mod: CbtModuleRecord) {
    setError(null);
    setMessage(null);
    try {
      await publishCbtModule(mod.id, mod.status !== "published");
      load();
    } catch {
      setError("Không đổi được trạng thái đăng. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Danh sách bài tập CBT</h2>
        {listFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>
              Chưa tải được danh sách bài tập CBT lúc này — có thể do mạng chập chờn thôi.
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
        ) : modules === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : modules.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có bài tập CBT nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {modules.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <span className="font-medium">{m.title}</span>
                <span className="text-sm text-slate-500">v{m.version} · {m.status}</span>
                {m.isSampleContent && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">nội dung mẫu</span>
                )}
                <button type="button" onClick={() => handleEdit(m)} className="ml-auto underline">Sửa</button>
                <button type="button" onClick={() => void handleTogglePublish(m)} className="underline">
                  {m.status === "published" ? "Gỡ đăng" : "Đăng"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          {editingId ? "Sửa bài tập CBT" : "Tạo bài tập CBT mới"}
        </h2>
        <p className="text-sm text-slate-500">
          Nội dung chuyên môn nằm ở đây, không nằm trong code. Điền vào form bên dưới —
          hoặc nếu đã có bài được thẩm định, dùng mục Dán JSON ở cuối trang.
        </p>

        <CbtModuleForm value={form} onChange={setForm} />

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        {message && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{message}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={() => void handleSave()} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
            Lưu bản nháp
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setForm(MAU); setMessage(null); setError(null); }}
              className="rounded-lg border px-4 py-2"
            >
              Tạo bài mới
            </button>
          )}
        </div>

        <JsonFallbackSection
          jsonHienTai={JSON.stringify(cbtFormToDraft(form), null, 2)}
          onApply={handleApplyJson}
        />
      </section>
    </div>
  );
}
