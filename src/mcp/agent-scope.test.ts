import { describe, expect, it } from "vitest";
import { filterServersByAgent, isServerAccessible } from "./agent-scope.js";

describe("isServerAccessible", () => {
  const scopes: Record<string, string[]> = {
    assistant: ["docs", "search"],
    reviewer: ["github"],
  };

  it("returns true when agentId is undefined", () => {
    expect(isServerAccessible("docs", undefined, scopes)).toBe(true);
  });

  it("returns true when agentScopes is undefined", () => {
    expect(isServerAccessible("docs", "assistant", undefined)).toBe(true);
  });

  it("returns true when agent is not listed in scopes (default open)", () => {
    expect(isServerAccessible("docs", "unlisted-agent", scopes)).toBe(true);
  });

  it("returns true when server is in agent's allowed list", () => {
    expect(isServerAccessible("docs", "assistant", scopes)).toBe(true);
    expect(isServerAccessible("search", "assistant", scopes)).toBe(true);
  });

  it("returns false when server is not in agent's allowed list", () => {
    expect(isServerAccessible("github", "assistant", scopes)).toBe(false);
    expect(isServerAccessible("docs", "reviewer", scopes)).toBe(false);
  });
});

describe("filterServersByAgent", () => {
  const scopes: Record<string, string[]> = {
    assistant: ["docs", "search"],
    reviewer: ["github"],
  };

  const allServers = ["docs", "search", "github", "analytics"];

  it("returns all servers when agentId is undefined", () => {
    expect(filterServersByAgent(allServers, undefined, scopes)).toEqual(allServers);
  });

  it("returns all servers when agentScopes is undefined", () => {
    expect(filterServersByAgent(allServers, "assistant", undefined)).toEqual(allServers);
  });

  it("returns all servers when agent is not listed (default open)", () => {
    expect(filterServersByAgent(allServers, "unlisted", scopes)).toEqual(allServers);
  });

  it("filters to allowed servers for a scoped agent", () => {
    expect(filterServersByAgent(allServers, "assistant", scopes)).toEqual(["docs", "search"]);
  });

  it("filters to allowed servers for reviewer agent", () => {
    expect(filterServersByAgent(allServers, "reviewer", scopes)).toEqual(["github"]);
  });

  it("returns empty when agent's allowed servers don't overlap", () => {
    expect(filterServersByAgent(["analytics"], "reviewer", scopes)).toEqual([]);
  });
});
