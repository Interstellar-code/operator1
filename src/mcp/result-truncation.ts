/**
 * Truncates oversized MCP tool results before returning to the agent.
 */

/** Content item from an MCP tool result. */
export type McpResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: unknown };

const encoder = new TextEncoder();

/** Measure byte length of a string (UTF-8). */
function byteLen(s: string): number {
  return encoder.encode(s).byteLength;
}

/**
 * Truncate an array of MCP result content items so total text bytes
 * stays within `maxBytes`. Image and resource items pass through untouched.
 */
export function truncateResult(content: McpResultContent[], maxBytes: number): McpResultContent[] {
  // Measure total text bytes across all text items.
  let totalTextBytes = 0;
  for (const item of content) {
    if (item.type === "text") {
      totalTextBytes += byteLen(item.text);
    }
  }

  if (totalTextBytes <= maxBytes) {
    return content;
  }

  // Truncate: walk text items and fill up to maxBytes budget.
  let budget = maxBytes;
  const result: McpResultContent[] = [];

  for (const item of content) {
    if (item.type !== "text") {
      result.push(item);
      continue;
    }

    const itemBytes = byteLen(item.text);
    if (budget <= 0) {
      // No budget left — skip remaining text items.
      continue;
    }

    if (itemBytes <= budget) {
      result.push(item);
      budget -= itemBytes;
    } else {
      // Slice to approximate byte boundary (cut chars, re-measure).
      let sliced = item.text.slice(0, budget);
      while (byteLen(sliced) > budget && sliced.length > 0) {
        sliced = sliced.slice(0, -1);
      }
      const shownBytes = byteLen(sliced);
      const marker = `\n[truncated — ${totalTextBytes} bytes total, showing first ${shownBytes} bytes]`;
      result.push({ type: "text", text: sliced + marker });
      budget = 0;
    }
  }

  return result;
}

/** Convenience wrapper that truncates a full tool result object. */
export function truncateToolResult(
  result: { content: McpResultContent[] },
  maxBytes: number,
): { content: McpResultContent[] } {
  return { content: truncateResult(result.content, maxBytes) };
}
