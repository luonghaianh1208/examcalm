import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TestDefinitionForm, EMPTY_TEST_FORM, type TestFormValue } from "./TestDefinitionForm";

function Harness({ initial }: { initial?: Partial<TestFormValue> }) {
  const [value, setValue] = useState<TestFormValue>({ ...EMPTY_TEST_FORM, ...initial });
  return (
    <>
      <TestDefinitionForm value={value} onChange={setValue} />
      <pre data-testid="state">{JSON.stringify(value)}</pre>
    </>
  );
}

const doc = () => JSON.parse(screen.getByTestId("state").textContent ?? "{}") as TestFormValue;
const cau = (n: number) => within(screen.getByRole("group", { name: new RegExp("^Câu " + n + "$") }));
const muc = (n: number) => within(screen.getByRole("group", { name: new RegExp("^Mức " + n + "$") }));

const hai = () => [
  { label: "Không", score: "0" },
  { label: "Có", score: "1" },
];
const BA_CAU: Partial<TestFormValue> = {
  questions: [
    { id: "q1", text: "Cau 1", options: hai() },
    { id: "q2", text: "Cau 2", options: hai() },
    { id: "q3", text: "Cau 3", options: hai() },
  ],
};

describe("TestDefinitionForm", () => {
  it("them cau hoi sinh id moi khong trung", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_CAU} />);
    await user.click(screen.getByRole("button", { name: "Thêm câu hỏi" }));

    const ids = doc().questions.map((q) => q.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("XOA CAU HOI O GIUA KHONG DANH SO LAI cac cau con lai", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_CAU} />);
    await user.click(cau(2).getByRole("button", { name: "Xóa câu hỏi" }));

    // Dap an cua hoc sinh trong testAnswers.answers khoa theo chinh id nay.
    expect(doc().questions.map((q) => q.id)).toEqual(["q1", "q3"]);
    expect(doc().questions.map((q) => q.text)).toEqual(["Cau 1", "Cau 3"]);
  });

  it("them phuong an vao dung cau duoc chon", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_CAU} />);
    await user.click(cau(2).getByRole("button", { name: "Thêm phương án" }));

    expect(doc().questions.map((q) => q.options.length)).toEqual([2, 3, 2]);
  });

  it("khong cho xoa phuong an khi chi con hai — schema doi toi thieu 2", () => {
    render(<Harness initial={BA_CAU} />);
    for (const nut of cau(1).getAllByRole("button", { name: "Xóa phương án" })) {
      expect(nut).toBeDisabled();
    }
  });

  it("sua noi dung dung cau duoc chon", async () => {
    const user = userEvent.setup();
    render(<Harness initial={BA_CAU} />);
    await user.clear(cau(3).getByLabelText("Nội dung câu hỏi"));
    await user.type(cau(3).getByLabelText("Nội dung câu hỏi"), "Da sua");

    expect(doc().questions.map((q) => q.text)).toEqual(["Cau 1", "Cau 2", "Da sua"]);
  });

  it("them va xoa muc diem", async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ thresholds: [{ min: "0", max: "5", level: "Nhe", interpretation: "X" }] }} />);
    await user.click(screen.getByRole("button", { name: "Thêm mức" }));
    expect(doc().thresholds).toHaveLength(2);

    await user.click(muc(1).getByRole("button", { name: "Xóa mức" }));
    expect(doc().thresholds).toHaveLength(1);
  });
});
