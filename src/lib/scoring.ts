import type { Question, Threshold } from "@/lib/types/test";

export class IncompleteAnswersError extends Error {
  constructor(public readonly missingQuestionIds: string[]) {
    super(`Còn ${missingQuestionIds.length} câu chưa trả lời.`);
    this.name = "IncompleteAnswersError";
  }
}

export class InvalidAnswerError extends Error {
  constructor(public readonly questionId: string, public readonly optionIndex: number) {
    super(`Câu ${questionId} có lựa chọn không hợp lệ: ${optionIndex}.`);
    this.name = "InvalidAnswerError";
  }
}

export function isComplete(
  questions: Question[],
  answers: Record<string, number>,
): boolean {
  return questions.every((q) => q.id in answers);
}

/**
 * Tính tổng điểm từ chỉ số option đã chọn.
 * `answers` là questionId -> chỉ số option (0-based), KHÔNG phải điểm.
 */
export function calculateScore(
  questions: Question[],
  answers: Record<string, number>,
): number {
  const missing = questions.filter((q) => !(q.id in answers)).map((q) => q.id);
  if (missing.length > 0) throw new IncompleteAnswersError(missing);

  let total = 0;
  for (const question of questions) {
    const index = answers[question.id]!;
    const option = question.options[index];
    if (!Number.isInteger(index) || option === undefined) {
      throw new InvalidAnswerError(question.id, index);
    }
    total += option.score;
  }
  return total;
}

/** Trả về ngưỡng ĐẦU TIÊN khớp; null nếu không ngưỡng nào khớp. */
export function resolveLevel(
  score: number,
  thresholds: Threshold[],
): Threshold | null {
  return thresholds.find((t) => score >= t.min && score <= t.max) ?? null;
}
