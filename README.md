# DWCode

CLI coding agent di terminal — mode PLAN (read-only) dan BUILD (full access). Multi-agent, skill system, autocomplete.

Cross-platform: **Linux · Termux · Windows (PowerShell)**.

---

## Install

### Linux (Debian/Ubuntu)

```bash
# Install 9router (wajib)
npm install -g 9router

# Install DWCode
pip install git+https://github.com/heydeden/dwcode

# Kalau kena externally-managed-environment:
pip install --break-system-packages git+https://github.com/heydeden/dwcode
```

Jalankan 9router:
```bash
node /usr/local/lib/node_modules/9router/cli.js --tray --skip-update -p 20128
```

### Termux (Android)

```bash
# Update & install dependencies
pkg update && pkg install rust binutils python-pip nodejs

# Install 9router
npm install -g 9router

# Install DWCode
pip install git+https://github.com/heydeden/dwcode
```

> Rust diperlukan karena dependency `jiter` perlu di-compile. Cuma sekali, berikutnya langsung cepet.

Jalankan 9router:
```bash
node /data/data/com.termux/files/usr/lib/node_modules/9router/cli.js --tray --skip-update -p 20128
```

### Windows (PowerShell)

```powershell
# Install Python 3.10+ dari https://python.org — pastikan "Add to PATH" dicentang

# Install 9router
npm install -g 9router

# Install DWCode
pip install git+https://github.com/heydeden/dwcode
```

Jalankan 9router:
```powershell
node "$(Get-Command node).Source.Replace('node.exe', '')node_modules\9router\cli.js" --tray --skip-update -p 20128
```

Atau cari path `9router/cli.js` manual di `%APPDATA%\npm\node_modules\9router\`.

### Local install (semua OS)

```bash
git clone https://github.com/heydeden/dwcode
cd dwcode
pip install .
```

---

## API Key

3 cara (prioritas: env > flag > file):

```bash
# 1. Environment variable
export DWCODE_API_KEY=sk-xxx          # Linux/Termux
export DWCODE_MODEL=Gratis
$env:DWCODE_API_KEY="sk-xxx"          # PowerShell
$env:DWCODE_MODEL="Gratis"
dwcode

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
