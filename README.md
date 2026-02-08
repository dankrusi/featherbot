# FeatherBot

A personal AI agent framework built with TypeScript. Connects to messaging platforms (Telegram, WhatsApp) and provides an extensible tool/skill system powered by LLMs via the Vercel AI SDK.

## Features

- **Multi-provider LLM support** — Anthropic, OpenAI, OpenRouter
- **Messaging channels** — Telegram, WhatsApp, terminal REPL
- **Tool system** — File I/O, shell execution, web search/fetch, cron scheduling
- **Skills** — Markdown-driven plugins loaded from the workspace
- **Sub-agents** — Spawn background tasks with isolated tool sets
- **Memory** — Persistent file-based memory across sessions
- **Cron & Heartbeat** — Scheduled tasks and periodic self-reflection

## Prerequisites

- Node.js >= 20
- pnpm >= 9

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/your-username/featherbot.git
cd featherbot
pnpm install

# 2. Build
pnpm build

# 3. Start (runs onboard wizard on first launch)
pnpm start
```

The onboard wizard will:
1. Ask for your API key (auto-detects provider from key prefix)
2. Let you choose a model
3. Optionally enable Telegram and WhatsApp channels

Configuration is saved to `~/.featherbot/config.json`.

## Commands

| Command | Description |
|---------|-------------|
| `featherbot` | Smart start — runs onboard if needed, then starts agent |
| `featherbot start` | Same as bare `featherbot` |
| `featherbot onboard` | Interactive setup wizard |
| `featherbot agent` | Start the REPL |
| `featherbot agent -m "message"` | Single-shot mode |
| `featherbot gateway` | Start with all enabled channels |
| `featherbot status` | Show current configuration |
| `featherbot whatsapp login` | Pair your WhatsApp device |

## Channels

### Telegram

1. Create a bot via [@BotFather](https://t.me/BotFather)
2. Run `featherbot onboard` and enable Telegram when prompted
3. Paste your bot token
4. Start with `featherbot start`

### WhatsApp

1. Run `featherbot onboard` and enable WhatsApp when prompted
2. Run `featherbot whatsapp login` to pair via QR code
3. Start with `featherbot start`

## Configuration

The primary config file is `~/.featherbot/config.json`, created by the onboard wizard.

Environment variables can override any config value using the `FEATHERBOT_` prefix with `__` as the delimiter:

```bash
FEATHERBOT_providers__anthropic__apiKey=sk-ant-...
FEATHERBOT_channels__telegram__enabled=true
```

## Docker

```bash
# Build
docker build -t featherbot .

# Run with docker-compose
cp .env.example .env
# Edit .env with your API keys
docker compose up
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full reference architecture.

## Development

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm typecheck        # Type checking
pnpm lint             # Lint with Biome
```

### Project Structure

```
packages/
  core/       # Agent engine, tools, memory, skills, config, gateway
  channels/   # Channel implementations (terminal, telegram, whatsapp)
  bus/        # Message bus
  scheduler/  # Cron + heartbeat services
  cli/        # CLI commands
skills/       # Bundled skill plugins
workspace/    # Default workspace template
```
