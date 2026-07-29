"use strict";
const fs = require("fs");
const path = require("path");
const { Command } = require("commander");
const { load, save, SKILLS_DIR, AGENTS_DIRS } = require("./config.js");
const { LLMClient } = require("./client.js");
const { execute, getSchemas, envInfo, IS_WINDOWS } = require("./tools.js");
const { setPromptMode, showHeader, showStatus, showInfo, showError, getInput, reloadCompletions, panel } = require("./ui.js");

let MODE = "plan";

const PLAN_RULES = `- ✅ Membaca file untuk analisis
- ✅ Mencari kode (grep/glob)
- ❌ **TIDAK BOLEH** menulis/mengedit file
- ❌ **TIDAK BOLEH** menjalankan bash
- ❌ **TIDAK BOLEH** memberikan kode utuh untuk dicopy-paste
- ✅ Boleh memberikan contoh kode kecil sebagai ilustrasi (< 10 baris)

### Tool Availability
- **\`read\`** ✅, **\`grep\`** ✅, **\`glob\`** ✅
- **\`write\`** ❌, **\`edit\`** ❌, **\`bash\`** ❌ (hanya Build mode)

Jika user minta eksekusi (bash, write, edit, install, deploy, dll), katakan:
"Minta user ketik /build dulu untuk switch ke Build mode."`;

const BUILD_RULES = `- ✅ Semua operasi diizinkan
- ✅ Membaca, menulis, mengedit file
- ✅ Menjalankan bash command
- ✅ Membuat dan memodifikasi kode

### Tool Availability
- **\`read\`** ✅, **\`write\`** ✅, **\`edit\`** ✅, **\`bash\`** ✅, **\`grep\`** ✅, **\`glob\`** ✅
- Kamu punya akses penuh ke semua tools.

Jangan tanyakan "switch ke build mode" — kamu SUDAH di Build mode. Langsung kerjakan apa yang user minta.`;

const ENV_INFO = envInfo();

const SYSTEM_PROMPT = `Kamu adalah **DWCode**, asisten coding di terminal. Tugasmu membantu user mengerjakan task coding dengan tool yang tersedia.

## Environment
{env}

## Mode Saat Ini: {mode}

### {mode} Rules
{rules}

## Built-in Skills
Gunakan tools berikut untuk memuat pengetahuan spesifik sesuai kebutuhan task:
- **\`list_skills()\`** — lihat skill yang tersedia
- **\`load_skill(nama)\`** — muat skill untuk task saat ini (bisa multi skill)
- **\`unload_skill(nama)\`** — hapus skill kalo tidak diperlukan lagi (atau 'all')

Skill berisi teknik, payload, command, dan panduan teknis. Load skill yang RELEVAN
sebelum mengerjakan task. Bisa load banyak skill sekaligus.

## Agents
Agent adalah AI specialized dengan role dan permission sendiri.
Gunakan \`/agent <nama>\` untuk switch, atau kirim \`@nama\` di chat.
Ketik \`/agents\` atau tool \`list_agents()\` untuk lihat daftar lengkap.

Bedakan Skill vs Agent:
- **Skill** = pengetahuan/teknik (load dengan \`load_skill()\`)
- **Agent** = AI dengan identitas dan permission khusus (panggil dengan \`@nama\`)

Agent tersedia: lihat dengan \`/agents\` atau \`list_agents()\`.

## Aturan Penting
1. Gunakan **Bahasa Indonesia** untuk komunikasi.
2. Kode, identifier, error message tetap dalam bahasa asli.
3. Path file HARUS absolut.
4. Untuk \`edit\`, pastikan \`old_string\` cocok PERSIS dengan isi file.
5. Jika task butuh banyak langkah, kerjakan step by step.
6. Sebelum mengerjakan task, cek skill yang relevan dengan \`list_skills()\` lalu \`load_skill()\`.
7. Setelah selesai, beri ringkasan apa yang sudah dilakukan.`;

function buildSystem(mode) {
  const rules = mode === "plan" ? PLAN_RULES : BUILD_RULES;
  return SYSTEM_PROMPT.replace("{env}", ENV_INFO).replace(/\{mode\}/g, mode.toUpperCase()).replace("{rules}", rules);
}

const activeSkills = {};
let activeAgent = null;

function applyMode(mode, modelName) {
  MODE = mode;
  setPromptMode(MODE);
  if (modelName) showHeader(MODE, modelName);
}

function listSkillsDir() {
  if (!fs.existsSync(SKILLS_DIR)) return [];
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith(".md")).sort();
  return files.map((f) => {
    const name = f.slice(0, -3);
    const content = fs.readFileSync(path.join(SKILLS_DIR, f), "utf-8");
    let desc = "";
    for (const line of content.split("\n")) {
      if (line.startsWith("description:")) {
        desc = line.split(":", 1)[1].trim().replace(/^"|"$/g, "");
        break;
      }
    }
    return { name, description: desc };
  });
}

function listAgentsDir() {
  const agents = [];
  const seen = new Set();
  for (const d of AGENTS_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".md")).sort()) {
      const name = f.slice(0, -3);
      if (seen.has(name)) continue;
      seen.add(name);
      const content = fs.readFileSync(path.join(d, f), "utf-8");
      let desc = "";
      for (const line of content.split("\n")) {
        if (line.startsWith("description:")) {
          desc = line.split(":", 1)[1].trim().replace(/^"|"$/g, "");
          break;
        }
      }
      agents.push({ name, description: desc });
    }
  }
  return agents;
}

function loadAgent(name) {
  for (const d of AGENTS_DIRS) {
    const p = path.join(d, `${name}.md`);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      const body = content.startsWith("---") ? content.split("---", 2)[2].trim() : content;
      let desc = "";
      for (const line of content.split("\n")) {
        if (line.startsWith("description:")) {
          desc = line.split(":", 1)[1].trim().replace(/^"|"$/g, "");
          break;
        }
      }
      return { name, description: desc, prompt: body };
    }
  }
  return null;
}

function rebuildSystem() {
  let base = activeAgent ? activeAgent.prompt : buildSystem(MODE);

  const agents = listAgentsDir();
  if (agents.length) {
    base += "\n\n## Available Agents\n";
    for (const a of agents) {
      const tag = activeAgent && a.name === activeAgent.name ? " ✅" : "";
      base += `- \`@${a.name}\`${tag} — ${a.description}\n`;
    }
    base += "\nGunakan \`/agent <nama>\` atau tool \`load_agent()\` untuk switch agent.\n";
  }

  const skills = listSkillsDir();
  if (skills.length) {
    base += "\n## Available Skills\n";
    for (const s of skills) {
      const tag = activeSkills[s.name] ? " ✅" : "";
      base += `- \`${s.name}\`${tag} — ${s.description}\n`;
    }
    base += "\nGunakan \`load_skill(<nama>)\` untuk memuat skill.\n";
  }

  if (Object.keys(activeSkills).length > 0) {
    base += "\n---\n## Active Skills\n";
    for (const [name, content] of Object.entries(activeSkills)) {
      base += `\n### ${name}\n${content}\n`;
    }
  }
  return base;
}

const COMMANDS = {
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
};

function handleCommand(cmdLine) {
  const parts = cmdLine.split(/\s+/);
  const cmd = parts[0];

  if (cmd === "/plan") {
    applyMode("plan", "");
    showInfo("Switch ke Plan mode");
    return { handled: true, rebuild: true };
  }
  if (cmd === "/build") {
    applyMode("build", "");
    showInfo("Switch ke Build mode");
    return { handled: true, rebuild: true };
  }
  if (cmd === "/mode") {
    showInfo(`Mode: ${MODE.toUpperCase()}`);
    return { handled: true, rebuild: false };
  }
  if (cmd === "/skill") {
    const name = parts.slice(1).join(" ").trim();
    if (!name) { showInfo("Gunakan: /skill <nama>"); return { handled: true, rebuild: false }; }
    const p = path.join(SKILLS_DIR, `${name}.md`);
    if (!fs.existsSync(p)) { showInfo(`Skill \`${name}\` tidak ditemukan`); return { handled: true, rebuild: false }; }
    activeSkills[name] = fs.readFileSync(p, "utf-8");
    showInfo(`Skill loaded: ${name}`);
    return { handled: true, rebuild: true };
  }
  if (cmd === "/skills") {
    const skills = listSkillsDir();
    if (!skills.length) { showInfo("Tidak ada skill"); return { handled: true, rebuild: false }; }
    const lines = skills.map((s) => `  ${s.name}${activeSkills[s.name] ? " ✅" : ""} — ${s.description}`);
    showInfo("Available skills:\n" + lines.join("\n"));
    return { handled: true, rebuild: false };
  }
  if (cmd === "/unskill") {
    const target = parts.slice(1).join(" ").trim();
    if (!target) { showInfo("Gunakan: /unskill <nama>"); return { handled: true, rebuild: false }; }
    if (target === "all") {
      Object.keys(activeSkills).forEach((k) => delete activeSkills[k]);
      showInfo("Semua skill dihapus");
    } else if (activeSkills[target]) {
      delete activeSkills[target];
      showInfo(`Skill ${target} dihapus`);
    }
    return { handled: true, rebuild: true };
  }
  if (cmd === "/agent") {
    const name = parts.slice(1).join(" ").trim();
    if (!name) { showInfo("Gunakan: /agent <nama>"); return { handled: true, rebuild: false }; }
    const agent = loadAgent(name);
    if (!agent) { showInfo(`Agent \`${name}\` tidak ditemukan`); return { handled: true, rebuild: false }; }
    activeAgent = agent;
    Object.keys(activeSkills).forEach((k) => delete activeSkills[k]);
    showInfo(`Agent: ${agent.description}`);
    return { handled: true, rebuild: true };
  }
  if (cmd === "/agents") {
    const agents = listAgentsDir();
    if (!agents.length) { showInfo("Tidak ada agent"); return { handled: true, rebuild: false }; }
    const lines = agents.map((a) => `  @${a.name}${activeAgent && a.name === activeAgent.name ? " ✅" : ""} — ${a.description}`);
    showInfo("Available agents:\n" + lines.join("\n"));
    return { handled: true, rebuild: false };
  }
  if (cmd === "/default") {
    activeAgent = null;
    Object.keys(activeSkills).forEach((k) => delete activeSkills[k]);
    showInfo("Kembali ke DWCode default");
    return { handled: true, rebuild: true };
  }
  if (cmd === "/exit" || cmd === "/quit") process.exit(0);
  if (cmd === "/clear") return { handled: true, rebuild: true, clear: true };
  if (cmd === "/help") {
    showInfo("Commands: " + Object.entries(COMMANDS).map(([k, v]) => `${k} — ${v}`).join(", "));
    return { handled: true, rebuild: false };
  }
  return { handled: false };
}

async function runConversation(userInput, client, toolSchemas, messages, systemMsg) {
  if (!client) {
    showError("Belum ada API key. Set dulu: dwcode --api-key <key> --model <model>");
    return;
  }
  messages.push({ role: "user", content: userInput });
  showStatus("Mikir...");

  while (true) {
    const history = [systemMsg, ...messages.slice(-30)];
    let textAcc = "";
    let toolCalls = [];
    let hadError = false;

    for await (const event of client.stream(history, toolSchemas)) {
      if (event.type === "text_delta") {
        textAcc += event.content;
        process.stdout.write(event.content);
      } else if (event.type === "tool_calls") {
        toolCalls = event.calls;
        break;
      } else if (event.type === "error") {
        console.log();
        showError(event.content);
        showInfo("Coba lagi / ulang pertanyaan");
        hadError = true;
        break;
      }
    }

    if (hadError) return;
    if (toolCalls.length === 0) {
      if (textAcc) console.log();
      messages.push({ role: "assistant", content: textAcc });
      break;
    }

    console.log();
    const msg = { role: "assistant", content: textAcc || null, tool_calls: [] };
    for (const tc of toolCalls) {
      const tid = tc.id || `call_${Math.random().toString(36).slice(2, 10)}`;
      msg.tool_calls.push({
        id: tid,
        type: "function",
        function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments) },
      });
    }
    messages.push(msg);

    let rebuild = false;
    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = tc.function.arguments;
      const result = await execute(name, args, MODE);
      const tid = tc.id || `call_${Math.random().toString(36).slice(2, 10)}`;
      messages.push({ role: "tool", tool_call_id: tid, content: result });

      if (name === "load_skill") {
        const sn = args.name || "";
        if (sn && !result.includes("tidak ditemukan") && !result.includes("⚠️")) {
          activeSkills[sn] = result;
          rebuild = true;
        }
      } else if (name === "unload_skill") {
        const sn = args.name || "";
        if (sn === "all") { Object.keys(activeSkills).forEach((k) => delete activeSkills[k]); rebuild = true; }
        else if (activeSkills[sn]) { delete activeSkills[sn]; rebuild = true; }
      } else if (name === "load_agent") {
        const agent = loadAgent(args.name || "");
        if (agent) { activeAgent = agent; Object.keys(activeSkills).forEach((k) => delete activeSkills[k]); rebuild = true; }
      }
    }

    if (rebuild) systemMsg.content = rebuildSystem();
    showStatus("Mikir...");
  }
}

async function doctor() {
  const pkgDir = path.resolve(__dirname, "..");
  const dataDir = path.join(pkgDir, "data");
  const userDir = path.join(require("os").homedir(), ".config", "dwcode");
  const lines = [];
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf-8"));
    lines.push(`[OK] Package: dwcode v${pkg.version}`);
  } catch {
    lines.push("[ERR] Package: tidak ditemukan");
  }
  lines.push(`     Lokasi: ${pkgDir}`);

  if (fs.existsSync(dataDir)) {
    const skills = fs.readdirSync(path.join(dataDir, "skills")).filter((f) => f.endsWith(".md"));
    const agents = fs.readdirSync(path.join(dataDir, "agents")).filter((f) => f.endsWith(".md"));
    lines.push(`[OK] Data: data/ ditemukan (${skills.length} skills, ${agents.length} agents)`);
  } else {
    lines.push("[ERR] Data: data/ tidak ditemukan");
  }

  if (fs.existsSync(userDir)) {
    const sDir = path.join(userDir, "skills");
    const aDir = path.join(userDir, "agents");
    const si = fs.existsSync(sDir) ? fs.readdirSync(sDir).filter((f) => f.endsWith(".md")).length : 0;
    const ai = fs.existsSync(aDir) ? fs.readdirSync(aDir).filter((f) => f.endsWith(".md")).length : 0;
    lines.push(`[OK] Config: ~/.config/dwcode/ (${si} skills, ${ai} agents)`);
  } else {
    lines.push("[..] Config: ~/.config/dwcode/ belum ada (akan dibuat saat pertama dwcode jalan)");
  }

  const { execSync } = require("child_process");
  try {
    const which = IS_WINDOWS
      ? execSync("where dwcode", { stdio: "pipe" }).toString().trim()
      : execSync("which dwcode", { stdio: "pipe" }).toString().trim();
    lines.push(`[OK] Entry point: dwcode -> ${which}`);
  } catch {
    lines.push("[OK] Entry point: dwcode (npm global bin)");
    const npmBin = execSync("npm root -g", { stdio: "pipe" }).toString().trim();
    lines.push(`     Global npm: ${path.join(npmBin, ".bin")}`);
  }

  console.log(panel("DWCode Doctor", lines.join("\n"), "blue"));
}

async function update() {
  const { execSync } = require("child_process");
  console.log("⏳ Update DWCode...");
  try {
    execSync("npm install -g dwcode@latest", { stdio: "inherit", timeout: 120000 });
    console.log(panel("DWCode updated!", "", "green"));
  } catch (e) {
    console.log(panel(`Gagal: ${e.message}`, "", "red"));
  }
}

async function main() {
  const program = new Command();
  program
    .name("dwcode")
    .description("DWCode — CLI coding agent dengan mode plan/build")
    .version(require("../package.json").version)
    .option("--base-url <url>", "API base URL")
    .option("--model <model>", "Model name")
    .option("--api-key <key>", "API key")
    .option("-t, --task <task>", "Single task (non-interactive)")
    .option("--update", "Update DWCode ke versi terbaru")
    .option("--doctor", "Cek status instalasi");

  program.parse(process.argv);
  const opts = program.opts();

  if (opts.update) return await update();
  if (opts.doctor) return await doctor();

  const cfg = load();
  if (opts.baseUrl) cfg.base_url = opts.baseUrl;
  if (opts.model) cfg.model = opts.model;
  if (opts.apiKey) cfg.api_key = opts.apiKey;

  if (opts.baseUrl || opts.model || opts.apiKey) {
    save({
      base_url: opts.baseUrl || cfg.base_url,
      api_key: opts.apiKey || cfg.api_key,
      model: opts.model || cfg.model,
    });
  }

  let client = null;
  let toolSchemas = null;

  if (!cfg.api_key) {
    console.log(panel(
      "DWCode — First Run",
      "Belum ada API key & model.\n\n" +
      "Ketik di terminal:\n\n" +
      "  dwcode --api-key <api_key_9router> --model <nama_model>\n\n" +
      "Contoh:\n" +
      "  dwcode --api-key sk-xxx --model Gratis\n\n" +
      "Atau pake env:\n" +
      "  export DWCODE_API_KEY=sk-xxx\n" +
      "  export DWCODE_MODEL=Gratis\n" +
      "  dwcode\n\n" +
      "Command: /exit — keluar    /help — bantuan",
      "yellow"
    ));
  } else {
    client = new LLMClient(cfg.base_url, cfg.api_key, cfg.model);
    toolSchemas = getSchemas();
  }

  MODE = "plan";
  setPromptMode(MODE);
  showHeader(MODE, cfg.model);

  const messages = [];
  const systemMsg = { role: "system", content: buildSystem(MODE) };
  const allWords = reloadCompletions();

  if (opts.task) {
    await runConversation(opts.task, client, toolSchemas, messages, systemMsg);
    return;
  }

  while (true) {
    let userInput;
    try {
      userInput = await getInput(allWords);
    } catch {
      break;
    }
    if (userInput === null || userInput === undefined) break;
    if (!userInput) continue;

    if (userInput.startsWith("/")) {
      const result = handleCommand(userInput);
      if (result.handled) {
        const cmd = userInput.trim().split(/\s+/)[0];
        if (result.rebuild) systemMsg.content = rebuildSystem();
        if (result.clear) {
          messages.length = 0;
          Object.keys(activeSkills).forEach((k) => delete activeSkills[k]);
          activeAgent = null;
          systemMsg.content = rebuildSystem();
          showInfo("Conversation dihapus");
        }
        if (["/plan", "/build", "/skill", "/unskill", "/agent", "/default"].includes(cmd)) {
          if (messages.length > 0 && messages[0].role === "system") {
            messages[0] = systemMsg;
          }
          if (cmd === "/plan" || cmd === "/build") {
            const label = cmd === "/plan" ? "PLAN" : "BUILD";
            messages.push({ role: "user", content: cmd });
            messages.push({ role: "assistant", content: `✅ Mode diubah ke **${label}**. Sekarang kamu bisa minta apa saja.` });
          }
        }
      }
      continue;
    }

    await runConversation(userInput, client, toolSchemas, messages, systemMsg);
  }
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
