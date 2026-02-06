import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useGatewayStore } from "@/store/gateway-store";

export function NavStatus() {
  const connectionStatus = useGatewayStore((s) => s.connectionStatus);
  const lastError = useGatewayStore((s) => s.lastError);
  const hello = useGatewayStore((s) => s.hello);

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";
  const protocol = hello?.protocol ? `v${hello.protocol}` : undefined;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip="Connection status">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-accent">
            {isConnecting ? (
              <Loader2 className="size-4 text-muted-foreground animate-spin" />
            ) : isConnected ? (
              <Wifi className="size-4 text-sidebar-primary" />
            ) : (
              <WifiOff className="size-4 text-muted-foreground" />
            )}
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium font-mono text-xs">
              {isConnecting ? "Connecting..." : isConnected ? "Connected" : "Disconnected"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {isConnected
                ? `Gateway online${protocol ? ` (${protocol})` : ""}`
                : lastError
                  ? lastError.slice(0, 40)
                  : "Not connected"}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
