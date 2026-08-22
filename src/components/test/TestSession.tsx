"use client";

import { useState } from "react";
import { TestRunner, type CompletedTest } from "./TestRunner";
import { TestResult } from "./TestResult";
import { saveGuestResult } from "@/lib/guest-storage";
import { saveTestAttempt } from "@/lib/firestore/attempts";
import type { TestDefinition } from "@/lib/types/test";

type Props = {
  test: TestDefinition & { id: string };
  uid: string | null;
  isSignedIn: boolean;
  /** true khi user đã đăng nhập VÀ đã xác thực email — rules mới cho ghi. */
  canSave: boolean;
};

export function TestSession({ test, uid, isSignedIn, canSave }: Props) {
  const [result, setResult] = useState<CompletedTest | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  async function handleComplete(completed: CompletedTest) {
    setResult(completed);

    if (canSave && uid) {
      try {
        setAttemptId(await saveTestAttempt(uid, completed));
      } catch {
        // Kết quả vẫn hiện — mất kết nối không được làm hỏng trải nghiệm (spec §7.4).
        setSaveFailed(true);
      }
      return;
    }

    if (!isSignedIn) {
      saveGuestResult({
        testId: completed.testId,
        testVersion: completed.testVersion,
        answers: completed.answers,
        score: completed.score,
        level: completed.level,
        completedAt: new Date().toISOString(),
      });
    }
  }

  if (result) {
    return (
      <>
        <TestResult
          result={result}
          disclaimer={test.disclaimer}
          isSampleContent={test.isSampleContent}
          isSignedIn={isSignedIn}
          savedAttemptId={attemptId}
        />
        {isSignedIn && !canSave && (
          <p role="status" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-900">
            Bạn cần <strong>xác thực email</strong> thì kết quả mới được lưu lại.
          </p>
        )}
        {saveFailed && (
          <p role="status" className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-slate-700">
            Kết quả đang chờ đồng bộ. Khi có mạng trở lại, mình sẽ tự lưu giúp bạn.
          </p>
        )}
      </>
    );
  }

  return <TestRunner test={test} onComplete={handleComplete} />;
}
