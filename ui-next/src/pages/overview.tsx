import { BarChart3, Radio, MessageSquare, Link2, Zap, Clock, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
};

function StatCard({ icon, label, value, subtitle }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 p-5 rounded-lg",
        "bg-card border border-border",
        "hover:border-primary/20 transition-colors duration-200",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="text-primary/60">{icon}</div>
      </div>
      <div>
        <span className="text-2xl font-mono font-bold text-primary text-glow">{value}</span>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export function OverviewPage() {
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const hello = useGatewayStore((s) => s.hello);
  const presenceEntries = useGatewayStore((s) => s.presenceEntries);
  const lastError = useGatewayStore((s) => s.lastError);

  const isConnected = connectionStatus === "connected";
  const features = hello?.features;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-card border border-border">
        {isConnected ? (
          <Wifi className="w-5 h-5 text-primary" />
        ) : (
          <WifiOff className="w-5 h-5 text-muted-foreground" />
        )}
        <div className="flex-1">
          <span
            className={cn(
              "font-mono text-sm",
              isConnected ? "text-primary" : "text-muted-foreground",
            )}
          >
            {isConnected ? "Gateway Online" : "Gateway Offline"}
          </span>
          {hello?.protocol && (
            <span className="text-xs text-muted-foreground ml-3">protocol v{hello.protocol}</span>
          )}
          {lastError && !isConnected && (
            <p className="text-xs text-destructive mt-1">{lastError}</p>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<Radio className="w-4 h-4" />}
          label="Connected Clients"
          value={isConnected ? String(presenceEntries.length) : "--"}
          subtitle={isConnected ? "Active connections" : "Waiting for connection"}
        />
        <StatCard
          icon={<MessageSquare className="w-4 h-4" />}
          label="Methods"
          value={isConnected ? String(features?.methods?.length ?? 0) : "--"}
          subtitle={isConnected ? "Available RPC methods" : "Waiting for connection"}
        />
        <StatCard
          icon={<Link2 className="w-4 h-4" />}
          label="Events"
          value={isConnected ? String(features?.events?.length ?? 0) : "--"}
          subtitle={isConnected ? "Subscribed event types" : "Waiting for connection"}
        />
        <StatCard
          icon={<Zap className="w-4 h-4" />}
          label="Protocol"
          value={hello?.protocol ? `v${hello.protocol}` : "--"}
          subtitle={isConnected ? "Gateway protocol version" : "Waiting for connection"}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Tick Interval"
          value={
            hello?.policy?.tickIntervalMs
              ? `${(hello.policy.tickIntervalMs / 1000).toFixed(0)}s`
              : "--"
          }
          subtitle={isConnected ? "Heartbeat interval" : "Waiting for connection"}
        />
        <StatCard
          icon={<BarChart3 className="w-4 h-4" />}
          label="Event Log"
          value={isConnected ? String(useGatewayStore.getState().eventLog.length) : "--"}
          subtitle={isConnected ? "Events received this session" : "Waiting for connection"}
        />
      </div>

      {/* Presence entries */}
      {isConnected && presenceEntries.length > 0 && (
        <div className="rounded-lg bg-card border border-border p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-4">
            Connected Clients
          </h2>
          <div className="space-y-2">
            {presenceEntries.map((entry, i) => (
              <div
                key={entry.instanceId ?? i}
                className="flex items-center gap-3 px-3 py-2 rounded-md bg-secondary/50"
              >
                <div className="w-2 h-2 rounded-full bg-primary animate-glow-pulse" />
                <span className="text-sm font-mono text-foreground">
                  {entry.clientId ?? "unknown"}
                </span>
                {entry.mode && (
                  <span className="text-xs text-muted-foreground">({entry.mode})</span>
                )}
                {entry.platform && (
                  <span className="text-xs text-muted-foreground ml-auto">{entry.platform}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disconnected state */}
      {!isConnected && (
        <div className="rounded-lg bg-card border border-border p-5">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground mb-4">
            Connection
          </h2>
          <p className="text-sm text-muted-foreground">
            {connectionStatus === "connecting"
              ? "Connecting to gateway..."
              : "Not connected to gateway. The UI will automatically reconnect."}
          </p>
        </div>
      )}
    </div>
  );
}
