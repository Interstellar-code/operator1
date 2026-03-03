import {
  Timer,
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Pause,
  Play,
  History,
  Trash2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/custom/data";
import { useToast } from "@/components/ui/custom/toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useGateway } from "@/hooks/use-gateway";
import { useGatewayStore } from "@/store/gateway-store";

/* ── Types ───────────────────────────────────────────────────────────── */

type CronSchedule =
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string };

type CronPayload =
  | { kind: "systemEvent"; text: string }
  | { kind: "agentTurn"; message: string; thinking?: string; timeoutSeconds?: number };

type CronDelivery = {
  mode: "none" | "announce";
  channel?: string;
  to?: string;
  bestEffort?: boolean;
};

type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDurationMs?: number;
};

type CronJob = {
  id: string;
  agentId?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: CronSchedule;
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payload: CronPayload;
  delivery?: CronDelivery;
  state?: CronJobState;
};

type CronRunLogEntry = {
  ts: number;
  jobId: string;
  status?: "ok" | "error" | "skipped";
  durationMs?: number;
  error?: string;
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
  runAtMs?: number;
  nextRunAtMs?: number;
};

type CronStatus = {
  enabled: boolean;
  jobs: number;
  nextWakeAtMs?: number | null;
};

/* ── Helpers ─────────────────────────────────────────────────────────── */

function formatTime(ms?: number | null): string {
  if (!ms) {
    return "—";
  }
  const d = new Date(ms);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatRelative(ms?: number | null): string {
  if (!ms) {
    return "—";
  }
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const past = diff < 0;
  if (abs < 60_000) {
    return past ? "just now" : "< 1m";
  }
  if (abs < 3_600_000) {
    const m = Math.floor(abs / 60_000);
    return past ? `${m}m ago` : `in ${m}m`;
  }
  if (abs < 86_400_000) {
    const h = Math.floor(abs / 3_600_000);
    return past ? `${h}h ago` : `in ${h}h`;
  }
  const days = Math.floor(abs / 86_400_000);
  return past ? `${days}d ago` : `in ${days}d`;
}

function formatSchedule(s: CronSchedule): string {
  if (s.kind === "at") {
    return `at: ${formatTime(new Date(s.at).getTime())}`;
  }
  if (s.kind === "cron") {
    return `cron: ${s.expr}${s.tz ? ` (${s.tz})` : ""}`;
  }
  const ms = s.everyMs;
  if (ms >= 86_400_000) {
    return `every ${Math.round(ms / 86_400_000)}d`;
  }
  if (ms >= 3_600_000) {
    return `every ${Math.round(ms / 3_600_000)}h`;
  }
  return `every ${Math.round(ms / 60_000)}m`;
}

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  error: "bg-red-500/15 text-red-600 dark:text-red-400",
  skipped: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

/* ── Form types ──────────────────────────────────────────────────────── */

type CronFormState = {
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  scheduleKind: "at" | "every" | "cron";
  scheduleAt: string;
  everyAmount: string;
  everyUnit: "minutes" | "hours" | "days";
  cronExpr: string;
  cronTz: string;
  sessionTarget: "main" | "isolated";
  wakeMode: "next-heartbeat" | "now";
  payloadKind: "systemEvent" | "agentTurn";
  payloadText: string;
  deliveryMode: "none" | "announce";
  deliveryChannel: string;
  deliveryTo: string;
  timeoutSeconds: string;
};

const FORM_DEFAULTS: CronFormState = {
  name: "",
  description: "",
  agentId: "",
  enabled: true,
  scheduleKind: "every",
  scheduleAt: "",
  everyAmount: "30",
  everyUnit: "minutes",
  cronExpr: "",
  cronTz: "",
  sessionTarget: "main",
  wakeMode: "now",
  payloadKind: "systemEvent",
  payloadText: "",
  deliveryMode: "announce",
  deliveryChannel: "last",
  deliveryTo: "",
  timeoutSeconds: "",
};

const UNIT_MS: Record<string, number> = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

function buildSchedule(f: CronFormState): CronSchedule {
  if (f.scheduleKind === "at") {
    return { kind: "at", at: new Date(f.scheduleAt).toISOString() };
  }
  if (f.scheduleKind === "cron") {
    const sched: CronSchedule = { kind: "cron", expr: f.cronExpr.trim() };
    if (f.cronTz.trim()) {
      (sched as { tz?: string }).tz = f.cronTz.trim();
    }
    return sched;
  }
  const amount = Number(f.everyAmount) || 1;
  return { kind: "every", everyMs: amount * (UNIT_MS[f.everyUnit] ?? 60_000) };
}

function buildPayload(f: CronFormState): CronPayload {
  if (f.payloadKind === "systemEvent") {
    return { kind: "systemEvent", text: f.payloadText.trim() };
  }
  const payload: CronPayload = { kind: "agentTurn", message: f.payloadText.trim() };
  const timeout = Number(f.timeoutSeconds);
  if (timeout > 0) {
    (payload as { timeoutSeconds?: number }).timeoutSeconds = timeout;
  }
  return payload;
}

function buildDelivery(f: CronFormState): CronDelivery | undefined {
  if (f.payloadKind !== "agentTurn") {
    return undefined;
  }
  const d: CronDelivery = { mode: f.deliveryMode };
  if (f.deliveryMode === "announce") {
    if (f.deliveryChannel.trim()) {
      d.channel = f.deliveryChannel.trim();
    }
    if (f.deliveryTo.trim()) {
      d.to = f.deliveryTo.trim();
    }
  }
  return d;
}

const FLD = "flex flex-col gap-1";
const LBL = "text-xs text-muted-foreground font-medium";
const INP =
  "h-8 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus:border-ring";
const SEL =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-ring cursor-pointer";
const TXT =
  "rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus:border-ring resize-none";

/* ── Component ───────────────────────────────────────────────────────── */

export function CronPage() {
  const { sendRpc } = useGateway();
  const { toast } = useToast();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [runsJobId, setRunsJobId] = useState<string | null>(null);
  const [runs, setRuns] = useState<CronRunLogEntry[]>([]);
  const [recentRuns, setRecentRuns] = useState<CronRunLogEntry[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CronFormState>({ ...FORM_DEFAULTS });
  const [formBusy, setFormBusy] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const patchForm = useCallback((patch: Partial<CronFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, statusRes] = await Promise.all([
        sendRpc<{ jobs?: CronJob[] }>("cron.list", { includeDisabled: true }),
        sendRpc<CronStatus>("cron.status", {}),
      ]);
      const jobList = listRes?.jobs ?? [];
      setJobs(jobList);
      if (statusRes) {
        setStatus(statusRes);
      }
      return jobList;
    } catch (err) {
      setError(String(err));
      return [];
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  const openEditForm = useCallback((job: CronJob) => {
    const f: CronFormState = {
      name: job.name,
      description: job.description ?? "",
      agentId: job.agentId ?? "",
      enabled: job.enabled,
      scheduleKind: job.schedule.kind,
      scheduleAt:
        job.schedule.kind === "at" ? new Date(job.schedule.at).toISOString().slice(0, 16) : "",
      everyAmount:
        job.schedule.kind === "every"
          ? job.schedule.everyMs >= 86_400_000
            ? String(Math.round(job.schedule.everyMs / 86_400_000))
            : job.schedule.everyMs >= 3_600_000
              ? String(Math.round(job.schedule.everyMs / 3_600_000))
              : String(Math.round(job.schedule.everyMs / 60_000))
          : "30",
      everyUnit:
        job.schedule.kind === "every"
          ? job.schedule.everyMs >= 86_400_000
            ? "days"
            : job.schedule.everyMs >= 3_600_000
              ? "hours"
              : "minutes"
          : "minutes",
      cronExpr: job.schedule.kind === "cron" ? job.schedule.expr : "",
      cronTz: job.schedule.kind === "cron" ? (job.schedule.tz ?? "") : "",
      sessionTarget: job.sessionTarget,
      wakeMode: job.wakeMode,
      payloadKind: job.payload.kind,
      payloadText: job.payload.kind === "systemEvent" ? job.payload.text : job.payload.message,
      deliveryMode: job.delivery?.mode ?? "none",
      deliveryChannel: job.delivery?.channel ?? "last",
      deliveryTo: job.delivery?.to ?? "",
      timeoutSeconds:
        job.payload.kind === "agentTurn" && job.payload.timeoutSeconds
          ? String(job.payload.timeoutSeconds)
          : "",
    };
    setForm(f);
    setEditingJobId(job.id);
    setFormOpen(true);
  }, []);

  const handleAddJob = useCallback(async () => {
    if (!form.name.trim()) {
      setError("Job name is required");
      return;
    }
    if (!form.payloadText.trim()) {
      setError("Payload text is required");
      return;
    }
    if (form.scheduleKind === "at" && !form.scheduleAt) {
      setError("Run-at datetime is required");
      return;
    }
    if (form.scheduleKind === "cron" && !form.cronExpr.trim()) {
      setError("Cron expression is required");
      return;
    }
    setFormBusy(true);
    setError(null);
    try {
      const params: Record<string, unknown> = {
        name: form.name.trim(),
        enabled: form.enabled,
        schedule: buildSchedule(form),
        sessionTarget: form.sessionTarget,
        wakeMode: form.wakeMode,
        payload: buildPayload(form),
      };
      if (form.description.trim()) {
        params.description = form.description.trim();
      }
      if (form.agentId.trim()) {
        params.agentId = form.agentId.trim();
      }
      const delivery = buildDelivery(form);
      if (delivery) {
        params.delivery = delivery;
      }
      await sendRpc("cron.add", params);
      setFormOpen(false);
      setForm({ ...FORM_DEFAULTS });
      await loadJobs();
    } catch (err) {
      setError(String(err));
    } finally {
      setFormBusy(false);
    }
  }, [form, sendRpc, loadJobs]);

  const handleUpdateJob = useCallback(async () => {
    if (!editingJobId) {
      return;
    }
    if (!form.payloadText.trim()) {
      setError("Payload text is required");
      return;
    }
    if (form.scheduleKind === "at" && !form.scheduleAt) {
      setError("Run-at datetime is required");
      return;
    }
    if (form.scheduleKind === "cron" && !form.cronExpr.trim()) {
      setError("Cron expression is required");
      return;
    }
    setFormBusy(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        agentId: form.agentId.trim() || undefined,
        enabled: form.enabled,
        schedule: buildSchedule(form),
        sessionTarget: form.sessionTarget,
        wakeMode: form.wakeMode,
        payload: buildPayload(form),
      };
      const delivery = buildDelivery(form);
      if (delivery) {
        patch.delivery = delivery;
      }
      await sendRpc("cron.update", { id: editingJobId, patch });
      setFormOpen(false);
      setEditingJobId(null);
      setForm({ ...FORM_DEFAULTS });
      await loadJobs();
    } catch (err) {
      setError(String(err));
    } finally {
      setFormBusy(false);
    }
  }, [editingJobId, form, sendRpc, loadJobs]);

  const loadRuns = useCallback(
    async (jobId: string) => {
      setRunsJobId(jobId);
      try {
        const result = await sendRpc<{ entries?: CronRunLogEntry[] }>("cron.runs", {
          id: jobId,
          limit: 50,
        });
        setRuns(result?.entries ?? []);
      } catch (err) {
        setError(String(err));
      }
    },
    [sendRpc],
  );

  /** Load most recent runs across all jobs (last 6) */
  const loadRecentRuns = useCallback(
    async (jobList: CronJob[]) => {
      if (jobList.length === 0) {
        return;
      }
      try {
        const allEntries: CronRunLogEntry[] = [];
        const results = await Promise.all(
          jobList.map((j) =>
            sendRpc<{ entries?: CronRunLogEntry[] }>("cron.runs", { id: j.id, limit: 6 }),
          ),
        );
        for (const r of results) {
          if (r?.entries) {
            allEntries.push(...r.entries);
          }
        }
        // Sort by timestamp desc and take last 6
        allEntries.sort((a, b) => b.ts - a.ts);
        setRecentRuns(allEntries.slice(0, 6));
      } catch {
        // Non-critical — don't set error
      }
    },
    [sendRpc],
  );

  // Load jobs + recent runs on connect
  useEffect(() => {
    if (isConnected) {
      void loadJobs().then((jobList) => {
        if (jobList.length > 0) {
          void loadRecentRuns(jobList);
        }
      });
    }
  }, [isConnected, loadJobs, loadRecentRuns]);

  const handleRunNow = useCallback(
    async (jobId: string) => {
      setActionLoading(jobId);
      try {
        const job = jobs.find((j) => j.id === jobId);
        await sendRpc("cron.run", { id: jobId, mode: "force" });
        toast(`Job "${job?.name ?? jobId}" triggered`);
        await loadJobs();
        if (runsJobId === jobId) {
          await loadRuns(jobId);
        }
      } catch (err) {
        toast(String(err), "error");
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadJobs, loadRuns, runsJobId, jobs, toast],
  );

  const handleToggle = useCallback(
    async (jobId: string, enabled: boolean) => {
      setActionLoading(jobId);
      try {
        await sendRpc("cron.update", { id: jobId, patch: { enabled } });
        await loadJobs();
      } catch (err) {
        setError(String(err));
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadJobs],
  );

  const handleDelete = useCallback(
    async (jobId: string, jobName: string) => {
      const confirmed = window.confirm(`Remove job "${jobName}"?`);
      if (!confirmed) {
        return;
      }
      setActionLoading(jobId);
      try {
        await sendRpc("cron.remove", { id: jobId });
        if (runsJobId === jobId) {
          setRunsJobId(null);
          setRuns([]);
        }
        await loadJobs();
      } catch (err) {
        setError(String(err));
      } finally {
        setActionLoading(null);
      }
    },
    [sendRpc, loadJobs, runsJobId],
  );

  /* ── DataTable columns ─────────────────────────────────────────────── */

  const columns: Column<CronJob>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-mono font-semibold">{row.name}</span>
          {row.description && (
            <span className="text-[11px] text-muted-foreground">{row.description}</span>
          )}
          {row.agentId && (
            <span className="text-[11px] text-muted-foreground font-mono">
              Agent: {row.agentId}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "schedule",
      header: "Schedule",
      className: "w-40",
      render: (row) => (
        <span className="text-xs font-mono text-muted-foreground">
          {formatSchedule(row.schedule)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "w-20",
      render: (row) => {
        const st = row.state?.lastStatus ?? "n/a";
        const cls = STATUS_STYLES[st] ?? "bg-muted text-muted-foreground";
        return (
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
            {st}
          </span>
        );
      },
    },
    {
      key: "nextRun",
      header: "Next Run",
      className: "w-24",
      render: (row) => (
        <span className="text-xs text-muted-foreground" title={formatTime(row.state?.nextRunAtMs)}>
          {formatRelative(row.state?.nextRunAtMs)}
        </span>
      ),
    },
    {
      key: "lastRun",
      header: "Last Run",
      className: "w-24",
      render: (row) => (
        <span className="text-xs text-muted-foreground" title={formatTime(row.state?.lastRunAtMs)}>
          {formatRelative(row.state?.lastRunAtMs)}
        </span>
      ),
    },
    {
      key: "chips",
      header: "",
      className: "w-40",
      render: (row) => (
        <div className="flex items-center gap-1 flex-wrap">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${row.enabled ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}
          >
            {row.enabled ? "enabled" : "disabled"}
          </span>
          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
            {row.sessionTarget}
          </span>
          <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">
            {row.wakeMode}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-36",
      render: (row) => (
        <TooltipProvider>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEditForm(row);
                  }}
                  disabled={actionLoading === row.id}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleToggle(row.id, !row.enabled);
                  }}
                  disabled={actionLoading === row.id}
                >
                  {row.enabled ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{row.enabled ? "Disable" : "Enable"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRunNow(row.id);
                  }}
                  disabled={actionLoading === row.id}
                >
                  <Play className="h-3.5 w-3.5 text-emerald-500" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run now</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    void loadRuns(row.id);
                  }}
                  disabled={actionLoading === row.id}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run history</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDelete(row.id, row.name);
                  }}
                  disabled={actionLoading === row.id}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      ),
    },
  ];

  /* ── Selected run history ────────────────────────────────────────── */

  const selectedJob = runsJobId ? jobs.find((j) => j.id === runsJobId) : undefined;
  // eslint-disable-next-line unicorn/no-array-sort -- slice creates new array
  const sortedRuns = runs.slice().sort((a, b) => b.ts - a.ts);
  // When no specific job selected, show recent runs across all jobs
  const displayRuns = runsJobId ? sortedRuns : recentRuns;

  /* ── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Timer className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Cron Jobs</h1>
          <span className="text-xs font-mono text-muted-foreground">{jobs.length} jobs</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setForm({ ...FORM_DEFAULTS });
              setEditingJobId(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Job
          </Button>
          <Button variant="outline" size="sm" onClick={loadJobs} disabled={loading}>
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Scheduler status */}
      {status && (
        <div className="flex items-center gap-6 text-xs text-muted-foreground font-mono">
          <span>
            Scheduler:{" "}
            <strong className={status.enabled ? "text-emerald-500" : "text-destructive"}>
              {status.enabled ? "enabled" : "disabled"}
            </strong>
          </span>
          <span>
            Jobs: <strong>{status.jobs}</strong>
          </span>
          <span>
            Next wake: <strong>{formatRelative(status.nextWakeAtMs)}</strong>
          </span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-destructive/70 hover:text-destructive text-xs ml-2"
          >
            dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Timer className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view cron jobs</p>
        </div>
      ) : jobs.length === 0 && !loading ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-1">No cron jobs configured</p>
          <p className="text-xs">Add scheduled jobs via the form above or the config file</p>
        </div>
      ) : (
        <div className={loading ? "opacity-60 pointer-events-none" : ""}>
          <DataTable
            columns={columns}
            data={jobs}
            keyField="id"
            emptyMessage="No cron jobs found"
            className="[&_tr]:group"
            pageSize={10}
          />
        </div>
      )}

      {/* Run history */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-mono font-semibold">Run History</h3>
            <p className="text-xs text-muted-foreground">
              {selectedJob ? `Latest runs for ${selectedJob.name}` : "Recent runs across all jobs"}
            </p>
          </div>
          {runsJobId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px]"
              onClick={() => {
                setRunsJobId(null);
                setRuns([]);
              }}
            >
              Show all
            </Button>
          )}
        </div>
        <div className="px-4 py-3">
          {displayRuns.length === 0 ? (
            <p className="text-xs text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-1">
              {displayRuns.map((entry, i) => {
                const statusCls =
                  entry.status === "ok"
                    ? "text-emerald-500"
                    : entry.status === "error"
                      ? "text-destructive"
                      : "text-amber-500";
                const jobName =
                  !runsJobId && entry.jobId
                    ? jobs.find((j) => j.id === entry.jobId)?.name
                    : undefined;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-xs font-mono px-2 py-1.5 rounded hover:bg-secondary/20"
                  >
                    {entry.status === "ok" ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3 w-3 text-destructive shrink-0" />
                    )}
                    <span className={statusCls}>{entry.status ?? "—"}</span>
                    {jobName && (
                      <span className="text-muted-foreground truncate max-w-[180px]">
                        {jobName}
                      </span>
                    )}
                    <span className="text-muted-foreground">{formatTime(entry.ts)}</span>
                    {entry.durationMs != null && (
                      <span className="text-muted-foreground">{entry.durationMs}ms</span>
                    )}
                    {entry.summary && (
                      <span className="text-muted-foreground truncate max-w-[300px]">
                        {entry.summary}
                      </span>
                    )}
                    {entry.sessionKey && (
                      <a
                        href={`/chat?session=${encodeURIComponent(entry.sessionKey)}`}
                        className="text-primary hover:underline"
                      >
                        Open chat
                      </a>
                    )}
                    {entry.error && (
                      <span className="text-destructive truncate max-w-[200px]">{entry.error}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Job Sheet */}
      <Sheet
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditingJobId(null);
          }
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingJobId ? "Edit Cron Job" : "New Cron Job"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-4">
            {/* Basic info */}
            <div className={FLD}>
              <label className={LBL}>Name *</label>
              <input
                className={`${INP}${editingJobId ? " opacity-60" : ""}`}
                value={form.name}
                onChange={(e) => patchForm({ name: e.target.value })}
                placeholder="my-job"
                readOnly={!!editingJobId}
              />
            </div>
            <div className={FLD}>
              <label className={LBL}>Description</label>
              <input
                className={INP}
                value={form.description}
                onChange={(e) => patchForm({ description: e.target.value })}
              />
            </div>
            <div className={FLD}>
              <label className={LBL}>Agent ID</label>
              <input
                className={INP}
                value={form.agentId}
                onChange={(e) => patchForm({ agentId: e.target.value })}
                placeholder="default"
              />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => patchForm({ enabled: e.target.checked })}
                className="accent-primary"
              />
              <span>Enabled</span>
            </label>

            {/* Schedule */}
            <div className={FLD}>
              <label className={LBL}>Schedule</label>
              <select
                className={SEL}
                value={form.scheduleKind}
                onChange={(e) =>
                  patchForm({ scheduleKind: e.target.value as CronFormState["scheduleKind"] })
                }
              >
                <option value="every">Every</option>
                <option value="at">At</option>
                <option value="cron">Cron</option>
              </select>
            </div>
            {form.scheduleKind === "at" && (
              <div className={FLD}>
                <label className={LBL}>Run at</label>
                <input
                  type="datetime-local"
                  className={INP}
                  value={form.scheduleAt}
                  onChange={(e) => patchForm({ scheduleAt: e.target.value })}
                />
              </div>
            )}
            {form.scheduleKind === "every" && (
              <div className="grid grid-cols-2 gap-2">
                <div className={FLD}>
                  <label className={LBL}>Every</label>
                  <input
                    type="number"
                    min={1}
                    className={INP}
                    value={form.everyAmount}
                    onChange={(e) => patchForm({ everyAmount: e.target.value })}
                  />
                </div>
                <div className={FLD}>
                  <label className={LBL}>Unit</label>
                  <select
                    className={SEL}
                    value={form.everyUnit}
                    onChange={(e) =>
                      patchForm({ everyUnit: e.target.value as CronFormState["everyUnit"] })
                    }
                  >
                    <option value="minutes">Minutes</option>
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                  </select>
                </div>
              </div>
            )}
            {form.scheduleKind === "cron" && (
              <div className="grid grid-cols-2 gap-2">
                <div className={FLD}>
                  <label className={LBL}>Expression</label>
                  <input
                    className={INP}
                    value={form.cronExpr}
                    onChange={(e) => patchForm({ cronExpr: e.target.value })}
                    placeholder="0 9 * * *"
                  />
                </div>
                <div className={FLD}>
                  <label className={LBL}>Timezone</label>
                  <input
                    className={INP}
                    value={form.cronTz}
                    onChange={(e) => patchForm({ cronTz: e.target.value })}
                    placeholder="UTC"
                  />
                </div>
              </div>
            )}

            {/* Session & Wake */}
            <div className="grid grid-cols-2 gap-2">
              <div className={FLD}>
                <label className={LBL}>Session</label>
                <select
                  className={SEL}
                  value={form.sessionTarget}
                  onChange={(e) =>
                    patchForm({ sessionTarget: e.target.value as CronFormState["sessionTarget"] })
                  }
                >
                  <option value="main">Main</option>
                  <option value="isolated">Isolated</option>
                </select>
              </div>
              <div className={FLD}>
                <label className={LBL}>Wake mode</label>
                <select
                  className={SEL}
                  value={form.wakeMode}
                  onChange={(e) =>
                    patchForm({ wakeMode: e.target.value as CronFormState["wakeMode"] })
                  }
                >
                  <option value="now">Now</option>
                  <option value="next-heartbeat">Next heartbeat</option>
                </select>
              </div>
            </div>

            {/* Payload */}
            <div className={FLD}>
              <label className={LBL}>Payload</label>
              <select
                className={SEL}
                value={form.payloadKind}
                onChange={(e) =>
                  patchForm({ payloadKind: e.target.value as CronFormState["payloadKind"] })
                }
              >
                <option value="systemEvent">System event</option>
                <option value="agentTurn">Agent turn</option>
              </select>
            </div>
            <div className={FLD}>
              <label className={LBL}>
                {form.payloadKind === "systemEvent" ? "System text" : "Agent message"} *
              </label>
              <textarea
                className={TXT}
                rows={4}
                value={form.payloadText}
                onChange={(e) => patchForm({ payloadText: e.target.value })}
              />
            </div>

            {/* Delivery (agentTurn only) */}
            {form.payloadKind === "agentTurn" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className={FLD}>
                    <label className={LBL}>Delivery</label>
                    <select
                      className={SEL}
                      value={form.deliveryMode}
                      onChange={(e) =>
                        patchForm({ deliveryMode: e.target.value as CronFormState["deliveryMode"] })
                      }
                    >
                      <option value="announce">Announce</option>
                      <option value="none">None (internal)</option>
                    </select>
                  </div>
                  <div className={FLD}>
                    <label className={LBL}>Timeout (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      className={INP}
                      value={form.timeoutSeconds}
                      onChange={(e) => patchForm({ timeoutSeconds: e.target.value })}
                    />
                  </div>
                </div>
                {form.deliveryMode === "announce" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className={FLD}>
                      <label className={LBL}>Channel</label>
                      <input
                        className={INP}
                        value={form.deliveryChannel}
                        onChange={(e) => patchForm({ deliveryChannel: e.target.value })}
                        placeholder="last"
                      />
                    </div>
                    <div className={FLD}>
                      <label className={LBL}>To</label>
                      <input
                        className={INP}
                        value={form.deliveryTo}
                        onChange={(e) => patchForm({ deliveryTo: e.target.value })}
                        placeholder="+1555… or chat id"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Submit */}
            <Button
              className="w-full"
              onClick={editingJobId ? handleUpdateJob : handleAddJob}
              disabled={formBusy}
            >
              {formBusy ? "Saving…" : editingJobId ? "Update Job" : "Add Job"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
