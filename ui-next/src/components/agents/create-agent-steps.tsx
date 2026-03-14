import { Wand2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PersonaInfo {
  slug: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  tags: string[];
}

export interface PersonaCategory {
  slug: string;
  name: string;
  count: number;
}

export interface WizardState {
  persona: PersonaInfo | null;
  department: string;
  parentAgent: string;
  agentId: string;
  name: string;
  role: string;
  tier: number;
  description: string;
  preferredModel: string;
  toolsAllow: string;
  toolsDeny: string;
  manifest: string;
  promptContent: string;
  workspaceFiles: Array<{ name: string; content: string; size: number }>;
  validationError: string;
  installed: boolean;
  installError: string;
}

export interface ParentOption {
  id: string;
  name: string;
  department: string;
  tier: number;
}

export const STEPS_WITH_PERSONA = ["Persona", "Basics", "Review", "Install"] as const;
export const STEPS_NO_PERSONA = ["Persona", "Basics", "Describe", "Review", "Install"] as const;

export const DEPARTMENTS = [
  "engineering",
  "finance",
  "marketing",
  "operations",
  "hr",
  "legal",
  "product",
  "sales",
  "customer-success",
  "security",
];

export const INITIAL_STATE: WizardState = {
  persona: null,
  department: "",
  parentAgent: "",
  agentId: "",
  name: "",
  role: "",
  tier: 2,
  description: "",
  preferredModel: "",
  toolsAllow: "",
  toolsDeny: "",
  manifest: "",
  promptContent: "",
  workspaceFiles: [],
  validationError: "",
  installed: false,
  installError: "",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function idFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateLocalTemplate(state: WizardState): {
  manifest: string;
  promptContent: string;
} {
  const tools: string[] = [];
  if (state.toolsAllow) {
    tools.push(
      `  allow:\n${state.toolsAllow
        .split(",")
        .map((t) => `    - ${t.trim()}`)
        .join("\n")}`,
    );
  }
  if (state.toolsDeny) {
    tools.push(
      `  deny:\n${state.toolsDeny
        .split(",")
        .map((t) => `    - ${t.trim()}`)
        .join("\n")}`,
    );
  }

  const manifest = [
    `id: ${state.agentId}`,
    `name: ${state.name}`,
    `tier: ${state.tier}`,
    `role: ${state.role}`,
    `department: ${state.department}`,
    `description: ${state.description.split("\n")[0]}`,
    `version: 1.0.0`,
    "",
    ...(state.parentAgent ? [`requires: ${state.parentAgent}`] : []),
    "",
    `model:`,
    `  provider: anthropic`,
    `  primary: ${state.preferredModel || "claude-sonnet-4-6"}`,
    "",
    ...(tools.length > 0 ? [`tools:`, ...tools, ""] : []),
    `capabilities:`,
    `  - task_execution`,
    "",
    `routing_hints:`,
    `  keywords:`,
    `    - ${state.department}`,
    `  priority: normal`,
    "",
    `limits:`,
    `  timeout_seconds: 300`,
    `  cost_limit_usd: 0.50`,
    "",
    `author:`,
    `  name: User`,
    "",
    `keywords:`,
    `  - ${state.department}`,
    `category: ${state.tier === 2 ? "department-head" : "specialist"}`,
  ].join("\n");

  const promptContent = [
    `# ${state.name}`,
    "",
    `You are **${state.name}**, the ${state.role} in the ${state.department} department.`,
    "",
    `## Responsibilities`,
    "",
    state.description,
    "",
    `## Guidelines`,
    "",
    `- Focus on your area of expertise: ${state.department}`,
    `- Collaborate with other agents when tasks cross department boundaries`,
    `- Report progress and blockers clearly`,
    ...(state.parentAgent
      ? [`- Escalate decisions outside your scope to your department head (${state.parentAgent})`]
      : []),
  ].join("\n");

  return { manifest, promptContent };
}

// ── Step indicator ───────────────────────────────────────────────────────────

export function StepIndicator({ current, steps }: { current: number; steps: readonly string[] }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={cn(
              "flex items-center justify-center size-7 rounded-full text-xs font-medium border",
              i < current && "bg-green-600 text-white border-green-600",
              i === current && "bg-foreground text-background border-foreground",
              i > current && "bg-muted text-muted-foreground border-muted",
            )}
          >
            {i < current ? <CheckCircle2 className="size-3.5" /> : i + 1}
          </div>
          <span
            className={cn(
              "text-xs hidden sm:inline",
              i === current ? "font-medium" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
          {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

// ── Step 0: Persona ─────────────────────────────────────────────────────────

export function StepPersona({
  selected,
  onSelect,
  onSkip,
  sendRpc,
}: {
  selected: PersonaInfo | null;
  onSelect: (persona: PersonaInfo) => void;
  onSkip: () => void;
  sendRpc: <T>(method: string, params: Record<string, unknown>) => Promise<T>;
}) {
  const [categories, setCategories] = useState<PersonaCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [personas, setPersonas] = useState<PersonaInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch categories on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await sendRpc<{ categories: PersonaCategory[] }>("personas.categories", {});
        if (!cancelled && res?.categories) {
          setCategories(res.categories);
          if (res.categories.length > 0) {
            setActiveCategory(res.categories[0].slug);
          }
        }
      } catch {
        // RPC unavailable
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [sendRpc]);

  // Fetch personas when category changes
  useEffect(() => {
    if (!activeCategory) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await sendRpc<{ personas: PersonaInfo[] }>("personas.list", {
          category: activeCategory,
        });
        if (!cancelled && res?.personas) {
          setPersonas(res.personas);
        }
      } catch {
        if (!cancelled) {
          setPersonas([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [activeCategory, sendRpc]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pick a persona to get started quickly, or skip to build from scratch.
      </p>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setActiveCategory(cat.slug)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                activeCategory === cat.slug
                  ? "bg-foreground text-background border-foreground"
                  : "bg-muted text-muted-foreground border-muted hover:border-foreground/30",
              )}
            >
              {cat.name}
              <span className="ml-1 opacity-60">{cat.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="overflow-auto max-h-[280px] pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : personas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No personas available</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {personas.map((p) => (
              <button
                key={p.slug}
                type="button"
                onClick={() => onSelect(p)}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                  selected?.slug === p.slug
                    ? "border-foreground bg-foreground/5 ring-1 ring-foreground/20"
                    : "border-border hover:border-foreground/30 hover:bg-muted/50",
                )}
              >
                <span className="text-xl leading-none mt-0.5 shrink-0">{p.emoji}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
      >
        Skip — create without persona
      </button>
    </div>
  );
}

// ── Step 1: Basics ──────────────────────────────────────────────────────────

export function StepBasics({
  state,
  parents,
  onChange,
  existingIds,
}: {
  state: WizardState;
  parents: ParentOption[];
  onChange: (partial: Partial<WizardState>) => void;
  existingIds: Set<string>;
}) {
  const filteredParents = parents.filter(
    (p) => !state.department || p.department === state.department,
  );

  const idError =
    state.agentId && existingIds.has(state.agentId)
      ? "Agent ID already exists"
      : state.agentId && !/^[a-z0-9-]+$/.test(state.agentId)
        ? "Must be lowercase alphanumeric with hyphens"
        : "";

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Department *</label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm mt-1"
          value={state.department}
          onChange={(e) => onChange({ department: e.target.value })}
        >
          <option value="">Select department...</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d.charAt(0).toUpperCase() + d.slice(1).replace(/-/g, " ")}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Parent Agent</label>
        <p className="text-xs text-muted-foreground mb-1">
          Select a department head to create a specialist, or leave empty for a new department head
        </p>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={state.parentAgent}
          onChange={(e) => {
            const parent = parents.find((p) => p.id === e.target.value);
            onChange({
              parentAgent: e.target.value,
              tier: e.target.value ? 3 : 2,
              department: parent?.department ?? state.department,
            });
          }}
        >
          <option value="">None (Department Head — Tier 2)</option>
          {filteredParents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.department})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium">Agent Name *</label>
          <Input
            value={state.name}
            onChange={(e) =>
              onChange({
                name: e.target.value,
                agentId:
                  state.agentId === idFromName(state.name) || !state.agentId
                    ? idFromName(e.target.value)
                    : state.agentId,
              })
            }
            placeholder="Security Engineer"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Agent ID *</label>
          <Input
            value={state.agentId}
            onChange={(e) => onChange({ agentId: e.target.value })}
            placeholder="security-engineer"
            className={cn("mt-1", idError && "border-destructive")}
          />
          {idError && <p className="text-xs text-destructive mt-1">{idError}</p>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium">Role Title *</label>
          <Input
            value={state.role}
            onChange={(e) => onChange({ role: e.target.value })}
            placeholder="Security Engineer"
            className="mt-1"
          />
        </div>
        <div className="pt-5">
          <span
            className={cn(
              "font-medium px-2 py-0.5 rounded-full border text-xs",
              state.tier === 2
                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                : "bg-zinc-500/10 text-zinc-600 border-zinc-500/20",
            )}
          >
            T{state.tier} {state.tier === 2 ? "Dept Head" : "Specialist"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Describe (no-persona path only) ─────────────────────────────────

export function StepDescribe({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (partial: Partial<WizardState>) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">What should this agent do? *</label>
        <p className="text-xs text-muted-foreground mb-2">
          Describe the agent's responsibilities. AI will generate the manifest and prompt files.
        </p>
        <textarea
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[120px] resize-y"
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="A security engineer who reviews code for vulnerabilities, runs SAST/DAST tools, manages security advisories..."
        />
      </div>

      <details className="group">
        <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground">
          Advanced options
        </summary>
        <div className="space-y-3 mt-3 pl-1">
          <div>
            <label className="text-sm font-medium">Preferred Model</label>
            <Input
              value={state.preferredModel}
              onChange={(e) => onChange({ preferredModel: e.target.value })}
              placeholder="claude-opus-4-6 (default: inherit from parent)"
              className="mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Tools to Allow</label>
              <Input
                value={state.toolsAllow}
                onChange={(e) => onChange({ toolsAllow: e.target.value })}
                placeholder="read, write, exec"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Tools to Deny</label>
              <Input
                value={state.toolsDeny}
                onChange={(e) => onChange({ toolsDeny: e.target.value })}
                placeholder="browser"
                className="mt-1"
              />
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

// ── Step: Review ────────────────────────────────────────────────────────────

export function StepReview({
  state,
  onChange,
  onRegenerate,
  generating,
}: {
  state: WizardState;
  onChange: (partial: Partial<WizardState>) => void;
  onRegenerate: () => void;
  generating: boolean;
}) {
  const hasPersona = !!state.persona;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {hasPersona
            ? "Preview the generated agent files. You can edit AGENT.md before installing."
            : "Review and edit the generated files before installing."}
        </p>
        <Button variant="outline" size="sm" onClick={onRegenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="size-3.5 animate-spin mr-1" />
          ) : (
            <Wand2 className="size-3.5 mr-1" />
          )}
          Regenerate
        </Button>
      </div>

      {state.validationError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
          <AlertCircle className="size-4 shrink-0" />
          {state.validationError}
        </div>
      )}

      {hasPersona ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block">AGENT.md</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono min-h-[280px] resize-y"
              value={state.promptContent}
              onChange={(e) => onChange({ promptContent: e.target.value })}
            />
          </div>
          {state.workspaceFiles.length > 0 && (
            <div>
              <label className="text-xs font-medium mb-1 block">Workspace files</label>
              <div className="rounded-md border divide-y text-sm">
                {state.workspaceFiles.map((f) => (
                  <div key={f.name} className="flex items-center justify-between px-3 py-1.5">
                    <span className="font-mono text-xs">{f.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.size > 1024 ? `${(f.size / 1024).toFixed(1)} KB` : `${f.size} B`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2">
          <div>
            <label className="text-xs font-medium mb-1 block">agent.yaml</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono min-h-[280px] resize-y"
              value={state.manifest}
              onChange={(e) => onChange({ manifest: e.target.value, validationError: "" })}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">AGENT.md</label>
            <textarea
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono min-h-[280px] resize-y"
              value={state.promptContent}
              onChange={(e) => onChange({ promptContent: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step: Install ───────────────────────────────────────────────────────────

export function StepInstall({ state }: { state: WizardState }) {
  if (state.installError) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-destructive/30 p-8">
        <div className="text-center space-y-2">
          <AlertCircle className="mx-auto size-8 text-destructive" />
          <h3 className="font-semibold">Installation Failed</h3>
          <p className="text-sm text-destructive max-w-md">{state.installError}</p>
        </div>
      </div>
    );
  }

  if (state.installed) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-green-600/30 p-8">
        <div className="text-center space-y-2">
          <CheckCircle2 className="mx-auto size-8 text-green-600" />
          <h3 className="font-semibold">Agent Created Successfully</h3>
          <p className="text-sm text-muted-foreground">
            <strong>{state.name}</strong> ({state.agentId}) has been installed as a{" "}
            {state.tier === 2 ? "department head" : "specialist"} in the {state.department}{" "}
            department.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed p-8">
      <div className="text-center space-y-3">
        <h3 className="font-semibold">Ready to Install</h3>
        <p className="text-sm text-muted-foreground">
          This will create <strong>{state.agentId}</strong> in the agents directory.
        </p>
        <div className="text-left inline-block text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">Name:</span> {state.name}
          </div>
          <div>
            <span className="text-muted-foreground">Role:</span> {state.role}
          </div>
          <div>
            <span className="text-muted-foreground">Tier:</span> {state.tier} (
            {state.tier === 2 ? "Dept Head" : "Specialist"})
          </div>
          <div>
            <span className="text-muted-foreground">Department:</span> {state.department}
          </div>
          {state.parentAgent && (
            <div>
              <span className="text-muted-foreground">Parent:</span> {state.parentAgent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
