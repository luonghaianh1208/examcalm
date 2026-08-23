"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listAllTests, parseTestDraft, publishTest, saveTest, type TestRecord,
} from "@/lib/firestore/admin-tests";

const EMPTY_DRAFT = JSON.stringify(
  {
    title: "Test lo âu (mẫu)",
    version: 1,
    isSampleContent: true,
    disclaimer: "Kết quả chỉ mang tính tham khảo, không phải chẩn đoán y khoa hay tâm lý.",
    questions: [
      { id: "q1", text: "Câu hỏi mẫu 1", options: [
        { label: "Không bao giờ", score: 0 },
        { label: "Thỉnh thoảng", score: 1 },
        { label: "Thường xuyên", score: 2 },
      ]},
    ],
    scoring: { thresholds: [
      { min: 0, max: 1, level: "thap", interpretation: "Diễn giải mẫu cho mức thấp." },
      { min: 2, max: 2, level: "cao", interpretation: "Diễn giải mẫu cho mức cao." },
    ]},
  },
  null, 2,
);

export function TestEditor({ adminUid }: { adminUid: string }) {
  const [tests, setTests] = useState<TestRecord[] | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [json, setJson] = useState(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Ba trạng thái tách biệt (đang tải / lỗi / rỗng thật) giống ProgressView —
  // nuốt lỗi bằng `void reload()` sẽ khiến admin nhìn mãi khung xám, không
  // biết vì sao và không có cách thử lại. Hàm này cũng được gọi lại SAU khi
  // lưu/đăng: nếu lần tải lại đó thất bại, listFailed chuyển sang true và
  // danh sách cũ (có thể đã lỗi thời) không còn được vẽ như thể vẫn còn đúng.
  const load = useCallback(() => {
    listAllTests()
      .then((result) => {
        setTests(result);
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

    const parsed = parseTestDraft(json);
    if (!parsed.ok) { setError(parsed.error); return; }

    try {
      const id = await saveTest(editingId, parsed.value, adminUid);
      setEditingId(id);
      setMessage("Đã lưu bản nháp.");
      load();
    } catch {
      setError("Không lưu được. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  function handleEdit(test: TestRecord) {
    setEditingId(test.id);
    setMessage(null);
    setError(null);
    setJson(JSON.stringify({
      title: test.title, version: test.version, isSampleContent: test.isSampleContent,
      disclaimer: test.disclaimer, questions: test.questions, scoring: test.scoring,
    }, null, 2));
  }

  async function handleTogglePublish(test: TestRecord) {
    setError(null);
    setMessage(null);
    try {
      await publishTest(test.id, test.status !== "published");
      load();
    } catch {
      setError("Không đổi được trạng thái đăng. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-lg font-medium">Danh sách bài test</h2>
        {listFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>
              Chưa tải được danh sách bài test lúc này — có thể do mạng chập chờn thôi.
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
        ) : tests === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : tests.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có bài test nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tests.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <span className="font-medium">{t.title}</span>
                <span className="text-sm text-slate-500">v{t.version} · {t.status}</span>
                {t.isSampleContent && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-sm text-amber-900">nội dung mẫu</span>
                )}
                <button type="button" onClick={() => handleEdit(t)} className="ml-auto underline">Sửa</button>
                <button type="button" onClick={() => void handleTogglePublish(t)} className="underline">
                  {t.status === "published" ? "Gỡ đăng" : "Đăng"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-lg font-medium">
          {editingId ? "Sửa bài test" : "Tạo bài test mới"}
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Nội dung chuyên môn nằm ở đây, không nằm trong code. Khi có thang đo đã thẩm định,
          chỉ cần dán vào ô này.
        </p>

        <label className="flex flex-col gap-1">
          <span className="sr-only">Nội dung bài test dạng JSON</span>
          <textarea
            value={json} onChange={(e) => setJson(e.target.value)}
            rows={22} spellCheck={false}
            aria-label="Nội dung bài test dạng JSON"
            className="w-full rounded-lg border p-3 font-mono text-sm"
          />
        </label>

        {error && <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
        {message && <p role="status" className="mt-2 rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{message}</p>}

        <div className="mt-3 flex gap-3">
          <button type="button" onClick={() => void handleSave()} className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white">
            Lưu bản nháp
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => { setEditingId(null); setJson(EMPTY_DRAFT); setMessage(null); setError(null); }}
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
