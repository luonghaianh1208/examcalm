import { describe, it, expect } from "vitest";
import { CURRENT_AI_CONSENT_VERSION, hasCurrentAiConsent } from "./ai-consent";

describe("hasCurrentAiConsent", () => {
  it("aiOptIn=true, version = CURRENT -> true", () => {
    expect(hasCurrentAiConsent(true, CURRENT_AI_CONSENT_VERSION)).toBe(true);
  });

  it("aiOptIn=true, version > CURRENT (tương lai) -> true", () => {
    expect(hasCurrentAiConsent(true, CURRENT_AI_CONSENT_VERSION + 1)).toBe(true);
  });

  it("aiOptIn=true, version < CURRENT -> false", () => {
    expect(hasCurrentAiConsent(true, CURRENT_AI_CONSENT_VERSION - 1)).toBe(false);
  });

  it("aiOptIn=true, version null (field vắng mặt) -> false", () => {
    expect(hasCurrentAiConsent(true, null)).toBe(false);
  });

  it("aiOptIn=true, version undefined -> false", () => {
    expect(hasCurrentAiConsent(true, undefined)).toBe(false);
  });

  it("aiOptIn=false, version CURRENT -> false (chưa từng đồng ý thắng version)", () => {
    expect(hasCurrentAiConsent(false, CURRENT_AI_CONSENT_VERSION)).toBe(false);
  });
});
