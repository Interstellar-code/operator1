import {
  Zap,
  RotateCcw,
  Download,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  Loader2,
  Key,
  Slash,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { CommandFormDialog } from "@/components/commands/command-form-dialog";
import { Button } from "@/components/ui/button";
import { SecretInput } from "@/components/ui/custom/form";
import { Switch } from "@/components/ui/switch";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";
import type { CommandEntry, CommandsListResult } from "@/types/commands";

// --- Types ---

type SkillInstallOption = {
  id: string;
  kind: "brew" | "node" | "go" | "uv";
  label: string;
  bins: string[];
};

type SkillStatusEntry = {
  skillKey: string;
  name: string;
  description: string;
  source: string;
  bundled?: boolean;
  filePath: string;
  baseDir: string;
  primaryEnv?: string;
  emoji?: string;
  homepage?: string;
  always: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  eligible: boolean;
  version?: string;
  requirements: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  missing: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  configChecks: unknown[];
  install: SkillInstallOption[];
  hasApiKey?: boolean;
  apiKeyRequired?: boolean;
  error?: string;
  [key: string]: unknown;
};

type SkillsReport = {
  skills?: SkillStatusEntry[];
  [key: string]: unknown;
};

// --- Source grouping ---

const SOURCE_ORDER = ["workspace", "openclaw-bundled", "openclaw-managed", "openclaw-extra"];

function sourceLabel(source: string): string {
  switch (source) {
    case "workspace":
      return "Workspace Skills";
    case "openclaw-bundled":
      return "Built-in Skills";
    case "openclaw-managed":
      return "Installed Skills";
    case "openclaw-extra":
      return "Available Skills";
    default:
      return source.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " Skills";
  }
}

function getMissingList(skill: SkillStatusEntry): string[] {
  return [
    ...(skill.missing?.bins?.map((b) => `bin:${b}`) || []),
    ...(skill.missing?.env?.map((e) => `env:${e}`) || []),
    ...(skill.missing?.config?.map((c) => `config:${c}`) || []),
    ...(skill.missing?.os?.map((o) => `os:${o}`) || []),
  ];
}

function isInstalled(skill: SkillStatusEntry): boolean {
  return getMissingList(skill).length === 0;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function SkillsPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [skills, setSkills] = useState<SkillStatusEntry[]>([]);
  const [skillCommands, setSkillCommands] = useState<CommandEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [viewingCommand, setViewingCommand] = useState<CommandEntry | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const [skillsResult, cmdsResult] = await Promise.all([
        sendRpc<SkillsReport>("skills.status", {}),
        sendRpc<CommandsListResult>("commands.list", { scope: "all" }),
      ]);
      setSkills(skillsResult?.skills ?? []);
      setSkillCommands((cmdsResult?.commands ?? []).filter((c) => c.source === "skill"));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  // Build skillKey → commands lookup map.
  // Match by filePath: command filePath should start with skill's baseDir.
  // Fall back to category === skillKey for skills without a baseDir match.
  const commandsBySkill = useMemo(() => {
    const map = new Map<string, CommandEntry[]>();
    for (const cmd of skillCommands) {
      let matched = false;
      for (const skill of skills) {
        if (skill.baseDir && cmd.filePath && cmd.filePath.startsWith(skill.baseDir)) {
          const arr = map.get(skill.skillKey) ?? [];
          arr.push(cmd);
          map.set(skill.skillKey, arr);
          matched = true;
          break;
        }
      }
      // Fallback: match by category = skillKey
      if (!matched) {
        const byCategory = skills.find((s) => s.skillKey === (cmd.category ?? ""));
        if (byCategory) {
          const arr = map.get(byCategory.skillKey) ?? [];
          arr.push(cmd);
          map.set(byCategory.skillKey, arr);
        }
      }
    }
    return map;
  }, [skillCommands, skills]);

  useEffect(() => {
    if (isConnected) {
      void loadSkills();
    }
  }, [isConnected, loadSkills]);

  const handleDependencyInstall = useCallback(
    async (skillKey: string, installId: string) => {
      setActionLoading(skillKey);
      try {
        await sendRpc("skills.install", {
          name: skillKey,
          installId,
          timeoutMs: 60_000,
        });
        await loadSkills();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadSkills],
  );

  const handleToggle = useCallback(
    async (skillKey: string, enabled: boolean) => {
      setActionLoading(skillKey);
      try {
        await sendRpc("skills.update", { skillKey, enabled });
        await loadSkills();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadSkills],
  );

  const handleSaveApiKey = useCallback(
    async (skillKey: string) => {
      const apiKey = apiKeyInputs[skillKey];
      if (!apiKey) {
        return;
      }
      setActionLoading(skillKey);
      try {
        await sendRpc("skills.update", { skillKey, apiKey });
        setApiKeyInputs((prev) => ({ ...prev, [skillKey]: "" }));
        await loadSkills();
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadSkills, apiKeyInputs],
  );

  // Filter
  const filteredSkills = skills.filter((s) => {
    if (!search) {
      return true;
    }
    const term = search.toLowerCase();
    return (
      (s.name ?? s.skillKey).toLowerCase().includes(term) ||
      (s.description ?? "").toLowerCase().includes(term) ||
      (s.source ?? "").toLowerCase().includes(term)
    );
  });

  // Group by source
  const grouped = filteredSkills.reduce<Record<string, SkillStatusEntry[]>>((acc, skill) => {
    const key = skill.source || "unknown";
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(skill);
    return acc;
  }, {});

  // Sort groups by predefined order
  const sortedGroups = Object.entries(grouped).toSorted(([a], [b]) => {
    const ai = SOURCE_ORDER.indexOf(a);
    const bi = SOURCE_ORDER.indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const installedCount = skills.filter(isInstalled).length;
  const enabledCount = skills.filter((s) => !s.disabled && isInstalled(s)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Skills</h1>
          <span className="text-sm text-muted-foreground">
            {installedCount} installed · {enabledCount}/{installedCount} enabled
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border bg-background pl-9 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button variant="outline" size="sm" onClick={loadSkills} disabled={loading}>
            <RotateCcw className={cn("h-3.5 w-3.5 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Zap className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view skills</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {sortedGroups.map(([source, groupSkills]) => (
            <SkillGroup
              key={source}
              source={source}
              skills={groupSkills}
              expandedSkill={expandedSkill}
              onExpand={setExpandedSkill}
              actionLoading={actionLoading}
              onToggle={handleToggle}
              onInstallDep={handleDependencyInstall}
              apiKeyInputs={apiKeyInputs}
              onApiKeyChange={(key, val) => setApiKeyInputs((prev) => ({ ...prev, [key]: val }))}
              onApiKeySave={handleSaveApiKey}
              commandsBySkill={commandsBySkill}
              onViewCommand={setViewingCommand}
            />
          ))}

          {skills.length > 0 && filteredSkills.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No skills match your search.
            </div>
          )}

          {skills.length === 0 && !loading && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No skills available</p>
            </div>
          )}
        </>
      )}

      {/* Command view dialog */}
      {viewingCommand && (
        <CommandFormDialog
          mode="view"
          initial={viewingCommand}
          existingNames={new Set()}
          onSave={async () => {}}
          onClose={() => setViewingCommand(null)}
        />
      )}
    </div>
  );
}

// ============================================================
// SKILL GROUP (collapsible source section)
// ============================================================

function SkillGroup({
  source,
  skills,
  expandedSkill,
  onExpand,
  actionLoading,
  onToggle,
  onInstallDep,
  apiKeyInputs,
  onApiKeyChange,
  onApiKeySave,
  commandsBySkill,
  onViewCommand,
}: {
  source: string;
  skills: SkillStatusEntry[];
  expandedSkill: string | null;
  onExpand: (key: string | null) => void;
  actionLoading: string | null;
  onToggle: (key: string, enabled: boolean) => void;
  onInstallDep: (key: string, installId: string) => void;
  apiKeyInputs: Record<string, string>;
  onApiKeyChange: (key: string, val: string) => void;
  onApiKeySave: (key: string) => void;
  commandsBySkill: Map<string, CommandEntry[]>;
  onViewCommand: (cmd: CommandEntry) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const installedInGroup = skills.filter(isInstalled).length;
  const enabledInGroup = skills.filter((s) => !s.disabled && isInstalled(s)).length;

  return (
    <div>
      {/* Group header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-2 mb-3 group"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {sourceLabel(source)}
        </span>
        <span className="text-xs text-muted-foreground/70">
          {enabledInGroup}/{installedInGroup} enabled
        </span>
        <div className="flex-1 border-t border-border/30 ml-2" />
      </button>

      {/* Card grid */}
      {!collapsed && (
        <div className="grid grid-cols-2 gap-3">
          {skills.map((skill) => (
            <SkillCard
              key={skill.skillKey}
              skill={skill}
              isExpanded={expandedSkill === skill.skillKey}
              onExpand={onExpand}
              actionLoading={actionLoading}
              onToggle={onToggle}
              onInstallDep={onInstallDep}
              apiKeyInput={apiKeyInputs[skill.skillKey] ?? ""}
              onApiKeyChange={onApiKeyChange}
              onApiKeySave={onApiKeySave}
              commands={commandsBySkill.get(skill.skillKey) ?? []}
              onViewCommand={onViewCommand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// SKILL CARD
// ============================================================

const MAX_COMMANDS_INLINE = 3;

function SkillCard({
  skill,
  isExpanded,
  onExpand,
  actionLoading,
  onToggle,
  onInstallDep,
  apiKeyInput,
  onApiKeyChange,
  onApiKeySave,
  commands,
  onViewCommand,
}: {
  skill: SkillStatusEntry;
  isExpanded: boolean;
  onExpand: (key: string | null) => void;
  actionLoading: string | null;
  onToggle: (key: string, enabled: boolean) => void;
  onInstallDep: (key: string, installId: string) => void;
  apiKeyInput: string;
  onApiKeyChange: (key: string, val: string) => void;
  onApiKeySave: (key: string) => void;
  commands: CommandEntry[];
  onViewCommand: (cmd: CommandEntry) => void;
}) {
  const missingList = getMissingList(skill);
  const hasMissing = missingList.length > 0;
  const installed = isInstalled(skill);
  const canInstall = skill.install && skill.install.length > 0 && hasMissing;
  const isLoading = actionLoading === skill.skillKey;
  const isEnabled = !skill.disabled;
  const [showAllCommands, setShowAllCommands] = useState(false);
  const visibleCommands = showAllCommands ? commands : commands.slice(0, MAX_COMMANDS_INLINE);

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden transition-colors",
        isExpanded && "ring-1 ring-primary/20",
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3">
        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onExpand(isExpanded ? null : skill.skillKey)}
        >
          <div className="flex items-center gap-2 mb-1">
            {skill.emoji && <span className="text-base">{skill.emoji}</span>}
            <span className="text-sm font-medium truncate">{skill.name || skill.skillKey}</span>
            {hasMissing && <AlertTriangle className="h-3.5 w-3.5 text-chart-5 shrink-0" />}
            {skill.apiKeyRequired && !skill.hasApiKey && (
              <Key className="h-3.5 w-3.5 text-chart-5 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {skill.description}
          </p>
        </div>

        {/* Toggle */}
        <div className="shrink-0 pt-0.5">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch
              checked={isEnabled && installed}
              onCheckedChange={(checked) => onToggle(skill.skillKey, checked)}
              disabled={!installed}
              title={!installed ? "Install missing dependencies first" : undefined}
            />
          )}
        </div>
      </div>

      {/* Skill commands — compact chips always visible when not expanded */}
      {commands.length > 0 && !isExpanded && (
        <div className="px-4 pb-3 -mt-0.5 flex items-center gap-1.5 flex-wrap">
          <Slash className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          {visibleCommands.map((cmd) => (
            <button
              key={cmd.commandId}
              onClick={() => onViewCommand(cmd)}
              title={cmd.description}
              className="inline-flex items-center gap-0.5 text-[10px] font-mono px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors"
            >
              {cmd.emoji && <span className="mr-0.5">{cmd.emoji}</span>}/{cmd.name}
            </button>
          ))}
          {commands.length > MAX_COMMANDS_INLINE && !showAllCommands && (
            <button
              onClick={() => setShowAllCommands(true)}
              className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              +{commands.length - MAX_COMMANDS_INLINE} more
            </button>
          )}
        </div>
      )}

      {/* Inline warning for missing deps (always visible, no expand needed) */}
      {hasMissing && !isExpanded && (
        <div className="px-4 pb-3 -mt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-chart-5">
              Missing: {missingList.slice(0, 3).join(", ")}
              {missingList.length > 3 && ` +${missingList.length - 3} more`}
            </span>
          </div>
        </div>
      )}

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-muted/5">
          {/* Error */}
          {skill.error && (
            <div className="text-xs font-mono text-destructive bg-destructive/5 px-3 py-2 rounded">
              {skill.error}
            </div>
          )}

          {/* Missing dependencies */}
          {hasMissing && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-chart-5 mb-1.5">
                Missing Dependencies
              </h4>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {missingList.map((item) => (
                  <span
                    key={item}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-chart-5/10 text-chart-5"
                  >
                    {item}
                  </span>
                ))}
              </div>
              {canInstall && skill.install && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {skill.install.map((action) => (
                    <Button
                      key={action.id}
                      variant="outline"
                      size="sm"
                      onClick={() => onInstallDep(skill.skillKey, action.id)}
                      disabled={isLoading}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Download className="h-3 w-3" />
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* API Key */}
          {skill.apiKeyRequired && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                API Key {skill.hasApiKey ? "(configured)" : "(required)"}
              </h4>
              <div className="flex items-center gap-2">
                <SecretInput
                  placeholder={skill.hasApiKey ? "Replace API key..." : "Enter API key..."}
                  value={apiKeyInput}
                  onValueChange={(v) => onApiKeyChange(skill.skillKey, v)}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onApiKeySave(skill.skillKey)}
                  disabled={isLoading || !apiKeyInput}
                  className="h-8"
                >
                  Save
                </Button>
              </div>
            </div>
          )}

          {/* Skill commands — expanded table */}
          {commands.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                <Slash className="h-3 w-3" />
                Commands
              </h4>
              <div className="space-y-0.5">
                {commands.map((cmd) => (
                  <button
                    key={cmd.commandId}
                    onClick={() => onViewCommand(cmd)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-muted/60 transition-colors group"
                  >
                    <span className="font-mono text-[11px] text-primary shrink-0">
                      {cmd.emoji && <span className="mr-1">{cmd.emoji}</span>}/{cmd.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate flex-1">
                      {cmd.description}
                    </span>
                    {cmd.longRunning && (
                      <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-amber-500/10 text-amber-600 shrink-0">
                        long
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t border-border/30">
            <span className="font-mono">{skill.source}</span>
            {skill.version && <span className="font-mono">v{skill.version}</span>}
            {skill.blockedByAllowlist && (
              <span className="px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">
                blocked by allowlist
              </span>
            )}
            {!skill.eligible && !skill.blockedByAllowlist && (
              <span className="px-1.5 py-0.5 rounded bg-chart-5/10 text-chart-5">ineligible</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
