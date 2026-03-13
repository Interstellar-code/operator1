export type CommandArg = {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
};

export type CommandEntry = {
  commandId: string;
  name: string;
  description: string;
  emoji: string | null;
  filePath: string | null;
  type: string;
  source: string;
  userCommand: boolean;
  modelInvocation: boolean;
  enabled: boolean;
  longRunning: boolean;
  args: CommandArg[];
  tags: string[];
  category: string;
  version: number;
};

export type CommandsListResult = {
  commands: CommandEntry[];
};

export type CommandGetResult = {
  command: CommandEntry;
};

export type CommandGetBodyResult = {
  body: string;
  hasFile: boolean;
  raw?: string;
};

export type CommandCreateInput = {
  name: string;
  description: string;
  body: string;
  emoji?: string;
  category?: string;
  long_running?: boolean;
  args?: CommandArg[];
};

export type CommandUpdateInput = {
  name: string;
  description?: string;
  body?: string;
  emoji?: string;
  category?: string;
  long_running?: boolean;
  args?: CommandArg[];
};

export type CommandInvokeResult = {
  expandedInstruction: string;
  invocationId: string;
  commandName: string;
};
