"use strict";
const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "..", "data");

function loadMarkdown(dir) {
  const result = {};
  const fullPath = path.join(dataDir, dir);
  if (!fs.existsSync(fullPath)) return result;
  for (const f of fs.readdirSync(fullPath)) {
    if (f.endsWith(".md")) {
      const name = f.slice(0, -3);
      result[name] = fs.readFileSync(path.join(fullPath, f), "utf-8");
    }
  }
  return result;
}

const DEFAULT_SKILLS = loadMarkdown("skills");
const DEFAULT_AGENTS = loadMarkdown("agents");

module.exports = { DEFAULT_SKILLS, DEFAULT_AGENTS };
