/**
 * Client-side slash command registry for debug/cheat commands.
 * Commands are parsed from chat input (e.g. /snow start) and executed locally;
 * the result message is shown in chat without sending to the server.
 */

export type CommandHandler = (args: string[]) => string | void;

const commands = new Map<string, CommandHandler>();

/**
 * Register a slash command. Name is stored lowercase; handler receives
 * the arguments after the command name (e.g. /snow start → args ["start"]).
 */
export function registerCommand(name: string, handler: CommandHandler): void {
  commands.set(name.toLowerCase().trim(), handler);
}

/**
 * Parse and run a slash command. Only runs when line starts with "/".
 * Returns { handled: true, message? } for slash input (whether or not the command was known);
 * returns { handled: false } when line is not a command.
 */
export function runCommand(line: string): { handled: boolean; message?: string } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const parts = trimmed.slice(1).trim().split(/\s+/);
  const name = (parts[0] ?? "").toLowerCase();
  const args = parts.slice(1);

  const handler = name ? commands.get(name) : undefined;
  if (!handler) {
    return { handled: true, message: `Unknown command: /${name || "(empty)"}` };
  }

  try {
    const result = handler(args);
    return { handled: true, message: result ?? "OK" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { handled: true, message: `Error: ${msg}` };
  }
}
