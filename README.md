# 🐚 MCP ShellKeeper

<div align="center">

**Persistent Terminal Sessions + File Transfer for AI Assistants**

SSH into servers, run commands, transfer files — all through your AI assistant. No more stateless limitations.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)
[![npm](https://img.shields.io/badge/npm-mcp--shellkeeper-green.svg)](https://www.npmjs.com/package/mcp-shellkeeper) [![npm downloads](https://img.shields.io/npm/dt/mcp-shellkeeper)](https://www.npmjs.com/package/mcp-shellkeeper)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/tranhuucanh/mcp-shellkeeper)

[Real-World Example](#-real-world-example) • [Installation](#-installation) • [Core Features](#-core-features) • [Use Cases](#-use-cases) • [Tools](#-available-tools)

</div>

---

## 🎯 The Problem

AI assistants like Cursor execute commands **statelessly** — each command runs in a fresh environment:

```bash
❌ ssh user@server                          # Hangs forever - no output until exit
❌ Can't run commands after SSH
❌ Each command starts from scratch
❌ No way to transfer files to/from servers
❌ Must re-authenticate for every operation
```

## ✨ The Solution

ShellKeeper transforms AI assistants into **stateful operators** with persistent sessions and file transfer capabilities.

---

## 🚀 Core Features

<table>
<tr>
<td width="33%" align="left">

### 🔄 Stateful Execution

**Traditional AI (Stateless)**
```
You: "SSH to server"
AI: ❌ Command hangs forever

You: "List files"
AI: ❌ Runs on local, not server
```

**ShellKeeper (Stateful)**
```
You: "Connect to my server"
AI: ✅ Establishes SSH session

You: "What files are there?"
AI: ✅ Lists files on server

You: "Go to the logs folder"
AI: ✅ Changes to /var/log

You: "Show me recent errors"
AI: ✅ Displays log content
```

AI maintains full context between your questions!

</td>
<td width="33%" align="left">

### 🎯 Persistent Sessions

**Natural Conversation Flow**
```
You: "SSH to production server"
AI: ✅ Connected to prod-01
    Session: prod-01

You: "How much disk space left?"
AI: ✅ 45GB available
    (same session, no re-auth)

You: "Show me today's logs"
AI: ✅ Displaying logs...
    (same session continues)

You: "Restart the API service"
AI: ✅ Service restarted
    (still same session!)
```

**The AI remembers everything:**
- ✅ Your SSH connections
- ✅ Current directories
- ✅ Environment variables
- ✅ All previous context

</td>
<td width="33%" align="left">

### 📁 Seamless File Transfer

**Just Ask in Natural Language**
```
You: "Upload my config to the server"

AI: ✅ Uploaded config.json
    /app/config/config.json

---

You: "Download the error logs"

AI: ✅ Downloaded app.log
    Saved to ./logs/app.log

---

You: "Get database backup"

AI: ✅ Downloaded backup.sql
    (even through SSH jumps!)
```

**It just works:**
- ✅ Through any SSH session
- ✅ Multiple jump hosts
- ✅ Up to 10MB files
- ✅ Binary and text files

</td>
</tr>
</table>

---

## 🎬 Real-World Example

Watch how a natural conversation becomes automated operations:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👤 YOU ASK:
   "Debug the slow API on prod-server-01"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 AI EXECUTES:

   [Connecting...]
   → ssh user@prod-server-01
   ✅ Connected to prod-server-01

   [Investigating processes...]
   → ps aux | grep api
   📊 API process found: PID 1234, using 98% CPU

   [Checking logs...]
   → cd /var/log/api && tail -n 100 error.log
   🔍 ERROR: Memory leak in /api/v1/users endpoint

   [Downloading for analysis...]
   → Download: /var/log/api/error.log → ./local-debug/
   ✅ Downloaded 2.4MB (analyzed: 500+ memory errors)

   [Applying fix...]
   → Upload: ./fixed-config.yml → /app/config/
   ✅ Uploaded new rate-limiting config

   [Restarting service...]
   → systemctl restart api-service
   → systemctl status api-service
   ✅ Service restarted, CPU now at 12%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🤖 AI RESPONDS:
   "Fixed! The API had a memory leak in the users endpoint.

   • Downloaded logs and found 500+ memory allocation errors
   • Applied rate-limiting configuration
   • Restarted service - CPU dropped from 98% to 12%
   • All operations completed in one persistent session"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ All in ONE session, NO re-authentication needed! ✨
```

---

## 📦 Installation

```bash
npm install -g mcp-shellkeeper
```

### Configuration

<table>
<tr>
<td width="33%">

**Cursor**

Settings JSON:
```json
{
  "mcpServers": {
    "shellkeeper": {
      "command": "npx",
      "args": ["-y", "mcp-shellkeeper"]
    }
  }
}
```

(`Cmd+Shift+P` → Preferences: Open Settings)

</td>
<td width="33%">

**Claude Code**

Config file:
```json
{
  "mcpServers": {
    "shellkeeper": {
      "command": "npx",
      "args": ["-y", "mcp-shellkeeper"]
    }
  }
}
```

(`~/.config/claude/config.json`)

</td>
<td width="33%">

**VS Code (Cline)**

Settings JSON:
```json
{
  "cline.mcpServers": {
    "shellkeeper": {
      "command": "npx",
      "args": ["-y", "mcp-shellkeeper"]
    }
  }
}
```

</td>
</tr>
</table>

**Restart your AI assistant** and you're ready! 🎉

---

## 💡 Use Cases

| Scenario | What You Ask | What AI Does |
|----------|-------------|--------------|
| **🔍 Debug Production** | *"Why is prod-api slow?"* | SSH → Check CPU/memory → Download logs → Analyze → Upload fix → Restart |
| **🚀 Deploy Updates** | *"Deploy v2.0 to staging"* | SSH → Backup → Upload files → Migrate DB → Restart → Verify |
| **🔧 Update Configs** | *"Update SSL certs on web servers"* | SSH → Download old certs → Upload new → Test → Reload nginx |
| **🗄️ Backup Database** | *"Backup prod DB to local"* | SSH through bastion → Dump DB → Compress → Download → Verify |
| **📊 Analyze Logs** | *"Find all 500 errors today"* | SSH → Parse logs → Download → Analyze locally → Report patterns |
| **🔄 Batch Operations** | *"Update configs on all servers"* | Parallel sessions → Upload → Restart → Download results |

**All through natural conversation with your AI!** No scripts, no manual SSH juggling.

---

## 📖 Available Tools

The AI uses these tools automatically, but you can reference them for advanced use:

| Tool | Purpose | Key Features |
|------|---------|--------------|
| **`terminal_execute`** | Run commands in persistent session | Timeout config, exit code capture, clean output |
| **`terminal_upload_file`** | Upload local → remote (max 10MB) | Auto-detect directory, handle duplicates, works through SSH |
| **`terminal_download_file`** | Download remote → local (max 10MB) | Auto-create dirs, preserve permissions, verify integrity |
| **`terminal_new_session`** | Create isolated session | Parallel operations, separate environments |
| **`terminal_list_sessions`** | View all active sessions | Status, uptime, last command |
| **`terminal_close_session`** | Clean up session | Free resources when done |
| **`terminal_get_buffer`** | Debug raw output | Useful for troubleshooting |

**💡 Tip:** The AI handles these automatically based on your natural language requests!

---

## 🔒 Security Best Practices

**✅ DO:**
- Use SSH key authentication (not passwords): `ssh-keygen -t ed25519`
- Jump through bastion hosts for production: `ssh -J bastion.com user@prod`
- Limit file upload destinations (avoid `/etc`, `/root`, `.ssh/`)
- Use read-only accounts for investigation
- Clean up sessions after tasks
- Audit all AI operations

**❌ DON'T:**
- Store passwords in commands or configs
- Upload untrusted files to production
- Download sensitive data without encryption
- Run destructive commands without verification
- Grant unnecessary permissions

---

## 🛠️ How It Works

**Persistent Sessions:**
- Uses PTY (Pseudo-Terminal) for full TTY emulation with state persistence
- Smart markers detect command completion automatically
- Exit codes captured for error detection
- Output parsed clean (no ANSI codes)

**File Transfer:**
- Base64 encoding through existing SSH sessions (no separate SCP/SFTP)
- Works through jump hosts without re-authentication
- Max 10MB, 5-minute timeout (completes early if faster)

---

## 🐛 Troubleshooting

<details>
<summary><b>Commands timeout or hang</b></summary>

```javascript
// Increase timeout for long-running commands
terminal_execute({
  command: "npm install",
  timeout: 120000  // 2 minutes
})

// Check if SSH keys are set up correctly
ssh -v user@server
```
</details>

<details>
<summary><b>SSH asks for password</b></summary>

```bash
# Set up passwordless authentication
ssh-keygen -t ed25519
ssh-copy-id user@server

# Verify
ssh user@server "echo Success"
```
</details>

<details>
<summary><b>File upload fails</b></summary>

```javascript
// Check if in SSH session first
terminal_execute({ command: "pwd" })  // Verify you're on remote server

// Ensure remote directory exists
terminal_execute({ command: "mkdir -p /app/uploads" })

// Then upload
terminal_upload({ local_path: "file.txt", remote_path: "/app/uploads/file.txt" })
```
</details>

<details>
<summary><b>File download fails</b></summary>

```javascript
// Verify remote file exists
terminal_execute({ command: "ls -lh /path/to/file" })

// Check permissions
terminal_execute({ command: "cat /path/to/file | wc -l" })

// Try download with absolute path
terminal_download({ remote_path: "/full/path/to/file", local_path: "./" })
```
</details>

<details>
<summary><b>Session becomes unresponsive</b></summary>

```javascript
// List all sessions
terminal_list_sessions()

// Close problematic session
terminal_close_session({ session_id: "stuck-session" })

// Create fresh session
terminal_new_session({ session_id: "new-session" })
```
</details>

---

## 🧪 Development

```bash
# Clone repository
git clone https://github.com/tranhuucanh/mcp-shellkeeper.git
cd mcp-shellkeeper

# Install dependencies
npm install

# Build
npm run build

# Test locally with stdio transport
node dist/index.js

# Test with MCP Inspector
npm run inspector
```

---

## 🤝 Contributing

Contributions welcome! Help make AI-assisted server management better.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

**You can:**
- ✅ Use commercially
- ✅ Modify
- ✅ Distribute
- ✅ Private use

---

## 🙏 Acknowledgments

- Built with [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk)
- Uses [node-pty](https://github.com/microsoft/node-pty) for terminal emulation
- Inspired by the need for stateful command execution in AI workflows

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/tranhuucanh/mcp-shellkeeper/issues)
- **Discussions**: [GitHub Discussions](https://github.com/tranhuucanh/mcp-shellkeeper/discussions)
- **MCP Community**: [Discord](https://discord.gg/modelcontextprotocol)

---

<div align="center">

**Built with ❤️ for the AI developer community**

*Stateful execution + File transfer = Limitless possibilities*

[![Star History Chart](https://api.star-history.com/svg?repos=tranhuucanh/mcp-shellkeeper&type=Date&t=89)](https://star-history.com/#tranhuucanh/mcp-shellkeeper&Date&t=89)

[⬆ Back to top](#-mcp-shellkeeper)

</div>
