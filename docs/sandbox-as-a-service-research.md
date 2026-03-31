# Sandbox-as-a-Service: Deep Research Report

**Date:** 2026-03-31
**Purpose:** Evaluate E2B and competing sandbox/isolation platforms for programmatic code execution

---

## Table of Contents

1. [E2B Deep Dive](#e2b-deep-dive)
2. [Competitor Analysis](#competitor-analysis)
3. [Comparison Matrix](#comparison-matrix)
4. [Recommendations](#recommendations)

---

## E2B Deep Dive

### 1. Architecture

E2B (pronounced "edge-to-backend") is a cloud runtime purpose-built for AI agents. The core architecture:

- **Firecracker microVMs**: Each sandbox is a dedicated Firecracker microVM (the same technology behind AWS Lambda). Every sandbox gets its own Linux kernel, filesystem, and network stack.
- **KVM-based virtualization**: Hardware-level isolation via Linux KVM, not container namespaces.
- **Orchestration layer**: Kubernetes + Terraform drive dynamic scaling on top of the Firecracker VMs.
- **Build system**: Custom sandbox templates are defined via Dockerfiles. E2B's CLI builds the Docker image, then converts it to a microVM image that runs on their cloud.

The key architectural decision is choosing Firecracker over Docker/containers. This gives hardware-level isolation (each VM has its own kernel) rather than sharing the host kernel. The tradeoff is slightly more overhead than containers but dramatically stronger security isolation.

**Sources:**
- [Firecracker vs QEMU - E2B Blog](https://e2b.dev/blog/firecracker-vs-qemu)
- [E2B Breakdown - Dwarves Memo](https://memo.d.foundation/breakdown/e2b)

### 2. Isolation Technology: Firecracker MicroVMs

Why Firecracker specifically:

| Property | Firecracker | Docker/runc | gVisor |
|---|---|---|---|
| Isolation level | Hardware VM (KVM) | OS namespaces | User-space kernel |
| Own kernel | Yes | No (shared) | Partial (Go kernel) |
| Boot time | <125ms | <1s | <1s |
| Memory overhead | <5 MiB per VM | ~10 MiB | ~15-50 MiB |
| Attack surface | Minimal (no BIOS, no PCI) | Full kernel syscalls | Reduced (Go kernel) |
| Container escape risk | Extremely low | Known exploits exist | Low |

Firecracker was built by Amazon specifically for multi-tenant serverless workloads. It strips out everything unnecessary: no BIOS, no USB, no PCI, no video. The result is a tiny attack surface and <125ms boot times.

**Sources:**
- [Firecracker MicroVM GitHub](https://github.com/firecracker-microvm/firecracker)
- [E2B Architecture - The Sequence](https://thesequence.substack.com/p/the-sequence-ai-of-the-week-698-how)

### 3. API and SDK

E2B provides SDKs for **Python** and **JavaScript/TypeScript**.

#### Creating a Sandbox and Running Code (Python)

```python
from e2b_code_interpreter import Sandbox

# Create sandbox (boots in ~150ms)
sbx = Sandbox()

# Run Python code
execution = sbx.run_code('print("hello world")')
print(execution.logs.stdout)  # ["hello world"]

# Run shell commands
result = sbx.commands.run("ls -la /")

# Upload/download files
sbx.files.write("/tmp/data.csv", "col1,col2\n1,2\n")
content = sbx.files.read("/tmp/data.csv")

# Kill when done
sbx.kill()
```

#### Creating a Sandbox (JavaScript/TypeScript)

```typescript
import { Sandbox } from '@e2b/code-interpreter'

const sbx = await Sandbox.create()
const execution = await sbx.runCode('print("hello world")')
console.log(execution.logs.stdout)
await sbx.kill()
```

#### Custom Templates

```dockerfile
# e2b.Dockerfile
FROM e2b/base:latest

RUN apt-get update && apt-get install -y nodejs npm
RUN pip install pandas numpy scikit-learn
RUN npm install -g typescript
```

Build with: `e2b template build`

This produces a template ID you reference when creating sandboxes:
```python
sbx = Sandbox(template="my-custom-template")
```

**Build System 2.0** (newer): No Dockerfiles needed. Define templates in code.

**Sources:**
- [E2B Quickstart](https://e2b.dev/docs/quickstart)
- [E2B SDK Reference](https://e2b.dev/docs/sdk-reference/python-sdk/v1.3.2/sandbox_sync)
- [E2B Sandbox Templates](https://e2b.dev/docs/sandbox-template)

### 4. Pricing

E2B bills **per second** of active sandbox runtime.

#### Compute Rates

| Resource | Rate | Hourly Equivalent |
|---|---|---|
| CPU | $0.000014/vCPU/s | $0.0504/vCPU/hr |
| RAM | $0.0000045/GiB/s | $0.0162/GiB/hr |
| Storage | Free (10-20 GiB) | Free |

**Example**: A default sandbox (2 vCPU, 512 MiB RAM) running for 1 hour costs approximately $0.109.

#### Plans

| Plan | Monthly Fee | Session Limit | Concurrency | Free Credits |
|---|---|---|---|---|
| Hobby | Free | 1 hour | 20 sandboxes | $100 one-time |
| Pro | $150/mo | 24 hours | 100 sandboxes | - |
| Enterprise | $3,000/mo min | Custom | Custom | - |

Billing stops immediately when a sandbox is paused, killed, or times out. Paused sandboxes incur no compute charges.

**Sources:**
- [E2B Pricing](https://e2b.dev/pricing)
- [E2B Billing Docs](https://e2b.dev/docs/billing)
- [E2B Pricing Estimator](https://pricing.e2b.dev/)

### 5. Language and Runtime Support

E2B sandboxes are **full Linux VMs**. You can run anything you can run on Debian Linux.

**Built-in SDK support:**
- Python (Code Interpreter SDK with Jupyter kernel)
- JavaScript/TypeScript (Node.js)

**Via custom templates (any language):**
- Go, Rust, Java, Ruby, C/C++, PHP, R, Julia
- Any language with a Linux runtime
- Only Debian-based images are supported as base

**Desktop environments:** E2B also offers a Desktop SDK for GUI interactions (browser automation, etc.).

**Sources:**
- [E2B Code Interpreter GitHub](https://github.com/e2b-dev/code-interpreter)
- [E2B Documentation](https://e2b.dev/docs)

### 6. Persistence, Networking, and File System

#### Persistence (Pause/Resume)

- **Full memory + filesystem snapshots**: When paused, both RAM state and disk are preserved.
- Running processes, loaded variables, and data are all restored on resume.
- Pause takes ~4 seconds per 1 GB RAM. Resume takes ~1 second.
- Paused sandboxes can be stored for up to **30 days**.
- No compute charges while paused.

#### Networking

- Sandboxes have **full internet access by default**.
- Three firewall modes:
  - **allow-all** (default): All outbound traffic permitted
  - **deny-all**: Blocks everything including DNS
  - **Custom rules**: Allow/deny lists with IP addresses, CIDR blocks, and domain names
- When both allow and deny rules are specified, **allow takes precedence**.
- Services running inside sandboxes can be exposed externally via proxy tunneling.
- Pausing disconnects all network clients; resuming requires reconnection.

#### File System

- Each sandbox has its own filesystem (10-20 GiB depending on plan).
- **Cloud bucket mounting** via FUSE: Amazon S3, Google Cloud Storage, Cloudflare R2.
- File upload/download via SDK (`sbx.files.write()`, `sbx.files.read()`).

**Sources:**
- [E2B Sandbox Persistence](https://e2b.dev/docs/sandbox/persistence)
- [E2B Internet Access](https://e2b.dev/docs/sandbox/internet-access)

### 7. Connecting to Supabase/Databases from E2B

**Yes, this works.** Since E2B sandboxes have full internet access by default:

- Install `psycopg2` or any Postgres client in your template
- Connect to Supabase's connection pooler (transaction mode recommended for ephemeral clients)
- Use the Supabase JS/Python client library directly inside the sandbox
- Environment variables can be passed when creating the sandbox

```python
sbx = Sandbox(
    template="my-template",
    envs={"SUPABASE_URL": "https://xxx.supabase.co", "SUPABASE_KEY": "eyJ..."}
)
sbx.run_code("""
from supabase import create_client
import os
client = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_KEY'])
result = client.table('users').select('*').execute()
print(result.data)
""")
```

For security, use the **network firewall** to restrict outbound connections to only your Supabase host:
```python
sbx = Sandbox(
    template="my-template",
    internet_access={"allow_out": ["xxx.supabase.co"]}
)
```

**Note:** E2B itself uses Supabase for its own dashboard (authentication + logging). Supabase has a [case study about E2B](https://supabase.com/customers/e2b).

**Sources:**
- [E2B + Supabase Case Study](https://supabase.com/customers/e2b)
- [E2B Internet Access Docs](https://e2b.dev/docs/sandbox/internet-access)

### 8. Startup Time

- **Sandbox creation**: ~150-200ms (Firecracker microVM boot)
- **Resume from pause**: ~1 second
- **Pause**: ~4 seconds per 1 GB RAM
- Effectively **zero cold start** for real-time AI applications

This is dramatically faster than container-based solutions (2-5s typical) and traditional VMs (10-30s).

**Sources:**
- [E2B Blog - Firecracker vs QEMU](https://e2b.dev/blog/firecracker-vs-qemu)
- [AI Code Sandbox Benchmark 2026](https://www.superagent.sh/blog/ai-code-sandbox-benchmark-2026)

### 9. Security Model

**Multi-layered defense:**

1. **Hardware isolation (Firecracker)**: Each sandbox has its own kernel via KVM. No shared kernel = no container escape attacks.
2. **Minimalist VM design**: No BIOS, USB, PCI, or unnecessary devices. Reduced attack surface.
3. **Network firewall**: Configurable allow/deny lists for outbound traffic (IP, CIDR, domain).
4. **Dual authentication**: API key + sandbox ID required for access.
5. **Ephemeral by default**: Sandboxes are destroyed after timeout unless explicitly paused.
6. **No GPU access**: Sandboxes cannot access GPU hardware (limits crypto mining abuse).

**What if someone runs malicious code?**
- The code runs inside a Firecracker microVM with its own kernel. Even a kernel exploit inside the sandbox cannot reach the host.
- Network access can be restricted to prevent data exfiltration.
- Resource limits prevent runaway processes from affecting other tenants.
- Sandboxes auto-terminate after their session timeout (1hr hobby, 24hr pro).

**Sources:**
- [E2B Security - Dwarves Memo](https://memo.d.foundation/breakdown/e2b)
- [E2B Security Documentation](https://e2b.dev/docs)

### 10. Who Uses E2B?

E2B claims **88% of Fortune 100 companies** have signed up. Named customers include:

| Company | Use Case |
|---|---|
| **Perplexity** | Advanced data analysis for Pro users (shipped in 1 week with E2B) |
| **Manus** | Multi-agent system with 27 different tools across languages |
| **Hugging Face** | Secure AI research at scale (tens of thousands of concurrent sandboxes) |
| **Groq** | High-speed secure code execution |
| **LMArena (UC Berkeley)** | 230,000+ sandboxes for evaluating LLMs |
| **Lindy** | Python/JS execution in user workflows |
| **Lovable** | Data analysis and deep research agents |
| **Microsoft** | (Named customer, specific use case not disclosed) |

E2B raised a **$21M Series A** in 2025, led by Insight Partners.

**Sources:**
- [E2B Series A Announcement](https://e2b.dev/blog/series-a)
- [VentureBeat - E2B Fortune 100](https://venturebeat.com/ai/how-e2b-became-essential-to-88-of-fortune-100-companies-and-raised-21-million)
- [How Manus Uses E2B](https://e2b.dev/blog/how-manus-uses-e2b-to-provide-agents-with-virtual-computers)

---

## Competitor Analysis

### Daytona.io

**What it is:** Infrastructure for running AI-generated code. Pivoted from dev environments in Feb 2025. Raised $24M Series A in Feb 2026.

| Property | Details |
|---|---|
| **Isolation** | Docker/OCI containers (default), Kata Containers (optional for VM-level isolation) |
| **Startup time** | Sub-90ms (fastest in class) |
| **API** | REST API + Python/JS SDKs for programmatic sandbox creation |
| **Pricing** | $0.067/hr for 1 vCPU / 1 GiB. $200 free credits. Usage-based, no credit card required |
| **Session limits** | Unlimited duration |
| **Concurrency** | Configurable |
| **Default resources** | 1 vCPU, 1 GB RAM, 3 GiB disk (max 4 vCPU, 8 GB, 10 GiB) |
| **Persistence** | Stateful environment snapshots |
| **Networking** | Per-sandbox firewall rules, own network stack |
| **Languages** | Any (Docker-based) |
| **GPU support** | No |
| **Security trade-off** | Default Docker isolation is weaker than Firecracker. Kata Containers add VM-level isolation but increase startup time |
| **Best for** | Sub-100ms cold starts for real-time chatbots, code interpreters. Open-source transparency |

**Sources:**
- [Daytona.io](https://www.daytona.io/)
- [Daytona Sandboxes Docs](https://www.daytona.io/docs/en/sandboxes/)
- [Sub-90ms Daytona - Medium](https://medium.com/@kacperwlodarczyk/sub-90ms-cloud-code-execution-how-daytona-replaced-docker-in-our-ai-agent-stack-b6f343e4e547)

---

### Modal.com

**What it is:** Serverless AI infrastructure with GPU support. Designed for ML workloads, batch processing, and AI agent sandboxes.

| Property | Details |
|---|---|
| **Isolation** | gVisor (Google's user-space kernel). Intercepts syscalls, runs in Go, prevents host kernel access |
| **Startup time** | 2-4 seconds cold start (sub-second for warm) |
| **API** | Python SDK (everything defined in code, no YAML/Dockerfiles). `modal.Sandbox.create()` |
| **Pricing** | Per-second billing. CPU: $0.0000131/core/s (~$0.047/core/hr) base, $0.00003942/core/s for sandboxes. Free tier: $30/mo credits |
| **Session limits** | Unlimited |
| **Concurrency** | Autoscales to 50,000+ sandboxes |
| **GPU support** | Yes (A100, H100, etc.) - this is Modal's primary differentiator |
| **Persistence** | Network filesystems, volumes |
| **Networking** | Configurable network policies |
| **Languages** | Any (container-based images) |
| **Security** | gVisor provides stronger isolation than runc but weaker than Firecracker VMs |
| **Best for** | GPU workloads, ML inference, batch processing. Not optimized for sub-200ms cold starts |

**Sources:**
- [Modal Pricing](https://modal.com/pricing)
- [Modal Sandboxes](https://modal.com/products/sandboxes)
- [Modal Sandbox Networking](https://modal.com/docs/guide/sandbox-networking)

---

### Fly.io Machines API

**What it is:** Direct VM API on top of Firecracker. Lower-level than E2B; you manage your own orchestration.

| Property | Details |
|---|---|
| **Isolation** | Firecracker microVMs (same as E2B and AWS Lambda) |
| **Startup time** | Sub-second. API call to running VM: 20-50ms same-region, ~300ms cross-region |
| **API** | REST API for full VM lifecycle (create, start, stop, destroy). `POST /v1/apps/{app}/machines` |
| **Pricing** | Per-second. Shared 256 MB: ~$0.0027/hr ($1.94/mo). Persistent volumes: $0.15/GB/mo |
| **Session limits** | None (VMs run until stopped) |
| **GPU support** | Limited |
| **Persistence** | Persistent volumes on NVMe |
| **Networking** | Anycast networking, WireGuard tunnels between regions, Fly Proxy for TLS termination |
| **Languages** | Any (Docker images) |
| **Security** | Hardware VM isolation via Firecracker. Equivalent to E2B's isolation level |
| **Best for** | Building your own sandbox platform, custom orchestration, edge deployment across 30+ regions |

**Note:** Fly.io's "Sprites" product is a higher-level sandbox offering built on Machines, with checkpoint/rollback support.

**Sources:**
- [Fly.io Pricing](https://fly.io/pricing/)
- [Fly Machines Blog](https://fly.io/blog/fly-machines/)
- [Fly.io Architecture](https://fly.io/docs/reference/architecture/)
- [Fly Machines API Docs](https://docs.machines.dev/)

---

### Cloudflare Workers

**What it is:** Edge computing platform using V8 isolates. Extremely fast, extremely constrained.

| Property | Details |
|---|---|
| **Isolation** | V8 isolates (same engine as Chrome). Process-level sandboxing + seccomp + anti-Spectre measures |
| **Startup time** | ~5ms (100x faster than containers) |
| **API** | Wrangler CLI + REST API. Deploy via `wrangler deploy` |
| **Pricing** | Free: 100K requests/day, 10ms CPU/request. Paid ($5/mo): 10M requests + 30M CPU-ms included. Overage: $0.30/M requests + $0.02/M CPU-ms |
| **Execution limits** | Free: 10ms CPU. Paid: 30s CPU (15 min wall clock via Cron Triggers) |
| **Persistence** | KV, Durable Objects, R2 (object storage), D1 (SQLite), Queues |
| **Networking** | Outbound fetch() only. No raw TCP sockets (Cloudflare Tunnels for that) |
| **Languages** | JavaScript/TypeScript (native). Rust, C, C++ via WASM. Python via Transcrypt (limited) |
| **Security** | Extremely strong for the constrained model. V8 memory isolation + process sandboxing + hardware anti-Spectre. 92% of cross-isolate attacks hit hardware traps |
| **Best for** | Edge functions, API gateways, request transformation, lightweight compute. NOT for arbitrary code execution (too constrained) |

**Sources:**
- [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Workers Security Model](https://developers.cloudflare.com/workers/reference/security-model/)
- [Cloudflare Workers Languages](https://developers.cloudflare.com/workers/languages/)

---

### Deno Deploy + Deno Sandbox

**What it is:** Two products. Deno Deploy is a V8 isolate edge platform (like Cloudflare Workers). Deno Sandbox is a newer Firecracker microVM product for full Linux sandboxes.

#### Deno Deploy (V8 Isolates)

| Property | Details |
|---|---|
| **Isolation** | V8 isolates |
| **Startup time** | Near-instant (<5ms) |
| **Pricing** | Free: 100K requests/day. Pro: $20/mo |
| **Languages** | TypeScript/JavaScript (Deno runtime) |
| **Best for** | Edge functions, similar to Cloudflare Workers but with Deno's permission model |

#### Deno Sandbox (Firecracker MicroVMs) - GA Feb 2026

| Property | Details |
|---|---|
| **Isolation** | Firecracker microVMs (same as E2B) |
| **Startup time** | <200ms |
| **API** | JavaScript and Python SDKs. `@deno/sandbox` npm package |
| **Pricing** | $0.05/CPU-hr, $0.016/GB-hr memory, $0.20/GiB-month storage. Pro tier includes 40 CPU-hrs + 1000 GB-hrs |
| **Default resources** | 2 vCPU, 1.2 GiB memory, 10 GiB disk |
| **Languages** | Any (full Linux VM) |
| **Security** | Hardware VM isolation (Firecracker) |
| **Best for** | Running untrusted/LLM-generated code with Firecracker isolation. Direct competitor to E2B |

**Sources:**
- [Deno Sandbox](https://deno.com/deploy/sandbox)
- [Deno Deploy Pricing](https://deno.com/deploy/pricing)
- [Introducing Deno Sandbox](https://deno.com/blog/introducing-deno-sandbox)

---

### Val Town

**What it is:** Social code platform where every function gets its own API endpoint. Think "GitHub Gists that run."

| Property | Details |
|---|---|
| **Isolation** | Deno runtime with V8 isolates. Previously used vm2 (had security issues), migrated to Deno |
| **Startup time** | Near-instant (V8 isolates) |
| **API** | Every val is automatically an HTTP endpoint. REST API for CRUD |
| **Pricing** | Free: 1M runs/day. Pro: $8.33/mo. Teams: $166.67/mo. Enterprise: custom |
| **Languages** | TypeScript/JavaScript only |
| **Persistence** | SQLite (Turso), blob storage |
| **Networking** | Full outbound access |
| **Security** | Deno permission model + V8 isolation. No known security bugs since Deno migration |
| **Best for** | Quick scripts, webhooks, cron jobs, prototyping. Social coding. NOT for heavy compute |

**Sources:**
- [Val Town Pricing](https://www.val.town/pricing)
- [Val Town Retrospective](https://macwright.com/2025/11/11/val-town)

---

### Coder.com

**What it is:** Self-hosted cloud development environment platform. Open-source. Uses Terraform for infrastructure-as-code.

| Property | Details |
|---|---|
| **Isolation** | Depends on template: Kubernetes pods, Docker containers, EC2 VMs, etc. |
| **Startup time** | Seconds to minutes (depends on infrastructure) |
| **API** | REST API + Terraform provider + CLI. `coderd` server manages workspace lifecycle |
| **Pricing** | Community: Free (open-source, self-hosted). Premium: Custom pricing (enterprise features) |
| **Persistence** | Full (persistent workspaces with volumes) |
| **Networking** | Full (whatever your infrastructure provides) |
| **Languages** | Any (full dev environments) |
| **Security** | Depends on your infrastructure. Supports zero-trust, audit logging, RBAC |
| **Best for** | Enterprise teams wanting self-hosted dev environments with full control. Infrastructure-agnostic |

**Sources:**
- [Coder.com](https://coder.com/)
- [Coder GitHub](https://github.com/coder/coder)
- [Coder Docs](https://coder.com/docs)

---

### Gitpod / Ona

**What it is:** Cloud development environments, recently rebranded to Ona. Pivoting toward AI-driven software engineering agents.

| Property | Details |
|---|---|
| **Isolation** | Docker containers (Gitpod Classic used Kubernetes). Moving away from Kubernetes to custom architecture |
| **Startup time** | Seconds (prebuilds can reduce to near-instant) |
| **API** | REST API, `.gitpod.yml` configuration |
| **Pricing** | Small (2 vCPU, 8 GiB): $0.12/hr. Large (8 vCPU, 32 GiB): $0.48/hr. GPU: $1.95/hr |
| **Persistence** | Ephemeral workspaces (by design), but persistent storage available |
| **Networking** | Full, with network controls (OIDC, audit logs, policy enforcement) |
| **Languages** | Any (Docker-based) |
| **Security** | OS-level isolation per workspace, guardrails for agents |
| **Best for** | Team development environments, CI/CD integration, GitHub/GitLab workflow automation |

**Sources:**
- [Ona (formerly Gitpod)](https://ona.com/)
- [Gitpod GitHub](https://github.com/gitpod-io/gitpod)
- [Gitpod leaving Kubernetes](https://ona.com/stories/we-are-leaving-kubernetes)

---

### RunKit / Observable

**What it is:** Browser-based notebook environments for JavaScript.

| Property | Details |
|---|---|
| **Isolation** | iframe isolation (browser sandboxing). RunKit: server-side Node.js with every npm package pre-installed. Observable: client-side JavaScript execution |
| **Startup time** | Near-instant (browser-based) |
| **API** | Embeddable via React components (RunKit). Observable has an API for notebook access |
| **Pricing** | RunKit: Free. Observable: Free tier + Team/Enterprise plans |
| **Languages** | JavaScript/Node.js (RunKit), JavaScript (Observable) |
| **Security** | Browser iframe isolation. Not designed for untrusted AI-generated code |
| **Best for** | Documentation, data visualization, interactive examples. NOT for AI agent sandboxing |

**Sources:**
- [RunKit GitHub](https://github.com/runkitdev)
- [Observable](https://observablehq.com/)

---

## Comparison Matrix

### Isolation Level & Security

| Platform | Isolation Mechanism | Isolation Level | Own Kernel? | Container Escape Risk |
|---|---|---|---|---|
| **E2B** | Firecracker microVM | Hardware VM | Yes | Extremely low |
| **Daytona** | Docker (default) / Kata | Container / VM (opt-in) | No (Yes with Kata) | Medium (Low with Kata) |
| **Modal** | gVisor | User-space kernel | Partial | Low |
| **Fly.io Machines** | Firecracker microVM | Hardware VM | Yes | Extremely low |
| **Cloudflare Workers** | V8 isolates + seccomp | Process isolate | No | Very low (multi-layer) |
| **Deno Deploy** | V8 isolates | Process isolate | No | Very low |
| **Deno Sandbox** | Firecracker microVM | Hardware VM | Yes | Extremely low |
| **Val Town** | Deno / V8 isolates | Process isolate | No | Very low |
| **Coder** | Varies (Docker/K8s/VM) | Varies | Varies | Varies |
| **Gitpod/Ona** | Docker containers | Container | No | Medium |
| **RunKit** | iframe + Node.js | Browser sandbox | No | High (not designed for untrusted) |

### Performance & Cost

| Platform | Startup Time | Cost (1 vCPU, 1 GiB, 1 hr) | Max Session | GPU Support |
|---|---|---|---|---|
| **E2B** | ~150ms | ~$0.066 | 24hr (Pro) | No |
| **Daytona** | <90ms | ~$0.067 | Unlimited | No |
| **Modal** | 2-4s | ~$0.142 (sandbox rate) | Unlimited | Yes (A100, H100) |
| **Fly.io Machines** | <500ms | ~$0.003-0.01 | Unlimited | Limited |
| **Cloudflare Workers** | ~5ms | ~$0.00003/req | 30s CPU max | No |
| **Deno Deploy** | <5ms | ~$0.003/10K req | Per-request | No |
| **Deno Sandbox** | <200ms | ~$0.066 | Configurable | No |
| **Val Town** | Near-instant | Free (1M runs/day) | Per-request | No |
| **Coder** | Seconds-minutes | Self-hosted (infra cost) | Unlimited | Depends |
| **Gitpod/Ona** | Seconds | ~$0.12 (2vCPU/8GiB) | Configurable | Yes |

### Features

| Platform | Persistent Storage | Network Control | Language Support | API Maturity | Pause/Resume |
|---|---|---|---|---|---|
| **E2B** | Cloud bucket FUSE | Allow/deny firewall | Any (Linux) | Excellent | Yes (memory+fs) |
| **Daytona** | Snapshots | Per-sandbox firewall | Any (Docker) | Good | Yes (snapshots) |
| **Modal** | Network volumes | Configurable | Any (container) | Excellent | No |
| **Fly.io** | Persistent volumes | Full control | Any (Docker) | Excellent | Yes (stop/start) |
| **CF Workers** | KV, D1, R2, DO | Outbound fetch only | JS/TS + WASM | Excellent | No (stateless) |
| **Deno Deploy** | KV, object storage | Standard | TS/JS (Deno) | Good | No (stateless) |
| **Deno Sandbox** | Volume storage | Configurable | Any (Linux) | New (GA Feb 2026) | TBD |
| **Val Town** | SQLite, blobs | Full outbound | TS/JS only | Good | No (stateless) |
| **Coder** | Full (your infra) | Full (your infra) | Any | Good | Yes (workspace) |
| **Gitpod/Ona** | Optional persistent | Network controls | Any (Docker) | Good | Yes (workspace) |

### Best Use Case Summary

| Platform | Primary Use Case |
|---|---|
| **E2B** | AI agent code execution with strong isolation. Best SDK/DX for AI integration |
| **Daytona** | Lowest-latency AI sandbox (<90ms). Open-source. Cost-effective |
| **Modal** | GPU workloads, ML inference, batch jobs. Only option with real GPU support |
| **Fly.io Machines** | Build-your-own platform. Maximum control. Cheapest raw VMs |
| **Cloudflare Workers** | Edge functions, API gateways. Not for arbitrary code execution |
| **Deno Deploy** | Edge TypeScript functions. Deno ecosystem |
| **Deno Sandbox** | New Firecracker alternative to E2B with Deno ecosystem integration |
| **Val Town** | Quick scripts, webhooks, prototypes. Social coding |
| **Coder** | Enterprise self-hosted dev environments |
| **Gitpod/Ona** | Team dev environments with AI agent support |

---

## Recommendations

### For AI Agent Code Execution (the E2B use case)

**Top tier:**
1. **E2B** - Best ecosystem, proven at scale (88% of Fortune 100), excellent SDKs, Firecracker isolation. The market leader.
2. **Daytona** - Fastest cold starts (<90ms), open-source, competitive pricing. Weaker default isolation (Docker) but Kata containers available.
3. **Deno Sandbox** - Newest entrant (GA Feb 2026). Firecracker isolation like E2B. Worth watching.

**For GPU workloads:** Modal is the only real option.

**For building your own platform:** Fly.io Machines gives you raw Firecracker VMs at the lowest cost with full control.

**For edge/lightweight compute:** Cloudflare Workers or Deno Deploy if you only need JS/TS.

### Key Decision Factors

| If you need... | Choose... |
|---|---|
| Strongest security isolation | E2B, Fly.io, or Deno Sandbox (all Firecracker) |
| Fastest cold starts | Daytona (<90ms) or Cloudflare Workers (~5ms for JS) |
| GPU access | Modal |
| Lowest cost | Fly.io Machines (raw) or Cloudflare Workers (edge) |
| Best AI SDK/DX | E2B |
| Self-hosted/open-source | Daytona or Coder |
| Supabase integration | E2B (they already use Supabase themselves) or any platform with outbound networking |
| Pause/resume with full memory state | E2B (unique feature - full memory + process snapshot) |

---

## Key Takeaways

1. **E2B is the market leader** for AI agent sandboxing. Its combination of Firecracker isolation, excellent SDKs, pause/resume with full memory state, and enterprise adoption (88% Fortune 100) makes it the default choice.

2. **Daytona is the strongest challenger**, with faster cold starts and open-source transparency, but weaker default isolation.

3. **The isolation spectrum** from weakest to strongest: iframe < V8 isolate < Docker container < gVisor < Kata Container < Firecracker microVM. Choose based on your threat model.

4. **Connecting to Supabase from any sandbox is straightforward** - any platform with outbound networking supports it via connection string. E2B's network firewall lets you lock down access to only your Supabase host.

5. **GPU sandboxing is still rare** - only Modal offers it. E2B, Daytona, and most others are CPU-only.

6. **Deno Sandbox is the newest player** to watch, bringing Firecracker isolation with Deno ecosystem integration. GA as of February 2026.
