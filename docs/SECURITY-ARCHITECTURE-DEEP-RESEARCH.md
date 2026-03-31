# Security Architecture & Sandboxing Deep Research

Research date: 2026-03-31
Focus: Lovable.dev security patterns, Firecracker MicroVM isolation, code execution sandboxing,
multi-tenant isolation, and Supabase security for platform builders.

---

## Table of Contents

1. [Firecracker MicroVM Security Architecture](#1-firecracker-microvm-security-architecture)
2. [Code Execution Sandboxing Patterns](#2-code-execution-sandboxing-patterns)
3. [Multi-Tenant Isolation Patterns](#3-multi-tenant-isolation-patterns)
4. [Supabase Security for Platforms](#4-supabase-security-for-platforms)
5. [Alternative Isolation Approaches](#5-alternative-isolation-approaches)
6. [Real-World Security Incidents](#6-real-world-security-incidents)
7. [Comparison Matrix](#7-comparison-matrix)
8. [Recommendations for KEYHOLDER](#8-recommendations-for-keyholder)

---

## 1. Firecracker MicroVM Security Architecture

### 1.1 Overview

Firecracker is an open-source Virtual Machine Monitor (VMM) written in Rust, developed by AWS
for Lambda and Fargate. It creates lightweight microVMs using Linux KVM, providing hardware-level
isolation with container-like performance.

**Key specs:**
- Boot time: ~125ms
- Memory overhead: <5 MiB per microVM
- Creation rate: up to 150 microVMs/second/host
- Codebase: ~50,000 lines of Rust (vs QEMU's ~2 million lines of C)
- Minimal device model: virtio-net, virtio-block, virtio-vsock, serial console, keyboard controller

Source: [Firecracker GitHub](https://github.com/firecracker-microvm/firecracker),
[Firecracker Design Doc](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md)

### 1.2 Defense-in-Depth Architecture

Firecracker implements a nested trust zone model with multiple isolation barriers:

```
┌─────────────────────────────────────────────────┐
│                  Host OS / KVM                   │
│  ┌───────────────────────────────────────────┐  │
│  │           Jailer Process                   │  │
│  │  ┌─────────────────────────────────────┐  │  │
│  │  │     Firecracker VMM Process         │  │  │
│  │  │  ┌─────────────────────────────┐    │  │  │
│  │  │  │    Guest Kernel (untrusted)  │    │  │  │
│  │  │  │  ┌─────────────────────┐    │    │  │  │
│  │  │  │  │  Guest User Code     │    │    │  │  │
│  │  │  │  │  (fully untrusted)   │    │    │  │  │
│  │  │  │  └─────────────────────┘    │    │  │  │
│  │  │  └─────────────────────────────┘    │  │  │
│  │  └─────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Layer 1 - KVM Hardware Virtualization:**
- CPU virtualization boundaries prevent guest kernel bugs from accessing host memory
- Hardware-enforced memory isolation (EPT/NPT page tables)
- Each microVM gets its own kernel

**Layer 2 - Minimal VMM Surface:**
- Only 5 emulated devices (vs dozens in QEMU)
- Written in memory-safe Rust
- Three-thread process model: API thread, VMM thread, vCPU threads

**Layer 3 - Jailer Process:**
- chroot isolation
- Linux namespace separation (PID, mount, network, IPC, UTS)
- cgroup resource limits
- Privilege dropping before exec into Firecracker binary

**Layer 4 - seccomp-bpf Filters:**
- Per-thread syscall filtering
- Approximately 35-40 allowed syscalls (down from ~340)
- Argument-level filtering on sensitive calls

**Design principle:** "All vCPU threads are considered to be running malicious code as soon as
they have been started; these malicious threads need to be contained."

Source: [Firecracker Security Analysis](https://securemachinery.com/2019/09/08/firecracker-microvm-security/),
[Fly.io Blog on Sandboxing](https://fly.io/blog/sandboxing-and-workload-isolation/)

### 1.3 seccomp-bpf Filter Details

Firecracker applies per-thread seccomp filters loaded before any guest code executes. Filters
are defined in JSON and compiled via `seccompiler-bin` into serialized BPF code embedded in the
binary. Three thread categories each get their own filter set: `vmm`, `api`, and `vcpu`.

**VMM Thread Allowed Syscalls (~40 total):**

Basic (no argument filtering):
```
stat, epoll_ctl, epoll_pwait, exit, exit_group, open, read, write,
mincore, writev, readv, fsync, close, eventfd2, io_uring_enter,
io_uring_setup, io_uring_register, brk, gettid, clock_gettime,
connect, fstat, ftruncate, lseek, mremap, munmap, recvfrom,
rt_sigprocmask, rt_sigreturn, sigaltstack, getrandom, sendto,
sched_yield, sendmsg, recvmsg, restart_syscall, mprotect
```

With argument-level filtering:
```
accept4      (SOCK_CLOEXEC only)
fcntl        (F_SETFD + FD_CLOEXEC only)
futex        (WAIT/WAKE variants only)
madvise      (specific flags only)
msync        (specific flags only)
mmap         (constrained flag combinations)
rt_sigaction (SIGABRT only)
socket       (AF_UNIX + SOCK_STREAM|SOCK_CLOEXEC only)
tkill        (SIGABRT or RT signal offset only)
timerfd_settime (flags=0 only)
ioctl        (KVM and terminal operations only)
```

**API Thread:** Subset of VMM syscalls, focused on HTTP server operations.

**VCPU Thread:** Most restricted set, focused on KVM operations (ioctl for KVM_RUN, etc.).

**Default action:** Kill process (SCMP_ACT_KILL) -- any syscall not in the allowlist terminates
the Firecracker process immediately.

**Custom filters:** Advanced users can override defaults via `--seccomp-filter` parameter with
pre-compiled BPF binary.

Source: [Firecracker seccomp JSON (x86_64)](https://github.com/firecracker-microvm/firecracker/blob/main/resources/seccomp/x86_64-unknown-linux-musl.json),
[Seccomp docs](https://github.com/firecracker-microvm/firecracker/blob/main/docs/seccomp.md)

### 1.4 The Jailer Process

The jailer is a separate binary that sets up isolation constraints before launching Firecracker.
The sequence is:

1. **Create cgroup** -- resource limits for CPU, memory, disk I/O, process count
2. **Set up chroot** -- minimal filesystem with only required device nodes and rootfs
3. **Create namespaces** -- PID (process isolation), mount (filesystem isolation), network
   (network stack isolation), IPC, UTS (hostname isolation)
4. **Drop privileges** -- switch from root to unprivileged user/group
5. **Apply seccomp filters** -- load BPF filter program
6. **exec() into Firecracker** -- Firecracker starts as fully constrained, unprivileged process

After step 6, the Firecracker process can only access resources explicitly granted during setup.
Even if an attacker escapes the guest VM and compromises the VMM, they face:
- A chroot jail with minimal filesystem
- An unprivileged user with no capabilities
- seccomp filters blocking most syscalls
- Namespace isolation preventing visibility of host processes

Source: [Qumulus Jailer Documentation](https://www.qumulus.io/jailer/),
[Firecracker Design](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md)

### 1.5 Network Isolation

- Guest emulated network interfaces connect to host TAP devices
- Data is copied between layers by the Firecracker I/O thread
- Rate limiting is applied at the copy boundary
- virtio-vsock provides host-guest communication via AF_UNIX <-> AF_VSOCK mediation
- Each VM gets its own network namespace via the jailer
- No direct VM-to-VM communication path exists

### 1.6 Comparison: Firecracker vs Docker vs gVisor vs Traditional VMs

| Property | Docker Container | gVisor | Firecracker | Traditional VM |
|----------|-----------------|--------|-------------|----------------|
| Isolation | Namespace + seccomp | User-space kernel | Hardware (KVM) | Hardware (full) |
| Shared kernel | Yes | Partially (Sentry) | No | No |
| Boot time | <1s | <1s | ~125ms | 10-60s |
| Memory overhead | ~0 | Small | <5 MiB | 100s MiB |
| Syscall surface | ~300 of ~340 | ~70 host syscalls | ~35-40 | Full (in guest) |
| Language | Go (runtime) | Go (Sentry) | Rust | C/C++ (QEMU etc) |
| Codebase size | N/A | Medium | ~50K lines | ~2M lines (QEMU) |
| Attack surface | Large (host kernel) | Medium (Sentry) | Small (KVM+VMM) | Medium (full VMM) |
| Escape difficulty | Medium | Medium-High | Very High | Very High |
| GPU support | Yes | Limited | No | Yes |
| Best for | Trusted code | Semi-trusted | Untrusted/hostile | Legacy/compliance |

### 1.7 Known Attack Surface and Vulnerabilities

**Firecracker-specific:**
- No public CVEs for Firecracker VMM escape as of March 2026
- Theoretical attack surface: KVM subsystem, VirtIO device emulation, MMDS metadata service
- Firecracker runs a bug bounty and treats any guest-to-host escape as critical

**KVM vulnerabilities (affecting all KVM-based solutions including Firecracker):**
- CVE-2021-29657: KVM vulnerability in kernel v5.10-rc1 to v5.12-rc6, potential guest-to-host
  escape. Patched March 2021.
- Google's kvmCTF program (launched Oct 2023) offers $250,000 for full KVM VM escape exploits,
  indicating KVM escape is considered extremely difficult but not impossible.

**Host-level mitigations Firecracker recommends:**
- Disable Simultaneous Multithreading (SMT) against side-channel attacks
- Enable Kernel Page-Table Isolation (KPTI) against Meltdown
- Disable Kernel Same-page Merging (KSM) against cross-VM information leakage
- Apply Spectre/L1TF/SSBD mitigations
- Use rowhammer-resistant memory
- Disable swap

**Contrast with VMware (for perspective):**
- CVE-2025-22224, CVE-2025-22225, CVE-2025-22226: Three VMware ESXi zero-days in March 2025,
  actively exploited in the wild for VM escape. Demonstrates that even mature hypervisors face
  real escape vulnerabilities.

Source: [Google Project Zero KVM Escape](https://projectzero.google/2021/06/an-epyc-escape-case-study-of-kvm.html),
[Firecracker Security](https://firecracker-microvm.github.io/)

---

## 2. Code Execution Sandboxing Patterns

### 2.1 How Major Platforms Handle Untrusted Code

| Platform | Isolation Technology | Key Details |
|----------|---------------------|-------------|
| **Lovable.dev** | Client-side JS + Supabase RLS | No server-side code sandbox; browser-based preview; backend via Supabase |
| **Replit** | Firecracker microVMs (via Fly.io) | Full per-user VM; persistent workspace |
| **CodeSandbox** | Firecracker microVMs | Cloud-based dev environments with VM isolation |
| **Bolt.new / StackBlitz** | WebContainers (browser) | WASM-based Node.js in browser; no server-side execution |
| **E2B.dev** | Firecracker microVMs | Sandbox-as-a-service; ~150ms cold start; 24hr max session |
| **Modal.com** | gVisor | Syscall interception; Python-focused; GPU support |
| **Gitpod** | Kubernetes + security policies | Container-based with pod-level isolation |
| **Deno Deploy** | V8 isolates | Process-shared isolates; sub-ms startup |
| **Cloudflare Workers** | V8 isolates | Shared process; hardware isolation via WebAssembly |

Source: [Better Stack Sandbox Comparison](https://betterstack.com/community/comparisons/best-sandbox-runners/),
[Northflank Secure Runtime](https://northflank.com/blog/secure-runtime-for-codegen-tools-microvms-sandboxing-and-execution-at-scale)

### 2.2 Node.js Specific Sandboxing

**The vm2 Problem:**
- vm2 was the most popular Node.js sandboxing library
- Multiple critical sandbox escape CVEs discovered (the library is now deprecated)
- Escapes exploited prototype chain manipulation and promise handler edge cases
- Lesson: userland JavaScript sandboxing is fundamentally fragile

**Better approaches for Node.js:**
1. **Firecracker microVM** -- run Node.js in isolated VM (E2B, Replit approach)
2. **gVisor** -- run Node.js container with syscall interception (Modal approach)
3. **WebContainers** -- WASM-based Node.js in browser (StackBlitz/Bolt.new approach)
4. **Deno** -- V8 isolate with permission model (no fs/net by default)
5. **Isolated-VM** -- V8 isolate within Node.js process (lighter but weaker)

**Never use:** vm2, vm (Node.js built-in), eval(), Function constructor for untrusted code.

Source: [Semgrep VM2 Analysis](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/)

### 2.3 Preventing Common Attacks

**Filesystem Escape:**
- VM/microVM: hardware-enforced memory isolation; guest has no access to host filesystem
- gVisor: Gofer process mediates all file I/O via 9P/LISAFS protocol
- Container: read-only root filesystem + ephemeral tmpfs for writable paths
- WebContainers: virtual filesystem in browser memory

**Network Abuse (data exfil, C2, lateral movement):**
- Network disabled by default; whitelist-based outbound connections
- Domain allowlist proxies for egress control
- No raw socket access
- Per-VM network namespaces prevent lateral movement
- Rate limiting at TAP device boundary

**Crypto Mining:**
- CPU quotas enforced via cgroups at microVM level
- Time-limited execution (3-5 second timeouts for functions)
- CPU usage monitoring and anomaly detection

**Resource Exhaustion (fork bombs, memory bombs):**
- cgroup limits: max 256 processes, 2048 open file descriptors (typical)
- Memory caps per VM/container
- Disk quotas on ephemeral storage
- cgroups prevent DoS but are NOT security boundaries -- they prevent stability
  issues, not escape

**Fork Bombs specifically:**
- PID namespace limits max process count
- cgroup pids controller caps total PIDs
- Kernel `RLIMIT_NPROC` per-user limit

Source: [Agent Sandbox Guide](https://www.vietanh.dev/blog/2026-02-02-agent-sandboxes),
[Sandbox Isolation Discussion](https://www.shayon.dev/post/2026/52/lets-discuss-sandbox-isolation/)

### 2.4 Handling Malicious npm Packages

The September 2025 npm supply chain attack compromised 18 widely-used packages with 2.6 billion
weekly downloads. Prevention strategies:

1. **CI/CD hardening:** `npm ci --ignore-scripts` by default; sandbox all installs
2. **Egress blocking:** Block network access during `npm install`
3. **Lockfile pinning:** Pin versions to known safe releases
4. **Trusted publishing:** Adopt npm trusted publishing (available since July 2025)
5. **YARA rules:** Embed malware detection rules in CI/CD pipeline
6. **Audit automation:** Regular `npm audit` with automated blocking of high-severity CVEs
7. **Sandboxed installs:** Run `npm install` inside microVM, not on host
8. **Post-install script scanning:** Block lifecycle scripts by default

Source: [CISA npm Alert](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem),
[GitHub Supply Chain Security](https://github.blog/security/supply-chain-security/strengthening-supply-chain-security-preparing-for-the-next-malware-campaign/)

### 2.5 Five-Layer Defense Model for Code Execution

```
Layer 1: Process isolation     │ Minimal privileges, RLIMIT, PR_SET_NO_NEW_PRIVS
Layer 2: VM/container boundary │ Kernel isolation (Firecracker/gVisor)
Layer 3: Syscall filtering     │ seccomp-bpf blocking dangerous calls (execve, clone3, etc.)
Layer 4: Runtime monitoring    │ Anomaly detection, resource usage tracking
Layer 5: Human-in-the-loop    │ Approval gates for sensitive operations
```

---

## 3. Multi-Tenant Isolation Patterns

### 3.1 Fly.io Per-User Dev Environments Blueprint

Fly.io provides a documented blueprint for running isolated dev environments per user using
Fly Machines (Firecracker microVMs behind an API).

**Architecture:**
```
                          ┌──────────────────────┐
                          │   Router App          │
   *.example.com  ──────> │   (wildcard domain)   │
                          │   extracts subdomain   │
                          │   looks up user→machine│
                          │   issues fly-replay    │
                          └──────────┬─────────────┘
                                     │ fly-replay header
                    ┌────────────────┼────────────────┐
                    │                │                 │
              ┌─────▼─────┐   ┌─────▼─────┐    ┌─────▼─────┐
              │ Alice's    │   │ Bob's      │    │ Carol's    │
              │ Fly App    │   │ Fly App    │    │ Fly App    │
              │ (Machine)  │   │ (Machine)  │    │ (Machine)  │
              │ + Volume   │   │ + Volume   │    │ + Volume   │
              └───────────┘   └───────────┘    └───────────┘
```

**Key components:**

1. **Router app** -- handles wildcard subdomain traffic (`*.example.com`)
2. **Per-user Fly apps** -- dedicated app per user containing isolated Machine(s)
3. **fly-replay headers** -- transparent internal redirection (~10ms latency)
4. **Fly Volumes** -- persistent storage attached to individual machines

**Wildcard subdomain routing pattern:**
- Router app registers `*.example.com`
- On incoming request, extracts subdomain (e.g., `alice.example.com` -> `alice-123`)
- Looks up correct app + machine ID from datastore
- Returns `fly-replay: app=alice-app-123` header
- Fly Proxy internally redirects request to correct machine
- Replay caching reduces latency and router load

**Pre-creation pools:** App + Machine creation is not instantaneous, so pre-creating pools of
ready-to-assign apps is recommended for fast user onboarding.

Source: [Fly.io Per-User Dev Environments](https://fly.io/docs/blueprints/per-user-dev-environments/)

### 3.2 Preventing Cross-User Access

**Hardware isolation:** Each user's code runs in a separate Firecracker microVM with its own
kernel, memory space, and virtual devices. No shared memory, no shared kernel.

**Network isolation:** Each machine gets its own network namespace via the jailer. VMs cannot
directly communicate with each other unless explicitly connected through the Fly.io WireGuard
mesh (which requires API-level authorization).

**Storage isolation:** Fly Volumes are attached to specific machines. There is no shared
filesystem between different users' machines.

**API isolation:** Each user gets a dedicated Fly app, providing organizational separation at
the Fly.io platform level.

### 3.3 Blast Radius When a VM is Compromised

If an attacker escapes the guest VM, they face:
1. **Firecracker VMM** -- written in Rust, minimal attack surface (~50K LoC)
2. **Jailer constraints** -- chroot, unprivileged user, namespace isolation, seccomp
3. **Host kernel KVM** -- hardware-enforced isolation boundary
4. **Network isolation** -- separate network namespace, no direct access to internal network

The primary concern (per Fly.io) is internal network access: "the most important attack surface
you need to reduce is exposure to your internal network." An escaped VM gaining internal network
access is comparable to an SSRF vulnerability.

**Mitigation:** Zero-trust networking between VMs, no implicit trust based on network position,
per-service authentication.

Source: [Fly.io Sandboxing Blog](https://fly.io/blog/sandboxing-and-workload-isolation/),
[Fly.io Security Practices](https://fly.io/docs/security/security-at-fly-io/)

---

## 4. Supabase Security for Platforms

### 4.1 Project-Level Isolation

Each Supabase project gets its own dedicated PostgreSQL instance. This is true database-level
isolation -- separate process, separate data directory, separate connection string. Projects
cannot access each other's data at the infrastructure level.

**However:** Within a single project, multi-tenancy relies on Row Level Security (RLS).

### 4.2 RLS Architecture and the anon Key Problem

Supabase exposes the PostgreSQL database directly to clients via PostgREST. The architecture:

```
Browser/Client
    │
    │ Authorization: Bearer <JWT>
    │ apikey: <anon_key>     (public, embedded in client code)
    ▼
PostgREST (API gateway)
    │
    │ validates JWT → determines role
    │ switches PostgreSQL role accordingly
    ▼
PostgreSQL
    │ RLS policies check current role + JWT claims
    ▼
Data (allowed rows only)
```

**Critical understanding:**
- The `anon_key` is PUBLIC and WILL be in client-side code
- The `service_role` key BYPASSES ALL RLS -- must NEVER be in client code
- Security depends ENTIRELY on RLS policies being correct and comprehensive
- RLS enforcement is based on the `Authorization` header JWT, not the `apikey` header

### 4.3 CVE-2025-48757 Pattern: How to Prevent It

The Lovable vulnerability was: AI-generated RLS policies were missing or incorrect, and the
platform had no enforcement mechanism to verify them before deployment.

**Prevention strategies:**

1. **Secure-by-default templates:**
   ```sql
   -- WRONG: Lovable's default pattern in some cases
   CREATE POLICY "allow_all" ON table USING (true);

   -- RIGHT: Explicit user-scoped policy
   CREATE POLICY "user_data" ON table
     USING (auth.uid() = user_id)
     WITH CHECK (auth.uid() = user_id);
   ```

2. **Mandatory RLS enforcement:**
   - Run automated checks that ALL tables have RLS enabled
   - Verify policies are not trivially permissive (`USING (true)`)
   - Block deployment if RLS checks fail

3. **Test RLS policies adversarially:**
   - Impersonate different users and attempt cross-tenant data access
   - Test with unauthenticated requests using only the anon_key
   - Test write operations separately from reads

4. **Server-side validation layer:**
   - Don't rely solely on RLS; add Edge Functions as middleware
   - Validate business logic server-side before database operations
   - Use the service_role key only in server-side Edge Functions

5. **Audit tooling:**
   ```sql
   -- Find tables without RLS enabled
   SELECT schemaname, tablename
   FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename NOT IN (
       SELECT tablename FROM pg_tables t
       JOIN pg_class c ON c.relname = t.tablename
       WHERE c.relrowsecurity = true
     );
   ```

### 4.4 Management API Security for Platforms

**Authentication options:**
- Personal Access Tokens (PAT): Long-lived, for automation/CI-CD
- OAuth 2.0 with PKCE: Short-lived, for third-party apps managing user projects

**OAuth token management:**
- Access tokens include standard Supabase JWT claims plus OAuth-specific claims
- Custom Access Token Hooks allow injecting client-specific metadata
- Token rotation handled by OAuth refresh flow
- Store tokens server-side only; never expose to client

**Best practices for platform builders:**
- Use OAuth 2.0 (not PATs) for user-facing operations
- Scope tokens to minimum required permissions
- Rotate tokens regularly
- Audit API access logs
- Use separate service accounts per environment (dev/staging/prod)

### 4.5 Per-Tenant Project Architecture

For a platform like Lovable/KEYHOLDER where each user gets a Supabase project:

```
Platform Backend (your server)
    │
    │ Management API (OAuth token)
    ▼
Supabase Management API
    │
    │ Creates/manages projects per tenant
    ▼
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Tenant A   │ │ Tenant B   │ │ Tenant C   │
│ Project    │ │ Project    │ │ Project    │
│ (own PG)   │ │ (own PG)   │ │ (own PG)   │
│ (own auth) │ │ (own auth) │ │ (own auth) │
│ (own RLS)  │ │ (own RLS)  │ │ (own RLS)  │
└────────────┘ └────────────┘ └────────────┘
```

**Advantages:** True isolation; one tenant's RLS mistake doesn't affect others.
**Cost:** $0/month for paused projects; $25/month for active (or self-hosted for $0).

Source: [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security),
[Supabase Token Security](https://supabase.com/docs/guides/auth/oauth-server/token-security),
[Supabase Roles](https://supabase.com/docs/guides/database/postgres/roles)

---

## 5. Alternative Isolation Approaches

### 5.1 WebContainers (StackBlitz / Bolt.new)

**How it works:**
- Full Node.js runtime compiled to WebAssembly, running entirely in the browser
- Virtual filesystem in browser memory
- Package managers (npm/yarn) run in-browser
- Dev servers accessible via browser's own network stack

**Security model:**
- Isolation provided by the browser sandbox (same-origin policy, process isolation)
- No server-side execution = no server to compromise
- Cannot access host filesystem or network
- Limited to what the browser allows

**Tradeoffs:**
| Advantage | Limitation |
|-----------|------------|
| Zero infrastructure cost | Limited to Node.js/browser-compatible code |
| Browser sandbox is well-tested | No native binary execution |
| Instant startup (ms) | Limited filesystem (in-memory) |
| No network attack surface | Cannot run databases, Docker, etc. |
| Offline capable | Performance limited by browser |

Source: [StackBlitz WebContainers Blog](https://blog.stackblitz.com/posts/introducing-webcontainers/)

### 5.2 V8 Isolates (Cloudflare Workers / Deno Deploy)

**How it works:**
- Multiple independent JavaScript contexts within a single OS process
- Each isolate has its own heap, global object, and event loop
- Sub-millisecond startup (no VM or container creation)

**Security model:**
- Logical isolation: separate heaps, no shared memory between isolates
- V8's sandbox enforces memory safety within each isolate
- But: all isolates share an OS process on the host

**The debate (Fly.io vs Cloudflare):**
- Kurt Mackey (Fly.io): "Multiple isolates shouldn't share an OS process without sandboxing"
- Kenton Varda (Cloudflare): "Strict process isolation would impose an order of magnitude more
  overhead in CPU and memory usage"
- Cloudflare's position: V8's isolation is sufficient, proven at massive scale
- Fly.io's position: Hardware isolation is the only safe choice for truly untrusted code

**Deno Deploy specifics:**
- Built on V8 but adds Deno's permission model (no fs/net by default)
- Secure-by-default: explicit permissions required for filesystem, network, env access
- Git deploys in ~3.5 seconds

Source: [Isolates, MicroVMs, WebAssembly](https://notes.crmarsh.com/isolates-microvms-and-webassembly),
[MicroVMs vs V8 Isolates](https://sumofbytes.com/blog/micro-vms-firecaracker-v8-isolates-gvisor-new-era-of-virtualization/)

### 5.3 Lightweight Linux Sandboxing Tools

**nsjail** (Google):
- Uses Linux namespaces + seccomp-bpf + cgroups
- Protobuf-based configuration
- Production-proven (used in Google CTF infrastructure)
- Good for server workloads; complex configuration
- Does NOT require root when using CLONE_NEWUSER

**bubblewrap (bwrap):**
- ~50KB static binary, ~4K lines of C
- Maintained by GNOME/Flatpak team
- Handles PID/UTS/IPC/net namespaces, bind mounts, tmpfs, symlinks
- `--die-with-parent` ensures cleanup
- Used by Flatpak for every sandboxed desktop app on Linux
- Best for: wrapping CLI processes with minimal overhead

**Landlock LSM:**
- Linux Security Module (kernel 5.13+)
- Fine-grained filesystem access control per-path
- Network binding/connecting per-port (kernel 6.2+)
- No root required (unprivileged processes can use it)
- Cannot create namespaces or do bind mounts
- ~50 lines of Rust to integrate
- Best for: defense-in-depth layer combined with other tools

**Landrun** (Go CLI wrapper for Landlock):
- Makes Landlock accessible via CLI
- Lightweight sandboxing without containers

Source: [ai-jail Sandbox Alternatives](https://github.com/akitaonrails/ai-jail/blob/master/docs/sandbox-alternatives.md),
[Landrun](https://biggo.com/news/202503241142_Landrun_Makes_Linux_Landlock_Security_Accessible)

### 5.4 E2B.dev (Sandbox-as-a-Service)

**Architecture:**
- Firecracker microVM per sandbox
- ~150ms cold start
- Full Linux environment with filesystem, network, and process isolation
- Open source (Apache-2.0)
- SDK for Python, JavaScript, Go

**Limitations:**
- 24-hour maximum session duration
- Short-lived by design (5-10 minute default sessions)
- No built-in orchestration for long-lived workloads
- Scaled from 40K sessions/month (March 2024) to ~15M/month (March 2025)

### 5.5 Modal.com

**Architecture:**
- gVisor-based isolation (Sentry intercepts syscalls)
- Python SDK for workload definition
- Integrated GPU support for ML workloads
- Auto-scaling to 10,000+ concurrent units

**Security model:**
- gVisor Sentry reimplements ~70-80% of Linux syscalls in Go
- Only ~70 audited syscalls reach the host kernel (vs ~300 for containers)
- Not VM-level isolation, but significantly stronger than containers
- Production users include Lovable and Quora running millions of daily code snippets

### 5.6 WebAssembly (WASM) Sandboxing

**Security model:**
- Memory-safe bytecode with no direct syscall interface
- Only explicitly imported functions are accessible
- Linear memory model prevents out-of-bounds access
- No filesystem, network, or process spawning by default

**Limitations:**
- Language support constraints (arbitrary Python requires compiling interpreter + extensions)
- WASI standard still immature (no HTTP requests in standard WASI)
- Excellent where "you control the toolchain"
- Struggles with general-purpose arbitrary code execution

**Performance:**
- Sub-millisecond startup
- Fermyon's Spin: tens of thousands of WASM binaries in single instance
- Near-native execution speed

Source: [Northflank E2B Alternatives](https://northflank.com/blog/best-alternatives-to-e2b-dev-for-running-untrusted-code-in-secure-sandboxes),
[Modal Sandbox Docs](https://modal.com/docs/guide/sandboxes)

---

## 6. Real-World Security Incidents

### 6.1 CVE-2025-48757: Lovable RLS Bypass (Full Analysis)

**Discovery:**
- March 20, 2025: Matt Palmer (Replit engineer) discovers the vulnerability
- March 21, 2025: Vendor (Lovable) notified
- March 24, 2025: Vendor acknowledges
- May 29, 2025: Public disclosure after 45-day responsible disclosure window
- Independent reporting by Danial Asaria

**Root cause:**
Lovable's AI-generated code made direct REST API calls to Supabase databases from the browser
using a public `anon_key`. Security depended entirely on RLS policies being correct. The AI
frequently generated missing or insufficient RLS policies.

**Exploitation method:**
1. Observe network traffic from a Lovable app to identify Supabase endpoint
2. Extract the public `anon_key` from client-side JavaScript
3. Modify REST request to query `?select=*` from any table
4. No authentication required; 15 lines of Python suffice

**Scope:**
- 1,645 Lovable apps analyzed from the platform showcase
- 170 apps (10.3%) contained critical flaws
- 303 vulnerable endpoints across the sample set
- Affects all Lovable versions through April 15, 2025

**Data exposed:**
- PII: names, emails, LinkedIn profiles, home addresses
- API keys: Google Maps, Gemini API, eBay credentials
- Financial data: transaction details, payment status, personal debt amounts
- Admin access tokens

**CVSS score:** 8.26 (High severity)
- Confidentiality: High (unauthorized data access)
- Integrity: Low-to-High (unauthorized writes)
- Availability: None

**Key detail:** A single engineer discovered and exploited the vulnerability in 47 minutes using
only 15 lines of Python and basic HTTP requests.

**Lovable's response:**
- Introduced a "security scanner" tool
- Scanner only checks for RLS policy *existence*, not *correctness*
- No patches available; only workarounds provided
- Affected "all versions"

**Broader context:**
- Research shows 40-48% of AI-generated code contains vulnerabilities
- Lovable scored 1.8/10 on VibeScamming Benchmark (lowest of tested platforms)
- The vulnerability exposed a systemic architectural flaw, not an isolated bug

Source: [CVE-2025-48757 NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-48757),
[Matt Palmer CVE Report](https://mattpalmer.io/posts/2025/05/CVE-2025-48757/),
[Superblocks Analysis](https://www.superblocks.com/blog/lovable-vulnerabilities),
[Desplega Analysis](https://www.desplega.ai/blog/vibe-break-chapter-iv-the-lovable-inadvertence),
[Momen Security Analysis](https://momen.app/blogs/security-issues-lovable-rls-api-key-exposure-ai-phishing/)

### 6.2 VM2 Sandbox Escapes (Affecting Replit and Others)

**vm2** was the most popular Node.js sandboxing library, used by Replit and many other platforms.

- Multiple critical sandbox escape CVEs discovered
- Exploited fail-open behavior in promise catch block configuration
- Allowed untrusted JavaScript to execute with full host process privileges
- vm2 is now **deprecated** -- maintainers recommend against use
- Lesson: Userland JavaScript sandboxing is fundamentally fragile; always use OS-level or
  hardware-level isolation for untrusted code

Source: [Semgrep VM2 Analysis](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/),
[Bleeping Computer VM2 PoC](https://www.bleepingcomputer.com/news/security/new-sandbox-escape-poc-exploit-available-for-vm2-library-patch-now/)

### 6.3 Container Escape CVEs (Affecting Docker/Kubernetes Users)

**CVE-2024-21626** (runc):
- File descriptor leak allowing containers to access host filesystem
- Affected all Docker and Kubernetes deployments using runc
- Real-world exploitation demonstrated

**CVE-2025-31133, 31665, 31881:**
- Mount race conditions enabling writes to protected host paths from inside containers
- Pattern: Implementation bugs in container runtime, not kernel exploitation

**Lesson:** Containers provide isolation against accidents, not adversaries. For adversarial
workloads, use hardware-level isolation (Firecracker, Kata) or at minimum gVisor.

### 6.4 Browser Sandbox Escapes (2025)

**CVE-2025-2783** (Chrome):
- Critical zero-day allowing escape from Chrome's sandbox
- Actively exploited in the wild

**CVE-2025-2857** (Firefox):
- Improper IPC handling allowing child process to gain elevated privileges

**Relevance:** If your platform uses WebContainers (StackBlitz/Bolt.new model), browser sandbox
escapes are your threat vector instead of VM escapes. Browser vendors patch quickly, but
zero-days do exist.

### 6.5 Fly.io / Firecracker

No publicly disclosed security breaches or VM escape incidents for Fly.io or Firecracker
microVMs as of March 2026. Firecracker's minimal codebase in memory-safe Rust and its defense-
in-depth architecture have held up well.

Source: [OX Security CVE-2025-4609](https://www.ox.security/blog/the-aftermath-of-cve-2025-4609-critical-sandbox-escape-leaves-1-5m-developers-vulnerable/)

---

## 7. Comparison Matrix

### 7.1 Isolation Technology Security Spectrum

From weakest to strongest:

```
Weakest                                                      Strongest
├──────────┬──────────┬──────────┬──────────┬──────────┬──────────┤
│ No       │ Linux    │ Docker   │ gVisor   │ Firecracker│ Dedicated│
│ isolation│ namespaces│ container│          │ microVM   │ bare-metal│
│          │ alone    │ + seccomp│          │           │ VM       │
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Lovable  │ nsjail   │ Gitpod   │ Modal    │ E2B      │ Enterprise│
│ (client  │ bubblewrap│          │          │ Replit   │ banks    │
│  only)   │          │          │          │ CodeSandbox│         │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘

Host syscall exposure:
  ~340        ~340      ~300       ~70        ~35-40      N/A
  (all)       (all)     (filtered) (Sentry)   (VMM only)  (own HW)
```

### 7.2 Cost vs Security Tradeoff

| Approach | Security | Cold Start | $/user/month | Complexity |
|----------|----------|-----------|--------------|------------|
| Client-only (Lovable) | Low | 0ms | $0 | Low |
| WebContainers | Medium | <100ms | $0 | Low |
| V8 Isolates | Medium-High | <1ms | $0.01-0.10 | Medium |
| gVisor (Modal) | High | ~300ms | $0.10-1.00 | Medium |
| Firecracker (E2B/Fly) | Very High | ~150ms | $1-25 | High |
| Dedicated VM | Highest | 10-60s | $25-100+ | Very High |

---

## 8. Recommendations for KEYHOLDER

### 8.1 If Building a Code Execution Platform

**Minimum viable security for running user/AI-generated code:**

1. **Use Firecracker microVMs** (via E2B, Fly.io, or self-hosted) for code execution
2. **Never run user code on your infrastructure** without VM-level isolation
3. **Network isolation by default** -- whitelist only required outbound connections
4. **Resource limits** -- CPU, memory, process count, disk via cgroups
5. **Ephemeral environments** -- destroy and recreate rather than reuse
6. **npm install in sandbox** -- run package installation inside the VM, not on host

### 8.2 For Supabase Integration

1. **One Supabase project per tenant** -- true database-level isolation
2. **Mandatory RLS enforcement** -- automated checks before deployment
3. **Never expose service_role key** -- server-side Edge Functions only
4. **Test RLS adversarially** -- attempt unauthorized access as part of CI/CD
5. **Server-side validation layer** -- don't rely solely on RLS
6. **Audit all tables for RLS** periodically with automated queries

### 8.3 Avoiding the Lovable Mistake

The fundamental lesson from CVE-2025-48757:

> **Do not trust AI-generated security policies.** Verify them automatically and adversarially.

Specifically:
- AI-generated RLS policies must be validated, not just checked for existence
- Client-side-only architectures must have compensating server-side controls
- Security scanning must test policy *effectiveness*, not just *presence*
- Every table accessible via the API must have explicit, tested RLS policies
- Default should be deny-all, not allow-all

### 8.4 Architecture Decision Tree

```
Is the code trusted (your own code only)?
  ├── YES → Docker container with seccomp is fine
  └── NO → Is it AI-generated or user-written?
       ├── AI-generated (limited scope) → gVisor (Modal pattern)
       └── Arbitrary user code → Firecracker microVM (E2B/Fly.io pattern)
            └── Need persistent workspace?
                 ├── YES → Fly Machines + Volumes
                 └── NO → E2B ephemeral sandboxes
```

---

## Sources Index

### Firecracker / MicroVM
- [Firecracker GitHub](https://github.com/firecracker-microvm/firecracker)
- [Firecracker Design Doc](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md)
- [Firecracker Seccomp JSON (x86_64)](https://github.com/firecracker-microvm/firecracker/blob/main/resources/seccomp/x86_64-unknown-linux-musl.json)
- [Firecracker Security Analysis](https://securemachinery.com/2019/09/08/firecracker-microvm-security/)
- [USENIX Paper: Firecracker](https://www.usenix.org/system/files/nsdi20-paper-agache.pdf)
- [UW Academic Paper: Firecracker vs gVisor](https://pages.cs.wisc.edu/~swift/papers/vee20-isolation.pdf)

### Fly.io
- [Fly.io Architecture](https://fly.io/docs/reference/architecture/)
- [Sandboxing and Workload Isolation Blog](https://fly.io/blog/sandboxing-and-workload-isolation/)
- [Per-User Dev Environments Blueprint](https://fly.io/docs/blueprints/per-user-dev-environments/)
- [Fly.io Security Practices](https://fly.io/docs/security/security-at-fly-io/)

### Lovable / CVE-2025-48757
- [CVE-2025-48757 NVD](https://nvd.nist.gov/vuln/detail/CVE-2025-48757)
- [Matt Palmer's CVE Report](https://mattpalmer.io/posts/2025/05/CVE-2025-48757/)
- [Matt Palmer's Statement](https://mattpalmer.io/posts/2025/05/statement-on-CVE-2025-48757/)
- [Superblocks: 170+ Apps Exposed](https://www.superblocks.com/blog/lovable-vulnerabilities)
- [Desplega: Lovable Inadvertence](https://www.desplega.ai/blog/vibe-break-chapter-iv-the-lovable-inadvertence)
- [Momen: Lovable Security Issues](https://momen.app/blogs/security-issues-lovable-rls-api-key-exposure-ai-phishing/)

### Sandbox Comparisons
- [Better Stack: Best Sandbox Runners 2026](https://betterstack.com/community/comparisons/best-sandbox-runners/)
- [Northflank: Secure Runtime for Codegen](https://northflank.com/blog/secure-runtime-for-codegen-tools-microvms-sandboxing-and-execution-at-scale)
- [Northflank: Firecracker vs gVisor](https://northflank.com/blog/firecracker-vs-gvisor)
- [Northflank: E2B vs Modal](https://northflank.com/blog/e2b-vs-modal)
- [Agent Sandbox Practical Guide](https://www.vietanh.dev/blog/2026-02-02-agent-sandboxes)
- [Sandbox Isolation Discussion](https://www.shayon.dev/post/2026/52/lets-discuss-sandbox-isolation/)
- [Awesome Sandbox (GitHub)](https://github.com/restyler/awesome-sandbox)

### V8 Isolates / WebContainers
- [Isolates, MicroVMs, and WebAssembly](https://notes.crmarsh.com/isolates-microvms-and-webassembly)
- [MicroVMs, Isolates, Wasm, gVisor](https://sumofbytes.com/blog/micro-vms-firecaracker-v8-isolates-gvisor-new-era-of-virtualization/)
- [StackBlitz WebContainers Intro](https://blog.stackblitz.com/posts/introducing-webcontainers/)
- [V8 Isolates vs Firecracker (Aalto Thesis)](https://aaltodoc.aalto.fi/items/2e7c3647-5cc4-4441-a586-6c122f42be5f)

### Supabase Security
- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Token Security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security)
- [Supabase Best Practices](https://www.leanware.co/insights/supabase-best-practices)
- [Supabase RLS Best Practices (Makerkit)](https://makerkit.dev/blog/tutorials/supabase-rls-best-practices)

### npm Supply Chain
- [CISA: npm Supply Chain Alert](https://www.cisa.gov/news-events/alerts/2025/09/23/widespread-supply-chain-compromise-impacting-npm-ecosystem)
- [GitHub: Supply Chain Security](https://github.blog/security/supply-chain-security/strengthening-supply-chain-security-preparing-for-the-next-malware-campaign/)

### Alternative Tools
- [ai-jail Sandbox Alternatives](https://github.com/akitaonrails/ai-jail/blob/master/docs/sandbox-alternatives.md)
- [Landrun (Landlock CLI)](https://biggo.com/news/202503241142_Landrun_Makes_Linux_Landlock_Security_Accessible)
- [E2B.dev](https://e2b.dev/)
- [Modal Sandboxes Docs](https://modal.com/docs/guide/sandboxes)

### Hypervisor Security
- [Google Project Zero: KVM Escape](https://projectzero.google/2021/06/an-epyc-escape-case-study-of-kvm.html)
- [VMware ESXi Zero-Days (March 2025)](https://www.cybereason.com/blog/zero-day-vulnerabilities-vmware)
- [Semgrep: VM2 Sandbox Escape](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/)
