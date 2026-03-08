import { describe, expect, it } from "vitest";
import { generateAutoLabel } from "./session-auto-label.js";

describe("generateAutoLabel", () => {
  it("returns undefined for empty/short input", () => {
    expect(generateAutoLabel("")).toBeUndefined();
    expect(generateAutoLabel("   ")).toBeUndefined();
    expect(generateAutoLabel("hi")).toBeUndefined();
    expect(generateAutoLabel("ab")).toBeUndefined();
  });

  it("strips common polite prefixes", () => {
    expect(generateAutoLabel("Can you help me debug this function?")).toBe(
      "Help me debug this function?",
    );
    expect(generateAutoLabel("Please explain how async works")).toBe("Explain how async works");
    expect(generateAutoLabel("Could you please review my code")).toBe("Review my code");
    expect(generateAutoLabel("I want to build a REST API")).toBe("Build a REST API");
    expect(generateAutoLabel("I'd like to understand TypeScript generics")).toBe(
      "Understand TypeScript generics",
    );
  });

  it("strips trailing filler", () => {
    expect(generateAutoLabel("Fix the login bug for me please")).toBe("Fix the login bug");
    expect(generateAutoLabel("Write a test for me")).toBe("Write a test");
  });

  it("strips trailing punctuation except question marks", () => {
    expect(generateAutoLabel("How does this work?")).toBe("How does this work?");
    expect(generateAutoLabel("Fix the build issue.")).toBe("Fix the build issue");
    expect(generateAutoLabel("Deploy to production!")).toBe("Deploy to production");
  });

  it("capitalizes first letter", () => {
    expect(generateAutoLabel("debug the websocket connection")).toBe(
      "Debug the websocket connection",
    );
  });

  it("takes only first line of multiline input", () => {
    expect(generateAutoLabel("Fix the login flow\nHere is the code:\nfunction login() {}")).toBe(
      "Fix the login flow",
    );
  });

  it("truncates long messages at word boundary", () => {
    const long =
      "Implement a comprehensive authentication system with OAuth2 support and refresh token rotation";
    const label = generateAutoLabel(long);
    expect(label).toBeDefined();
    expect(label!.length).toBeLessThanOrEqual(50);
    // Should break at a word boundary
    expect(label!.endsWith(" ")).toBe(false);
  });

  it("strips markdown formatting", () => {
    expect(generateAutoLabel("## Fix the **build** issue")).toBe("Fix the build issue");
    expect(generateAutoLabel("Check `config.ts` for errors")).toBe("Check config.ts for errors");
  });

  it("skips command-like messages", () => {
    expect(generateAutoLabel("/reset")).toBeUndefined();
    expect(generateAutoLabel("/think high")).toBeUndefined();
  });

  it("strips greeting prefixes", () => {
    expect(generateAutoLabel("Hey, can you help me with testing?")).toBe("Help me with testing?");
    expect(generateAutoLabel("Hello, I need a database migration")).toBe(
      "I need a database migration",
    );
  });

  it("handles real-world examples", () => {
    // Instead of "Read HEARTBEAT.md if it exists..." as title
    expect(generateAutoLabel("Read HEARTBEAT.md if it exists and report status")).toBe(
      "Read HEARTBEAT.md if it exists and report status",
    );

    expect(generateAutoLabel("What's the current version of Node.js?")).toBe(
      "What's the current version of Node.js?",
    );

    expect(generateAutoLabel("Help me refactor the auth middleware")).toBe(
      "Refactor the auth middleware",
    );

    expect(generateAutoLabel("Hi, please review my pull request")).toBe("Review my pull request");
  });
});
