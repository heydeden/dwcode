"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, exec: execCb, spawn } = require("child_process");
const fg = require("fast-glob");
const { diffLines } = require("diff");
const { SKILLS_DIR, AGENTS_DIRS } = require("./config.js");

const IS_WINDOWS = process.platform === "win32";

function detectShell() {
  if (IS_WINDOWS) return "PowerShell";
  const shell = process.env.SHELL || "";
  return shell ? path.basename(shell) : "sh";
}

const CURRENT_SHELL = detectShell();

function envInfo() {
  return `OS: ${process.platform} (${process.arch})
Shell: ${CURRENT_SHELL}
Node: ${process.version}`;
}

const LINUX_BLOCKED = ["rm", "sudo", "dd", "mkfs", "chmod", "chown", "kill"];
const WINDOWS_BLOCKED = ["format", "del", "rd", "rmdir", "regedit", "shutdown", "taskkill"];
const SHARED_BLOCKED = [">", ">>", "|"];

const BLOCKED_COMMANDS = [...LINUX_BLOCKED, ...(IS_WINDOWS ? WINDOWS_BLOCKED : []), ...SHARED_BLOCKED];

const TOOLS = {};

function tool(name, description, params, required, fn) {
  TOOLS[name] = { description, params, required, fn };
}

function getSchemas() {
  return Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    parameters: {
      type: "object",
      properties: t.params,
      required: t.required,
    },
  }));
}

function execute(name, args, mode) {
  const t = TOOLS[name];
  if (!t) return `Tool \`${name}\` tidak dikenal.`;

  if (mode === "plan" && ["write", "edit", "bash"].includes(name)) {
    return [
      "⛔ **Plan mode: tidak bisa menjalankan perintah ini**",
      "",
      `Tool \`${name}\` hanya tersedia di **Build mode**.`,
      "Ketik `/build` untuk switch ke build mode.",
    ].join("\n");
  }

  if (name === "bash" && args.command) {
    const cmd = args.command.trim();
    const firstWord = cmd.split(/\s+/)[0] || "";
    if (BLOCKED_COMMANDS.includes(firstWord)) {
      return `⛔ Perintah \`${firstWord}\` diblokir untuk keamanan.`;
    }
  }

  try {
    return t.fn(args, mode);
  } catch (e) {
    return `⚠️ Error: ${e.message}`;
  }
}

tool(
  "read",
  "Read a file from the filesystem. Optionally specify offset (line number) and limit (max lines).",
  {
    path: { type: "string", description: "Absolute path to the file" },
    offset: { type: "integer", description: "Starting line number (1-indexed)", default: 1 },
    limit: { type: "integer", description: "Maximum number of lines to read" },
  },
  ["path"],
  _read
);

tool(
  "write",
  "Write content to a file. Creates parent directories if needed. OVERWRITES existing file.",
  {
    path: { type: "string", description: "Absolute path to the file" },
    content: { type: "string", description: "Full content to write" },
  },
  ["path", "content"],
  _write
);

tool(
  "edit",
  "Replace exact matching text in a file. Shows a diff of the change.",
  {
    path: { type: "string", description: "Absolute path to the file" },
    old_string: { type: "string", description: "Exact text to find and replace" },
    new_string: { type: "string", description: "Replacement text" },
  },
  ["path", "old_string", "new_string"],
  _edit
);

tool(
  "bash",
  `Execute a shell command on ${process.platform} (${process.arch}). Shell: ${CURRENT_SHELL}. Returns stdout, stderr, and exit code.`,
  {
    command: { type: "string", description: "Shell command to execute" },
    workdir: { type: "string", description: "Working directory (default: current)" },
  },
  ["command"],
  _bash
);

tool(
  "grep",
  "Search file contents using a regex pattern. Returns matching file paths and line numbers.",
  {
    pattern: { type: "string", description: "Regex pattern to search for" },
    include: { type: "string", description: "Only search files matching this glob (e.g. *.py)" },
    path: { type: "string", description: "Directory to search (default: current)" },
  },
  ["pattern"],
  _grep
);

tool(
  "glob",
  "Find files and directories matching a glob pattern.",
  {
    pattern: { type: "string", description: "Glob pattern (e.g. **/*.py)" },
    path: { type: "string", description: "Starting directory (default: current)" },
  },
  ["pattern"],
  _glob
);

tool("list_skills", "List all available skills with their descriptions.", {}, [], _listSkills);
tool(
  "load_skill",
  "Load a skill by name.",
  { name: { type: "string", description: "Skill name (e.g. sec-api, sec-recon, sec-exploit)" } },
  ["name"],
  _loadSkill
);
tool(
  "unload_skill",
  "Unload a skill by name, or use 'all' to unload all active skills.",
  { name: { type: "string", description: "Skill name or 'all'" } },
  ["name"],
  _unloadSkill
);
tool("list_agents", "List all available agents with their descriptions.", {}, [], _listAgents);
tool(
  "load_agent",
  "Load an agent by name. The agent prompt will replace the current system prompt.",
  { name: { type: "string", description: "Agent name (e.g. sec-bounty, sec-web, fullstack-developer)" } },
  ["name"],
  _loadAgent
);

function _read(args) {
  const p = args.path;
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) {
    return `⚠️ File tidak ditemukan: \`${p}\``;
  }
  const content = fs.readFileSync(p, "utf-8");
  const lines = content.split("\n");
  const offset = args.offset || 1;
  const limit = args.limit;
  const start = offset - 1;
  if (start >= lines.length) {
    return `⚠️ Offset ${offset} melebihi total ${lines.length} baris.`;
  }
  let selected = lines.slice(start);
  if (limit) selected = selected.slice(0, limit);
  const total = lines.length;
  const shown = selected.length;
  const header = `\u{1F4C4} \`${p}\` — menampilkan baris ${offset}-${offset + shown - 1} dari ${total}\n`;
  return header + "```\n" + selected.join("\n").replace(/\n$/, "") + "\n```";
}

function _write(args) {
  const p = args.path;
  const content = args.content;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf-8");
  const size = Buffer.byteLength(content, "utf-8");
  return `✅ File ditulis: \`${p}\` (${size} bytes)`;
}

function _edit(args) {
  const p = args.path;
  const oldStr = args.old_string;
  const newStr = args.new_string;
  if (!fs.existsSync(p)) return `⚠️ File tidak ditemukan: \`${p}\``;
  const text = fs.readFileSync(p, "utf-8");
  if (!text.includes(oldStr)) {
    return `⚠️ String tidak ditemukan di \`${p}\`.\n\nCoba cari dengan tool \`grep\` untuk memastikan teks yang tepat.`;
  }
  const count = text.split(oldStr).length - 1;
  if (count > 1) return `⚠️ Ditemukan ${count} kemunculan. Sediakan konteks yang lebih unik.`;
  const newText = text.replace(oldStr, newStr);
  fs.writeFileSync(p, newText, "utf-8");
  const diffResult = diffLines(text, newText);
  const diffText = diffResult
    .map((part) => {
      const prefix = part.added ? "+" : part.removed ? "-" : " ";
      return part.value
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => prefix + l)
        .join("\n");
    })
    .filter((x) => x !== "")
    .join("\n");
  return `✅ File diedit: \`${p}\`\n\n\`\`\`diff\n${diffText}\n\`\`\``;
}

function _bash(args) {
  const cmd = args.command;
  const cwd = args.workdir || undefined;

  return new Promise((resolve) => {
    let proc;
    if (IS_WINDOWS) {
      proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", cmd], {
        cwd,
        timeout: 60000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      proc = spawn("bash", ["-c", cmd], {
        cwd,
        timeout: 60000,
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      const parts = [];
      if (stdout.trim()) parts.push(stdout.trim());
      if (stderr.trim()) parts.push(`stderr:\n${stderr.trim()}`);
      const output = parts.join("\n");
      const meta = `$ \`${cmd}\`\nexit code: ${code}`;
      resolve(output ? `${meta}\n\n\`\`\`\n${output}\n\`\`\`` : `${meta}\n\n_(tidak ada output)_`);
    });
    proc.on("error", (err) => {
      resolve(`$ \`${cmd}\`\n⚠️ Error: ${err.message}`);
    });
  });
}

function _grep(args) {
  const pattern = args.pattern;
  const include = args.include;
  const dir = args.path || process.cwd();
  const regex = new RegExp(pattern);
  const matches = [];

  function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules") walk(fullPath);
      } else if (entry.isFile()) {
        if (include && !entry.name.match(include.replace("*", ".*"))) continue;
        try {
          const lines = fs.readFileSync(fullPath, "utf-8").split("\n");
          const rel = path.relative(dir, fullPath);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              matches.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
            }
          }
        } catch {}
      }
    }
  }
  walk(dir);

  if (matches.length === 0) return `🔍 Tidak ditemukan untuk \`${pattern}\``;
  const limit = 50;
  const show = matches.slice(0, limit);
  let result = `🔍 Ditemukan ${matches.length} kecocokan untuk \`${pattern}\`:\n\n` + show.join("\n");
  if (matches.length > limit) result += `\n... dan ${matches.length - limit} lainnya`;
  return result;
}

async function _glob(args) {
  const pattern = args.pattern;
  const dir = args.path || process.cwd();
  try {
    const entries = await fg(pattern, { cwd: dir, dot: false, onlyFiles: true });
    const sorted = entries.sort().slice(0, 100);
    if (sorted.length === 0) return `🔍 Tidak ditemukan: \`${pattern}\``;
    return `📁 Ditemukan ${sorted.length} files untuk \`${pattern}\`:\n\n` + sorted.join("\n");
  } catch {
    return `🔍 Tidak ditemukan: \`${pattern}\``;
  }
}

function _parseMdFront(text) {
  const desc = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("description:")) {
      return line.split(":", 1)[1].trim().replace(/^"|"$/g, "");
    }
  }
  return desc;
}

function _listSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return "Tidak ada direktori skill.";
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) return "Tidak ada skill.";
  const lines = ["📚 Available skills:"];
  for (const f of files) {
    const name = f.slice(0, -3);
    const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
    const desc = _parseMdFront(content);
    lines.push(`  **${name}** — ${desc}`);
  }
  return lines.join("\n");
}

function _loadSkill(args) {
  const name = (args.name || "").trim();
  if (!name) return "⚠️ Nama skill diperlukan.";
  const p = path.join(SKILLS_DIR, `${name}.md`);
  if (!fs.existsSync(p)) {
    const available = fs.readdirSync(SKILLS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.slice(0, -3))
      .sort()
      .join(", ");
    return `⚠️ Skill \`${name}\` tidak ditemukan.\n\nTersedia: ${available}`;
  }
  return fs.readFileSync(p, "utf-8");
}

function _unloadSkill(args) {
  const name = (args.name || "").trim();
  if (!name) return "⚠️ Nama skill diperlukan.";
  if (name === "all") return "✅ Semua skill akan diunload.";
  return `✅ Skill \`${name}\` akan diunload.`;
}

function _listAgents() {
  const seen = new Set();
  const lines = ["📚 Available agents:"];
  for (const d of AGENTS_DIRS) {
    if (!fs.existsSync(d)) continue;
    const files = fs.readdirSync(d).filter((f) => f.endsWith(".md")).sort();
    for (const f of files) {
      const name = f.slice(0, -3);
      if (seen.has(name)) continue;
      seen.add(name);
      const content = fs.readFileSync(path.join(d, f), "utf-8");
      const desc = _parseMdFront(content);
      lines.push(`  **@${name}** — ${desc}`);
    }
  }
  if (lines.length === 1) return "Tidak ada agent.";
  return lines.join("\n");
}

function _loadAgent(args) {
  const name = (args.name || "").trim();
  if (!name) return "⚠️ Nama agent diperlukan.";
  for (const d of AGENTS_DIRS) {
    const p = path.join(d, `${name}.md`);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      return content.startsWith("---") ? content.split("---", 2)[2].trim() : content;
    }
  }
  const available = new Set();
  for (const d of AGENTS_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith(".md")) available.add(f.slice(0, -3));
    }
  }
  return `⚠️ Agent \`${name}\` tidak ditemukan.\n\nTersedia: ${[...available].sort().join(", ")}`;
}

module.exports = {
  TOOLS,
  getSchemas,
  execute,
  envInfo,
  IS_WINDOWS,
  CURRENT_SHELL,
};
