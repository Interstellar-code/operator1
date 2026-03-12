import {
  deleteSandboxBrowserFromDb,
  deleteSandboxContainerFromDb,
  getSandboxBrowsersFromDb,
  getSandboxContainersFromDb,
  upsertSandboxBrowserInDb,
  upsertSandboxContainerInDb,
} from "../../infra/state-db/sandbox-registry-sqlite.js";

export type SandboxRegistryEntry = {
  containerName: string;
  sessionKey: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  image: string;
  configHash?: string;
};

type SandboxRegistry = {
  entries: SandboxRegistryEntry[];
};

export type SandboxBrowserRegistryEntry = {
  containerName: string;
  sessionKey: string;
  createdAtMs: number;
  lastUsedAtMs: number;
  image: string;
  configHash?: string;
  cdpPort: number;
  noVncPort?: number;
};

type SandboxBrowserRegistry = {
  entries: SandboxBrowserRegistryEntry[];
};

export async function readRegistry(): Promise<SandboxRegistry> {
  return { entries: getSandboxContainersFromDb() };
}

export async function updateRegistry(entry: SandboxRegistryEntry) {
  upsertSandboxContainerInDb(entry);
}

export async function removeRegistryEntry(containerName: string) {
  deleteSandboxContainerFromDb(containerName);
}

export async function readBrowserRegistry(): Promise<SandboxBrowserRegistry> {
  return { entries: getSandboxBrowsersFromDb() };
}

export async function updateBrowserRegistry(entry: SandboxBrowserRegistryEntry) {
  upsertSandboxBrowserInDb(entry);
}

export async function removeBrowserRegistryEntry(containerName: string) {
  deleteSandboxBrowserFromDb(containerName);
}
