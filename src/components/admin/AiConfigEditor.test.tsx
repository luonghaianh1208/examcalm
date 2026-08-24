import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  getAiConfig, saveAiConfig, listPromptTemplates, saveDraftPromptTemplate,
  publishPromptTemplate, unpublishPromptTemplate,
} from "@/lib/firestore/admin-ai";
import { callTestAiConnection } from "@/lib/firebase/functions-client";
import { DEFAULT_AI_CONFIG, type AiConfig } from "@/lib/types/ai";
import type { PromptTemplateRecord } from "@/lib/firestore/admin-ai";
import { AiConfigEditor } from "./AiConfigEditor";

// Chỉ mock các hàm gọi Firestore/callable — cùng phong cách CbtEditor.test.tsx/ResourceEditor.test.tsx.
vi.mock("@/lib/firestore/admin-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore/admin-ai")>();
  return {
    ...actual,
    getAiConfig: vi.fn(),
    saveAiConfig: vi.fn(),
    listPromptTemplates: vi.fn(),
    saveDraftPromptTemplate: vi.fn(),
    publishPromptTemplate: vi.fn(),
    unpublishPromptTemplate: vi.fn(),
  };
});

vi.mock("@/lib/firebase/functions-client", () => ({
  callTestAiConnection: vi.fn(),
}));

const mockedGetAiConfig = vi.mocked(getAiConfig);
const mockedSaveAiConfig = vi.mocked(saveAiConfig);
const mockedListPromptTemplates = vi.mocked(listPromptTemplates);
const mockedSaveDraftPromptTemplate = vi.mocked(saveDraftPromptTemplate);
const mockedPublishPromptTemplate = vi.mocked(publishPromptTemplate);
const mockedUnpublishPromptTemplate = vi.mocked(unpublishPromptTemplate);
const mockedCallTestAiConnection = vi.mocked(callTestAiConnection);

const CONFIGURED: AiConfig = {
  providerLabel: "OpenAI",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  temperature: 0.7,
  maxTokens: 500,
  quotaStudentPerDay: 10,
  rateLimitPerMinute: 3,
  killSwitch: { moodReflection: false },
};

const TEMPLATE_DRAFT: PromptTemplateRecord = {
  id: "pt1",
  name: "mood_reflection",
  version: 1,
  status: "draft",
  systemPrompt: "Bạn là chú mèo đồng hành.",
  userTemplate: "Hãy viết phản chiếu.",
  updatedBy: "admin-1",
  updatedAt: new Date("2026-08-20T00:00:00Z"),
};

async function renderReady(config: AiConfig = DEFAULT_AI_CONFIG, templates: PromptTemplateRecord[] = []) {
  mockedGetAiConfig.mockResolvedValue(config);
  mockedListPromptTemplates.mockResolvedValue(templates);
  render(<AiConfigEditor adminUid="admin-1" />);
  await waitFor(() => {
    expect(screen.getByLabelText(/tên nhà cung cấp/i)).toBeInTheDocument();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AiConfigEditor — nạp cấu hình", () => {
  it("nạp đúng giá trị đã lưu vào form", async () => {
    await renderReady(CONFIGURED);

    expect((screen.getByLabelText(/tên nhà cung cấp/i) as HTMLInputElement).value).toBe("OpenAI");
    expect((screen.getByLabelText(/^base url/i) as HTMLInputElement).value).toBe("https://api.openai.com/v1");
    expect((screen.getByLabelText(/^model/i) as HTMLInputElement).value).toBe("gpt-4o-mini");
  });

  it("tải lỗi -> hiện thông báo lỗi kèm nút thử lại", async () => {
    mockedGetAiConfig.mockRejectedValue(new Error("network lỗi"));
    mockedListPromptTemplates.mockResolvedValue([]);
    render(<AiConfigEditor adminUid="admin-1" />);

    await waitFor(() => {
      expect(screen.getByText(/chưa tải được cấu hình/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /thử tải lại/i })).toBeInTheDocument();
  });
});

describe("AiConfigEditor — validate baseUrl (Decision, dùng lại aiConfigSchema)", () => {
  it("baseUrl http:// ngoài localhost -> chặn lưu, hiện lỗi rõ ràng, KHÔNG gọi saveAiConfig", async () => {
    await renderReady(CONFIGURED);

    const baseUrlInput = screen.getByLabelText(/^base url/i);
    await userEvent.clear(baseUrlInput);
    await userEvent.type(baseUrlInput, "http://evil-provider.com/v1");

    await userEvent.click(screen.getByRole("button", { name: /lưu cấu hình/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/https/i);
    });
    expect(mockedSaveAiConfig).not.toHaveBeenCalled();
  });

  it("baseUrl http://localhost -> hợp lệ (ngoại lệ Ollama), lưu thành công", async () => {
    await renderReady(CONFIGURED);

    const baseUrlInput = screen.getByLabelText(/^base url/i);
    await userEvent.clear(baseUrlInput);
    await userEvent.type(baseUrlInput, "http://localhost:11434/v1");

    await userEvent.click(screen.getByRole("button", { name: /lưu cấu hình/i }));

    await waitFor(() => {
      expect(mockedSaveAiConfig).toHaveBeenCalled();
    });
  });

  it("baseUrl sai định dạng (không phải URL) -> chặn lưu", async () => {
    await renderReady(CONFIGURED);

    const baseUrlInput = screen.getByLabelText(/^base url/i);
    await userEvent.clear(baseUrlInput);
    await userEvent.type(baseUrlInput, "khong-phai-url");

    await userEvent.click(screen.getByRole("button", { name: /lưu cấu hình/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockedSaveAiConfig).not.toHaveBeenCalled();
  });
});

describe("AiConfigEditor — kill switch (Decision D)", () => {
  it("không render checkbox nào có nhãn 'killSwitch' thô", async () => {
    await renderReady(CONFIGURED);
    expect(screen.queryByLabelText(/killswitch/i)).not.toBeInTheDocument();
  });

  it("khi tính năng đang bật (killSwitch=false) -> hiện chữ 'Đang bật cho học sinh'", async () => {
    await renderReady(CONFIGURED); // killSwitch.moodReflection: false
    expect(screen.getByText(/đang bật cho học sinh/i)).toBeInTheDocument();
  });

  it("khi tính năng đang tắt (killSwitch=true) -> hiện chữ 'Đang tắt'", async () => {
    await renderReady({ ...CONFIGURED, killSwitch: { moodReflection: true } });
    expect(screen.getByText(/^đang tắt$/i)).toBeInTheDocument();
  });

  it("bật công tắc trong form rồi lưu -> gửi killSwitch.moodReflection=false", async () => {
    await renderReady({ ...CONFIGURED, killSwitch: { moodReflection: true } });

    const toggle = screen.getByLabelText(/bật tính năng phản chiếu ai cho học sinh/i);
    await userEvent.click(toggle);
    await userEvent.click(screen.getByRole("button", { name: /lưu cấu hình/i }));

    await waitFor(() => {
      expect(mockedSaveAiConfig).toHaveBeenCalledWith(
        expect.objectContaining({ killSwitch: { moodReflection: false } }),
      );
    });
  });

  // Fix round 1, Finding 1: bỏ tick công tắc nhưng CHƯA lưu — dòng trạng thái không được
  // khẳng định thì HIỆN TẠI ("Đang tắt") cho một thay đổi chưa từng ghi xuống Firestore, vì
  // killSwitch thật chưa đổi và học sinh vẫn đang dùng tính năng như cũ.
  it("tắt công tắc nhưng CHƯA lưu -> hiện trạng thái TƯƠNG LAI ('Sẽ tắt sau khi lưu'), không khẳng định sai hiện tại", async () => {
    await renderReady(CONFIGURED); // featureEnabled=true đã lưu

    const toggle = screen.getByLabelText(/bật tính năng phản chiếu ai cho học sinh/i);
    await userEvent.click(toggle); // bỏ tick -> dirty, muốn tắt

    expect(screen.getByText(/sẽ tắt sau khi lưu/i)).toBeInTheDocument();
    expect(screen.queryByText(/^đang tắt$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/đang bật cho học sinh/i)).not.toBeInTheDocument();
    expect(mockedSaveAiConfig).not.toHaveBeenCalled();
  });

  it("bật công tắc nhưng CHƯA lưu -> hiện trạng thái TƯƠNG LAI ('Sẽ bật sau khi lưu')", async () => {
    await renderReady({ ...CONFIGURED, killSwitch: { moodReflection: true } }); // đã lưu: tắt

    const toggle = screen.getByLabelText(/bật tính năng phản chiếu ai cho học sinh/i);
    await userEvent.click(toggle); // tick -> dirty, muốn bật

    expect(screen.getByText(/sẽ bật sau khi lưu/i)).toBeInTheDocument();
    expect(screen.queryByText(/đang bật cho học sinh/i)).not.toBeInTheDocument();
  });

  it("sau khi lưu thành công -> trạng thái tương lai biến mất, hiện đúng trạng thái đã lưu", async () => {
    mockedSaveAiConfig.mockResolvedValue(undefined);
    await renderReady(CONFIGURED); // featureEnabled=true đã lưu

    const toggle = screen.getByLabelText(/bật tính năng phản chiếu ai cho học sinh/i);
    await userEvent.click(toggle); // bỏ tick -> dirty
    expect(screen.getByText(/sẽ tắt sau khi lưu/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /lưu cấu hình/i }));

    await waitFor(() => {
      expect(screen.getByText(/^đang tắt$/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/sẽ tắt sau khi lưu/i)).not.toBeInTheDocument();
  });
});

describe("AiConfigEditor — thông báo lưu nêu tên nhà cung cấp (Fix round 1, Finding 8)", () => {
  it("lưu thành công -> thông báo nêu đúng providerLabel sẽ hiện trên màn hình đồng ý học sinh", async () => {
    mockedSaveAiConfig.mockResolvedValue(undefined);
    await renderReady(CONFIGURED);

    await userEvent.click(screen.getByRole("button", { name: /lưu cấu hình/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/openai/i);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/màn hình đồng ý/i);
  });
});

describe("AiConfigEditor — API key KHÔNG nhập ở trang này (Decision C)", () => {
  // Fix round 1, Finding 3: bản trước chỉ soi name/id/placeholder/aria-label — KHÔNG một input
  // nào trong component này đặt các attribute đó (chúng được gắn nhãn theo khuôn cả codebase:
  // `<label><span>Base URL</span><input/></label>`), nên 47/48 phép so sánh so một chuỗi rỗng
  // với pattern và luôn xanh vô nghĩa. Một `<label><span>API key</span><input/></label>` tương
  // lai lọt qua đúng bài test được thiết kế để chặn nó. Soi thêm "tên truy cập" thật của input
  // (labels/label bao quanh) — đây mới là thứ Decision C gọi là "label".
  function accessibleNameOf(el: Element): string {
    const withLabels = el as { labels?: NodeListOf<HTMLLabelElement> };
    const fromLabelsProp = withLabels.labels
      ? Array.from(withLabels.labels).map((l) => l.textContent ?? "").join(" ")
      : "";
    const fromClosestLabel = el.closest("label")?.textContent ?? "";
    return `${fromLabelsProp} ${fromClosestLabel}`;
  }

  it("không có input/textarea/select nào có name/id/placeholder/aria-label/label chứa key|secret|token", async () => {
    await renderReady(CONFIGURED, [TEMPLATE_DRAFT]);

    // Attribute (name/id/placeholder/aria-label) không component nào trong app này từng đặt,
    // nên không có xung đột hợp lệ — giữ pattern đầy đủ.
    const suspiciousAttrPattern = /key|secret|token/i;
    // Nhãn HIỂN THỊ (label text) có một cụm hợp lệ trong chính domain này: "token" như đơn vị
    // đếm của LLM (vd. "Số token tối đa mỗi lượt") — không liên quan gì credential. Vẫn bắt
    // "key"/"secret" nguyên vẹn (không có nghĩa hợp lệ nào trong form này), và vẫn bắt "token"
    // khi đi kèm một từ gợi ý credential ngay trước nó (api/access/session/auth) — đúng cụm một
    // admin thật sẽ gõ cho một ô nhập khoá thật ("API token", "access token"...).
    const suspiciousLabelPattern = /key|secret|\b(api|access|session|auth)[\s-]*token\b/i;

    const fields = document.querySelectorAll("input, textarea, select");
    expect(fields.length).toBeGreaterThan(0);
    fields.forEach((el) => {
      const name = el.getAttribute("name") ?? "";
      const id = el.getAttribute("id") ?? "";
      const placeholder = el.getAttribute("placeholder") ?? "";
      const ariaLabel = el.getAttribute("aria-label") ?? "";
      const labelText = accessibleNameOf(el);
      expect(name).not.toMatch(suspiciousAttrPattern);
      expect(id).not.toMatch(suspiciousAttrPattern);
      expect(placeholder).not.toMatch(suspiciousAttrPattern);
      expect(ariaLabel).not.toMatch(suspiciousAttrPattern);
      expect(labelText).not.toMatch(suspiciousLabelPattern);
    });
  });

  it("hiện hướng dẫn CLI nêu đúng tên secret EXAMCALM_AI_API_KEY và nói rõ không nhập ở đây", async () => {
    await renderReady(CONFIGURED);

    expect(screen.getByText(/EXAMCALM_AI_API_KEY/)).toBeInTheDocument();
    expect(screen.getByText(/không nhập.*ở (đây|trang này)/i)).toBeInTheDocument();
  });
});

describe("AiConfigEditor — Thử kết nối (Decision E)", () => {
  it("bấm 'Thử kết nối' gọi callTestAiConnection và hiện kết quả thành công", async () => {
    mockedCallTestAiConnection.mockResolvedValue({ ok: true });
    await renderReady(CONFIGURED);

    await userEvent.click(screen.getByRole("button", { name: /thử kết nối/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/thành công/i);
    });
    expect(mockedCallTestAiConnection).toHaveBeenCalledTimes(1);
  });

  it("bấm 'Thử kết nối' khi thất bại -> hiện message đã sanitise, KHÔNG hiện raw response", async () => {
    mockedCallTestAiConnection.mockResolvedValue({
      ok: false, kind: "auth", message: "Xác thực với AI provider thất bại.",
    });
    await renderReady(CONFIGURED);

    await userEvent.click(screen.getByRole("button", { name: /thử kết nối/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/xác thực với ai provider thất bại/i);
    });
  });

  it("callable ném lỗi (permission-denied) -> hiện lỗi chung, không crash", async () => {
    mockedCallTestAiConnection.mockRejectedValue(new Error("permission-denied"));
    await renderReady(CONFIGURED);

    await userEvent.click(screen.getByRole("button", { name: /thử kết nối/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  // Fix round 1, Finding 2: callable kiểm tra cấu hình ĐÃ LƯU trên Firestore, không phải các ô
  // đang gõ dở — admin đổi provider rồi bấm "Thử kết nối" trước khi lưu sẽ nhận kết quả của
  // provider CŨ mà tưởng là đã xác nhận cho provider MỚI.
  it("form còn thay đổi chưa lưu -> nút 'Thử kết nối' bị disable", async () => {
    await renderReady(CONFIGURED);

    await userEvent.type(screen.getByLabelText(/^base url/i), "1");

    expect(screen.getByRole("button", { name: /thử kết nối/i })).toBeDisabled();
    expect(mockedCallTestAiConnection).not.toHaveBeenCalled();
  });

  it("form khớp cấu hình đã lưu -> nút 'Thử kết nối' KHÔNG bị disable", async () => {
    await renderReady(CONFIGURED);
    expect(screen.getByRole("button", { name: /thử kết nối/i })).not.toBeDisabled();
  });

  it("hiện copy nói rõ Thử kết nối kiểm tra cấu hình ĐÃ LƯU", async () => {
    await renderReady(CONFIGURED);
    expect(screen.getByText(/cấu hình đã lưu/i)).toBeInTheDocument();
  });
});

describe("AiConfigEditor — soạn prompt: draft → preview → publish", () => {
  it("hiện danh sách prompt template hiện có", async () => {
    await renderReady(CONFIGURED, [TEMPLATE_DRAFT]);
    expect(screen.getByText(/mood_reflection/)).toBeInTheDocument();
  });

  it("soạn draft mới rồi lưu -> gọi saveDraftPromptTemplate với status draft", async () => {
    mockedSaveDraftPromptTemplate.mockResolvedValue("new-pt-id");
    await renderReady(CONFIGURED, []);

    await userEvent.type(screen.getByLabelText(/system prompt/i), "Bạn là chú mèo.");
    await userEvent.type(screen.getByLabelText(/user template/i), "Hãy viết phản chiếu.");

    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(mockedSaveDraftPromptTemplate).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ name: "mood_reflection", systemPrompt: "Bạn là chú mèo." }),
        "admin-1",
      );
    });
  });

  it("bấm 'Xem thử' hiện nội dung system/user prompt hiện tại của form, không gọi network", async () => {
    await renderReady(CONFIGURED, []);

    const systemPromptInput = screen.getByLabelText(/system prompt/i);
    const userTemplateInput = screen.getByLabelText(/user template/i);
    await userEvent.clear(systemPromptInput);
    await userEvent.type(systemPromptInput, "NOI DUNG HE THONG DUY NHAT");
    await userEvent.clear(userTemplateInput);
    await userEvent.type(userTemplateInput, "NOI DUNG NGUOI DUNG DUY NHAT");

    await userEvent.click(screen.getByRole("button", { name: /xem thử/i }));

    expect(screen.getByText("NOI DUNG HE THONG DUY NHAT", { selector: "pre" })).toBeInTheDocument();
    expect(screen.getByText("NOI DUNG NGUOI DUNG DUY NHAT", { selector: "pre" })).toBeInTheDocument();
    expect(mockedCallTestAiConnection).not.toHaveBeenCalled();
  });

  it("publish một template đã lưu -> gọi publishPromptTemplate với đúng id và name", async () => {
    await renderReady(CONFIGURED, [TEMPLATE_DRAFT]);

    const item = screen.getByText(/mood_reflection/).closest("li");
    expect(item).not.toBeNull();
    await userEvent.click(within(item as HTMLElement).getByRole("button", { name: /^đăng$/i }));

    await waitFor(() => {
      expect(mockedPublishPromptTemplate).toHaveBeenCalledWith("pt1", "mood_reflection");
    });
  });

  it("gỡ đăng một template đã publish -> gọi unpublishPromptTemplate", async () => {
    const published: PromptTemplateRecord = { ...TEMPLATE_DRAFT, status: "published" };
    await renderReady(CONFIGURED, [published]);

    const item = screen.getByText(/mood_reflection/).closest("li");
    await userEvent.click(within(item as HTMLElement).getByRole("button", { name: /gỡ đăng/i }));

    await waitFor(() => {
      expect(mockedUnpublishPromptTemplate).toHaveBeenCalledWith("pt1");
    });
  });

  // Fix round 1, Finding 5 (ruling của reviewer): sửa và lưu trực tiếp một bản ĐANG PUBLISHED
  // phải bị từ chối — go-live checklist yêu cầu rà soát trước khi nội dung gửi cho học sinh
  // đổi. saveDraftPromptTemplate() ném EDIT_PUBLISHED_TEMPLATE_ERROR; component phải hiện lại
  // đúng thông báo đó qua role=alert, không nuốt thành một câu chung chung.
  it("sửa một template ĐANG PUBLISHED rồi lưu -> hiện lỗi cụ thể, KHÔNG nuốt thành câu chung chung", async () => {
    const published: PromptTemplateRecord = { ...TEMPLATE_DRAFT, status: "published" };
    mockedSaveDraftPromptTemplate.mockRejectedValue(
      new Error("Không thể sửa trực tiếp một prompt ĐANG PUBLISHED. Hãy gỡ đăng trước, rồi mới sửa nội dung."),
    );
    await renderReady(CONFIGURED, [published]);

    await userEvent.click(screen.getByRole("button", { name: /^sửa$/i }));
    await userEvent.type(screen.getByLabelText(/system prompt/i), " thêm chữ");
    await userEvent.click(screen.getByRole("button", { name: /lưu bản nháp/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/không thể sửa trực tiếp.*published/i);
    });
  });
});
