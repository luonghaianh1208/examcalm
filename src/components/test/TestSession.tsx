"use client";

import { useState } from "react";
import { TestRunner, type CompletedTest } from "./TestRunner";
import { TestResult } from "./TestResult";
import { saveGuestResult } from "@/lib/guest-storage";
import type { TestDefinition } from "@/lib/types/test";

type Props = {
  test: TestDefinition & { id: string };
  isSignedIn: boolean;
  canSave: boolean;
};

export function TestSession({ test, isSignedIn, canSave }: Props) {
  const [result, setResult] = useState<CompletedTest | null>(null);

  function handleComplete(completed: CompletedTest) {
    setResult(completed);
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
    // Lưu vào Firestore cho Student: thêm ở Task 13.
    void canSave;
  }

  if (result) {
    return (
      <TestResult
        result={result}
        disclaimer={test.disclaimer}
        isSampleContent={test.isSampleContent}
        isSignedIn={isSignedIn}
      />
    );
  }

  return <TestRunner test={test} onComplete={handleComplete} />;
}
