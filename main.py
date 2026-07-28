#!/usr/bin/env python3
import click, json, os, sys, pathlib

from config import load, save, SKILLS_DIR, AGENTS_DIRS
from client import LLMClient
from tools import execute, get_schemas
from rich.panel import Panel
from ui import console, get_input, show_header, AssistantStream, show_info, show_error, show_status, set_prompt_mode

MODE = "plan"

SYSTEM_PROMPT = """Kamu adalah **DWCode**, asisten coding di terminal. Tugasmu membantu user mengerjakan task coding dengan tool yang tersedia.

## Mode Saat Ini: {mode}

### Plan Mode — READ ONLY
- ✅ Membaca file untuk analisis
- ✅ Mencari kode (grep/glob)
- ❌ **TIDAK BOLEH** menulis/mengedit file
- ❌ **TIDAK BOLEH** menjalankan bash
- ❌ **TIDAK BOLEH** memberikan kode utuh untuk dicopy-paste
- ✅ Boleh memberikan contoh kode kecil sebagai ilustrasi (< 10 baris)

### Build Mode — FULL ACCESS
- ✅ Semua operasi diizinkan
- ✅ Membaca, menulis, mengedit file
- ✅ Menjalankan bash command
- ✅ Membuat dan memodifikasi kode

## Tools
- **`read`** — baca file
- **`write`** — tulis file (hanya build mode)
- **`edit`** — edit file dengan string replacement (hanya build mode)
- **`bash`** — jalankan shell command (hanya build mode)
- **`grep`** — cari teks dengan regex
- **`glob`** — cari file dengan pattern

## Built-in Skills
Gunakan tools berikut untuk memuat pengetahuan spesifik sesuai kebutuhan task:
- **`list_skills()`** — lihat skill yang tersedia
- **`load_skill(nama)`** — muat skill untuk task saat ini (bisa multi skill)
- **`unload_skill(nama)`** — hapus skill kalo tidak diperlukan lagi (atau 'all')

Skill berisi teknik, payload, command, dan panduan teknis. Load skill yang RELEVAN
sebelum mengerjakan task. Bisa load banyak skill sekaligus.

## Agents
Agent adalah AI specialized dengan role dan permission sendiri.
Gunakan `/agent <nama>` untuk switch, atau kirim `@nama` di chat.
Ketik `/agents` untuk lihat daftar lengkap.

Bedakan Skill vs Agent:
- **Skill** = pengetahuan/teknik (load dengan `load_skill()`)
- **Agent** = AI dengan identitas dan permission khusus (panggil dengan `@nama`)

Agent yang tersedia:
- `@sec-bounty` — Bug bounty hunter
- `@sec-web` — Web security auditor
- `@sec-polar` — Hunt-fix cycle
- `@fullstack-developer` — Full-stack developer

## Aturan Penting
1. Gunakan **Bahasa Indonesia** untuk komunikasi.
2. Jika user minta sesuatu yang butuh Build mode (bash, write, edit, jalanin server, git, install, compile, deploy, dll), KAMU HARUS kasih tau: "Ini butuh Build mode. Ketik /build dulu ya."
3. Kode, identifier, error message tetap dalam bahasa asli.
4. Path file HARUS absolut.
5. Untuk `edit`, pastikan `old_string` cocok PERSIS dengan isi file.
6. Jika task butuh banyak langkah, kerjakan step by step.
7. Sebelum mengerjakan task, cek skill yang relevan dengan `list_skills()` lalu `load_skill()`.
8. Setelah selesai, beri ringkasan apa yang sudah dilakukan.
"""

def build_system(mode):
    return SYSTEM_PROMPT.format(mode=mode.upper())

active_skills = {}
active_agent = None

def _apply_mode(mode, model_name):
    global MODE
    MODE = mode
    set_prompt_mode(MODE)
    if model_name:
        show_header(MODE, model_name)

def _list_skills():
    if not SKILLS_DIR.exists():
        return []
    skills = []
    for f in sorted(SKILLS_DIR.glob("*.md")):
        name = f.stem
        desc = ""
        for line in f.read_text().split("\n"):
            if line.startswith("description:"):
                desc = line.split(":", 1)[1].strip().strip('"')
                break
        skills.append({"name": name, "description": desc})
    return skills

def _list_agents():
    agents = []
    seen = set()
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
                agents.append({"name": name, "description": desc})
    return agents

def _load_agent(name):
    for d in AGENTS_DIRS:
        p = d / f"{name}.md"
        if p.exists():
            content = p.read_text()
            body = content.split("---", 2)[-1].strip() if content.startswith("---") else content
            desc = ""
            for line in content.split("\n"):
                if line.startswith("description:"):
                    desc = line.split(":", 1)[1].strip().strip('"')
                    break
            return {"name": name, "description": desc, "prompt": body}
    return None

def _rebuild_system():
    if active_agent:
        base = active_agent["prompt"]
    else:
        base = build_system(MODE)
    if active_skills:
        base += "\n\n---\n## Active Skills\n"
        for name, content in active_skills.items():
            base += f"\n### {name}\n{content}\n"
    return base

COMMANDS = {
    "/plan": "switch to plan mode (read-only)",
    "/build": "switch to build mode (full access)",
    "/mode": "show current mode",
    "/skill": "load a skill by name",
    "/skills": "list available skills",
    "/unskill": "remove active skill",
    "/agent": "switch agent",
    "/agents": "list agents",
    "/default": "back to default",
    "/clear": "reset conversation",
    "/help": "show this help",
    "/exit": "exit DWCode",
}

def handle_command(cmd_line):
    global MODE, active_skills, active_agent
    cmd = cmd_line.split()[0]
    if cmd == "/plan":
        _apply_mode("plan", "")
        show_info("Switch ke Plan mode")
        return True
    elif cmd == "/build":
        _apply_mode("build", "")
        show_info("Switch ke Build mode")
        return True
    elif cmd == "/mode":
        show_info(f"Mode: {MODE.upper()}")
        return True
    elif cmd == "/skill":
        parts = cmd_line.split(None, 1)
        if len(parts) < 2:
            show_info("Gunakan: /skill <nama>")
            return True
        name = parts[1].strip()
        path = SKILLS_DIR / f"{name}.md"
        if not path.exists():
            show_info(f"Skill `{name}` tidak ditemukan")
            return True
        active_skills[name] = path.read_text()
        show_info(f"Skill loaded: {name}")
        return True
    elif cmd == "/skills":
        skills = _list_skills()
        if not skills:
            show_info("Tidak ada skill")
            return True
        lines = []
        for s in skills:
            tag = " ✅" if s["name"] in active_skills else ""
            lines.append(f"  {s['name']}{tag} — {s['description']}")
        show_info("Available skills:\n" + "\n".join(lines))
        return True
    elif cmd == "/unskill":
        if not active_skills:
            show_info("Tidak ada skill aktif")
            return True
        parts = cmd_line.split(None, 1)
        if len(parts) < 2:
            show_info("Gunakan: /unskill <nama>")
            return True
        target = parts[1].strip()
        if target == "all":
            active_skills.clear()
            show_info("Semua skill dihapus")
        elif target in active_skills:
            del active_skills[target]
            show_info(f"Skill {target} dihapus")
        return True
    elif cmd == "/agent":
        parts = cmd_line.split(None, 1)
        if len(parts) < 2:
            show_info("Gunakan: /agent <nama>")
            return True
        name = parts[1].strip()
        agent = _load_agent(name)
        if not agent:
            show_info(f"Agent `{name}` tidak ditemukan")
            return True
        active_agent = agent
        active_skills.clear()
        show_info(f"Agent: {agent['description']}")
        return True
    elif cmd == "/agents":
        agents = _list_agents()
        if not agents:
            show_info("Tidak ada agent")
            return True
        lines = []
        for a in agents:
            tag = " ✅" if active_agent and a["name"] == active_agent["name"] else ""
            lines.append(f"  @{a['name']}{tag} — {a['description']}")
        show_info("Available agents:\n" + "\n".join(lines))
        return True
    elif cmd == "/default":
        active_agent = None
        active_skills.clear()
        show_info("Kembali ke DWCode default")
        return True
    elif cmd in ("/exit", "/quit"):
        sys.exit(0)
    elif cmd == "/clear":
        return True
    elif cmd == "/help":
        show_info("Commands: " + ", ".join(f"{k} — {v}" for k, v in COMMANDS.items()))
        return True
    return False

@click.command()
@click.option("--base-url", help="API base URL")
@click.option("--model", help="Model name")
@click.option("--api-key", help="API key")
@click.option("--task", "-t", help="Single task (non-interactive)")
@click.option("--update", is_flag=True, help="Update DWCode ke versi terbaru")
def main(base_url, model, api_key, task, update):
    if update:
        import subprocess, sys
        console.print("⏳ Update DWCode...")
        pip = sys.executable.replace("python", "pip")
        r = subprocess.run(
            [pip, "install", "--upgrade", "--force-reinstall",
             "git+https://github.com/heydeden/dwcode"],
            capture_output=True, text=True, timeout=120,
        )
        if r.returncode == 0:
            console.print(Panel("✅ DWCode updated!", title="Update", border_style="green"))
        else:
            console.print(Panel(f"❌ Gagal:\n{r.stderr[:300]}", title="Error", border_style="red"))
        return

    cfg = load()
    if base_url: cfg["base_url"] = base_url
    if model: cfg["model"] = model
    if api_key: cfg["api_key"] = api_key

    if base_url or model or api_key:
        save({
            "base_url": base_url or cfg["base_url"],
            "api_key": api_key or cfg["api_key"],
            "model": model or cfg["model"],
        })

    if not cfg.get("api_key"):
        console.print(Panel(
            "Belum ada API key & model.\n\n"
            "Ketik di terminal:\n\n"
            "  dwcode \\\n"
            "  --api-key <api_key_9router> \\\n"
            "  --model <nama_model>\n\n"
            "Contoh:\n"
            "  dwcode --api-key sk-xxx --model Gratis\n\n"
            "Atau pake env:\n"
            "  export DWCODE_API_KEY=sk-xxx\n"
            "  export DWCODE_MODEL=Gratis\n"
            "  dwcode\n\n"
            "Command: /exit — keluar    /help — bantuan",
            title="DWCode — First Run",
            border_style="yellow",
        ))
        client = None
        tool_schemas = None
    else:
        show_header(MODE, cfg["model"])
        client = LLMClient(cfg["base_url"], cfg["api_key"], cfg["model"])
        tool_schemas = get_schemas()

    global MODE
    MODE = "plan"
    set_prompt_mode(MODE)

    show_header(MODE, cfg["model"])

    messages = []
    system_msg = {"role": "system", "content": build_system(MODE)}

    def run_conversation(user_input):
        if not client:
            show_error("Belum ada API key. Set dulu: dwcode --api-key <key> --model <model>")
            return
        global MODE
        messages.append({"role": "user", "content": user_input})

        show_status("Mikir...")

        while True:
            history = [system_msg] + messages[-30:]

            stream = client.stream(history, tool_schemas)
            view = AssistantStream()
            view.__enter__()

            text_acc = ""
            tool_calls = []

            for event in stream:
                if event["type"] == "text_delta":
                    text_acc += event["content"]
                    view.update_text(event["content"])
                elif event["type"] == "tool_calls":
                    tool_calls = event["calls"]
                    break
                elif event["type"] == "error":
                    view.__exit__(None, None, None)
                    show_error(event["content"])
                    show_info("Coba lagi / ulang pertanyaan")
                    return

            view.__exit__(None, None, None)

            if tool_calls:
                msg = {"role": "assistant", "content": text_acc or None, "tool_calls": []}
                for tc in tool_calls:
                    tid = tc.get("id") or f"call_{id(tc)}"
                    msg["tool_calls"].append({
                        "id": tid, "type": "function",
                        "function": {"name": tc["function"]["name"], "arguments": json.dumps(tc["function"]["arguments"])},
                    })
                messages.append(msg)

                skill_changed = False
                for tc in tool_calls:
                    name = tc["function"]["name"]
                    args = tc["function"]["arguments"]
                    result = execute(name, args, MODE)
                    tid = tc.get("id") or f"call_{id(tc)}"
                    messages.append({"role": "tool", "tool_call_id": tid, "content": result})

                    if name == "load_skill":
                        sn = args.get("name", "")
                        if sn and "tidak ditemukan" not in result and "⚠️" not in result:
                            active_skills[sn] = result
                            skill_changed = True
                    elif name == "unload_skill":
                        sn = args.get("name", "")
                        if sn == "all":
                            active_skills.clear()
                            skill_changed = True
                        elif sn in active_skills:
                            del active_skills[sn]
                            skill_changed = True

                if skill_changed:
                    system_msg["content"] = _rebuild_system()

                show_status("Mikir...")
                continue

            if text_acc:
                messages.append({"role": "assistant", "content": text_acc})
            break

    if task:
        run_conversation(task)
        return

    while True:
        try:
            user_input = get_input()
        except:
            break

        if user_input is None:
            break
        if not user_input:
            continue

        if user_input.startswith("/"):
            if handle_command(user_input):
                cmd = user_input.strip().split()[0]
                if cmd in ("/plan", "/build", "/skill", "/unskill", "/agent", "/default"):
                    system_msg["content"] = _rebuild_system()
                    if messages and messages[0].get("role") == "system":
                        messages[0] = system_msg
                elif cmd == "/clear":
                    messages.clear()
                    active_skills.clear()
                    active_agent = None
                    show_info("Conversation dihapus")
            continue

        run_conversation(user_input)

if __name__ == "__main__":
    main()