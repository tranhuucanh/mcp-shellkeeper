#!/usr/bin/env node

/**
 * Copyright (c) 2025 tranhuucanh39@gmail.com
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as pty from "node-pty";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

interface TerminalSession {
  id: string;
  ptyProcess: pty.IPty;
  outputBuffer: string;
  isReady: boolean;
  promptPattern: RegExp;
  lastCommand: string;
  createdAt: Date;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_TRANSFER_TIMEOUT = 300000;

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanOutput(output: string): string {
  return output
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][0-9;]*\x07/g, "")
    .replace(/\x1b\][0-9;]*;[^\x07]*\x07/g, "")
    .replace(/\x1b[><=]/g, "")
    .replace(/\[\?[0-9]+[hl]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\[READY\]\$ /g, "")
    .replace(/^%\s*$/gm, "")
    .replace(/^❯\s*$/gm, "")
    .replace(/^~\s*$/gm, "")
    .replace(/^\$\s*$/gm, "")
    .replace(/^>\s*$/gm, "")
    .replace(/^#\s*$/gm, "")
    .replace(/^[❯$>#]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

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
      PS1: "[READY]\\$ ",
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

async function executeCommand(
  session: TerminalSession,
  command: string,
  timeout: number = 30000
): Promise<string> {
  session.lastCommand = command;
  session.isReady = false;

  session.outputBuffer = "";

  await sleep(200);

  const timestamp = Date.now();
  const startMarker = `===START${timestamp}===`;
  const endMarker = `===END${timestamp}===`;
  const exitMarker = `===EXIT${timestamp}===`;

  session.ptyProcess.write(`echo '${startMarker}'\n`);
  await sleep(100);
  session.ptyProcess.write(`${command}\n`);
  await sleep(100);
  session.ptyProcess.write(`echo '${exitMarker}'$?\n`);
  await sleep(100);
  session.ptyProcess.write(`echo '${endMarker}'\n`);

  const startTime = Date.now();
  let foundEnd = false;

  while (Date.now() - startTime < timeout) {
    const output = session.outputBuffer;

    if (output.includes(endMarker)) {
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

  const output = session.outputBuffer;

  const startIdx = output.lastIndexOf(startMarker);
  const endIdx = output.lastIndexOf(endMarker);

  if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
    return cleanOutput(output);
  }

  let exitCode = 0;
  const exitMarkerPattern = new RegExp(`${exitMarker}(\\d+)`);
  const exitMatch = output.match(exitMarkerPattern);
  if (exitMatch) {
    exitCode = parseInt(exitMatch[1], 10);
  }

  let result = output.substring(startIdx + startMarker.length, endIdx);

  const lines = result.split("\n");
  const seenLines = new Set<string>();
  let commandEchoSkipped = false;

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();

    if (trimmed === "") return false;

    if (trimmed.includes(startMarker)) return false;
    if (trimmed.includes(endMarker)) return false;
    if (trimmed.includes(exitMarker)) return false;

    if (trimmed.match(/^\([^)]+\)\[[^\]]+@[^\]]+\s+[^\]]+\]\$/)) {
      return false;
    }

    if (!commandEchoSkipped) {
      const cmdFirstWord = command.split(' ')[0];
      if (cmdFirstWord && trimmed.includes(cmdFirstWord)) {
        commandEchoSkipped = true;
        return false;
      }
      if (trimmed.startsWith("echo ")) {
        return false;
      }
    }

    if (seenLines.has(trimmed)) return false;
    seenLines.add(trimmed);

    return true;
  });

  result = filteredLines.join("\n");
  const cleanedResult = cleanOutput(result);

  if (exitCode !== 0) {
    throw new Error(
      `Command exited with code ${exitCode}\n` +
      `Command: ${command}\n` +
      `Output: ${cleanedResult || "(no output)"}`
    );
  }

  return cleanedResult;
}

async function uploadFile(
  session: TerminalSession,
  localPath: string,
  remotePath: string,
  timeout: number = FILE_TRANSFER_TIMEOUT
): Promise<string> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`);
  }

  const stats = fs.statSync(localPath);
  if (stats.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`
    );
  }

  const localFilename = path.basename(localPath);
  let finalRemotePath = remotePath;

  try {
    const testDirCmd = `test -d ${remotePath} && echo "DIR" || echo "FILE"`;
    const result = await executeCommand(session, testDirCmd, 5000);

    if (result.trim() === "DIR") {
      finalRemotePath = remotePath.endsWith('/') ? `${remotePath}${localFilename}` : `${remotePath}/${localFilename}`;
    }
  } catch (e) {
  }

  try {
    const testFileCmd = `test -f ${finalRemotePath} && echo "EXISTS" || echo "OK"`;
    const fileCheck = await executeCommand(session, testFileCmd, 5000);

    if (fileCheck.trim() === "EXISTS") {
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const ext = path.extname(localFilename);
      const nameWithoutExt = path.basename(localFilename, ext);
      const dir = path.dirname(finalRemotePath);
      finalRemotePath = `${dir}/${nameWithoutExt}_${randomSuffix}${ext}`;
    }
  } catch (e) {
  }

  const fileContent = fs.readFileSync(localPath);
  const base64Content = fileContent.toString("base64");

  const chunkSize = 50000;
  const chunks: string[] = [];
  for (let i = 0; i < base64Content.length; i += chunkSize) {
    chunks.push(base64Content.substring(i, i + chunkSize));
  }

  const tempBase64File = `/tmp/mcp_upload_${Date.now()}.b64`;

  try {
    await executeCommand(session, `rm -f ${tempBase64File}`, 10000);
  } catch (e) {
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const cmd = `printf '%s' '${chunk}' >> ${tempBase64File}`;
    await executeCommand(session, cmd, 30000);
  }

  const decodeCmd = `(base64 -D -i ${tempBase64File} -o ${finalRemotePath} 2>/dev/null || base64 -d ${tempBase64File} > ${finalRemotePath}) && rm -f ${tempBase64File}`;
  await executeCommand(session, decodeCmd, timeout);

  const verifyCmd = `ls -lh ${finalRemotePath}`;
  const result = await executeCommand(session, verifyCmd, 10000);

  return `File uploaded successfully: ${localPath} -> ${finalRemotePath}\n${result}`;
}

async function downloadFile(
  session: TerminalSession,
  remotePath: string,
  localPath: string,
  timeout: number = FILE_TRANSFER_TIMEOUT
): Promise<string> {
  const checkCmd = `test -f ${remotePath} && stat -f%z ${remotePath} 2>/dev/null || stat -c%s ${remotePath} 2>/dev/null`;
  let fileSizeStr: string;

  try {
    fileSizeStr = await executeCommand(session, checkCmd, 10000);
  } catch (e) {
    throw new Error(`Remote file not found or cannot access: ${remotePath}`);
  }

  const fileSize = parseInt(fileSizeStr.trim(), 10);
  if (isNaN(fileSize)) {
    throw new Error(`Cannot determine size of remote file: ${remotePath}`);
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(
      `File size (${(fileSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (${MAX_FILE_SIZE / 1024 / 1024}MB)`
    );
  }

  const encodeCmd = `base64 -i ${remotePath} 2>/dev/null || base64 ${remotePath}`;
  const base64Content = await executeCommand(session, encodeCmd, timeout);
  const cleanedBase64 = base64Content.replace(/\s/g, "");
  const buffer = Buffer.from(cleanedBase64, "base64");

  const localDir = path.dirname(localPath);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }

  fs.writeFileSync(localPath, buffer);
  const localStats = fs.statSync(localPath);

  return `File downloaded successfully: ${remotePath} -> ${localPath}\nSize: ${(localStats.size / 1024).toFixed(2)}KB`;
}

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
      {
        name: "terminal_upload_file",
        description:
          "Upload a file from local machine to remote server through the terminal session. " +
          "Works seamlessly with SSH and nested SSH connections. " +
          "Maximum file size: 10MB. Timeout: 5 minutes.",
        inputSchema: {
          type: "object",
          properties: {
            local_path: {
              type: "string",
              description: "Path to the local file to upload",
            },
            remote_path: {
              type: "string",
              description: "Destination path on the remote server",
            },
            session_id: {
              type: "string",
              description: "Session identifier to use for upload (default: 'default')",
              default: "default",
            },
            timeout: {
              type: "number",
              description: "Upload timeout in milliseconds (default: 300000 = 5 minutes, max: 300000)",
              default: 300000,
            },
          },
          required: ["local_path", "remote_path"],
        },
      },
      {
        name: "terminal_download_file",
        description:
          "Download a file from remote server to local machine through the terminal session. " +
          "Works seamlessly with SSH and nested SSH connections. " +
          "Maximum file size: 10MB. Timeout: 5 minutes.",
        inputSchema: {
          type: "object",
          properties: {
            remote_path: {
              type: "string",
              description: "Path to the file on remote server",
            },
            local_path: {
              type: "string",
              description: "Destination path on local machine",
            },
            session_id: {
              type: "string",
              description: "Session identifier to use for download (default: 'default')",
              default: "default",
            },
            timeout: {
              type: "number",
              description: "Download timeout in milliseconds (default: 300000 = 5 minutes, max: 300000)",
              default: 300000,
            },
          },
          required: ["remote_path", "local_path"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "terminal_execute": {
        const { command, session_id = "default", timeout = 30000 } = args as any;

        const validTimeout = Math.min(Math.max(timeout, 1000), 120000);

        let session = sessions.get(session_id);
        if (!session) {
          console.error(`[ShellKeeper] Creating new session: ${session_id}`);
          session = createSession(session_id);
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
        await sleep(500);

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

      case "terminal_upload_file": {
        const { local_path, remote_path, session_id = "default", timeout = FILE_TRANSFER_TIMEOUT } = args as any;

        const validTimeout = Math.min(timeout, FILE_TRANSFER_TIMEOUT);

        let session = sessions.get(session_id);
        if (!session) {
          console.error(`[ShellKeeper] Creating new session for upload: ${session_id}`);
          session = createSession(session_id);
          await sleep(500);
        }

        if (!session.isReady) {
          throw new Error(
            `Session ${session_id} is busy executing: ${session.lastCommand}. ` +
            `Please wait or use a different session.`
          );
        }

        console.error(`[ShellKeeper] Uploading file in session ${session_id}: ${local_path} -> ${remote_path}`);
        const result = await uploadFile(session, local_path, remote_path, validTimeout);

        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      }

      case "terminal_download_file": {
        const { remote_path, local_path, session_id = "default", timeout = FILE_TRANSFER_TIMEOUT } = args as any;

        const validTimeout = Math.min(timeout, FILE_TRANSFER_TIMEOUT);

        let session = sessions.get(session_id);
        if (!session) {
          throw new Error(
            `Session ${session_id} not found. Create a session first or connect to a server.`
          );
        }

        if (!session.isReady) {
          throw new Error(
            `Session ${session_id} is busy executing: ${session.lastCommand}. ` +
            `Please wait or use a different session.`
          );
        }

        console.error(`[ShellKeeper] Downloading file in session ${session_id}: ${remote_path} -> ${local_path}`);
        const result = await downloadFile(session, remote_path, local_path, validTimeout);

        return {
          content: [
            {
              type: "text",
              text: result,
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
