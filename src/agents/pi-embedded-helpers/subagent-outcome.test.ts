import { describe, expect, it } from "vitest";
import { classifySubagentOutcome } from "./errors.js";

describe("classifySubagentOutcome", () => {
  // --- Completed ---
  it('returns "completed" for stopReason "stop"', () => {
    expect(classifySubagentOutcome("stop", undefined)).toBe("completed");
  });

  it('returns "completed" for stopReason "end_turn"', () => {
    expect(classifySubagentOutcome("end_turn", undefined)).toBe("completed");
  });

  it('returns "completed" for stopReason "tool_use"', () => {
    expect(classifySubagentOutcome("tool_use", undefined)).toBe("completed");
  });

  it('returns "completed" for non-error stop reason without error message', () => {
    expect(classifySubagentOutcome("max_tokens", undefined)).toBe("completed");
  });

  // --- Aborted ---
  it('returns "aborted" for stopReason "abort"', () => {
    expect(classifySubagentOutcome("abort", undefined)).toBe("aborted");
  });

  it('returns "aborted" for stopReason "cancelled"', () => {
    expect(classifySubagentOutcome("cancelled", undefined)).toBe("aborted");
  });

  // --- Interrupted (network errors) ---
  it('returns "interrupted" for network_error', () => {
    expect(classifySubagentOutcome("error", "network_error")).toBe("interrupted");
  });

  it('returns "interrupted" for ECONNRESET', () => {
    expect(classifySubagentOutcome("error", "read ECONNRESET")).toBe("interrupted");
  });

  it('returns "interrupted" for ETIMEDOUT', () => {
    expect(classifySubagentOutcome("error", "connect ETIMEDOUT 1.2.3.4:443")).toBe("interrupted");
  });

  it('returns "interrupted" for WebSocket closed', () => {
    expect(classifySubagentOutcome("error", "WebSocket closed before connect")).toBe("interrupted");
  });

  it('returns "interrupted" for socket hang up', () => {
    expect(classifySubagentOutcome("error", "socket hang up")).toBe("interrupted");
  });

  it('returns "interrupted" for fetch failed', () => {
    expect(classifySubagentOutcome("error", "fetch failed")).toBe("interrupted");
  });

  it('returns "interrupted" for transient HTTP 502', () => {
    expect(classifySubagentOutcome("error", "502 Bad Gateway")).toBe("interrupted");
  });

  it('returns "interrupted" for transient HTTP 503', () => {
    expect(classifySubagentOutcome("error", "503 Service Unavailable")).toBe("interrupted");
  });

  it('returns "interrupted" for rate limit errors', () => {
    expect(classifySubagentOutcome("error", "rate limit exceeded")).toBe("interrupted");
  });

  // --- Timeout ---
  it('returns "timeout" for timeout errors', () => {
    expect(classifySubagentOutcome("error", "Request timed out")).toBe("timeout");
  });

  // --- Failed (permanent errors) ---
  it('returns "failed" for context overflow', () => {
    expect(classifySubagentOutcome("error", "context length exceeded")).toBe("failed");
  });

  it('returns "failed" for billing errors', () => {
    expect(
      classifySubagentOutcome("error", "402 Payment Required: billing limit reached"),
    ).toBe("failed");
  });

  it('returns "interrupted" for quota exceeded (treated as rate limit)', () => {
    expect(
      classifySubagentOutcome("error", "insufficient_quota: You exceeded your current quota"),
    ).toBe("interrupted");
  });

  it('returns "failed" for auth errors', () => {
    expect(classifySubagentOutcome("error", "invalid_api_key")).toBe("failed");
  });

  it('returns "failed" for stopReason "error" with no error message', () => {
    expect(classifySubagentOutcome("error", undefined)).toBe("failed");
  });

  it('returns "failed" for unknown error messages', () => {
    expect(classifySubagentOutcome("error", "some unknown error happened")).toBe("failed");
  });
});
