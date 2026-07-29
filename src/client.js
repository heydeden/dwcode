"use strict";
const OpenAI = require("openai");

function cleanError(raw) {
  const s = String(raw).slice(0, 500);
  const m1 = s.match(/"message":"([^"]+)"/);
  if (m1) return m1[1];
  const m2 = s.match(/'message': '([^']+)'/);
  if (m2) return m2[1];
  return s.slice(0, 200);
}

class LLMClient {
  constructor(baseUrl, apiKey, model) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.model = model;
    this.client = new OpenAI({ baseURL: baseUrl, apiKey });
  }

  async check() {
    try {
      await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      });
      return [true, ""];
    } catch (err) {
      if (err.status === 401) return [false, "API key ditolak (401)"];
      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND")
        return [false, "Server tidak bisa dihubungi"];
      if (err.status && err.status !== 401)
        return [true, ""];
      return [false, cleanError(err).slice(0, 200)];
    }
  }

  buildTools(toolSchemas) {
    if (!toolSchemas || toolSchemas.length === 0) return undefined;
    return toolSchemas.map((s) => ({
      type: "function",
      function: s,
    }));
  }

  async *stream(messages, toolSchemas) {
    const tools = this.buildTools(toolSchemas);
    const kwargs = {
      model: this.model,
      messages,
      stream: true,
    };
    if (tools) {
      kwargs.tools = tools;
      kwargs.tool_choice = "auto";
    }

    const retries = 5;
    let response;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        response = await this.client.chat.completions.create(kwargs);
        break;
      } catch (err) {
        if (err.status === 401) {
          yield { type: "error", content: "⚠️ API key ditolak (401)" };
          return;
        }
        if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
          if (attempt < retries - 1) {
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }
          yield { type: "error", content: `⚠️ Gagal terhubung ke ${this.baseUrl}` };
          return;
        }
        if (err.status && [400, 408, 429, 500, 502, 503].includes(err.status)) {
          if (attempt < retries - 1) {
            const delay = 3000 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          const msg = cleanError(err.message);
          yield { type: "error", content: `⚠️ ${msg} (HTTP ${err.status}), coba lagi nanti` };
          return;
        }
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        yield { type: "error", content: `⚠️ ${cleanError(err)}` };
        return;
      }
    }

    let text = "";
    const toolCalls = {};

    for await (const chunk of response) {
      if (!chunk.choices || chunk.choices.length === 0) continue;
      const delta = chunk.choices[0].delta;
      const finish = chunk.choices[0].finish_reason;

      if (delta && delta.content) {
        text += delta.content;
        yield { type: "text_delta", content: delta.content };
      }

      if (delta && delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls[idx]) {
            toolCalls[idx] = { id: "", function: { name: "", arguments: "" } };
          }
          if (tc.id) toolCalls[idx].id += tc.id;
          if (tc.function) {
            if (tc.function.name) toolCalls[idx].function.name += tc.function.name;
            if (tc.function.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
          }
        }
      }

      if (finish === "tool_calls") break;
    }

    if (Object.keys(toolCalls).length > 0) {
      const calls = Object.values(toolCalls);
      for (const c of calls) {
        try {
          c.function.arguments = JSON.parse(c.function.arguments);
        } catch {
          c.function.arguments = {};
        }
      }
      yield { type: "tool_calls", calls };
    } else {
      yield { type: "done", content: text };
    }
  }
}

module.exports = { LLMClient };
