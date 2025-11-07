#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as pty from "node-pty";
import * as os from "os";

interface TerminalSession {
  id: string;
  ptyProcess: pty.IPty;
  outputBuffer: string;
  isReady: boolean;
  promptPattern: RegExp;
  lastCommand: string;
  createdAt: Date;
}

const sessions = new Map<string, TerminalSession>();

const server = new Server(
  {
    name: "mcp-shellkeeper",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper: Sleep function
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper: Clean ANSI codes and control characters
function cleanOutput(output: string): string {
  return output
    // Remove all ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "") // CSI sequences
    .replace(/\x1b\][0-9;]*\x07/g, "") // OSC sequences
    .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, "") // OSC with parameters
    .replace(/\x1b[><=]/g, "") // Other escape sequences
    .replace(/\[\?[0-9]+[hl]/g, "") // Bracketed paste mode, etc
    // Remove control characters
    .replace(/\r\n/g, "\n") // Windows line endings
    .replace(/\r/g, "\n") // Carriage returns
    // Remove prompts and artifacts
    .replace(/\[READY\]\$ /g, "") // Custom prompt
    .replace(/^%\s*$/gm, "") // zsh % prompt indicator
    .replace(/^❯\s*$/gm, "") // zsh arrow prompt
    .replace(/^~\s*$/gm, "") // home directory indicator
    .replace(/^\$\s*$/gm, "") // bash $ prompt
    .replace(/^>\s*$/gm, "") // generic > prompt
    .replace(/^#\s*$/gm, "") // root # prompt
    // Remove prompt prefixes from lines
    .replace(/^[❯$>#]\s+/gm, "") // Remove prompt symbols at line start
    // Remove duplicate newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Helper: Create new terminal session
function createSession(sessionId: string, shell?: string): TerminalSession {
  const shellPath = shell || (os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "/bin/bash");

  const ptyProcess = pty.spawn(shellPath, [], {
    name: "xterm-256color",
    cols: 160,
    rows: 40,
    cwd: process.env.HOME || process.cwd(),
    env: {
      ...process.env,
      TERM: "xterm-256color",
      // Simplified prompt for easier detection
      PS1: "[READY]\\$ ",
      // Disable SSH interactive prompts
      SSH_ASKPASS: "",
      GIT_TERMINAL_PROMPT: "0",
    },
  });

  const session: TerminalSession = {
    id: sessionId,
    ptyProcess,
    outputBuffer: "",
    isReady: true,
    promptPattern: /\[READY\]\$ $/,
    lastCommand: "",
    createdAt: new Date(),
  };

  // Capture all output
  ptyProcess.onData((data) => {
    session.outputBuffer += data;
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.error(`[ShellKeeper] Session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

// Helper: Execute command and wait for completion
async function executeCommand(
  session: TerminalSession,
  command: string,
  timeout: number = 30000
): Promise<string> {
  session.lastCommand = command;
  session.isReady = false;

  // Clear buffer before execution
  session.outputBuffer = "";

  // Wait a bit for buffer to clear
  await sleep(200);

  // Use unique markers with timestamp to ensure uniqueness
  const timestamp = Date.now();
  const startMarker = `===START${timestamp}===`;
  const endMarker = `===END${timestamp}===`;
  const exitMarker = `===EXIT${timestamp}===`;

  // Send command with markers - DON'T use subshell so cd/export/etc work
  session.ptyProcess.write(`echo '${startMarker}'\n`);
  await sleep(100);
  session.ptyProcess.write(`${command}\n`);
  await sleep(100);
  // Capture exit code
  session.ptyProcess.write(`echo '${exitMarker}'$?\n`);
  await sleep(100);
  session.ptyProcess.write(`echo '${endMarker}'\n`);

  // Wait for output with timeout
  const startTime = Date.now();
  let foundEnd = false;

  while (Date.now() - startTime < timeout) {
    const output = session.outputBuffer;

    // Simple check: do we have the end marker?
    if (output.includes(endMarker)) {
      // Wait a bit more to ensure prompt is back
      await sleep(300);
      foundEnd = true;
      break;
    }

    await sleep(100);
  }

  if (!foundEnd) {
    session.isReady = true;
    throw new Error(`Command timeout after ${timeout}ms. Command might still be running or waiting for input.`);
  }

  session.isReady = true;

  // Extract output between markers
  const output = session.outputBuffer;

  // Find the LAST occurrence of markers (in case command appears multiple times in buffer)
  const startIdx = output.lastIndexOf(startMarker);
  const endIdx = output.lastIndexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return cleanOutput(output);
  }

  // Extract exit code
  let exitCode = 0;
  const exitMarkerPattern = new RegExp(`${exitMarker}(\\d+)`);
  const exitMatch = output.match(exitMarkerPattern);
  if (exitMatch) {
    exitCode = parseInt(exitMatch[1], 10);
  }

  // Get content between markers
  let result = output.substring(startIdx + startMarker.length, endIdx);

  // Clean up the result
  const lines = result.split("\n");
  let skippedCommandEcho = false;

  const filteredLines = lines.filter((line, index) => {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === "") return false;

    // Skip marker lines
    if (trimmed.includes(startMarker)) return false;
    if (trimmed.includes(endMarker)) return false;
    if (trimmed.includes(exitMarker)) return false;
    if (trimmed.startsWith("echo ")) return false;

    // Skip the exact command echo
    if (trimmed === command) return false;

    // Skip first non-empty line after markers (usually command echo with prompt)
    // Pattern: "❯ command" or "$ command" or "> command"
    if (!skippedCommandEcho &&
        (trimmed.match(/^[❯$>#]\s+/) ||
         trimmed.endsWith(command) ||
         trimmed.includes(command.split(' ')[0]))) {
      skippedCommandEcho = true;
      return false;
    }

    return true;
  });

  result = filteredLines.join("\n");
  const cleanedResult = cleanOutput(result);

  // Throw error if command failed
  if (exitCode !== 0) {
    throw new Error(
      `Command exited with code ${exitCode}\n` +
      `Command: ${command}\n` +
      `Output: ${cleanedResult || "(no output)"}`
    );
  }

  return cleanedResult;
}

// Define MCP tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "terminal_execute",
        description:
          "Execute a command in a persistent terminal session. " +
          "This tool maintains shell context across calls, making it perfect for: " +
          "1) Running local commands on the user's machine, " +
          "2) SSH into servers and maintaining that SSH connection, " +
          "3) Running commands within SSH sessions (nested SSH supported). " +
          "The session persists until explicitly closed or the server restarts. " +
          "Use the same session_id to maintain context (default: 'default').",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The command to execute. Examples: 'ls -la', 'ssh user@server', 'top -bn1', 'cd /var/log && tail -50 app.log'",
            },
            session_id: {
              type: "string",
              description: "Session identifier to maintain context across commands (default: 'default')",
              default: "default",
            },
            timeout: {
              type: "number",
              description: "Command timeout in milliseconds (default: 30000, max: 120000)",
              default: 30000,
            },
          },
          required: ["command"],
        },
      },
      {
        name: "terminal_new_session",
        description:
          "Create a new isolated terminal session. " +
          "Useful when you want to maintain multiple separate contexts " +
          "(e.g., one session per server, or separate sessions for different tasks).",
        inputSchema: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "Unique identifier for the new session",
            },
            shell: {
              type: "string",
              description: "Shell to use (optional, defaults to system default: bash/zsh on Unix, powershell on Windows)",
            },
          },
          required: ["session_id"],
        },
      },
      {
        name: "terminal_list_sessions",
        description: "List all active terminal sessions with their status and metadata",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "terminal_close_session",
        description: "Close and cleanup a specific terminal session",
        inputSchema: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "Session ID to close",
            },
          },
          required: ["session_id"],
        },
      },
      {
        name: "terminal_get_buffer",
        description:
          "Get the raw output buffer from a session. " +
          "Useful for debugging or when you need to see the unprocessed terminal output.",
        inputSchema: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "Session ID (default: 'default')",
              default: "default",
            },
            clean: {
              type: "boolean",
              description: "Clean ANSI codes and control characters (default: true)",
              default: true,
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "terminal_execute": {
        const { command, session_id = "default", timeout = 30000 } = args as any;

        // Validate timeout
        const validTimeout = Math.min(Math.max(timeout, 1000), 120000);

        // Create session if doesn't exist
        let session = sessions.get(session_id);
        if (!session) {
          console.error(`[ShellKeeper] Creating new session: ${session_id}`);
          session = createSession(session_id);
          // Wait for session to initialize
          await sleep(500);
        }

        if (!session.isReady) {
          throw new Error(
            `Session ${session_id} is busy executing: ${session.lastCommand}. ` +
            `Please wait or use a different session.`
          );
        }

        console.error(`[ShellKeeper] Executing in session ${session_id}: ${command}`);
        const output = await executeCommand(session, command, validTimeout);

        return {
          content: [
            {
              type: "text",
              text: output || "(Command executed successfully with no output)",
            },
          ],
        };
      }

      case "terminal_new_session": {
        const { session_id, shell } = args as any;

        if (sessions.has(session_id)) {
          throw new Error(
            `Session ${session_id} already exists. ` +
            `Use terminal_close_session first if you want to recreate it.`
          );
        }

        console.error(`[ShellKeeper] Creating new session: ${session_id}`);
        createSession(session_id, shell);
        await sleep(500); // Wait for initialization

        return {
          content: [
            {
              type: "text",
              text: `Created new terminal session: ${session_id}${shell ? ` (shell: ${shell})` : ""}`,
            },
          ],
        };
      }

      case "terminal_list_sessions": {
        const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
          id,
          ready: session.isReady,
          lastCommand: session.lastCommand || "(none)",
          createdAt: session.createdAt.toISOString(),
          uptime: Math.floor((Date.now() - session.createdAt.getTime()) / 1000),
        }));

        if (sessionList.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No active sessions",
              },
            ],
          };
        }

        const formatted = sessionList
          .map(
            (s) =>
              `  • ${s.id}\n` +
              `    Status: ${s.ready ? "✓ ready" : "⏳ busy"}\n` +
              `    Last command: ${s.lastCommand}\n` +
              `    Uptime: ${s.uptime}s`
          )
          .join("\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Active sessions (${sessionList.length}):\n\n${formatted}`,
            },
          ],
        };
      }

      case "terminal_close_session": {
        const { session_id } = args as any;

        const session = sessions.get(session_id);
        if (!session) {
          throw new Error(`Session ${session_id} not found`);
        }

        console.error(`[ShellKeeper] Closing session: ${session_id}`);
        session.ptyProcess.kill();
        sessions.delete(session_id);

        return {
          content: [
            {
              type: "text",
              text: `Closed session: ${session_id}`,
            },
          ],
        };
      }

      case "terminal_get_buffer": {
        const { session_id = "default", clean = true } = args as any;

        const session = sessions.get(session_id);
        if (!session) {
          throw new Error(`Session ${session_id} not found`);
        }

        const buffer = clean ? cleanOutput(session.outputBuffer) : session.outputBuffer;

        return {
          content: [
            {
              type: "text",
              text: buffer || "(Empty buffer)",
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    console.error(`[ShellKeeper] Error:`, error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", () => {
  console.error("[ShellKeeper] Shutting down...");
  sessions.forEach((session) => {
    session.ptyProcess.kill();
  });
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[ShellKeeper] Shutting down...");
  sessions.forEach((session) => {
    session.ptyProcess.kill();
  });
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[ShellKeeper] MCP Server started successfully");
  console.error("[ShellKeeper] Ready to handle terminal sessions");
}

main().catch((error) => {
  console.error("[ShellKeeper] Fatal error:", error);
  process.exit(1);
});


