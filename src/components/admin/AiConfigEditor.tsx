"use client";

import { useCallback, useEffect, useState } from "react";
import { aiConfigSchema, type AiConfig } from "@/lib/types/ai";
import {
  getAiConfig, saveAiConfig, listPromptTemplates, saveDraftPromptTemplate,
  promptTemplateDraftSchema, publishPromptTemplate, unpublishPromptTemplate,
  type PromptTemplateRecord,
} from "@/lib/firestore/admin-ai";
import { callTestAiConnection } from "@/lib/firebase/functions-client";

/** Tên secret trong Secret Manager — đặt qua CLI, KHÔNG BAO GIỜ nhập ở trang này (task-12-brief.md,
 *  Decision C). Chuỗi này chỉ được phép xuất hiện dưới dạng TEXT HIỂN THỊ trong file này. */
const AI_API_KEY_SECRET_NAME = "EXAMCALM_AI_API_KEY";

/** Tên secret Resend trong Secret Manager — ExamCalm Spec #5 (task-3-brief.md, mục 5). Cùng kỷ
 *  luật với AI_API_KEY_SECRET_NAME ở trên: KHÔNG BAO GIỜ có ô nhập cho key này, chỉ text hiển
 *  thị hướng dẫn CLI. */
const RESEND_API_KEY_SECRET_NAME = "EXAMCALM_RESEND_API_KEY";

type ConfigFormState = {
  providerLabel: string;
  baseUrl: string;
  model: string;
  temperature: string;
  maxTokens: string;
  quotaStudentPerDay: string;
  // Task 9 (task-9-brief.md): giờ có ô nhập thật bên dưới — trước đây chỉ pass-through vì
  // task-1-brief.md chỉ yêu cầu thêm field vào schema, chưa tới UI.
  chatQuotaPerDay: string;
  rateLimitPerMinute: string;
  // Task 9: giờ có ô nhập thật bên dưới — trước đây chỉ pass-through (Fix round 1, Task 5,
  // Finding 2a).
  chatRateLimitPerMinute: string;
  /** true = tính năng ĐANG BẬT cho học sinh — NGƯỢC với killSwitch.moodReflection (true =
   *  tắt). Form giữ chiều tích cực để không ai phải tự đảo chiều trong đầu lúc đọc UI. */
  featureEnabled: boolean;
  // Task 9: giờ có checkbox thật bên dưới. Công tắc RIÊNG cho chat (Fix round 1, Task 5,
  // Finding 2b) — tách biệt hẳn UI với công tắc phản chiếu (nhãn/dòng trạng thái không dùng
  // chung chữ với featureEnabled) đúng tinh thần "không dễ bấm nhầm" mà Finding 2b đặt ra: §10
  // của design spec chặn go-live của chat cho tới khi chuyên gia tâm lý duyệt persona và
  // CRISIS_REPLY_TEXT, nên admin bật công tắc này phải biết chắc mình đang bật ĐÚNG tính năng
  // nào. true = tính năng ĐANG BẬT (cùng chiều tích cực với featureEnabled).
  chatEnabled: boolean;
  // ExamCalm Spec #5 (task-1-brief.md): chỉ PASS-THROUGH ở Task 1 — chưa có ô nhập nào thao
  // túng được hai field này (Task 3 mới thêm UI). Giữ ở đây để không làm hỏng aiConfigSchema
  // (giờ bắt buộc cả hai field) khi admin lưu các field KHÁC trên trang này.
  crisisEmailEnabled: boolean;
  crisisEmailFrom: string;
};

function toFormState(config: AiConfig): ConfigFormState {
  return {
    providerLabel: config.providerLabel,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: String(config.temperature),
    maxTokens: String(config.maxTokens),
    quotaStudentPerDay: String(config.quotaStudentPerDay),
    chatQuotaPerDay: String(config.chatQuotaPerDay),
    rateLimitPerMinute: String(config.rateLimitPerMinute),
    chatRateLimitPerMinute: String(config.chatRateLimitPerMinute),
    featureEnabled: !config.killSwitch.moodReflection,
    chatEnabled: !config.killSwitch.chat,
    crisisEmailEnabled: config.crisisEmailEnabled,
    crisisEmailFrom: config.crisisEmailFrom,
  };
}

type TemplateFormState = { name: string; version: string; systemPrompt: string; userTemplate: string };

const EMPTY_TEMPLATE: TemplateFormState = {
  name: "mood_reflection", version: "1", systemPrompt: "", userTemplate: "",
};

export function AiConfigEditor({ adminUid }: { adminUid: string }) {
  // ---- Cấu hình AI ----
  const [configLoadFailed, setConfigLoadFailed] = useState(false);
  const [form, setForm] = useState<ConfigFormState | null>(null);
  // Bản đã LƯU (từ lần load hoặc lần lưu thành công gần nhất) — tách khỏi `form` (đang gõ dở)
  // để biết form có đang "dirty" hay không. Fix round 1, Finding 1 + 2: thiếu bản tham chiếu
  // này, dòng trạng thái kill switch và nút "Thử kết nối" chỉ có thể nói về `form` hiện tại —
  // tức nói về một cấu hình CHƯA TỪNG được ghi xuống Firestore.
  const [savedForm, setSavedForm] = useState<ConfigFormState | null>(null);

  const loadConfig = useCallback(() => {
    getAiConfig()
      .then((result) => {
        const nextForm = toFormState(result);
        setForm(nextForm);
        setSavedForm(nextForm);
        setConfigLoadFailed(false);
      })
      .catch(() => setConfigLoadFailed(true));
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // true khi form đang gõ dở khác với bản đã lưu — theo TẤT CẢ field, không chỉ kill switch,
  // vì "Thử kết nối" (Finding 2) cần biết dirty theo baseUrl/model, không riêng kill switch.
  const isConfigDirty = form !== null && savedForm !== null && JSON.stringify(form) !== JSON.stringify(savedForm);
  // true khi RIÊNG công tắc bật/tắt tính năng khác bản đã lưu — Finding 1 chỉ cần biết đúng
  // field này để quyết định dòng trạng thái nói "đang" (khớp bản lưu) hay "sẽ" (chưa lưu).
  const isFeatureToggleDirty = form !== null && savedForm !== null && form.featureEnabled !== savedForm.featureEnabled;
  // Task 9: cùng lý do với isFeatureToggleDirty ở trên, áp cho công tắc chat RIÊNG.
  const isChatToggleDirty = form !== null && savedForm !== null && form.chatEnabled !== savedForm.chatEnabled;
  // ExamCalm Spec #5 (task-3-brief.md, mục 3): cùng lý do với isFeatureToggleDirty/isChatToggleDirty
  // ở trên, áp cho công tắc gửi mail cảnh báo khủng hoảng RIÊNG.
  const isCrisisEmailToggleDirty =
    form !== null && savedForm !== null && form.crisisEmailEnabled !== savedForm.crisisEmailEnabled;

  const [configError, setConfigError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  function updateForm<K extends keyof ConfigFormState>(key: K, value: ConfigFormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSaveConfig() {
    if (!form) return;
    setConfigError(null);
    setConfigMessage(null);

    const candidate = {
      providerLabel: form.providerLabel.trim(),
      baseUrl: form.baseUrl.trim(),
      model: form.model.trim(),
      temperature: Number(form.temperature),
      maxTokens: Number(form.maxTokens),
      quotaStudentPerDay: Number(form.quotaStudentPerDay),
      chatQuotaPerDay: Number(form.chatQuotaPerDay),
      rateLimitPerMinute: Number(form.rateLimitPerMinute),
      chatRateLimitPerMinute: Number(form.chatRateLimitPerMinute),
      killSwitch: { moodReflection: !form.featureEnabled, chat: !form.chatEnabled },
      crisisEmailEnabled: form.crisisEmailEnabled,
      crisisEmailFrom: form.crisisEmailFrom,
    };

    const parsed = aiConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setConfigError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    try {
      await saveAiConfig(parsed.data);
      const nextForm = toFormState(parsed.data);
      setForm(nextForm);
      setSavedForm(nextForm);
      // Fix round 1, Finding 8: saveAiConfig() republish providerLabel vào aiPublic, thứ
      // AiConsentSection.tsx đọc để nói với học sinh ghi chú của các em đi tới đâu. Một dòng
      // "Đã lưu cấu hình." trung tính không đủ để một admin nhận ra họ VỪA đổi tên công ty
      // được nêu trên màn hình đồng ý của một tính năng liên quan tới trẻ vị thành niên.
      setConfigMessage(
        parsed.data.providerLabel
          ? `Đã lưu cấu hình. Màn hình đồng ý AI của học sinh giờ sẽ ghi nhà cung cấp là "${parsed.data.providerLabel}".`
          : "Đã lưu cấu hình.",
      );
    } catch {
      setConfigError("Không lưu được cấu hình. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  // ---- Thử kết nối ----
  const [testPending, setTestPending] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function handleTestConnection() {
    setTestPending(true);
    setTestMessage(null);
    setTestError(null);
    try {
      const result = await callTestAiConnection();
      if (result.ok) {
        setTestMessage("Kết nối thành công.");
      } else {
        setTestError(result.message);
      }
    } catch {
      setTestError("Không gọi được kiểm tra kết nối. Kiểm tra lại quyền quản trị của bạn.");
    } finally {
      setTestPending(false);
    }
  }

  // ---- Prompt templates ----
  const [templates, setTemplates] = useState<PromptTemplateRecord[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>({ ...EMPTY_TEMPLATE });
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateMessage, setTemplateMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const loadTemplates = useCallback(() => {
    listPromptTemplates()
      .then((result) => {
        setTemplates(result);
        setTemplatesFailed(false);
      })
      .catch(() => setTemplatesFailed(true));
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function updateTemplateForm<K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) {
    setTemplateForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSaveTemplateDraft() {
    setTemplateError(null);
    setTemplateMessage(null);

    const parsed = promptTemplateDraftSchema.safeParse({
      name: templateForm.name.trim(),
      version: Number(templateForm.version),
      systemPrompt: templateForm.systemPrompt,
      userTemplate: templateForm.userTemplate,
    });
    if (!parsed.success) {
      setTemplateError(parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ.");
      return;
    }

    try {
      const id = await saveDraftPromptTemplate(editingTemplateId, parsed.data, adminUid);
      setEditingTemplateId(id);
      setTemplateMessage("Đã lưu bản nháp.");
      loadTemplates();
    } catch (err) {
      // Dùng err.message khi có — Fix round 1, Finding 5: saveDraftPromptTemplate() chặn sửa
      // trực tiếp một bản ĐANG PUBLISHED với một thông báo cụ thể (EDIT_PUBLISHED_TEMPLATE_ERROR),
      // nuốt lỗi bằng một câu chung chung sẽ khiến admin không hiểu vì sao thao tác bị từ chối.
      setTemplateError(err instanceof Error ? err.message : "Không lưu được. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  function handleEditTemplate(t: PromptTemplateRecord) {
    setEditingTemplateId(t.id);
    setTemplateMessage(null);
    setTemplateError(null);
    setShowPreview(false);
    setTemplateForm({
      name: t.name, version: String(t.version),
      systemPrompt: t.systemPrompt, userTemplate: t.userTemplate,
    });
  }

  function handleNewTemplate() {
    setEditingTemplateId(null);
    setTemplateForm({ ...EMPTY_TEMPLATE });
    setTemplateMessage(null);
    setTemplateError(null);
    setShowPreview(false);
  }

  async function handlePublish(t: PromptTemplateRecord) {
    setTemplateError(null);
    setTemplateMessage(null);
    try {
      await publishPromptTemplate(t.id, t.name);
      loadTemplates();
    } catch {
      setTemplateError("Không đăng được. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  async function handleUnpublish(t: PromptTemplateRecord) {
    setTemplateError(null);
    setTemplateMessage(null);
    try {
      await unpublishPromptTemplate(t.id);
      loadTemplates();
    } catch {
      setTemplateError("Không gỡ đăng được. Kiểm tra lại quyền quản trị của bạn.");
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Cấu hình provider</h2>

        {configLoadFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>Chưa tải được cấu hình lúc này — có thể do mạng chập chờn thôi.</p>
            <button
              type="button"
              onClick={loadConfig}
              className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
            >
              Thử tải lại
            </button>
          </div>
        ) : form === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span>Tên nhà cung cấp (hiển thị cho học sinh ở màn hình đồng ý)</span>
              <input
                value={form.providerLabel}
                onChange={(e) => updateForm("providerLabel", e.target.value)}
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Base URL</span>
              <input
                value={form.baseUrl}
                onChange={(e) => updateForm("baseUrl", e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="rounded-lg border px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Model</span>
              <input
                value={form.model}
                onChange={(e) => updateForm("model", e.target.value)}
                className="rounded-lg border px-3 py-2 font-mono text-sm"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Temperature (0 đến 1)</span>
              <input
                value={form.temperature}
                onChange={(e) => updateForm("temperature", e.target.value)}
                inputMode="decimal"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Số token tối đa mỗi lượt (1 đến 2000)</span>
              <input
                value={form.maxTokens}
                onChange={(e) => updateForm("maxTokens", e.target.value)}
                inputMode="numeric"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Quota mỗi học sinh mỗi ngày (0 = tạm khoá hoàn toàn)</span>
              <input
                value={form.quotaStudentPerDay}
                onChange={(e) => updateForm("quotaStudentPerDay", e.target.value)}
                inputMode="numeric"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Giới hạn số lượt gọi mỗi phút (phanh chống burst, 0 = không giới hạn)</span>
              <input
                value={form.rateLimitPerMinute}
                onChange={(e) => updateForm("rateLimitPerMinute", e.target.value)}
                inputMode="numeric"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <div className="rounded-lg border p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.featureEnabled}
                  onChange={(e) => updateForm("featureEnabled", e.target.checked)}
                />
                <span>Bật tính năng phản chiếu AI cho học sinh</span>
              </label>
              <p className="mt-1 text-sm font-medium">
                {isFeatureToggleDirty
                  // Fix round 1, Finding 1: nói ở thì TƯƠNG LAI khi chưa lưu — nói "Đang tắt" ở
                  // thì hiện tại cho một thay đổi chưa lưu là khẳng định SAI: killSwitch thật
                  // trên Firestore chưa đổi, học sinh vẫn đang dùng đúng như trước khi admin bấm.
                  ? (form.featureEnabled ? "Sẽ bật sau khi lưu" : "Sẽ tắt sau khi lưu")
                  : (form.featureEnabled ? "Đang bật cho học sinh" : "Đang tắt")}
              </p>
            </div>

            <label className="flex flex-col gap-1">
              <span>Quota tin nhắn chat mỗi học sinh mỗi ngày (0 = tạm khoá hoàn toàn)</span>
              <input
                value={form.chatQuotaPerDay}
                onChange={(e) => updateForm("chatQuotaPerDay", e.target.value)}
                inputMode="numeric"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span>Giới hạn số tin chat mỗi phút (phanh chống burst, 0 = không giới hạn)</span>
              <input
                value={form.chatRateLimitPerMinute}
                onChange={(e) => updateForm("chatRateLimitPerMinute", e.target.value)}
                inputMode="numeric"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            {/* Task 9: nhãn/dòng trạng thái CỐ Ý dùng chữ khác hẳn công tắc phản chiếu ở trên
                ("trò chuyện" thay vì lặp lại "cho học sinh" trơn) — hai công tắc kiểm soát hai
                tính năng độc lập (killSwitch.moodReflection vs killSwitch.chat), lẫn chữ giữa
                hai dòng trạng thái đúng lúc 11 giờ đêm là cách nhanh nhất để bật nhầm tính năng. */}
            <div className="rounded-lg border p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.chatEnabled}
                  onChange={(e) => updateForm("chatEnabled", e.target.checked)}
                />
                <span>Bật tính năng trò chuyện AI cho học sinh</span>
              </label>
              <p className="mt-1 text-sm font-medium">
                {isChatToggleDirty
                  ? (form.chatEnabled ? "Sẽ bật trò chuyện sau khi lưu" : "Sẽ tắt trò chuyện sau khi lưu")
                  : (form.chatEnabled ? "Đang bật trò chuyện cho học sinh" : "Đang tắt trò chuyện")}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">Đặt API key bằng CLI</p>
              <p className="mt-1">
                Khóa API của provider KHÔNG nhập ở trang này — nó được lưu trong Secret Manager,
                đặt bằng lệnh CLI:
              </p>
              <code className="mt-1 block rounded bg-white px-2 py-1 font-mono text-xs">
                firebase functions:secrets:set {AI_API_KEY_SECRET_NAME}
              </code>
            </div>

            {/* ExamCalm Spec #5 (task-3-brief.md, mục 3): crisisEmailFrom giờ dùng làm CẢ from
                lẫn to (admin nhận qua bcc — xem onCrisisAlertCreated.ts) — mọi mail cảnh báo đều
                thử gửi tới CHÍNH địa chỉ này. Một no-reply không có hộp thư nhận sẽ bounce cứng
                trên MỌI lượt gửi, và bounce rate cao kéo dài là lý do Resend khoá/đình chỉ tài
                khoản — sập luôn đường gửi mail khủng hoảng. Nhãn phải nói rõ điều này TRƯỚC khi
                admin gõ vào, không phải sau khi sự cố xảy ra. */}
            <label className="flex flex-col gap-1">
              <span>
                Email gửi cảnh báo khủng hoảng cho admin — PHẢI là hộp thư có người thật kiểm
                tra, KHÔNG được là địa chỉ no-reply (địa chỉ này đóng vai trò CẢ người gửi lẫn
                người nhận; một no-reply sẽ bounce cứng mọi lượt gửi và có thể khiến Resend khoá
                tài khoản gửi mail)
              </span>
              <input
                value={form.crisisEmailFrom}
                onChange={(e) => updateForm("crisisEmailFrom", e.target.value)}
                placeholder="canh-bao@truong-ban.edu.vn"
                className="rounded-lg border px-3 py-2"
              />
            </label>

            <div className="rounded-lg border p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.crisisEmailEnabled}
                  onChange={(e) => updateForm("crisisEmailEnabled", e.target.checked)}
                />
                <span>Bật gửi mail cảnh báo khủng hoảng cho mọi admin</span>
              </label>
              <p className="mt-1 text-sm font-medium">
                {isCrisisEmailToggleDirty
                  ? (form.crisisEmailEnabled
                    ? "Sẽ bật gửi mail cảnh báo sau khi lưu"
                    : "Sẽ tắt gửi mail cảnh báo sau khi lưu")
                  : (form.crisisEmailEnabled
                    ? "Đang bật gửi mail cảnh báo cho admin"
                    : "Đang tắt gửi mail cảnh báo")}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-medium">Đặt API key Resend bằng CLI</p>
              <p className="mt-1">
                Khóa API của Resend (dùng để gửi mail cảnh báo khủng hoảng) không có ô nhập nào
                ở trang quản trị — nó được lưu trong Secret Manager, đặt bằng lệnh CLI:
              </p>
              <code className="mt-1 block rounded bg-white px-2 py-1 font-mono text-xs">
                firebase functions:secrets:set {RESEND_API_KEY_SECRET_NAME}
              </code>
            </div>

            {configError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{configError}</p>}
            {configMessage && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{configMessage}</p>}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveConfig()}
                className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
              >
                Lưu cấu hình
              </button>
              <button
                type="button"
                disabled={testPending || isConfigDirty}
                onClick={() => void handleTestConnection()}
                className="rounded-lg border px-4 py-2 disabled:opacity-50"
              >
                {testPending ? "Đang thử..." : "Thử kết nối"}
              </button>
            </div>

            {/* Fix round 1, Finding 2: "Thử kết nối" gọi callable đọc systemConfig/aiConfig ĐÃ
                LƯU trên Firestore, không phải các ô đang gõ dở ở trên — nếu không nói rõ, admin
                đang đổi provider dễ đọc nhầm kết quả của provider CŨ thành đã xác nhận cho
                provider MỚI chưa từng được lưu. Disable nút trong lúc dirty để không thể bấm
                nhầm vào đúng lúc dễ hiểu sai nhất. */}
            <p className="text-sm text-slate-500">
              Thử kết nối kiểm tra cấu hình ĐÃ LƯU, không phải các thay đổi chưa lưu ở trên.
              {isConfigDirty && " Còn thay đổi chưa lưu — lưu cấu hình trước khi thử kết nối."}
            </p>

            {testError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{testError}</p>}
            {testMessage && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{testMessage}</p>}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Danh sách prompt template</h2>
        {/* I8 (final whole-branch review): trước fix, không có gì ở đây nói rõ các template này
            CHỈ dùng cho "Phản chiếu" — sendChatMessage.ts (tính năng Trò chuyện) KHÔNG BAO GIỜ
            đọc promptTemplates (buildChatMessages luôn gọi không kèm template, dùng thẳng một
            persona cố định trong mã nguồn). Một admin sửa "System prompt" ở đây tin rằng mình
            đang chỉnh giọng nói của chú mèo trò chuyện — thực ra đang sửa văn bản của Phản
            chiếu, một thay đổi sống động ảnh hưởng học sinh ngay lập tức mà không ai ngờ tới. */}
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Các prompt template dưới đây chỉ áp dụng cho tính năng <strong>Phản chiếu</strong>{" "}
          (viết lại ghi chú cảm xúc). Tính năng <strong>Trò chuyện</strong> KHÔNG đọc bất kỳ
          template nào ở đây — giọng nói của chú mèo trò chuyện là một đoạn văn bản cố định
          trong mã nguồn (không sửa được qua trang này).
        </p>
        {templatesFailed ? (
          <div className="rounded-xl bg-amber-50 px-4 py-6 text-amber-900">
            <p>Chưa tải được danh sách prompt template lúc này — có thể do mạng chập chờn thôi.</p>
            <button
              type="button"
              onClick={loadTemplates}
              className="mt-3 rounded-lg border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-900"
            >
              Thử tải lại
            </button>
          </div>
        ) : templates === null ? (
          <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-200" />
        ) : templates.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-slate-600">Chưa có prompt template nào.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
                <span className="font-medium">{t.name}</span>
                <span className="text-sm text-slate-500">v{t.version} · {t.status}</span>
                <button type="button" onClick={() => handleEditTemplate(t)} className="ml-auto underline">Sửa</button>
                {t.status === "published" ? (
                  <button type="button" onClick={() => void handleUnpublish(t)} className="underline">Gỡ đăng</button>
                ) : (
                  <button type="button" onClick={() => void handlePublish(t)} className="underline">Đăng</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          {editingTemplateId ? "Sửa prompt" : "Soạn prompt mới"}
        </h2>

        <label className="flex flex-col gap-1">
          <span>Tên template</span>
          <input
            value={templateForm.name}
            onChange={(e) => updateTemplateForm("name", e.target.value)}
            className="rounded-lg border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>Phiên bản</span>
          <input
            value={templateForm.version}
            onChange={(e) => updateTemplateForm("version", e.target.value)}
            inputMode="numeric"
            className="rounded-lg border px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>System prompt</span>
          <textarea
            value={templateForm.systemPrompt}
            onChange={(e) => updateTemplateForm("systemPrompt", e.target.value)}
            rows={5}
            className="rounded-lg border p-3 font-mono text-sm"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span>User template</span>
          <textarea
            value={templateForm.userTemplate}
            onChange={(e) => updateTemplateForm("userTemplate", e.target.value)}
            rows={5}
            className="rounded-lg border p-3 font-mono text-sm"
          />
        </label>

        {templateError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{templateError}</p>}
        {templateMessage && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{templateMessage}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleSaveTemplateDraft()}
            className="rounded-lg bg-teal-600 px-4 py-2 font-medium text-white"
          >
            Lưu bản nháp
          </button>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="rounded-lg border px-4 py-2"
          >
            {showPreview ? "Ẩn xem thử" : "Xem thử"}
          </button>
          {editingTemplateId && (
            <button type="button" onClick={handleNewTemplate} className="rounded-lg border px-4 py-2">
              Soạn prompt mới
            </button>
          )}
        </div>

        {showPreview && (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <p className="mb-2 text-slate-500">
              Xem thử — nội dung sẽ được ghép cùng chỉ dẫn cấu trúc bắt buộc trước khi gửi cho AI:
            </p>
            <p className="mb-1 font-medium">System prompt</p>
            <pre className="mb-3 whitespace-pre-wrap rounded bg-white p-2">{templateForm.systemPrompt}</pre>
            <p className="mb-1 font-medium">User template</p>
            <pre className="whitespace-pre-wrap rounded bg-white p-2">{templateForm.userTemplate}</pre>
          </div>
        )}
      </section>
    </div>
  );
}
