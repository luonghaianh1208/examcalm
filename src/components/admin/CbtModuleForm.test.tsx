import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CbtModuleForm, EMPTY_CBT_FORM, type CbtFormValue } from "./CbtModuleForm";

/**
 * Form la controlled component: CbtEditor giu state, form chi bao thay doi.
 * Harness nay dung state that roi in ra JSON de test doc duoc id — thu ma
 * giao dien co tinh KHONG hien, nhung lai la thu de vo du lieu neu sai.
 */
function Harness({ initial }: { initial?: Partial<CbtFormValue> }) {
  const [value, setValue] = useState<CbtFormValue>({ ...EMPTY_CBT_FORM, ...initial });
  return (
    <>
      <CbtModuleForm value={value} onChange={setValue} />
      <pre data-testid="state">{JSON.stringify(value)}</pre>
    </>
  );
}

const doc = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}") as CbtFormValue;
const buoc = (n: number) => within(screen.getByRole("group", { name: new RegExp("Bước " + n) }));

const BA_BUOC: Partial<CbtFormValue> = {
  steps: [
    { id: "s1", prompt: "Cau 1", hint: "" },
    { id: "s2", prompt: "Cau 2", hint: "" },
    { id: "s3", prompt: "Cau 3", hint: "" },
  ],
};

describe("CbtModuleForm", () => {
  it("sua tieu de cap nhat gia tri", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Tiêu đề"), "Bai tap tho");
    expect(doc().title).toBe("Bai tap tho");
  });

  it("them buoc sinh id moi khong trung id nao dang co", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_BUOC} />);
    await user.click(screen.getByRole("button", { name: "Thêm bước" }));

    const ids = doc().steps.map((s) => s.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("XOA BUOC O GIUA KHONG DANH SO LAI cac buoc con lai", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_BUOC} />);
    await user.click(buoc(2).getByRole("button", { name: "Xóa bước" }));

    // s2 bien mat, nhung s1 va s3 phai GIU NGUYEN id: cau tra loi cua hoc sinh
    // trong cbtSessions.answers duoc khoa theo chinh nhung id nay.
    expect(doc().steps.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(doc().steps.map((s) => s.prompt)).toEqual(["Cau 1", "Cau 3"]);
  });

  it("sua noi dung dung buoc duoc chon, khong anh huong buoc khac", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_BUOC} />);
    await user.clear(buoc(2).getByLabelText("Câu hỏi"));
    await user.type(buoc(2).getByLabelText("Câu hỏi"), "Da sua");

    expect(doc().steps.map((s) => s.prompt)).toEqual(["Cau 1", "Da sua", "Cau 3"]);
  });

  it("khong cho xoa khi chi con mot buoc — schema doi it nhat 1 buoc", () => {
    render(<Harness initial={{ steps: [{ id: "s1", prompt: "Cau 1", hint: "" }] }} />);
    expect(buoc(1).getByRole("button", { name: "Xóa bước" })).toBeDisabled();
  });

  it("khong cho them qua 12 buoc — schema chan o 12", () => {
    const muoiHai = Array.from({ length: 12 }, (_, i) => ({
      id: "s" + (i + 1), prompt: "Cau " + (i + 1), hint: "",
    }));
    render(<Harness initial={{ steps: muoiHai }} />);
    expect(screen.getByRole("button", { name: "Thêm bước" })).toBeDisabled();
  });
});
