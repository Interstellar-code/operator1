import { useCallback, useEffect, useState } from "react";
import type {
  CommandCreateInput,
  CommandEntry,
  CommandGetBodyResult,
  CommandGetResult,
  CommandInvokeResult,
  CommandsListResult,
  CommandUpdateInput,
} from "../types/commands";
import { useGateway } from "./use-gateway";

export type CommandsState = {
  commands: CommandEntry[];
  loading: boolean;
  error: string | null;
};

export function useCommands(scope: "user" | "agent" | "all" = "user") {
  const { sendRpc } = useGateway();
  const [state, setState] = useState<CommandsState>({
    commands: [],
    loading: true,
    error: null,
  });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await sendRpc<CommandsListResult>("commands.list", { scope });
      setState({ commands: result.commands, loading: false, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [sendRpc, scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const getCommand = useCallback(
    (name: string) => sendRpc<CommandGetResult>("commands.get", { name }),
    [sendRpc],
  );

  const getCommandBody = useCallback(
    (name: string) => sendRpc<CommandGetBodyResult>("commands.getBody", { name }),
    [sendRpc],
  );

  const createCommand = useCallback(
    async (input: CommandCreateInput) => {
      const result = await sendRpc<{ commandId: string; name: string }>("commands.create", input);
      await refresh();
      return result;
    },
    [sendRpc, refresh],
  );

  const updateCommand = useCallback(
    async (input: CommandUpdateInput) => {
      const result = await sendRpc<{ name: string }>("commands.update", input);
      await refresh();
      return result;
    },
    [sendRpc, refresh],
  );

  const deleteCommand = useCallback(
    async (name: string) => {
      const result = await sendRpc<{ name: string }>("commands.delete", { name });
      await refresh();
      return result;
    },
    [sendRpc, refresh],
  );

  const invokeCommand = useCallback(
    (name: string, argsStr?: string, sessionKey?: string) =>
      sendRpc<CommandInvokeResult>("commands.invoke", {
        name,
        args_str: argsStr,
        session_key: sessionKey,
      }),
    [sendRpc],
  );

  return {
    ...state,
    refresh,
    getCommand,
    getCommandBody,
    createCommand,
    updateCommand,
    deleteCommand,
    invokeCommand,
  };
}
