# Install

## System Requirements

- **Node 24** (recommended) or Node 22.14+
- macOS, Linux, Windows (WSL2 recommended)
- `pnpm` only needed for source builds

## Quick Install

### macOS / Linux / WSL2
```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

### Windows (PowerShell)
```powershell
iwr -useb https://openclaw.ai/install.ps1 | iex
```

### npm
```bash
npm install -g openclaw@latest
openclaw onboard --install-daemon
```

### From source
```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install && pnpm build && pnpm ui:build
pnpm link --global
openclaw onboard --install-daemon
```

## Verify
```bash
openclaw --version
openclaw doctor
openclaw gateway status
```

## Container Options

- Docker, Podman, Nix, Ansible, Bun

## Update
```bash
openclaw update
```

## Uninstall
```bash
openclaw uninstall
```

## Deployment Targets

- VPS (any Linux)
- Docker VM
- Kubernetes
- Fly.io, Hetzner, GCP, Azure, Railway, Render, Northflank
