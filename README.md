# DWCode

CLI coding agent di terminal — mode PLAN (read-only) dan BUILD (full access). Multi-agent, skill system, autocomplete.

## Prerequisites — 9router (wajib)

```bash
npm install -g 9router
```

Jalankan manual tiap mau pake:
```bash
node /usr/local/lib/node_modules/9router/cli.js --tray --skip-update -p 20128
```

## Termux

```bash
pkg update
pkg install rust binutils python-pip
pip install git+https://github.com/heydeden/dwcode
```

Rust diperlukan karena dependency `jiter` perlu di-compile. Ini cuma sekali, berikutnya langsung cepet.

```bash
# Install 9router
pkg install nodejs
npm install -g 9router

# Jalankan 9router
node /data/data/com.termux/files/usr/lib/node_modules/9router/cli.js --tray --skip-update -p 20128

# Jalankan DWCode
dwcode --api-key sk-xxx
```

## Install

```bash
pip install git+https://github.com/heydeden/dwcode
```

Atau lokal:
```bash
git clone https://github.com/heydeden/dwcode
cd dwcode
pip install .
```

## API Key

3 cara (prioritas: env > flag > file):

```bash
# 1. Environment variable
export DWCODE_API_KEY=sk-xxx
dwcode

# 2. CLI flag
dwcode --api-key sk-xxx

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
dwcode                             # interactive mode
dwcode -t "baca file config.py"    # single task
dwcode --api-key sk-xxx            # override API key
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
