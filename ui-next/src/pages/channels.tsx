import {
  Link2,
  RotateCcw,
  LogOut,
  XCircle,
  Loader2,
  MoreHorizontal,
  Settings2,
  Activity,
  Trash2,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/custom/data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

/** Mirrors gateway ChannelAccountSnapshot */
type ChannelAccount = {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  reconnectAttempts?: number;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string;
  dmPolicy?: string;
  probe?: unknown;
  audit?: unknown;
  bot?: { username?: string };
  [key: string]: unknown;
};

type ChannelInfo = {
  id: string;
  label: string;
  configured: boolean;
  accounts: ChannelAccount[];
  summary: Record<string, unknown>;
};

/** Derived status for rendering badges */
type ChannelStatusInfo = {
  label: string;
  color: string;
  bg: string;
};

/** Flat row for the channels table (one row per channel+account) */
type ChannelTableRow = {
  channelId: string;
  channelLabel: string;
  accountId: string;
  accountName: string;
  enabled: boolean;
  configured: boolean;
  status: ChannelStatusInfo;
  connected: boolean;
  running: boolean;
  linked: boolean;
  mode: string | null;
  lastError: string | null;
  lastConnectedAt: number | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
  raw: ChannelAccount;
};

/** The actual shape returned by channels.status RPC */
type ChannelsStatusResponse = {
  ts?: number;
  channelOrder?: string[];
  channelLabels?: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channelSystemImages?: Record<string, string>;
  channelMeta?: Array<{ id: string; label: string; detailLabel?: string; systemImage?: string }>;
  channels?: Record<string, unknown>;
  channelAccounts?: Record<string, ChannelAccount[]>;
  channelDefaultAccountId?: Record<string, string>;
};

/** Format timestamp as relative time ago */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) {
    return `${Math.round(diff / 1000)}s ago`;
  }
  if (diff < 3_600_000) {
    return `${Math.round(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.round(diff / 3_600_000)}h ago`;
  }
  return `${Math.round(diff / 86_400_000)}d ago`;
}

const channelIcons: Record<string, string> = {
  whatsapp: "📱",
  telegram: "✈️",
  discord: "🎮",
  googlechat: "💬",
  slack: "💬",
  signal: "🔒",
  imessage: "💬",
  nostr: "🔑",
  web: "🌐",
  matrix: "🔗",
  msteams: "👥",
  voice: "🎙️",
  zalo: "💬",
};

/** Fallback channel list when gateway returns empty (matches old UI behavior) */
const FALLBACK_CHANNEL_ORDER = [
  "whatsapp",
  "telegram",
  "discord",
  "googlechat",
  "slack",
  "signal",
  "imessage",
  "nostr",
];

const FALLBACK_CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  googlechat: "Google Chat",
  slack: "Slack",
  signal: "Signal",
  imessage: "iMessage",
  nostr: "Nostr",
};

/** Transform the Record-based RPC response into an array for rendering */
function transformResponse(result: ChannelsStatusResponse): ChannelInfo[] {
  // Build labels from channelMeta (preferred) or channelLabels fallback
  const metaLabels: Record<string, string> = {};
  if (result.channelMeta) {
    for (const entry of result.channelMeta) {
      metaLabels[entry.id] = entry.label;
    }
  }
  const labels = { ...FALLBACK_CHANNEL_LABELS, ...metaLabels, ...result.channelLabels };

  // Channel order: explicit order → meta order → keys → hardcoded fallback
  const rawOrder =
    result.channelOrder ??
    result.channelMeta?.map((m) => m.id) ??
    Object.keys({ ...result.channels, ...result.channelAccounts });
  const order = rawOrder.length > 0 ? rawOrder : FALLBACK_CHANNEL_ORDER;

  const channelSummaries = result.channels ?? {};
  const accountsByChannel = result.channelAccounts ?? {};

  // Deduplicate order (in case both channels and accounts have overlapping keys)
  const seen = new Set<string>();
  const uniqueOrder = order.filter((id) => {
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });

  return uniqueOrder.map((id) => {
    const summary = (channelSummaries[id] ?? {}) as Record<string, unknown>;
    const accounts = Array.isArray(accountsByChannel[id]) ? accountsByChannel[id] : [];
    const hasConfigured = accounts.some((a) => a.configured);

    return {
      id,
      label: labels[id] ?? id,
      configured: hasConfigured || Boolean(summary.configured),
      accounts,
      summary,
    };
  });
}

/** Derive display status for a single account */
function deriveAccountStatus(acc: ChannelAccount): ChannelStatusInfo {
  if (acc.connected || acc.running) {
    return { color: "text-chart-2", bg: "bg-chart-2/10", label: "Connected" };
  }
  if (acc.lastError) {
    return { color: "text-destructive", bg: "bg-destructive/10", label: "Error" };
  }
  if (acc.configured && acc.enabled !== false) {
    return { color: "text-chart-5", bg: "bg-chart-5/10", label: "Configured" };
  }
  if (acc.enabled === false) {
    return { color: "text-muted-foreground", bg: "bg-muted/10", label: "Disabled" };
  }
  return { color: "text-muted-foreground", bg: "bg-muted/10", label: "Inactive" };
}

/** Flatten ChannelInfo[] into table rows (one row per channel+account) */
function toTableRows(channels: ChannelInfo[]): ChannelTableRow[] {
  const rows: ChannelTableRow[] = [];
  for (const ch of channels) {
    if (ch.accounts.length === 0) {
      // Channel with no accounts — show as a single unconfigured row
      rows.push({
        channelId: ch.id,
        channelLabel: ch.label,
        accountId: "default",
        accountName: "Default",
        enabled: false,
        configured: ch.configured,
        status: { color: "text-muted-foreground", bg: "bg-muted/10", label: "Not configured" },
        connected: false,
        running: false,
        linked: false,
        mode: null,
        lastError: null,
        lastConnectedAt: null,
        lastInboundAt: null,
        lastOutboundAt: null,
        raw: { accountId: "default" },
      });
      continue;
    }
    for (const acc of ch.accounts) {
      rows.push({
        channelId: ch.id,
        channelLabel: ch.label,
        accountId: acc.accountId,
        accountName:
          acc.name ??
          (acc.bot as { username?: string } | undefined)?.username ??
          (acc.accountId !== "default" ? acc.accountId : "Default"),
        enabled: acc.enabled !== false,
        configured: acc.configured ?? false,
        status: deriveAccountStatus(acc),
        connected: acc.connected ?? false,
        running: acc.running ?? false,
        linked: acc.linked ?? false,
        mode: acc.mode ?? null,
        lastError: acc.lastError ?? null,
        lastConnectedAt: acc.lastConnectedAt ?? null,
        lastInboundAt: acc.lastInboundAt ?? null,
        lastOutboundAt: acc.lastOutboundAt ?? null,
        raw: acc,
      });
    }
  }
  return rows;
}

export function ChannelsPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState<string | null>(null);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [probingKey, setProbingKey] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<ChannelTableRow | null>(null);
  const [pendingDeleteRow, setPendingDeleteRow] = useState<ChannelTableRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [rawSnapshot, setRawSnapshot] = useState<ChannelsStatusResponse | null>(null);
  const [snapshotFetchedAt, setSnapshotFetchedAt] = useState<number | null>(null);

  const loadChannels = useCallback(
    async (probe = false) => {
      if (probe) {
        setProbing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await sendRpc<ChannelsStatusResponse>("channels.status", {
          probe,
          timeoutMs: probe ? 15_000 : undefined,
        });
        if (result) {
          setRawSnapshot(result);
          setSnapshotFetchedAt(Date.now());
          setChannels(transformResponse(result));
        }
      } catch (err) {
        setError((err as Error).message ?? "Failed to load channels");
      } finally {
        setLoading(false);
        setProbing(false);
      }
    },
    [sendRpc],
  );

  useEffect(() => {
    if (isConnected) {
      void loadChannels();
    }
  }, [isConnected, loadChannels]);

  const handleLogout = useCallback(
    async (channel: string, accountId?: string) => {
      const key = `${channel}:${accountId ?? ""}`;
      setLogoutLoading(key);
      try {
        await sendRpc("channels.logout", { channel, accountId });
        await loadChannels();
      } finally {
        setLogoutLoading(null);
      }
    },
    [sendRpc, loadChannels],
  );

  const handleToggleEnabled = useCallback(
    async (channelId: string, newEnabled: boolean) => {
      const key = channelId;
      setTogglingKey(key);
      try {
        // Get current config hash for optimistic locking
        const snapshot = await sendRpc<{ hash?: string }>("config.get", {});
        const baseHash = snapshot?.hash;
        if (!baseHash) {
          setError("Cannot toggle: config hash unavailable");
          return;
        }
        // Patch the channel's enabled field
        const patch = { channels: { [channelId]: { enabled: newEnabled } } };
        await sendRpc("config.patch", { raw: JSON.stringify(patch), baseHash });
        // Refetch status after config change (gateway may restart)
        setTimeout(() => {
          void loadChannels();
        }, 1500);
      } catch (err) {
        setError(`Toggle failed: ${(err as Error).message}`);
      } finally {
        setTogglingKey(null);
      }
    },
    [sendRpc, loadChannels],
  );

  const handleProbe = useCallback(
    async (channelId: string) => {
      setProbingKey(channelId);
      try {
        const result = await sendRpc<ChannelsStatusResponse>("channels.status", {
          probe: true,
          timeoutMs: 15_000,
        });
        if (result) {
          setChannels(transformResponse(result));
        }
      } catch (err) {
        setError(`Probe failed: ${(err as Error).message}`);
      } finally {
        setProbingKey(null);
      }
    },
    [sendRpc],
  );

  const handleDeleteChannel = useCallback(
    async (row: ChannelTableRow) => {
      setDeleteLoading(true);
      try {
        // Logout first if the channel is configured (clears credentials)
        if (row.configured) {
          try {
            await sendRpc("channels.logout", { channel: row.channelId, accountId: row.accountId });
          } catch {
            // Non-fatal — proceed to config delete regardless
          }
        }
        // Null out the channel entry in config to delete it
        const snapshot = await sendRpc<{ hash?: string }>("config.get", {});
        const baseHash = snapshot?.hash;
        if (!baseHash) {
          setError("Cannot delete: config hash unavailable");
          return;
        }
        const patch = { channels: { [row.channelId]: null } };
        await sendRpc("config.patch", { raw: JSON.stringify(patch), baseHash });
        setPendingDeleteRow(null);
        setTimeout(() => {
          void loadChannels();
        }, 1500);
      } catch (err) {
        setError(`Delete failed: ${(err as Error).message}`);
      } finally {
        setDeleteLoading(false);
      }
    },
    [sendRpc, loadChannels],
  );

  // Flatten into table rows — hide channels that have no real config (extension installed but unconfigured)
  const rows = useMemo(
    () => toTableRows(channels).filter((r) => r.configured || r.connected || r.running),
    [channels],
  );
  const configuredCount = rows.filter((r) => r.configured).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Channels</h1>
          <span className="text-xs font-mono text-muted-foreground">
            {configuredCount} configured
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" disabled={!rawSnapshot}>
                <Activity className="h-3.5 w-3.5" />
                Health
              </Button>
            </SheetTrigger>
            <SheetContent className="flex flex-col">
              <SheetHeader>
                <SheetTitle className="font-mono">Channel Health</SheetTitle>
                <SheetDescription className="flex items-center justify-between">
                  <span>Channel status snapshots from the gateway</span>
                  <span className="text-xs font-mono tabular-nums">
                    {snapshotFetchedAt ? timeAgo(snapshotFetchedAt) : "n/a"}
                  </span>
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4 overflow-auto flex-1">
                {rawSnapshot ? (
                  <JsonViewer data={rawSnapshot} maxDepth={4} />
                ) : (
                  <p className="text-xs text-muted-foreground">No snapshot data</p>
                )}
              </div>
            </SheetContent>
          </Sheet>
          <Button variant="outline" size="sm" onClick={() => loadChannels()} disabled={loading}>
            <RotateCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => loadChannels(true)} disabled={probing}>
            {probing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            {probing ? "Probing..." : "Probe All"}
          </Button>
        </div>
      </div>

      {/* Not connected */}
      {!isConnected ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <Link2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view channels</p>
        </div>
      ) : (
        <>
          {/* Error state */}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-destructive">{error}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => loadChannels()}>
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {/* Loading state */}
          {loading && rows.length === 0 && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 mx-auto mb-3 animate-spin opacity-50" />
              <p className="text-sm">Loading channels...</p>
            </div>
          )}

          {/* Channel table */}
          {rows.length > 0 && (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_2fr_auto_auto] gap-2 px-4 py-2 border-b border-border bg-secondary/20 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <span>Channel</span>
                <span>Status</span>
                <span>Details</span>
                <span className="text-center">Enabled</span>
                <span className="w-16 text-right">Actions</span>
              </div>

              {/* Table rows */}
              {rows.map((row, i) => {
                const logoutKey = `${row.channelId}:${row.accountId}`;
                return (
                  <div
                    key={`${row.channelId}-${row.accountId}`}
                    className={cn(
                      "grid grid-cols-[2fr_1fr_2fr_auto_auto] gap-2 items-center px-4 py-2.5 border-b border-border/20 last:border-0",
                      i % 2 === 1 && "bg-secondary/5",
                      !row.configured && "opacity-50",
                    )}
                  >
                    {/* Channel + account */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">
                        {channelIcons[row.channelId] ?? "📡"}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-mono font-semibold truncate">
                          {row.channelLabel}
                        </div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">
                          {row.accountName}
                        </div>
                      </div>
                    </div>

                    {/* Status badge */}
                    <div>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold",
                          row.status.bg,
                          row.status.color,
                        )}
                      >
                        {row.status.label}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="min-w-0 text-xs font-mono text-muted-foreground">
                      {row.lastError ? (
                        <span className="text-destructive truncate block">{row.lastError}</span>
                      ) : (
                        <span className="truncate block">
                          {[
                            row.mode && `mode: ${row.mode}`,
                            row.lastInboundAt && `last msg: ${timeAgo(row.lastInboundAt)}`,
                            row.lastConnectedAt && `connected: ${timeAgo(row.lastConnectedAt)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ") || (row.configured ? "—" : "Not configured")}
                        </span>
                      )}
                    </div>

                    {/* Enabled toggle */}
                    <div className="flex justify-center">
                      {row.configured && (
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(val) => handleToggleEnabled(row.channelId, val)}
                          disabled={togglingKey === row.channelId}
                        />
                      )}
                    </div>

                    {/* Actions dropdown */}
                    <div className="w-16 flex items-center justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingRow(row)}>
                            <Settings2 className="h-3.5 w-3.5 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleProbe(row.channelId)}
                            disabled={probingKey === row.channelId}
                          >
                            <RotateCcw
                              className={cn(
                                "h-3.5 w-3.5 mr-2",
                                probingKey === row.channelId && "animate-spin",
                              )}
                            />
                            Probe
                          </DropdownMenuItem>
                          {row.configured && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleLogout(row.channelId, row.accountId)}
                                disabled={logoutLoading === logoutKey}
                                className="text-destructive focus:text-destructive"
                              >
                                <LogOut className="h-3.5 w-3.5 mr-2" />
                                Logout
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setPendingDeleteRow(row)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {rows.length === 0 && !loading && !error && (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
              <Link2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No channel data available</p>
            </div>
          )}
        </>
      )}

      {/* Edit channel sheet */}
      <ChannelEditSheet
        row={editingRow}
        onClose={() => setEditingRow(null)}
        sendRpc={sendRpc}
        onSaved={loadChannels}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={pendingDeleteRow !== null}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) {
            setPendingDeleteRow(null);
          }
        }}
      >
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-mono flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Delete channel?
            </DialogTitle>
            <DialogDescription>
              This will remove{" "}
              <span className="font-semibold text-foreground">
                {pendingDeleteRow?.channelLabel}
              </span>{" "}
              from your config.
              {pendingDeleteRow?.configured && " The account will be logged out first."} This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPendingDeleteRow(null)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => pendingDeleteRow && void handleDeleteChannel(pendingDeleteRow)}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {deleteLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Channel Edit Sheet ─── */

type ChannelEditSheetProps = {
  row: ChannelTableRow | null;
  onClose: () => void;
  sendRpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
  onSaved: () => void;
};

function ChannelEditSheet({ row, onClose, sendRpc, onSaved }: ChannelEditSheetProps) {
  const [configJson, setConfigJson] = useState("");
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch channel config when row changes
  useEffect(() => {
    if (!row) {
      return;
    }
    setConfigLoading(true);
    setSaveError(null);
    sendRpc<{ config?: Record<string, unknown>; hash?: string }>("config.get", {})
      .then((snapshot) => {
        const hash = snapshot?.hash ?? null;
        setBaseHash(hash);
        const channelConfig = (snapshot?.config as Record<string, unknown>)?.channels as
          | Record<string, unknown>
          | undefined;
        const section = channelConfig?.[row.channelId];
        setConfigJson(section ? JSON.stringify(section, null, 2) : "{}");
      })
      .catch(() => {
        setConfigJson("{}");
        setBaseHash(null);
      })
      .finally(() => setConfigLoading(false));
  }, [row, sendRpc]);

  const handleSave = useCallback(async () => {
    if (!row || !baseHash) {
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const parsed = JSON.parse(configJson);
      const patch = { channels: { [row.channelId]: parsed } };
      await sendRpc("config.patch", { raw: JSON.stringify(patch), baseHash });
      // Refetch after save (gateway may restart)
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1500);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [row, baseHash, configJson, sendRpc, onSaved, onClose]);

  return (
    <Sheet
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="font-mono flex items-center gap-2">
            {row && (
              <>
                <span>{channelIcons[row.channelId] ?? "📡"}</span>
                {row.channelLabel}
              </>
            )}
          </SheetTitle>
          <SheetDescription>
            {row ? `Account: ${row.accountName}` : "Channel configuration"}
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4 overflow-auto flex-1 space-y-4">
          {row && (
            <>
              {/* Status summary */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-mono font-semibold",
                      row.status.bg,
                      row.status.color,
                    )}
                  >
                    {row.status.label}
                  </span>
                  {row.mode && (
                    <span className="text-xs font-mono text-muted-foreground">
                      mode: {row.mode}
                    </span>
                  )}
                </div>
                {row.lastError && (
                  <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive">
                    {row.lastError}
                  </div>
                )}
              </div>

              {/* Config editor */}
              <div>
                <h3 className="text-xs font-mono text-muted-foreground mb-1">
                  Channel Config (JSON)
                </h3>
                {configLoading ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading config...
                  </div>
                ) : (
                  <textarea
                    value={configJson}
                    onChange={(e) => setConfigJson(e.target.value)}
                    className="w-full h-48 rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-y"
                    spellCheck={false}
                  />
                )}
              </div>

              {saveError && (
                <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive">
                  {saveError}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || !baseHash}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
              </div>

              {/* Raw account snapshot */}
              <div>
                <h3 className="text-xs font-mono text-muted-foreground mb-1">Account Snapshot</h3>
                <JsonViewer data={row.raw} maxDepth={4} />
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
