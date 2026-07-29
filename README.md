# DWCode

CLI coding agent di terminal — mode PLAN (read-only) dan BUILD (full access). Multi-agent, skill system, autocomplete.

Cross-platform: **Linux · Termux · Windows (PowerShell)**.

---

## Install

### Semua OS (Linux / Termux / Windows)

Persyaratan: **Node.js 18+**

```bash
# Install 9router (proksi wajib)
npm install -g 9router

# Install DWCode — langsung global, otomatis di PATH
npm install -g git+https://github.com/heydeden/dwcode
```

### Local install

```bash
git clone https://github.com/heydeden/dwcode
cd dwcode
npm install -g .
```

---

## API Key

3 cara (prioritas: env > flag > file):

```bash
# 1. Environment variable (Linux/Termux)
export DWCODE_API_KEY=sk-xxx
export DWCODE_MODEL=Gratis

# 1. Environment variable (PowerShell)
$env:DWCODE_API_KEY="sk-xxx"
$env:DWCODE_MODEL="Gratis"

# 2. CLI flag (1 baris)
dwcode --api-key sk-xxx --model Gratis

# 3. Config file
# ~/.config/dwcode/config.json
```

Config file `~/.config/dwcode/config.json`:

```json
{
  "base_url": "http://127.0.0.1:20128/v1",
  "api_key": "sk-xxx",
  "model": "Gratis"
}
```

Environment variables:

| Variable | Default |
|---|---|
| `DWCODE_API_KEY` | — |
| `DWCODE_BASE_URL` | `http://127.0.0.1:20128/v1` |
| `DWCODE_MODEL` | `Gratis` |

## Cara pake

```bash
dwcode                                         # interactive mode
dwcode --api-key sk-xxx --model Gratis         # + override key & model
dwcode -t "baca file config.py"                # single task (non-interactive)
dwcode --doctor                                # cek status instalasi
dwcode --update                                # update ke versi terbaru
```

## Commands

| Command | Fungsi |
|---|---|
| `/plan` | Plan mode (read-only) |
| `/build` | Build mode (full access) |
| `/mode` | Lihat mode |
| `/skill <nama>` | Load skill |
| `/skills` | List skill |
| `/unskill <nama>` | Unload skill |
| `/agent <nama>` | Switch agent |
| `/agents` | List agent |
| `/default` | Kembali ke default |
| `/clear` | Reset conversation |
| `/help` | Help |
| `/exit` | Exit |

## Agent

Tersedia: `@sec-bounty`, `@sec-web`, `@sec-polar`, `@fullstack-developer`.

Panggil dengan `/agent <nama>` atau ketik `@nama` di chat (autocomplete).

## Skill

Skill adalah panduan teknis siap pakai (7 skill: sec-api, sec-recon, sec-exploit, sec-cloud, sec-bypass, sec-proxy, md2pdf). Load dengan `load_skill(nama)` — AI otomatis pake skill yang relevan.

## License

MIT

Copyright (c) 2026 Deden Wirjadinata
