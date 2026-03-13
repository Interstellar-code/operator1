import { describe, expect, it } from "vitest";
import type { CommandArg } from "../../infra/state-db/commands-sqlite.js";
import { parseRawArgsString, substituteArgs } from "./commands-core.js";

describe("parseRawArgsString", () => {
  const argDefs: CommandArg[] = [
    { name: "project", type: "string" },
    { name: "env", type: "string" },
  ];

  it("parses positional args in order", () => {
    const result = parseRawArgsString("src/ staging", argDefs);
    expect(result).toEqual({ project: "src/", env: "staging" });
  });

  it("parses --key=value named args", () => {
    const result = parseRawArgsString("--project=src/ --env=prod", argDefs);
    expect(result).toEqual({ project: "src/", env: "prod" });
  });

  it("parses --key value named args", () => {
    const result = parseRawArgsString("--project src/", argDefs);
    expect(result).toEqual({ project: "src/" });
  });

  it("returns empty object for empty string", () => {
    expect(parseRawArgsString("", argDefs)).toEqual({});
    expect(parseRawArgsString("   ", argDefs)).toEqual({});
  });

  it("ignores extra positional args beyond defined argDefs", () => {
    const result = parseRawArgsString("a b c", argDefs);
    expect(result).toEqual({ project: "a", env: "b" });
    expect("c" in result).toBe(false);
  });
});

describe("substituteArgs", () => {
  const argDefs: CommandArg[] = [
    { name: "project", type: "string", default: "." },
    { name: "env", type: "string" },
  ];

  it("substitutes provided args", () => {
    const body = "Build {{project}} in {{env}}.";
    const result = substituteArgs(body, { project: "src/", env: "prod" }, argDefs);
    expect(result).toBe("Build src/ in prod.");
  });

  it("uses default when arg not provided", () => {
    const body = "Build {{project}} now";
    const result = substituteArgs(body, {}, argDefs);
    expect(result).toBe("Build . now");
  });

  it("leaves {{var}} untouched when no value and no default", () => {
    const body = "Deploy to {{env}}.";
    const result = substituteArgs(body, {}, argDefs);
    expect(result).toBe("Deploy to {{env}}.");
  });

  it("handles multiple occurrences of same var", () => {
    const body = "{{project}} — building {{project}}";
    const result = substituteArgs(body, { project: "myapp" }, argDefs);
    expect(result).toBe("myapp — building myapp");
  });

  it("does not substitute unknown vars not in argDefs", () => {
    const body = "{{unknown}} stays.";
    const result = substituteArgs(body, {}, argDefs);
    expect(result).toBe("{{unknown}} stays.");
  });
});
