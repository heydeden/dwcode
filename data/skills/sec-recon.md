---
name: web-recon
description: OSINT, subdomain enumeration, DNS recon, port scanning, technology fingerprinting, Google dorking, JS endpoint discovery, and directory fuzzing. First phase of any web assessment.
---

# Web Recon Toolkit

## Index

| # | Kategori | Isi |
|---|----------|-----|
| 1 | Subdomain Enumeration | subfinder, amass, dnsx, crt.sh |
| 2 | DNS Recon | dig, nslookup, dnsrecon, zone transfer |
| 3 | Port Scanning | naabu, rustscan, masscan |
| 4 | Tech Fingerprint | whatweb, wappalyzer, nuclei tech |
| 5 | OSINT | Google dorks, Shodan, Censys |
| 6 | Wayback/Archive | waybackurls, gau, katana |
| 7 | JS Endpoint Discovery | subjs, JS miner, source maps |
| 8 | Directory Fuzzing | ffuf, gobuster, dirsearch |
| 9 | CMS Detection | wpscan, joomscan, droopescan |
| 10 | Email/Employee Recon | theharvester, hunter.io, phonebook |

---

## 1 — Subdomain Enumeration

```bash
# Passive
subfinder -d target.com -o subdomains.txt
amass enum -passive -d target.com -o amass.txt

# Certificate transparency
curl -s "https://crt.sh/?q=%25.target.com&output=json" | jq -r '.[].name_value' | sort -u

# DNS brute force
dnsx -d target.com -w /usr/share/wordlists/subdomains.txt -o subs-resolved.txt

# All in one
subfinder -d target.com | dnsx -a -o live-subs.txt
```

---

## 2 — DNS Recon

```bash
# Basic records
dig target.com A +short
dig target.com AAAA +short
dig target.com MX +short
dig target.com NS +short
dig target.com TXT +short
dig target.com CNAME +short

# Zone transfer (rarely works but always try)
dig axfr @ns1.target.com target.com

# Reverse DNS
dig -x 1.2.3.4 +short

# Wildcard detection
dnsx -d target.com -w <(echo "randomstring123xyz")

# DNS brute force via dnsrecon
dnsrecon -d target.com -D /usr/share/wordlists/subdomains.txt -t brt
```

---

## 3 — Port Scanning

```bash
# Fast top 1000 (naabu — no root)
naabu -host target.com -top-ports 1000 -o ports.txt

# Full port scan
naabu -host target.com -p - -rate 1000 -o all-ports.txt

# Custom port list (web + management)
naabu -host target.com -p 80,443,8080,8443,9090,3000,4443,22,21,3306,6379

# Service detection
naabu -host target.com -top-ports 100 -scan -o ports-scan.txt

# Bash fallback (if naabu not available)
for port in 80 443 8080 8443 22 21 3306 6379 27017; do
  timeout 2 bash -c "echo > /dev/tcp/target.com/$port" 2>/dev/null && echo "OPEN: $port"
done
```

---

## 4 — Technology Fingerprinting

```bash
# whatweb
whatweb https://target.com -a 3 --log-verbose=whatweb.txt

# httpx (bulk)
httpx -l live-subs.txt -tech-detect -status-code -title -o tech.txt

# nuclei tech detection
nuclei -l live-subs.txt -tags tech -o nuclei-tech.txt

# Manual headers
curl -sI https://target.com | grep -iE 'server|x-powered|set-cookie|cf-ray|x-amzn'

# WAF detection
wafw00f https://target.com
```

---

## 5 — OSINT

### Google Dorks

```bash
# Common dork patterns
site:target.com intitle:"index of"
site:target.com inurl:admin
site:target.com ext:env
site:target.com ext:xml | ext:conf | ext:sql
site:target.com inurl:wp-content
site:target.com "password" | "secret" | "api_key"
site:target.com filetype:pdf
site:target.com intitle:"Dashboard" | intitle:"Login"
site:target.com inurl:?id=
site:target.com inurl:debug | inurl:test | inurl:dev
```

### Shodan

```bash
# CLI search (if API key configured)
shodan search "hostname:target.com"
shodan search "ssl:target.com"
shodan search "org:\"Target Inc.\""

# Common filters
net:1.2.3.0/24
port:22,443,8080 country:US
```

### Censys

```bash
curl -s "https://search.censys.io/api/v2/hosts/search?q=target.com"
```

---

## 6 — Wayback/Archive Discovery

```bash
# URLs from Wayback Machine
waybackurls target.com > wayback.txt
gau --subs target.com > gau.txt

# Filter endpoints
cat wayback.txt | grep -E '\.js$|\.php$|api|admin|graphql' | sort -u
cat wayback.txt | grep -iE 'id=|page=|file=|url=|redirect=|return='

# Katana crawl
katana -u https://target.com -d 3 -jc -o endpoints.txt
katana -u https://target.com -d 2 -f qurl -o params.txt

# Filter live endpoints
httpx -l wayback.txt -mc 200,301,302,403 -o live-endpoints.txt
```

---

## 7 — JS Endpoint Discovery

```bash
# Extract JS files
subjs -i live-subs.txt -o js-files.txt

# Download and analyze
while read url; do
  curl -s "$url" | grep -oP '(https?://[^"'\''<>]+)' | sort -u >> js-endpoints.txt
done < js-files.txt

# Source map discovery
curl -s "https://target.com/static/js/main.js.map" | jq '.sources[]' 2>/dev/null

# API endpoints from JS
grep -oP '"/api/[^"]+' js-endpoints.txt | sort -u
grep -oP '["'\''](/v[0-9]/[^"'\'']+)["'\'']' js-endpoints.txt | sort -u

# Hardcoded secrets in JS
grep -oP '(?:sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[a-zA-Z0-9_-]+\.eyJ)' js-endpoints.txt | sort -u
```

---

## 8 — Directory Fuzzing

```bash
# Directory brute force
ffuf -u https://target.com/FUZZ -w /usr/share/wordlists/dirb/common.txt -o dirs.json
ffuf -u https://target.com/FUZZ -w /usr/share/wordlists/directory-list-2.3-medium.txt -recursion

# Extension filter
ffuf -u https://target.com/FUZZ -w dirs.txt -e .php,.asp,.aspx,.jsp,.json,.xml

# VHost discovery
ffuf -u https://target.com -H "Host: FUZZ.target.com" -w /usr/share/wordlists/subdomains.txt

# Parameter fuzzing
ffuf -u "https://target.com/page?FUZZ=test" -w /usr/share/wordlists/params.txt
ffuf -u "https://target.com/api/resource?FUZZ=1" -w /usr/share/wordlists/params.txt

# gobuster
gobuster dir -u https://target.com -w /usr/share/wordlists/dirb/common.txt
gobuster vhost -u https://target.com -w /usr/share/wordlists/subdomains.txt
```

---

## 9 — CMS Detection

```bash
# WordPress
wpscan --url https://target.com --enumerate u,vp,vt --api-token $WPSCAN_TOKEN

# Joomla
joomscan -u https://target.com

# Drupal
droopescan scan drupal -u https://target.com

# General CMS
whatweb https://target.com | grep -iE 'wordpress|joomla|drupal|magento|shopify'
```

---

## 10 — Email/Employee Recon

```bash
# theHarvester
theHarvester -d target.com -b google,linkedin,bing,crtsh -f harvester.html

# DNS-based email
dig target.com MX +short
dig target.com TXT +short | grep -i spf

# Common email patterns
# admin@target.com, info@target.com, contact@target.com
# first.last@target.com, firstl@target.com
```

---

## Live Testing — Append New Findings

> **Aturan:** Saat live testing nemu teknik recon BARU, tambah entry baru di sini. **JANGAN edit/hapus entry lama.**

### [N+1] — REST API Namespace Discovery (WordPress)

**Target:** WordPress REST API
**Tool:** curl, jq
**Command:**
```bash
# Daftar semua namespace REST API
curl -s "https://target.com/wp-json/" | jq '.namespaces'

# Cek endpoint spesifik per namespace
for ns in $(curl -s "https://target.com/wp-json/" | jq -r '.namespaces[]'); do
  echo "=== $ns ==="
  curl -s "https://target.com/wp-json/$ns"
done

# Cari custom post types (plugin/theme)
curl -s "https://target.com/wp-json/wp/v2/types" | jq 'keys'

# Cek endpoint spesifik yang sering terlewat
curl -s "https://target.com/wp-json/awb/rendered_content"       # Avada Builder
curl -s "https://target.com/wp-json/awb/instagram/media"        # Avada Instagram
curl -s "https://target.com/wp-json/rttpg/v1"                    # The Post Grid
curl -s "https://target.com/wp-json/smart-slider-3/v1"           # Smart Slider 3
curl -s "https://target.com/wp-json/batch/v1"                    # WP Batch API
```
**Catatan:** REST API index (`/wp-json/`) sering terekspos penuh meski WAF proteksi path lain. Cari namespace plugin/theme yang tidak umum — banyak yang lupa di-auth. Custom post types (`/wp/v2/types`) juga bisa bocor.

### [N+2] — OIDC SSO Discovery via .well-known

**Target:** OIDC Identity Provider
**Tool:** curl
**Command:**
```bash
# 1. OIDC Discovery — mapping semua endpoint
curl -s "https://accounts.target.com/.well-known/openid-configuration" | jq .
# Dapatkan: authorization_endpoint, token_endpoint, userinfo_endpoint, jwks_uri
# registration_endpoint, device_authorization_endpoint, introspection_endpoint, revocation_endpoint

# 2. OAuth server metadata
curl -s "https://accounts.target.com/.well-known/oauth-authorization-server"

# 3. JWKS — public signing key
curl -s "https://accounts.target.com/identity/jwks.json" | jq .

# 4. Cek semua endpoint umum
for path in /.well-known/openid-configuration /.well-known/oauth-authorization-server \
  /identity/jwks.json /identity/token /identity/userinfo /identity/authorize \
  /identity/register /identity/device_authorization /identity/introspect \
  /identity/revoke /identity/logout /security/login /security/register; do
  echo "=== $path ==="
  curl -sI "https://accounts.target.com$path" | head -1
done

# 5. Dapatkan client_id dari halaman login atau redirect
# Cari parameter client_id di URL redirect atau source HTML login page
curl -s "https://accounts.target.com/security/login" | grep -oP 'client_id=[^"&]+'
```
**Catatan:** OIDC Discovery endpoint (`.well-known/openid-configuration`) adalah pintu masuk utama. Dari sini semua endpoint OIDC terlihat. JWKS endpoint mengexpose public key untuk verifikasi token. Cek apakah `registration_endpoint` ada — itu indikasi Dynamic Client Registration aktif. Device Authorization Grant (`urn:ietf:params:oauth:grant-type:device_code`) sering lupa diproteksi.

### [N+3] — Wayback Machine CDX API — Subdomain Enumeration Historis

**Target:** Domain target
**Tool:** curl
**Command:**
```bash
# Ambil semua URL historis dari Wayback Machine
curl -s "http://web.archive.org/cdx/search/cdx?url=*.target.com&output=text&fl=original&collapse=urlkey" | sort -u

# Ekstrak subdomain
curl -s "http://web.archive.org/cdx/search/cdx?url=*.target.com&output=text&fl=original&collapse=urlkey" | \
  grep -oP '([a-zA-Z0-9._-]+\.target\.com)' | sort -u

# Dengan filter status code (200 only)
curl -s "http://web.archive.org/cdx/search/cdx?url=*.target.com&output=text&fl=original,statuscode&collapse=urlkey" | \
  grep "200" | grep -oP '([a-zA-Z0-9._-]+\.target\.com)' | sort -u

# Limit jumlah hasil (default 15000)
curl -s "http://web.archive.org/cdx/search/cdx?url=*.target.com&output=text&fl=original&collapse=urlkey&limit=50000"
```
**Catatan:** Wayback CDX API berbeda dari waybackurls/gau — CDX memberikan data mentah URL historis dalam format CSV, bukan hanya URL. Bisa filter by status code, timestamp, dan mimetype. Sumber subdomain terbaik untuk domain pemerintahan/perusahaan besar. Kadang kena rate limit — tambah delay jika perlu.

### [N+4] — cPanel/WHM Server Fingerprint via Port Scan

**Target:** Server
**Tool:** naabu, curl
**Command:**
```bash
# Port khas cPanel/WHM
# Web: 80, 443, 2082 (cPanel HTTP), 2083 (cPanel HTTPS), 2086 (WHM HTTP), 2087 (WHM HTTPS)
# Mail: 25, 110, 143, 465, 587, 993, 995
# FTP: 21
# SSH: 22, 2222 (cPanel alt SSH)
# DNS: 53

# Cek dengan naabu
naabu -host target.com -p 21,22,53,80,110,143,443,465,587,993,995,2082,2083,2086,2087,2222

# Bash fallback
for port in 21 22 53 80 110 143 443 465 587 993 995 2082 2083 2086 2087 2222; do
  timeout 2 bash -c "echo > /dev/tcp/target.com/$port" 2>/dev/null && echo "OPEN: $port"
done
```
**Catatan:** Kombinasi port 21+22+53+80+110+143+443+465+587+993+995+2222 sangat khas cPanel/WHM. Port 2222 adalah SSH alternatif cPanel. Jika port ini terbuka, server kemungkinan besar managed hosting (cPanel). Ini berarti ada kemungkinan akses ke file manager, phpMyAdmin, dan fitur cPanel lainnya via port 2083.

### [N+5] — Payment Callback/Notify Endpoint Discovery

**Target:** Payment gateway / merchant API
**Tool:** curl, ffuf
**Command:**
```bash
# Cari callback/notify endpoint umum
for path in /notify /callback /webhook /payment/notify /payment/callback \
  /payment/webhook /ipn /payment/ipn /order/notify /order/callback \
  /order/status /transaction/notify /transaction/callback \
  /payermax/notify /payermax/id_notify /payloco/notify /antom/notify \
  /id_notify.php /notify.php /callback.php /webhook.php /ipn.php; do
  echo -n "$path "
  curl -sI "https://target.com$path" -o /dev/null -w "%{http_code} %{size_download}\n"
done

# Filter callback yang response-nya besar (indikasi halaman HTML/XML)
curl -s "https://target.com/payermax/id_notify.php" | head -20
# Jika return HTML form atau XML — ini adalah callback handler

# Cek apakah callback mengekspos konfigurasi merchant
curl -s "https://target.com/payermax/id_notify.php" | grep -oP 'merchant_id|merchant_key|api_key|secret[^"'"'"']+' 
```
**Catatan:** Callback/notify endpoint adalah handler yang dipanggil payment gateway setelah transaksi selesai. Jika endpoint ini publik tanpa validasi signature, attacker bisa memalsukan notifikasi pembayaran. Cari path seperti `/notify`, `/callback`, `/ipn`, `/{gateway_name}/notify`. Response yang besar (>1KB) biasanya indikasi halaman HTML penuh — bukan sekadar JSON response. Jika callback mengekspos merchant credential di halaman HTML, itu critical.

### [N+6] — NFS / RPC Port Exposure — Remote Filesystem Access

**Target:** Server
**Tool:** naabu, showmount, rpcinfo
**Command:**
```bash
# Scan port 111 (RPC) dan 2049 (NFS)
naabu -host target.com -p 111,2049

# Cek NFS export list
showmount -e target.com

# Jika NFS terbuka + ada export, mount tanpa auth
mkdir -p /mnt/nfs_target
mount -t nfs target.com:/export/path /mnt/nfs_target

# Bash fallback
for port in 111 2049; do
  timeout 3 bash -c "echo > /dev/tcp/target.com/$port" 2>/dev/null && echo "OPEN: $port"
done
```
**Catatan:** NFS port 2049 publik + RPC port 111 adalah kombinasi berbahaya. Jika NFS export tidak dilindungi firewall, attacker bisa mount filesystem server remote. Baca file konfigurasi, dump database, atau upload backdoor. NFS versi 3 ke bawah sering tidak punya auth kuat. Cek juga port 2049 di server yang sama dengan payment API.
