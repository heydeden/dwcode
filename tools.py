import os, subprocess, json, platform
from pathlib import Path
from config import SKILLS_DIR, AGENTS_DIRS

IS_WINDOWS = platform.system() == "Windows"

LINUX_BLOCKED = ["rm", "sudo", "dd", "mkfs", "chmod", "chown", "kill"]
WINDOWS_BLOCKED = ["format", "del", "rd", "rmdir", "regedit", "shutdown", "taskkill"]
SHARED_BLOCKED = [">", ">>", "|"]

BLOCKED_COMMANDS = LINUX_BLOCKED + (WINDOWS_BLOCKED if IS_WINDOWS else []) + SHARED_BLOCKED

TOOLS = {}

def tool(name, description, params, required, fn):
    TOOLS[name] = {
        "description": description,
        "params": params,
        "required": required,
        "fn": fn,
    }

def get_schemas():
    result = []
    for name, t in TOOLS.items():
        result.append({
            "name": name,
            "description": t["description"],
            "parameters": {
                "type": "object",
                "properties": t["params"],
                "required": t["required"],
            }
        })
    return result

def execute(name, args, mode):
    t = TOOLS.get(name)
    if not t:
        return f"Tool `{name}` tidak dikenal."

    if mode == "plan" and name in ("write", "edit", "bash"):
        return "\n".join([
            "⛔ **Plan mode: tidak bisa menjalankan perintah ini**",
            "",
            f"Tool `{name}` hanya tersedia di **Build mode**.",
            "Ketik `/build` untuk switch ke build mode.",
        ])

    if name == "bash" and "command" in args:
        cmd = args["command"].strip()
        first_word = cmd.split()[0] if cmd else ""
        if first_word in BLOCKED_COMMANDS:
            return f"⛔ Perintah `{first_word}` diblokir untuk keamanan."

    try:
        return t["fn"](args, mode)
    except Exception as e:
        return f"⚠️ Error: {e}"

# ── Tool Definitions ──────────────────────────────────

tool(
    name="read",
    description="Read a file from the filesystem. Optionally specify offset (line number) and limit (max lines).",
    params={
        "path": {"type": "string", "description": "Absolute path to the file"},
        "offset": {"type": "integer", "description": "Starting line number (1-indexed)", "default": 1},
        "limit": {"type": "integer", "description": "Maximum number of lines to read"},
    },
    required=["path"],
    fn=lambda args, mode: _read(args),
)

tool(
    name="write",
    description="Write content to a file. Creates parent directories if needed. OVERWRITES existing file.",
    params={
        "path": {"type": "string", "description": "Absolute path to the file"},
        "content": {"type": "string", "description": "Full content to write"},
    },
    required=["path", "content"],
    fn=lambda args, mode: _write(args),
)

tool(
    name="edit",
    description="Replace exact matching text in a file. Use this for targeted changes without rewriting the whole file. Shows a diff of the change.",
    params={
        "path": {"type": "string", "description": "Absolute path to the file"},
        "old_string": {"type": "string", "description": "Exact text to find and replace"},
        "new_string": {"type": "string", "description": "Replacement text"},
    },
    required=["path", "old_string", "new_string"],
    fn=lambda args, mode: _edit(args),
)

tool(
    name="bash",
    description=f"Execute a shell command on {platform.system()} ({platform.machine()}). Returns stdout, stderr, and exit code.",
    params={
        "command": {"type": "string", "description": "Shell command to execute"},
        "workdir": {"type": "string", "description": "Working directory (default: current)"},
    },
    required=["command"],
    fn=lambda args, mode: _bash(args),
)

tool(
    name="grep",
    description="Search file contents using a regex pattern. Returns matching file paths and line numbers.",
    params={
        "pattern": {"type": "string", "description": "Regex pattern to search for"},
        "include": {"type": "string", "description": "Only search files matching this glob (e.g. *.py)"},
        "path": {"type": "string", "description": "Directory to search (default: current)"},
    },
    required=["pattern"],
    fn=lambda args, mode: _grep(args),
)

tool(
    name="glob",
    description="Find files and directories matching a glob pattern.",
    params={
        "pattern": {"type": "string", "description": "Glob pattern (e.g. **/*.py)"},
        "path": {"type": "string", "description": "Starting directory (default: current)"},
    },
    required=["pattern"],
    fn=lambda args, mode: _glob(args),
)

# ── Skill Tools ──────────────────────────────────────

tool(
    name="list_skills",
    description="List all available skills with their descriptions.",
    params={},
    required=[],
    fn=lambda args, mode: _list_skills_impl(),
)

tool(
    name="load_skill",
    description="Load a skill by name. The skill content will be added to context and available for subsequent requests.",
    params={
        "name": {"type": "string", "description": "Skill name (e.g. sec-api, sec-recon, sec-exploit, sec-cloud, sec-bypass, sec-proxy, md2pdf)"},
    },
    required=["name"],
    fn=lambda args, mode: _load_skill_impl(args),
)

tool(
    name="unload_skill",
    description="Unload a skill by name, or use 'all' to unload all active skills.",
    params={
        "name": {"type": "string", "description": "Skill name or 'all'"},
    },
    required=["name"],
    fn=lambda args, mode: _unload_skill_impl(args),
)

# ── Agent Tools ──────────────────────────────────────

tool(
    name="list_agents",
    description="List all available agents with their descriptions.",
    params={},
    required=[],
    fn=lambda args, mode: _list_agents_impl(),
)

tool(
    name="load_agent",
    description="Load an agent by name. The agent prompt will replace the current system prompt.",
    params={
        "name": {"type": "string", "description": "Agent name (e.g. sec-bounty, sec-web, sec-polar, fullstack-developer)"},
    },
    required=["name"],
    fn=lambda args, mode: _load_agent_impl(args),
)

# ── Implementations ──────────────────────────────────

def _read(args):
    path = args["path"]
    if not os.path.isfile(path):
        return f"⚠️ File tidak ditemukan: `{path}`"

    with open(path) as f:
        lines = f.readlines()

    offset = args.get("offset", 1)
    limit = args.get("limit")

    start = offset - 1
    if start >= len(lines):
        return f"⚠️ Offset {offset} melebihi total {len(lines)} baris."

    selected = lines[start:]
    if limit:
        selected = selected[:limit]

    total = len(lines)
    shown = len(selected)
    header = f"📄 `{path}` — menampilkan baris {offset}-{offset+shown-1} dari {total}\n"
    content = "".join(selected)
    return header + "```\n" + content.rstrip("\n") + "\n```"

def _write(args):
    path = args["path"]
    content = args["content"]

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        f.write(content)

    size = len(content.encode())
    return f"✅ File ditulis: `{path}` ({size} bytes)"

def _edit(args):
    path = args["path"]
    old = args["old_string"]
    new = args["new_string"]

    if not os.path.isfile(path):
        return f"⚠️ File tidak ditemukan: `{path}`"

    with open(path) as f:
        text = f.read()

    if old not in text:
        return f"⚠️ String tidak ditemukan di `{path}`.\n\nCoba cari dengan tool `grep` untuk memastikan teks yang tepat."

    count = text.count(old)
    if count > 1:
        return f"⚠️ Ditemukan {count} kemunculan. Sediakan konteks yang lebih unik."

    new_text = text.replace(old, new)
    with open(path, "w") as f:
        f.write(new_text)

    import difflib
    diff = difflib.unified_diff(
        text.splitlines(keepends=True),
        new_text.splitlines(keepends=True),
        fromfile="before",
        tofile="after",
    )
    diff_text = "".join(diff)

    return f"✅ File diedit: `{path}`\n\n```diff\n{diff_text}\n```"

def _bash(args):
    cmd = args["command"]
    cwd = args.get("workdir")

    if IS_WINDOWS:
        full_cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", cmd]
        result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=60,
        )
    else:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=60,
        )

    parts = []
    if result.stdout:
        parts.append(result.stdout.strip())
    if result.stderr:
        parts.append(f"stderr:\n{result.stderr.strip()}")

    output = "\n".join(parts)

    meta = f"$ `{cmd}`\nexit code: {result.returncode}"
    if output:
        return f"{meta}\n\n```\n{output}\n```"
    return f"{meta}\n\n_(tidak ada output)_"

def _grep(args):
    import re
    pattern = args["pattern"]
    include = args.get("include")
    path = args.get("path") or os.getcwd()

    matches = []

    for root, dirs, files in os.walk(path):
        for f in files:
            fpath = os.path.join(root, f)
            rel = os.path.relpath(fpath, path)
            if include and not Path(f).match(include):
                continue
            try:
                with open(fpath, errors="ignore") as fh:
                    for i, line in enumerate(fh, 1):
                        if re.search(pattern, line):
                            matches.append(f"{rel}:{i}: {line.rstrip()[:200]}")
            except Exception:
                pass

    if not matches:
        return f"🔍 Tidak ditemukan untuk `{pattern}`"

    limit = 50
    show = matches[:limit]
    result = f"🔍 Ditemukan {len(matches)} kecocokan untuk `{pattern}`:\n\n"
    result += "\n".join(show)
    if len(matches) > limit:
        result += f"\n... dan {len(matches) - limit} lainnya"
    return result

def _glob(args):
    pattern = args["pattern"]
    path = args.get("path") or os.getcwd()

    import glob as glob_mod
    matches = glob_mod.glob(pattern, root_dir=path, recursive=True)
    matches = sorted(matches)[:100]

    if not matches:
        return f"🔍 Tidak ditemukan: `{pattern}`"

    result = f"📁 Ditemukan {len(matches)} files untuk `{pattern}`:\n\n"
    result += "\n".join(matches)
    return result

# ── Skill Implementation ─────────────────────────────

def _list_skills_impl():
    if not SKILLS_DIR.exists():
        return "Tidak ada direktori skill."
    files = sorted(SKILLS_DIR.glob("*.md"))
    if not files:
        return "Tidak ada skill."
    result = ["📚 Available skills:"]
    for f in files:
        name = f.stem
        desc = ""
        for line in f.read_text().split("\n"):
            if line.startswith("description:"):
                desc = line.split(":", 1)[1].strip().strip('"')
                break
        result.append(f"  **{name}** — {desc}")
    return "\n".join(result)

def _load_skill_impl(args):
    name = args.get("name", "").strip()
    if not name:
        return "⚠️ Nama skill diperlukan."
    path = SKILLS_DIR / f"{name}.md"
    if not path.exists():
        available = ", ".join(sorted(f.stem for f in SKILLS_DIR.glob("*.md")))
        return f"⚠️ Skill `{name}` tidak ditemukan.\n\nTersedia: {available}"
    return path.read_text()

def _unload_skill_impl(args):
    name = args.get("name", "").strip()
    if not name:
        return "⚠️ Nama skill diperlukan."
    if name == "all":
        return "✅ Semua skill akan diunload."
    return f"✅ Skill `{name}` akan diunload."

# ── Agent Implementation ────────────────────────────

def _list_agents_impl():
    seen = set()
    result = ["📚 Available agents:"]
    for d in AGENTS_DIRS:
        if d.exists():
            for f in sorted(d.glob("*.md")):
                name = f.stem
                if name in seen:
                    continue
                seen.add(name)
                desc = ""
                for line in f.read_text().split("\n"):
                    if line.startswith("description:"):
                        desc = line.split(":", 1)[1].strip().strip('"')
                        break
                result.append(f"  **@{name}** — {desc}")
    if len(result) == 1:
        return "Tidak ada agent."
    return "\n".join(result)

def _load_agent_impl(args):
    name = args.get("name", "").strip()
    if not name:
        return "⚠️ Nama agent diperlukan."
    for d in AGENTS_DIRS:
        p = d / f"{name}.md"
        if p.exists():
            content = p.read_text()
            body = content.split("---", 2)[-1].strip() if content.startswith("---") else content
            return body
    available = set()
    for d in AGENTS_DIRS:
        if d.exists():
            for f in d.glob("*.md"):
                available.add(f.stem)
    return f"⚠️ Agent `{name}` tidak ditemukan.\n\nTersedia: {', '.join(sorted(available))}"


