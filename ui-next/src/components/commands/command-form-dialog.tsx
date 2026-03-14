import { Slash, Loader2, AlertTriangle } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import type {
  CommandEntry,
  CommandCreateInput,
  CommandUpdateInput,
  CommandGetBodyResult,
} from "@/types/commands";

export type FormMode = "create" | "edit" | "view";

export type CommandFormValues = {
  name: string;
  description: string;
  body: string;
  emoji: string;
  category: string;
};

export const EMPTY_FORM: CommandFormValues = {
  name: "",
  description: "",
  body: "",
  emoji: "",
  category: "general",
};

export function CommandFormDialog({
  mode,
  initial,
  existingNames,
  onSave,
  onClose,
}: {
  mode: FormMode;
  initial?: CommandEntry;
  existingNames: Set<string>;
  onSave: (values: CommandCreateInput | CommandUpdateInput) => Promise<void>;
  onClose: () => void;
}) {
  const isView = mode === "view";
  const { sendRpc } = useGateway();

  const [values, setValues] = useState<CommandFormValues>(
    initial
      ? {
          name: initial.name,
          description: initial.description,
          body: "",
          emoji: initial.emoji ?? "",
          category: initial.category ?? "general",
        }
      : EMPTY_FORM,
  );
  const [bodyLoading, setBodyLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameConflict, setNameConflict] = useState(false);

  // Fetch body content when viewing or editing an existing command
  useEffect(() => {
    if (!initial?.name || mode === "create") {
      return;
    }
    setBodyLoading(true);
    sendRpc<CommandGetBodyResult>("commands.getBody", { name: initial.name })
      .then((res) => {
        if (res?.body) {
          setValues((prev) => ({ ...prev, body: res.body }));
        }
      })
      .catch(() => {
        /* body unavailable — leave empty */
      })
      .finally(() => setBodyLoading(false));
  }, [initial?.name, mode, sendRpc]);

  const handleNameChange = useCallback(
    (v: string) => {
      // Auto-lowercase so the name always satisfies the slug constraint
      const lower = v.toLowerCase();
      setValues((prev) => ({ ...prev, name: lower }));
      setNameConflict(
        mode === "create" &&
          existingNames.has(lower) &&
          lower !== (initial?.name ?? "").toLowerCase(),
      );
    },
    [mode, existingNames, initial],
  );

  const isNameValid = /^[a-z][a-z0-9-]*$/.test(values.name) && values.name.length <= 64;
  const canSave =
    !isView &&
    values.description.trim() &&
    (mode === "edit" || (isNameValid && !nameConflict)) &&
    !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) {
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        await onSave({
          name: values.name,
          description: values.description,
          body: values.body || values.description,
          emoji: values.emoji || undefined,
          category: values.category || "general",
        } as CommandCreateInput);
      } else {
        await onSave({
          name: values.name,
          description: values.description || undefined,
          body: values.body || undefined,
          emoji: values.emoji || undefined,
          category: values.category || undefined,
        } as CommandUpdateInput);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const titleLabel =
    mode === "create" ? "New Command" : isView ? `/${values.name}` : `Edit /${values.name}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Slash className="h-4 w-4 text-primary" />
            {titleLabel}
            {isView && (
              <span className="ml-1 text-xs font-normal text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                {initial?.source === "builtin" ? "built-in · read-only" : "skill · read-only"}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cmd-name" className="text-sm font-medium">
              Name
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                /
              </span>
              <Input
                id="cmd-name"
                value={values.name}
                onChange={(e) => handleNameChange(e.target.value)}
                readOnly={isView || mode === "edit"}
                disabled={isView || mode === "edit"}
                className={cn(
                  "pl-6 font-mono",
                  nameConflict && "border-destructive focus-visible:ring-destructive",
                  (isView || mode === "edit") && "opacity-60",
                )}
                placeholder="my-command"
                autoFocus={mode === "create"}
              />
            </div>
            {nameConflict && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />A command with this name already exists
              </p>
            )}
            {mode === "create" && values.name && !isNameValid && !nameConflict && (
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers and hyphens only (max 64 chars)
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cmd-desc" className="text-sm font-medium">
              Description
            </label>
            <Input
              id="cmd-desc"
              value={values.description}
              onChange={(e) => setValues((p) => ({ ...p, description: e.target.value }))}
              readOnly={isView}
              disabled={isView}
              placeholder="What does this command do?"
              className={isView ? "opacity-60" : ""}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="cmd-body" className="text-sm font-medium flex items-center gap-2">
              Body
              <span className="text-xs text-muted-foreground font-normal">
                (instruction / prompt template)
              </span>
              {bodyLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            </label>
            <Textarea
              id="cmd-body"
              value={values.body}
              onChange={(e) => setValues((p) => ({ ...p, body: e.target.value }))}
              readOnly={isView}
              disabled={isView || bodyLoading}
              placeholder={
                bodyLoading
                  ? "Loading…"
                  : isView
                    ? "Body not available for this command"
                    : `Use {{arg}} for substitutions.\nIf blank, description is used as the body.`
              }
              className={cn("font-mono text-sm min-h-[120px] resize-y", isView && "opacity-60")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="cmd-emoji" className="text-sm font-medium">
                Emoji
              </label>
              <Input
                id="cmd-emoji"
                value={values.emoji}
                onChange={(e) => setValues((p) => ({ ...p, emoji: e.target.value }))}
                readOnly={isView}
                disabled={isView}
                placeholder="✨"
                className={isView ? "opacity-60" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="cmd-category" className="text-sm font-medium">
                Category
              </label>
              <Input
                id="cmd-category"
                value={values.category}
                onChange={(e) => setValues((p) => ({ ...p, category: e.target.value }))}
                readOnly={isView}
                disabled={isView}
                placeholder="general"
                className={isView ? "opacity-60" : ""}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant={isView ? "default" : "ghost"}
              onClick={onClose}
              disabled={saving}
            >
              {isView ? "Close" : "Cancel"}
            </Button>
            {!isView && (
              <Button type="submit" disabled={!canSave}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {mode === "create" ? "Create" : "Save changes"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
