# LetsShare

**Peer-to-peer file sharing, straight from the browser — no cloud storage, no accounts, no size limits.**

LetsShare moves files directly between two browsers using **WebRTC**. A lightweight signaling server only helps two browsers find each other; once connected, every byte of your files travels directly from sender to receiver. The server never sees, stores, or proxies your data.

The project ships as **two independent apps** that share a common UI/logic library:

| App | Use case | How people connect |
|---|---|---|
| **Internet** | Send a file to anyone, anywhere | Share a generated link via chat, email, etc. |
| **LAN** | Share files with everyone on your local network | Auto-discovery lobby — no links needed |

---

## How it works

```
   Sender                  Signaling Server                 Receiver
     |                    (Express + Socket.io)                |
     | 1. Create session  ─────────────────────►               |
     |                     2. Exchange WebRTC offer/answer       |
     |  ◄──────────────────────────────────────► |
     |                                                          |
     | 3. Direct P2P connection established (WebRTC DataChannel) |
     |═══════════════════════════════════════════════════════►|
     |              File transferred directly, encrypted         |
```

1. The **signaling server** is only used to exchange connection details (SDP offers/answers and ICE candidates) — a brief handshake.
2. Once both sides establish a **WebRTC DataChannel**, the file transfers **directly between browsers**, end-to-end encrypted (DTLS).
3. The server's job is done after the handshake. It never touches file contents.

---

## Internet mode

Generate a shareable link, send it to anyone, and they can download your files the moment they open it — no signup, no app install.

**Flow:**
1. Open the **Send** page, select files.
2. A unique link is generated (e.g. `https://yourapp.com/receive?id=abc123`).
3. Share that link with the recipient through any channel — chat, email, SMS.
4. They open the link, the WebRTC handshake happens automatically, and the transfer starts.

### How to use it

<!-- TODO: Replace with actual screenshot of the Send page -->
![Send page — select files and generate a link](docs/images/internet-send.png)

<!-- TODO: Replace with actual screenshot of the generated share link -->
![Share link generated, ready to copy](docs/images/internet-share-link.png)

<!-- TODO: Replace with actual screenshot of the Receive page -->
![Receive page — download in progress](docs/images/internet-receive.png)

<!-- TODO: Replace with actual screenshot of a completed transfer -->
![Transfer complete](docs/images/internet-complete.png)

---

## LAN mode

Designed for sharing files across a local network — home, office, classroom, conference — without needing internet access at all. Everyone connects to the same local server and sees a live "lobby" of who's online and what's being shared.

**Flow:**
1. Anyone on the network opens `http://letshare.local` (or the host machine's LAN IP).
2. They pick a display name and enter the **Lobby**.
3. To share, go to the **Share** tab, select files/folders, choose access mode (**Open** or **PIN-protected**), and announce.
4. Everyone else in the lobby instantly sees the new share appear as a card.
5. To download, click a share card in the **Lobby** tab (entering the PIN if required), then watch live transfer stats in the **Download** tab.

mDNS (`letshare.local`) means no IP addresses need to be shared manually — though the lobby also displays the host's IP as a fallback for devices that don't support `.local` resolution (e.g. some Android devices).

### How to use it

<!-- TODO: Replace with actual screenshot of the name-entry screen -->
![Enter the LAN room with a display name](docs/images/lan-join.png)

<!-- TODO: Replace with actual screenshot of the Lobby tab showing active shares -->
![Lobby — see who's sharing and what's available](docs/images/lan-lobby.png)

<!-- TODO: Replace with actual screenshot of the Share tab with file picker and access mode -->
![Share tab — pick files and set access mode](docs/images/lan-share.png)

<!-- TODO: Replace with actual screenshot of the PIN entry modal -->
![PIN-protected session — enter code to join](docs/images/lan-pin.png)

<!-- TODO: Replace with actual screenshot of the Download tab with live transfer stats -->
![Download tab — live transfer stats and progress](docs/images/lan-download.png)

---

## Monorepo architecture

### The problem it solves

Internet mode and LAN mode are **two separate applications** — different entry points, different signaling servers, different deployment targets (one is a public-facing service, the other runs on a local network and advertises itself via mDNS). However, they share roughly 70% of their codebase: the WebRTC connection logic, file-chunking/transfer protocol, progress tracking, and nearly every UI component (drop zones, progress bars, stat panels, file tables).

Without a monorepo, this shared logic would have to live in one of three bad places:

1. **Duplicated** in both apps — any bug fix or UI tweak has to be made twice, and the two copies drift apart over time.
2. **Published as a private npm package** — every change to shared code requires a version bump, publish step, and dependency update in both apps before it's usable. Far too much ceremony for an internal library that only these two apps consume.
3. **Extracted into one app and imported via relative paths** (`../../other-app/src/...`) — creates an implicit dependency between two apps that are supposed to be independently deployable, and breaks if either app's folder is moved.

### The solution: npm workspaces

LetsShare uses **npm workspaces** to host both applications and a shared internal package (`@letshare/core`) in a single repository, with a single `npm install` at the root resolving dependencies for everything:

```
letshare/
├── package.json              ← declares the workspaces
├── packages/
│   └── core/                  ← @letshare/core — shared internal package
└── apps/
    ├── internet/{frontend,backend}/
    └── lan/{frontend,backend}/
```

Both `apps/*/frontend/package.json` files list `@letshare/core` as a normal dependency:

```json
"dependencies": {
  "@letshare/core": "*"
}
```

npm workspaces symlinks `packages/core` into each app's `node_modules/@letshare/core` automatically. There is no build step, no publishing, and no version pinning between internal packages — when you edit a file in `packages/core/src/`, both apps see the change immediately, because they're importing the *actual source files* through a symlink, not a built artifact.

### What this solved concretely in this project

- **One copy of the WebRTC transfer engine.** The chunking, backpressure handling, and DataChannel setup in `useSpeedTracker` and the shared `lib/webrtc.js` constants are written once and used identically by both the Internet and LAN frontends.
- **One copy of every UI component.** `DropZone`, `ProgressBar`, `RadialProgress`, `Sparkline`, `ReceiverCard`, etc. are visually and behaviorally identical across both apps because they're the *same file*. A design change to `ProgressBar.jsx` instantly applies everywhere.
- **Independent deployability preserved.** Despite sharing code, `apps/internet` and `apps/lan` remain fully separate deployable units — each has its own `Dockerfile`, its own backend, its own `package.json`, and can be built, versioned, and shipped independently. The shared package is an implementation detail, not a runtime dependency that needs to be deployed separately.
- **Single dependency tree.** One `npm install` at the root installs and de-duplicates dependencies (React, Vite, Socket.io, etc.) across all four apps plus the core package, using npm's workspace hoisting. No "works on my machine" drift between apps' `node_modules`.
- **Coordinated tooling.** Root-level scripts (`npm run dev:internet`, `npm run dev:lan`, `npm run build:internet`, `npm run build:lan`) provide a single command surface, while `docker-compose.yml` profiles (`dev`, `prod`, `dev-internet`, `dev-lan`, etc.) let you spin up either or both apps together.

### Trade-offs

**Pros**

- **Zero-friction code sharing** — no publish/version/update cycle for internal code; changes are visible instantly across consumers.
- **Atomic cross-cutting changes** — a single commit/PR can update a shared component *and* both apps that use it, keeping history and review coherent.
- **Consistent tooling and standards** — one ESLint config, one Node version (`24.14.0`, enforced via `.nvmrc` and `engines`), one Tailwind theme, shared across every app.
- **Simplified local development** — one `npm install`, one `.env.example` reference at the root, one `docker-compose.yml` to run everything together for integration testing.
- **Easier refactoring** — moving logic between "shared" and "app-specific" is a file move, not a cross-repository migration.

**Cons**

- **Larger checkout and install footprint** — cloning the repo and running `npm install` pulls in dependencies for all four apps, even if you only care about one. Mitigated here by npm's hoisting, but the `node_modules` tree is still bigger than a single-app repo.
- **CI/CD needs path-aware logic** — a naive CI pipeline would rebuild and redeploy both apps on every commit, even if only one changed. Production CI should use path filters (e.g. "only rebuild `apps/internet/*` if files under `apps/internet/` or `packages/core/` changed") to avoid wasted build time and unnecessary deploys.
- **Implicit coupling risk** — because changes to `packages/core` affect both apps immediately, a breaking change to a shared component can silently break the *other* app if it isn't tested. This requires either running both apps' test suites on every core change, or being disciplined about backward-compatible changes to shared exports.
- **Single point of version truth** — `@letshare/core` has no independent version number; both apps always consume "whatever is currently in `packages/core`". This is intentional here (no version skew), but means you cannot have one app on an "older" version of a shared component while the other moves ahead — a deliberate trade-off favoring consistency over independent evolution.
- **Workspace tooling learning curve** — contributors need to understand npm workspaces semantics (e.g. running scripts with `-w <workspace>`, how hoisting affects `node_modules`), which adds a small onboarding cost compared to a plain single-package repo.

### Why this was the right call for LetsShare

The two apps are not just "similar" — they are **two deployment targets for the same underlying transfer engine**, differing primarily in discovery mechanism (link-sharing vs. mDNS lobby) and a handful of UI screens. The shared surface area (WebRTC logic + UI library) is large and changes together; the divergent surface area (signaling server, discovery UI) is cleanly separated into `apps/internet` and `apps/lan`. A monorepo with workspaces matches this shape exactly: shared code lives in one place with zero ceremony, while each app remains an independently buildable, dockerizable, deployable unit.

---

## Project structure

```
letshare/
├── packages/core/        Shared UI components, hooks, and utilities
├── apps/
│   ├── internet/
│   │   ├── frontend/      React app — Send/Receive pages
│   │   └── backend/        Signaling server (Express + Socket.io)
│   └── lan/
│       ├── frontend/       React app — Lobby, Share, Download tabs
│       └── backend/         Signaling server + mDNS advertisement
└── docker-compose.yml      Orchestrates all four services
```

See [`STRUCTURE.md`](./STRUCTURE.md) for the full file-by-file breakdown.

---

## Running locally (without Docker)

### Prerequisites

- **Node.js `24.14.0`** (see `.nvmrc` — run `nvm use` if you have nvm installed)
- npm `>=10`

### 1. Install dependencies

From the monorepo root — this installs all workspaces (`packages/core` + all four apps) in one go:

```bash
npm install
```

### 2. Set up environment files

Copy the example env files for each app:

```bash
cp apps/internet/backend/.env.example  apps/internet/backend/.env
cp apps/internet/frontend/.env.example apps/internet/frontend/.env
cp apps/lan/backend/.env.example       apps/lan/backend/.env
cp apps/lan/frontend/.env.example      apps/lan/frontend/.env
```

The defaults work out of the box for local development — no edits required to get started.

### 3. Run the Internet app

```bash
npm run dev:internet
```

This starts both the backend (port `3001`) and frontend (port `5173`) concurrently.
Open **http://localhost:5173**.

### 4. Run the LAN app

```bash
npm run dev:lan
```

This starts the LAN backend (port `3002`, with mDNS advertisement) and frontend (port `5174`) concurrently.
Open **http://localhost:5174**, or from another device on the network: **http://letshare.local:5174** (or the host's LAN IP).

> You can run both apps at the same time — they use different ports and don't conflict.

---

## Running with Docker

Docker Compose builds and runs every service — frontend and backend, for both apps — with separate **development** and **production** configurations.

### Prerequisites

- Docker Engine `24+`
- Docker Compose v2 (`docker compose`, not `docker-compose`)

### 1. Set up environment

```bash
cp .env.example .env
```

Edit `.env` to set your production domain/IP if deploying — for local testing the defaults are fine.

### 2. Development mode

Runs all containers with **hot-reload** (Vite HMR for frontends, nodemon for backends). Source code is bind-mounted, so your local edits apply instantly without rebuilding images.

```bash
# Everything (internet + LAN)
docker compose --profile dev up

# Just the internet app
docker compose --profile dev-internet up

# Just the LAN app
docker compose --profile dev-lan up
```

| Service | URL |
|---|---|
| Internet frontend | http://localhost:5173 |
| Internet backend | http://localhost:3001 |
| LAN frontend | http://localhost:5174 |
| LAN backend | http://localhost:3002 |

### 3. Production mode

Builds optimized images — Vite production builds served via nginx for frontends, lean Node.js images for backends.

```bash
# Everything
docker compose --profile prod up --build

# Just the internet app
docker compose --profile prod-internet up --build

# Just the LAN app
docker compose --profile prod-lan up --build
```

| Service | URL |
|---|---|
| Internet frontend | http://localhost (port 80) |
| Internet backend | http://localhost:3001 |
| LAN frontend | http://localhost:8080 |
| LAN backend | http://localhost:3002 |

> **mDNS in Docker:** For the LAN backend to advertise `letshare.local` on your actual network, it needs `network_mode: host`, which only works on Linux. On macOS/Windows, either run the LAN backend natively (`npm run dev:lan` from the host) or access it via the container's published port/IP instead of the `.local` hostname. See `docker-compose.yml` for details.

### 4. Stopping containers

```bash
docker compose --profile dev down
# or
docker compose --profile prod down
```

Add `-v` to also remove the named volumes (`node_modules` caches):

```bash
docker compose --profile dev down -v
```

---

## Tech stack

- **Frontend:** React 19, Vite 7, Tailwind CSS v4, React Router v7
- **Backend:** Node.js 24, Express 4, Socket.io 4
- **Transport:** WebRTC (DataChannel), Bonjour/mDNS (LAN discovery)
- **Monorepo:** npm workspaces

---

## License

Add your license here.