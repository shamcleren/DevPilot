export type HookCommandContext = {
  packaged: boolean;
  execPath: string;
  appPath: string;
};

function quoteArg(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildCodePalHookArgs(subcommand: string, eventSuffix?: string): string {
  const parts = ["--codepal-hook", subcommand];
  if (eventSuffix !== undefined) {
    parts.push(eventSuffix);
  }
  return parts.join(" ");
}

export function buildCursorLifecycleHookCommand(
  eventName: string,
  context: HookCommandContext,
): string {
  const hookArgs = buildCodePalHookArgs("cursor-lifecycle", eventName);
  if (context.packaged) {
    return `${quoteArg(context.execPath)} ${hookArgs}`;
  }
  return `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`;
}

export function buildCodeBuddyHookCommand(context: HookCommandContext): string {
  const hookArgs = buildCodePalHookArgs("codebuddy");
  if (context.packaged) {
    return `${quoteArg(context.execPath)} ${hookArgs}`;
  }
  return `${quoteArg(context.execPath)} ${quoteArg(context.appPath)} ${hookArgs}`;
}

export function detectLegacyHookCommand(command: string): boolean {
  if (/scripts\/hooks\/[^"'\s]+\.sh/.test(command)) {
    return true;
  }
  if (/\bnode\b/.test(command) && /scripts\/bridge\//.test(command) && /\.mjs\b/.test(command)) {
    return true;
  }
  return false;
}
