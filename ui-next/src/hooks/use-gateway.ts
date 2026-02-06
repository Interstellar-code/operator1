import { useEffect, useRef, useCallback } from "react";
import { GatewayBrowserClient, type GatewayEventFrame } from "@/lib/gateway-client";
import { loadSettings, saveSettings } from "@/lib/storage";
import { useGatewayStore } from "@/store/gateway-store";

/** Extract ?token= (and ?session=, ?gatewayUrl=) from the URL, save to settings, strip from address bar. */
function applyUrlParams() {
  if (!window.location.search) return;
  const params = new URLSearchParams(window.location.search);
  const settings = loadSettings();
  let changed = false;

  const tokenRaw = params.get("token");
  if (tokenRaw != null) {
    const token = tokenRaw.trim();
    if (token && token !== settings.token) {
      settings.token = token;
      changed = true;
    }
    params.delete("token");
  }

  const sessionRaw = params.get("session");
  if (sessionRaw != null) {
    const sessionKey = sessionRaw.trim();
    if (sessionKey) {
      settings.sessionKey = sessionKey;
      settings.lastActiveSessionKey = sessionKey;
      changed = true;
    }
    params.delete("session");
  }

  const gatewayUrlRaw = params.get("gatewayUrl");
  if (gatewayUrlRaw != null) {
    const gatewayUrl = gatewayUrlRaw.trim();
    if (gatewayUrl) {
      settings.gatewayUrl = gatewayUrl;
      changed = true;
    }
    params.delete("gatewayUrl");
  }

  if (changed) saveSettings(settings);

  // Strip consumed params from URL without reload
  const remaining = params.toString();
  const cleanUrl = `${window.location.pathname}${remaining ? `?${remaining}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", cleanUrl);
}

export function useGateway() {
  const clientRef = useRef<GatewayBrowserClient | null>(null);
  const store = useGatewayStore();

  useEffect(() => {
    applyUrlParams();
    const settings = loadSettings();
    store.setConnectionStatus("connecting");

    const client = new GatewayBrowserClient({
      url: settings.gatewayUrl,
      token: settings.token.trim() ? settings.token : undefined,
      clientName: "openclaw-control-ui",
      mode: "webchat",
      onHello: (hello) => {
        store.applySnapshot(hello);
      },
      onClose: ({ code, reason }) => {
        // 1012 = Service Restart (expected during config saves)
        if (code !== 1012) {
          store.setLastError(`disconnected (${code}): ${reason || "no reason"}`);
        }
        store.setConnectionStatus("disconnected");
      },
      onEvent: (evt: GatewayEventFrame) => {
        store.pushEvent(evt.event, evt.payload);
        handleEvent(evt);
      },
      onGap: ({ expected, received }) => {
        store.setLastError(
          `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`,
        );
      },
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
      store.reset();
    };
    // Run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendRpc = useCallback(<T = unknown>(method: string, params?: unknown): Promise<T> => {
    const client = clientRef.current;
    if (!client) return Promise.reject(new Error("gateway not connected"));
    return client.request<T>(method, params);
  }, []);

  return { sendRpc };
}

function handleEvent(evt: GatewayEventFrame) {
  const store = useGatewayStore.getState();

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: unknown[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      store.setPresenceEntries(payload.presence as typeof store.presenceEntries);
    }
  }
}
