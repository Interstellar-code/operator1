import { updateSessionStoreEntry } from "../config/sessions.js";
import { readFirstUserMessageFromTranscript } from "./session-utils.fs.js";
import { loadSessionEntry } from "./session-utils.js";

const AUTO_LABEL_MAX_LEN = 50;

/**
 * Greeting prefixes stripped first, before action prefixes.
 * These only remove the greeting part, leaving the rest for a possible
 * second-pass action prefix strip.
 */
const GREETING_PREFIXES = [
  "hey can you",
  "hey could you",
  "hey please",
  "hi can you",
  "hi could you",
  "hi please",
  "hello can you",
  "hello could you",
  "hello please",
  "hey,",
  "hi,",
  "hello,",
  "hey",
  "hi",
  "hello",
];

/**
 * Action/polite prefixes to strip. Ordered longest-first so we strip
 * the most specific match.
 */
const ACTION_PREFIXES = [
  "could you please",
  "would you please",
  "can you please",
  "please help me",
  "i would like to",
  "i would like you to",
  "i want you to",
  "i'd like to",
  "i'd like you to",
  "i need you to",
  "i need to",
  "i want to",
  "please",
  "can you",
  "could you",
  "would you",
  "help me",
  "let's",
  "let me",
];

/**
 * Trailing filler to strip (e.g. "for me", "for me please").
 */
const STRIP_SUFFIXES = ["for me please", "for me", "please", "thanks", "thank you"];

/**
 * Generate a concise auto-label from the first user message in a session.
 * Uses heuristics (no LLM call) to extract the core topic/action.
 *
 * Returns undefined if the message is too short or not meaningful enough
 * to produce a good label.
 */
export function generateAutoLabel(firstUserMessage: string): string | undefined {
  if (!firstUserMessage || !firstUserMessage.trim()) {
    return undefined;
  }

  let text = firstUserMessage.trim();

  // If the message is very short (< 4 chars), not enough signal
  if (text.length < 4) {
    return undefined;
  }

  // Take only the first line if multiline
  const firstLine = text.split(/\r?\n/)[0].trim();
  if (firstLine) {
    text = firstLine;
  }

  // Strip markdown/formatting noise
  text = text.replace(/^#+\s*/, ""); // heading markers
  text = text.replace(/\*\*|__/g, ""); // bold
  text = text.replace(/`([^`]*)`/g, "$1"); // inline code
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"); // links

  // Strip prefixes: first try greeting prefixes, then one action prefix pass.
  // If no greeting matched, try action prefixes directly (single pass only).
  let strippedGreeting = false;
  {
    const lower = text.toLowerCase();
    for (const prefix of GREETING_PREFIXES) {
      if (lower.startsWith(prefix)) {
        const rest = text.slice(prefix.length).trim();
        if (rest.length >= 3) {
          text = rest;
          strippedGreeting = true;
          break;
        }
      }
    }
  }

  // One pass of action prefix stripping (always, whether we stripped a greeting or not)
  {
    const lower = text.toLowerCase();
    for (const prefix of ACTION_PREFIXES) {
      if (lower.startsWith(prefix)) {
        const rest = text.slice(prefix.length).trim();
        if (rest.length >= 3) {
          text = rest;
          break;
        }
      }
    }
  }

  // Strip common suffixes
  {
    const lowerText = text.toLowerCase();
    for (const suffix of STRIP_SUFFIXES) {
      if (lowerText.endsWith(suffix)) {
        const rest = text.slice(0, -suffix.length).trim();
        if (rest.length >= 3) {
          text = rest;
          break;
        }
      }
    }
  }

  // Strip trailing punctuation (but keep question marks as they're meaningful)
  text = text.replace(/[.!,;:]+$/, "").trim();

  // Capitalize first letter
  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  // Truncate to max length, break at word boundary
  if (text.length > AUTO_LABEL_MAX_LEN) {
    const cut = text.slice(0, AUTO_LABEL_MAX_LEN - 1);
    const lastSpace = cut.lastIndexOf(" ");
    if (lastSpace > AUTO_LABEL_MAX_LEN * 0.5) {
      text = cut.slice(0, lastSpace).trimEnd();
    } else {
      text = cut.trimEnd();
    }
    // Remove trailing punctuation from the truncated text
    text = text.replace(/[.!,;:\-]+$/, "").trim();
  }

  // Final validation: skip if too short or looks like a command
  if (text.length < 3) {
    return undefined;
  }
  if (text.startsWith("/")) {
    return undefined;
  }

  return text;
}

/**
 * Attempt to auto-label a session after the first assistant reply.
 * Only labels if:
 * - The session exists and has no user-set label
 * - The session doesn't already have an auto-label
 * - A first user message can be read from the transcript
 *
 * This is designed to be called fire-and-forget after a chat reply completes.
 */
export async function maybeAutoLabelSession(sessionKey: string): Promise<void> {
  try {
    const { storePath, entry } = loadSessionEntry(sessionKey);
    if (!storePath || !entry) {
      return;
    }

    // Don't overwrite user-set labels
    if (entry.label && !entry.autoLabel) {
      return;
    }

    // Don't re-label if already auto-labeled
    if (entry.autoLabel && entry.label) {
      return;
    }

    // Read the first user message from the transcript
    const firstUserMessage = readFirstUserMessageFromTranscript(
      entry.sessionId,
      storePath,
      entry.sessionFile,
    );
    if (!firstUserMessage) {
      return;
    }

    const label = generateAutoLabel(firstUserMessage);
    if (!label) {
      return;
    }

    // Persist the auto-label
    await updateSessionStoreEntry({
      storePath,
      sessionKey,
      update: async (current) => {
        // Re-check inside the lock: don't clobber a user-set label
        if (current.label && !current.autoLabel) {
          return null;
        }
        return { label, autoLabel: true };
      },
    });
  } catch {
    // Auto-labeling is best-effort; never fail the chat flow
  }
}
