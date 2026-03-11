import { describe, expect, it } from "vitest";
import { truncateResult, truncateToolResult, type McpResultContent } from "./result-truncation.js";

describe("truncateResult", () => {
  it("returns content unchanged when under limit", () => {
    const content: McpResultContent[] = [{ type: "text", text: "hello world" }];
    const result = truncateResult(content, 1000);
    expect(result).toEqual(content);
  });

  it("truncates text content when over limit", () => {
    const longText = "a".repeat(200);
    const content: McpResultContent[] = [{ type: "text", text: longText }];
    const result = truncateResult(content, 50);
    expect(result).toHaveLength(1);
    const first = result[0];
    expect(first?.type).toBe("text");
    const text = first?.type === "text" ? first.text : "";
    expect(text).toContain("[truncated");
    expect(text).toContain("200 bytes total");
  });

  it("preserves image content without truncation", () => {
    const content: McpResultContent[] = [
      { type: "text", text: "a".repeat(200) },
      { type: "image", data: "base64data", mimeType: "image/png" },
    ];
    const result = truncateResult(content, 50);
    const images = result.filter((item) => item.type === "image");
    expect(images).toHaveLength(1);
  });

  it("preserves resource content without truncation", () => {
    const content: McpResultContent[] = [
      { type: "text", text: "a".repeat(200) },
      { type: "resource", resource: { uri: "file:///test" } },
    ];
    const result = truncateResult(content, 50);
    const resources = result.filter((item) => item.type === "resource");
    expect(resources).toHaveLength(1);
  });

  it("handles empty content array", () => {
    const result = truncateResult([], 1000);
    expect(result).toEqual([]);
  });

  it("handles multiple text items with budget", () => {
    const content: McpResultContent[] = [
      { type: "text", text: "first" },
      { type: "text", text: "second" },
      { type: "text", text: "third" },
    ];
    // Budget allows "first" + "second" (5+6=11 bytes) but not "third"
    const result = truncateResult(content, 11);
    expect(result).toHaveLength(2);
  });
});

describe("truncateToolResult", () => {
  it("wraps truncateResult for convenience", () => {
    const result = truncateToolResult({ content: [{ type: "text", text: "hello" }] }, 1000);
    expect(result.content).toHaveLength(1);
  });
});
