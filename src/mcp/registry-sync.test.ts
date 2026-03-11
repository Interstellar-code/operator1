import { describe, expect, it } from "vitest";
import { syncMcpRegistry, syncAllMcpRegistries, loadCachedMcpServers } from "./registry-sync.js";

describe("registry-sync exports", () => {
  it("exports syncMcpRegistry function", () => {
    expect(typeof syncMcpRegistry).toBe("function");
  });

  it("exports syncAllMcpRegistries function", () => {
    expect(typeof syncAllMcpRegistries).toBe("function");
  });

  it("exports loadCachedMcpServers function", () => {
    expect(typeof loadCachedMcpServers).toBe("function");
  });
});
