# code-exec-MCP

An MCP (Model Context Protocol) server that executes Python code in an isolated gVisor sandbox. Supports multiple concurrent clients via Streamable HTTP transport.

## Quick Start

```bash
npm install
npm run build
docker build -f Dockerfile.sandbox -t code-exec-sandbox:latest .
npm start
```

## Project Structure

```
src/
├── index.ts              # Entry point — transport selection, session management
├── server.ts             # Server setup & tool registration
└── tools/
    └── code_exec.ts      # Python sandbox execution tool
Dockerfile                # MCP server image
Dockerfile.sandbox        # Python sandbox image (numpy, pandas, scipy, matplotlib)
docker-compose.yml        # Production deployment
docker-entrypoint.sh      # Container startup — fixes .tmp ownership for mcp user
```

## Tool: `code_exec`

Executes a Python snippet in a sandboxed gVisor container.

- No network access
- Read-only filesystem (`/tmp` is writable, 64 MB tmpfs)
- Libraries: `numpy`, `pandas`, `scipy`, `matplotlib`
- Timeout: 10 seconds
- Output cap: 512 KB stdout + stderr

### Returning a plot

```python
import matplotlib.pyplot as plt
import base64

plt.plot([1, 2, 3])
plt.savefig("/tmp/plot.png", dpi=90)
plt.close()

with open("/tmp/plot.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()
print(f"data:image/png;base64,{b64}")
```

## Transport Modes

### stdio (default)

```bash
npm start
```

### Streamable HTTP

```bash
npm run start:http
```

Endpoint: `http://localhost:3001/mcp`  
Health check: `http://localhost:3001/health`

## Docker Deployment

The sandbox image must be built on the host before starting the stack, because the MCP server spawns sandbox containers directly via the Docker socket:

```bash
docker build -f Dockerfile.sandbox -t code-exec-sandbox:latest .
docker compose up -d
```

The MCP endpoint will be available at `http://localhost:3001/mcp`.  
Health check: `http://localhost:3001/health` → `{"status":"ok","uptime_s":…,"sessions":…}`

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `MCP_PORT` | `3001` | HTTP port for Streamable HTTP transport |

## Session Management

In HTTP mode each client gets an isolated `McpServer` instance identified by `Mcp-Session-Id` header. Sessions are evicted after **30 minutes** of inactivity. Active session count is visible in `/health`.

## Security

Each code execution runs in a separate gVisor container:

- `--runtime=runsc` — gVisor kernel isolation
- `--network=none` — no network access
- `--read-only` — read-only root filesystem
- `--cap-drop=ALL` — no Linux capabilities
- `--security-opt=no-new-privileges` — prevents privilege escalation
- `--memory=256m` — hard memory limit
- `--cpus=1.0` — hard CPU limit
- `--pids-limit=64` — prevents fork bombs

## License

MIT
