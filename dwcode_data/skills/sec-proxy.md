---
name: proxy
description: Proxy configuration for security testing — env vars, tool flags, rotation, auth proxy, SSH tunnel, VPN killswitch, leak verification.
---

# Proxy Toolkit

## Index

| # | Kategori | Isi |
|---|----------|-----|
| 1 | Environment Proxy | HTTP_PROXY, HTTPS_PROXY, NO_PROXY global |
| 2 | Tool Proxy Flags | curl, ffuf, nuclei, httpx, naabu, katana, subfinder |
| 3 | Auth Proxy | Basic auth, NTLM, Bearer token via proxy |
| 4 | Proxy Rotation | Multi-proxy list, round-robin via proxychains |
| 5 | SSH Tunnel | Dynamic SOCKS, local/remote forward |
| 6 | VPN Killswitch | iptables rules prevent IP leak |
| 7 | Burp/ZAP Config | Intercept, scope, cert install, browser config |
| 8 | Verifikasi | Cek IP publik, DNS leak test, WebRTC leak |

---

## 1 — Environment Proxy

```bash
# Set global proxy (bashrc/profile)
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080
export http_proxy=http://127.0.0.1:8080
export https_proxy=http://127.0.0.1:8080

# Exclude internal networks
export NO_PROXY=localhost,127.0.0.1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
export no_proxy=$NO_PROXY

# Quick toggle
alias proxy-on='export HTTP_PROXY=http://127.0.0.1:8080; export HTTPS_PROXY=http://127.0.0.1:8080'
alias proxy-off='unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy'

# Per-command proxy
HTTP_PROXY=http://127.0.0.1:8080 curl -s https://ifconfig.me
```

---

## 2 — Tool Proxy Flags

```bash
# curl
curl -x http://127.0.0.1:8080 https://target.com
curl --proxy http://user:pass@127.0.0.1:8080 https://target.com

# ffuf
ffuf -u https://target.com/FUZZ -w wordlist.txt -x http://127.0.0.1:8080

# nuclei
nuclei -u https://target.com -proxy http://127.0.0.1:8080

# httpx
httpx -l targets.txt -proxy http://127.0.0.1:8080

# naabu
naabu -host target.com -proxy http://127.0.0.1:8080

# katana
katana -u https://target.com -proxy http://127.0.0.1:8080

# subfinder
subfinder -d target.com -proxy http://127.0.0.1:8080

# gau
gau --proxy http://127.0.0.1:8080 target.com

# waybackurls
waybackurls -proxy http://127.0.0.1:8080 target.com
```

---

## 3 — Auth Proxy

```bash
# Basic auth in URL
export HTTP_PROXY=http://user:password@127.0.0.1:8080
export HTTPS_PROXY=http://user:password@127.0.0.1:8080

# Basic auth via flag
curl -x http://127.0.0.1:8080 --proxy-user user:password https://target.com

# NTLM proxy
curl -x http://127.0.0.1:8080 --proxy-ntlm --proxy-user DOMAIN\\user:password https://target.com

# Bearer token (custom header)
curl -x http://127.0.0.1:8080 -H "Proxy-Authorization: Bearer TOKEN" https://target.com

# socks5 auth (if needed later)
# curl --socks5 user:password@127.0.0.1:1080 https://target.com
```

---

## 4 — Proxy Rotation

```bash
# proxychains — round-robin via proxy list
# Edit /etc/proxychains.conf:
#   strict_chain
#   round_robin
#   [ProxyList]
#   http 127.0.0.1 8080
#   http 127.0.0.1 8081
#   http 127.0.0.1 8082

proxychains curl https://ifconfig.me
proxychains ffuf -u https://target.com/FUZZ -w wordlist.txt

# Manual rotation with bash
proxies=("http://127.0.0.1:8080" "http://127.0.0.1:8081" "http://127.0.0.1:8082")
for i in $(seq 1 10); do
  proxy=${proxies[$((i % ${#proxies[@]}))]}
  curl -x "$proxy" -s https://ifconfig.me
done

# Random proxy from list
shuf -n 1 proxies.txt | xargs -I{} curl -x {} -s https://ifconfig.me

# ffuf with proxy file
ffuf -u https://target.com/FUZZ -w wordlist.txt -x http://127.0.0.1:8080
# Use external proxy rotator (e.g. mitmproxy relay)
```

---

## 5 — SSH Tunnel

```bash
# Dynamic SOCKS proxy via SSH
ssh -D 1080 -C -N user@vps-server

# Then point tools to SOCKS:
curl --socks5 127.0.0.1:1080 https://ifconfig.me

# Local port forward (specific port)
ssh -L 8080:internal-target.com:80 -N user@jumphost

# Remote port forward (expose local to remote)
ssh -R 9000:127.0.0.1:8080 -N user@vps-server

# Persistent tunnel with autossh
autossh -M 0 -D 1080 -C -N user@vps-server

# Multi-hop
ssh -J user@gateway1 -D 1080 -N user@internal-server
```

---

## 6 — VPN Killswitch

```bash
# iptables — block all traffic if VPN interface goes down

# Allow only through VPN interface (e.g. tun0)
iptables -A OUTPUT -o tun0 -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT  # DNS via VPN
iptables -A OUTPUT -j DROP

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Flush rules (emergency undo)
iptables -F
iptables -P INPUT ACCEPT
iptables -P OUTPUT ACCEPT

# Check current rules
iptables -L -v

# ufw alternative
ufw default deny outgoing
ufw allow out on tun0
ufw enable
```

---

## 7 — Burp/ZAP Config

```bash
# Burp — set proxy listener 127.0.0.1:8080
# 1. Proxy → Proxy Listeners → Add: 127.0.0.1:8080
# 2. Proxy → Options → Response Modification → Add "Access-Control-Allow-Origin: *"
# 3. Install CA cert: http://burp → download cacert.der → trust

# ZAP — set proxy 127.0.0.1:8080
# Tools → Options → Local Proxies → Address: 127.0.0.1 Port: 8080
# Tools → Options → Network → Connection → Use proxy chain

# Export Burp CA for tools
curl -x http://127.0.0.1:8080 -o burp-ca.der http://burp/cert
openssl x509 -inform DER -in burp-ca.der -out burp-ca.pem
export NODE_EXTRA_CA_CERTS=$PWD/burp-ca.pem  # for node.js tools

# Headless browser via proxy
google-chrome --proxy-server=http://127.0.0.1:8080 --ignore-certificate-errors
chromium --proxy-server=http://127.0.0.1:8080 --ignore-certificate-errors

# Scope config for Burp
# Proxy → Scope → Include: *.target.com
# Exclude: *.google-analytics.com, *.doubleclick.net

# ZAP scope
# Right-click target → Add to Context → Default Context → Include in Context
```

---

## 8 — Verifikasi

```bash
# Cek IP publik via proxy
curl -x http://127.0.0.1:8080 -s https://ifconfig.me
curl -x http://127.0.0.1:8080 -s https://api.ipify.org
curl -x http://127.0.0.1:8080 -s https://checkip.amazonaws.com

# Cek proxy headers (X-Forwarded-For leakage)
curl -x http://127.0.0.1:8080 -s https://httpbin.org/headers

# DNS leak test
curl -x http://127.0.0.1:8080 -s https://dnsleaktest.com
dig +short myip.opendns.com @resolver1.opendns.com  # via proxy DNS?

# WebRTC leak check
# Buka browser: https://browserleaks.com/webrtc

# Full leak check suite
curl -x http://127.0.0.1:8080 -s https://ipleak.net
curl -x http://127.0.0.1:8080 -s https://ipx.ac
```

---

## Live Testing — Append New Findings

> **Aturan:** Saat live testing nemu teknik proxy BARU, tambah entry baru di sini. **JANGAN edit/hapus entry lama.**

### [N+1] — Nama Teknik Baru

**Target:** ...
**Tool:** ...
**Command:** ...
**Catatan:** ...
