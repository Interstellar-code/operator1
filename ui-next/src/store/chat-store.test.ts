import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore, normalizeSessionKey } from "./chat-store";

// Helper: reset store to initial state before each test
beforeEach(() => {
  useChatStore.getState().reset();
});

describe("normalizeSessionKey", () => {
  it("trims whitespace", () => {
    expect(normalizeSessionKey("  main  ")).toBe("main");
    expect(normalizeSessionKey("agent:main:main")).toBe("agent:main:main");
  });

  it("preserves case (session keys are case-sensitive)", () => {
    expect(normalizeSessionKey("Main")).toBe("Main");
  });
});

describe("per-session state isolation", () => {
  it("getSessionState returns defaults for unknown key", () => {
    const state = useChatStore.getState().getSessionState("unknown");
    expect(state.messages).toEqual([]);
    expect(state.isStreaming).toBe(false);
    expect(state.streamRunId).toBeNull();
    expect(state.streamContent).toBe("");
    expect(state.isSendPending).toBe(false);
  });

  it("startStream on session A does not affect session B", () => {
    const store = useChatStore.getState();
    store.startStream("run-A", "session-A");

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    expect(stateA.isStreaming).toBe(true);
    expect(stateA.streamRunId).toBe("run-A");
    expect(stateB.isStreaming).toBe(false);
    expect(stateB.streamRunId).toBeNull();
  });

  it("two parallel sessions can stream independently without ping-pong", () => {
    const store = useChatStore.getState();
    store.startStream("run-A", "session-A");
    store.startStream("run-B", "session-B");

    // Delta for A
    useChatStore.getState().updateStreamDelta("run-A", "Hello from A", "session-A");
    // Delta for B
    useChatStore.getState().updateStreamDelta("run-B", "Hello from B", "session-B");

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    // No cross-contamination
    expect(stateA.streamContent).toBe("Hello from A");
    expect(stateB.streamContent).toBe("Hello from B");
    expect(stateA.isStreaming).toBe(true);
    expect(stateB.isStreaming).toBe(true);
  });

  it("updateStreamDelta ignores wrong runId (no cross-session bleed)", () => {
    const store = useChatStore.getState();
    store.startStream("run-A", "session-A");
    store.startStream("run-B", "session-B");

    // Wrong runId for session-A — should be ignored
    useChatStore.getState().updateStreamDelta("run-B", "Bleed!", "session-A");

    const stateA = useChatStore.getState().getSessionState("session-A");
    expect(stateA.streamContent).toBe(""); // unchanged — wrong runId was rejected
  });

  it("finalizeStream appends message only to the target session", () => {
    const store = useChatStore.getState();
    store.startStream("run-A", "session-A");
    store.startStream("run-B", "session-B");

    useChatStore.getState().updateStreamDelta("run-A", "Final text A", "session-A");
    useChatStore.getState().finalizeStream("run-A", "session-A", "Final text A");

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    // Session A: finalized — message appended, streaming stopped
    expect(stateA.isStreaming).toBe(false);
    expect(stateA.messages).toHaveLength(1);
    expect(stateA.messages[0].content).toBe("Final text A");
    expect(stateA.messages[0].role).toBe("assistant");

    // Session B: still streaming, no messages added
    expect(stateB.isStreaming).toBe(true);
    expect(stateB.messages).toHaveLength(0);
  });

  it("switching activeSessionKey preserves both sessions' state", () => {
    const store = useChatStore.getState();
    store.startStream("run-A", "session-A");
    useChatStore.getState().updateStreamDelta("run-A", "Mid-stream A", "session-A");

    // Switch to session B
    useChatStore.getState().setActiveSessionKey("session-B");

    // Session A's stream state must survive the session switch
    const stateA = useChatStore.getState().getSessionState("session-A");
    expect(stateA.isStreaming).toBe(true);
    expect(stateA.streamContent).toBe("Mid-stream A");

    // Active session key changed
    expect(useChatStore.getState().activeSessionKey).toBe("session-B");
  });

  it("appendMessage targets the correct session", () => {
    const store = useChatStore.getState();
    store.appendMessage(
      { role: "user", content: "Hello A", timestamp: Date.now(), seq: 0 },
      "session-A",
    );
    store.appendMessage(
      { role: "user", content: "Hello B", timestamp: Date.now(), seq: 0 },
      "session-B",
    );

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    expect(stateA.messages).toHaveLength(1);
    expect(stateA.messages[0].content).toBe("Hello A");
    expect(stateB.messages).toHaveLength(1);
    expect(stateB.messages[0].content).toBe("Hello B");
  });

  it("setSendPending scopes to target session", () => {
    const store = useChatStore.getState();
    store.setSendPending(true, "session-A");

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    expect(stateA.isSendPending).toBe(true);
    expect(stateB.isSendPending).toBe(false);
  });

  it("setMessages updates only the target session and does not affect others", () => {
    const store = useChatStore.getState();
    store.appendMessage(
      { role: "user", content: "Old B message", timestamp: Date.now(), seq: 0 },
      "session-B",
    );

    store.setMessages(
      [{ role: "assistant", content: "History A", timestamp: Date.now(), seq: 1, id: "m1" }],
      false,
      "session-A",
    );

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    expect(stateA.messages).toHaveLength(1);
    expect(stateA.messages[0].content).toBe("History A");
    // Session B untouched
    expect(stateB.messages).toHaveLength(1);
    expect(stateB.messages[0].content).toBe("Old B message");
  });

  it("streamError writes error message only to target session", () => {
    const store = useChatStore.getState();
    store.startStream("run-A", "session-A");
    store.startStream("run-B", "session-B");

    useChatStore.getState().streamError("run-A", "session-A", "Something went wrong");

    const stateA = useChatStore.getState().getSessionState("session-A");
    const stateB = useChatStore.getState().getSessionState("session-B");

    expect(stateA.isStreaming).toBe(false);
    expect(stateA.messages).toHaveLength(1);
    expect(stateA.messages[0].role).toBe("system");
    expect(stateA.messages[0].content).toBe("Something went wrong");

    // Session B unaffected
    expect(stateB.isStreaming).toBe(true);
    expect(stateB.messages).toHaveLength(0);
  });

  it("getActiveSessionState reflects activeSessionKey", () => {
    const store = useChatStore.getState();
    store.startStream("run-X", "session-X");
    store.setActiveSessionKey("session-X");

    const active = useChatStore.getState().getActiveSessionState();
    expect(active.isStreaming).toBe(true);
    expect(active.streamRunId).toBe("run-X");
  });
});
