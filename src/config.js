"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, ".config", "dwcode");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const SKILLS_DIR = path.join(CONFIG_DIR, "skills");
const AGENTS_DIRS = [
  path.join(CONFIG_DIR, "agents"),
  "/home/userland/.config/dwcode/agents",
  "/root/.config/dwcode/agents",
  path.join(process.env.USERPROFILE || path.join("C:", "Users", "Default"), ".config", "dwcode", "agents"),
];

const SKILL_VERSION = "2";

const DEFAULT = {
  base_url: "http://127.0.0.1:20128/v1",
  api_key: "",
  model: "Gratis",
};

function getDataDir() {
  const pkgDir = path.resolve(__dirname, "..");
  return path.join(pkgDir, "data");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function copyDirSync(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function writeDefaults(destDir, dataDict) {
  ensureDir(destDir);
  for (const [name, content] of Object.entries(dataDict)) {
    fs.writeFileSync(path.join(destDir, `${name}.md`), content, "utf-8");
  }
}

function ensureData() {
  let userDir = CONFIG_DIR;
  if (process.platform === "win32" && !fs.existsSync(userDir)) {
    const alt = path.join(
      process.env.USERPROFILE || path.join("C:", "Users", "Default"),
      ".config", "dwcode"
    );
    if (fs.existsSync(alt)) userDir = alt;
  }

  const skillsDest = path.join(userDir, "skills");
  const agentsDest = path.join(userDir, "agents");
  const versionFile = path.join(userDir, ".version");

  const prevVersion = fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, "utf-8").trim()
    : "";

  const needsRefresh = prevVersion !== SKILL_VERSION;

  if (!fs.existsSync(skillsDest) || needsRefresh) {
    removeDir(skillsDest);
    const dataSkills = path.join(getDataDir(), "skills");
    if (fs.existsSync(dataSkills)) {
      ensureDir(path.dirname(skillsDest));
      copyDirSync(dataSkills, skillsDest);
    } else {
      const { DEFAULT_SKILLS } = require("./embed.js");
      writeDefaults(skillsDest, DEFAULT_SKILLS);
    }
  }

  if (!fs.existsSync(agentsDest) || needsRefresh) {
    removeDir(agentsDest);
    const dataAgents = path.join(getDataDir(), "agents");
    if (fs.existsSync(dataAgents)) {
      ensureDir(path.dirname(agentsDest));
      copyDirSync(dataAgents, agentsDest);
    } else {
      const { DEFAULT_AGENTS } = require("./embed.js");
      writeDefaults(agentsDest, DEFAULT_AGENTS);
    }
  }

  if (needsRefresh) {
    ensureDir(userDir);
    fs.writeFileSync(versionFile, SKILL_VERSION, "utf-8");
  }
}

function load() {
  ensureData();

  let fileCfg = {};
  if (fs.existsSync(CONFIG_FILE)) {
    fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }

  const cfg = { ...DEFAULT, ...fileCfg };

  const envKey = process.env.DWCODE_API_KEY;
  const envUrl = process.env.DWCODE_BASE_URL;
  const envModel = process.env.DWCODE_MODEL;

  if (envKey) cfg.api_key = envKey;
  if (envUrl) cfg.base_url = envUrl;
  if (envModel) cfg.model = envModel;

  return cfg;
}

function save(cfg) {
  ensureDir(path.dirname(CONFIG_FILE));
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf-8");
}

module.exports = {
  CONFIG_DIR,
  CONFIG_FILE,
  SKILLS_DIR,
  AGENTS_DIRS,
  SKILL_VERSION,
  DEFAULT,
  getDataDir,
  ensureData,
  load,
  save,
  ensureDir,
};
