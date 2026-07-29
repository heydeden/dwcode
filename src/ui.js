"use strict";
const readline = require("readline/promises");
const { stdin, stdout } = require("process");
const chalk = require("chalk");
const { marked } = require("marked");
const { AGENTS_DIRS } = require("./config.js");
const fs = require("fs");
const path = require("path");

const SLASH_COMMANDS = ["/plan", "/build", "/mode", "/skill", "/skills", "/unskill", "/agent", "/agents", "/default", "/clear", "/help", "/exit"];

const PROMPT_EMOJIS = { plan: "?", build: ">" };

function buildCompletions() {
  const words = [...SLASH_COMMANDS];
  const seen = new Set(SLASH_COMMANDS);
  for (const d of AGENTS_DIRS) {
    if (fs.existsSync(d)) {
      for (const f of fs.readdirSync(d).filter((x) => x.endsWith(".md")).sort()) {
        const name = "@" + f.slice(0, -3);
        if (!seen.has(name)) {
          seen.add(name);
          words.push(name);
        }
      }
    }
  }
  return words;
}

function completer(line, allWords) {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith("/") && !trimmed.startsWith("@")) return [[], line];
  const matches = allWords.filter((w) => w.startsWith(trimmed));
  return [matches, line];
}

let _promptMode = "plan";

function setPromptMode(mode) {
  _promptMode = mode;
}

function reloadCompletions() {
  return buildCompletions();
}

function panel(title, content, borderColor = "blue") {
  const borderChars = { blue: chalk.blue, green: chalk.green, red: chalk.red, yellow: chalk.yellow, dim: chalk.dim };
  const b = borderChars[borderColor] || chalk.blue;
  const titleStr = title ? ` ${title} ` : "";
  const contentLines = content.split("\n");
  const maxInner = Math.max(
    titleStr.length,
    ...contentLines.map((l) => stripAnsi(l).length)
  );
  const width = Math.min(maxInner + 4, 80);
  const borderLine = b("\u2500".repeat(width));
  let result = `${borderLine}\n`;
  if (title) result += `${b(title)}\n`;
  for (const l of contentLines) {
    result += `${b("\u2502")} ${l.padEnd(width - 2)}\n`;
  }
  result += borderLine;
  return result;
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*[mK]/g, "");
}

function showHeader(mode, model) {
  console.log(panel("DWCode", `Model: ${chalk.bold(model)}          Mode: ${chalk.green("● " + mode.toUpperCase())}`, "blue"));
}

function showStatus(msg) {
  console.log(panel("...", msg, "dim"));
}

function showInfo(msg) {
  console.log(panel("i", msg, "dim"));
}

function showError(msg) {
  console.log(chalk.red(panel("Error", String(msg), "red")));
}

function renderMarkdown(text) {
  try {
    if (require("marked-terminal")) {
      return marked(text, { renderer: require("marked-terminal") });
    }
  } catch {}
  return text;
}

async function getInput(allWords) {
  const rl = readline.createInterface({
    input: stdin,
    output: stdout,
    completer: (line) => completer(line, allWords),
  });

  const emoji = PROMPT_EMOJIS[_promptMode] || ">";
  try {
    const answer = await rl.question(`${emoji} ${_promptMode} > `);
    return answer.trim();
  } catch {
    return null;
  } finally {
    rl.close();
  }
}

module.exports = {
  setPromptMode,
  reloadCompletions,
  showHeader,
  showStatus,
  showInfo,
  showError,
  getInput,
  renderMarkdown,
  panel,
  SLASH_COMMANDS,
};
