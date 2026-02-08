# MikroChat

![Icon](./icons/icon-144x144.png)

**The minimalist chat app that's all yours**.

MikroChat is a minimalistic, self-hosted chat application for teams who want complete control over their communication -- without expensive bills, vendor lock-in, or distractions.

![Build Status](https://github.com/mikaelvesavuori/mikrochat/workflows/main/badge.svg)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## Features

- **Batteries included** -- frontend and backend in one package
- **Channel-based messaging** with text and image support
- **Threaded replies** on channel messages
- **Direct messages** between users
- **Emoji reactions** on messages
- **Real-time updates** via Server-Sent Events
- **Dark mode** for the hackers
- **PWA support** -- installable with offline read access
- **Encryption at rest** -- AES-256-GCM encryption for all stored data
- **Flexible auth** -- dev mode, magic link, password, or OAuth 2.0 (email config only needed for magic link)
- **Webhooks** -- let external services post messages to channels
- **Lightweight** -- minimal dependencies, single-file deployable

![Example view inside MikroChat](./readme/message.png)

## Quick Start

### Production (recommended)

Install the CLI with a single command, then download and run MikroChat:

```bash
curl -sSL https://releases.mikrochat.com/install.sh | bash
mikrochat install

mkdir my-chat && cd my-chat
mikrochat init
# Edit mikrochat.config.json with your settings
mikrochat start
```

The API runs on `http://localhost:3000`. Serve the `app/` directory (created by `mikrochat init`) with your web server of choice (Caddy, nginx, etc.) for the frontend.

### Download release

Download the [latest release](https://releases.mikrochat.com/mikrochat_latest.zip), extract it, and deploy:

- `api/mikrochat.mjs` -- run with `node mikrochat.mjs` on your server
- `app/` -- deploy to any static host or serve with a reverse proxy

### Development

```bash
git clone https://github.com/mikaelvesavuori/mikrochat.git
cd mikrochat
npm install

cp mikrochat.config.example.json mikrochat.config.json
# Edit mikrochat.config.json with your settings

# Start frontend (terminal 1)
npm run dev

# Start backend (terminal 2)
npm run dev:reload
```

Open `http://localhost:8000` and sign in with your configured initial user's email.

## Documentation

Full documentation is available at **[docs.mikrochat.com](https://docs.mikrochat.com)**:

- [Introduction](https://docs.mikrochat.com/getting-started/intro) -- What is MikroChat?
- [Installation & Quickstart](https://docs.mikrochat.com/getting-started/installation-quickstart) -- Get up and running
- [Configuration](https://docs.mikrochat.com/guides/configuration) -- All configuration options
- [Authentication](https://docs.mikrochat.com/guides/authentication) -- Dev mode vs magic links
- [Deployment](https://docs.mikrochat.com/guides/deployment) -- Production deployment guide
- [API Reference](https://docs.mikrochat.com/reference/api) -- HTTP API endpoints

## Encryption

MikroChat supports AES-256-GCM encryption at rest for all stored data (messages, users, channels, conversations, and settings). To enable it, set the `STORAGE_KEY` environment variable or pass `--encryptionKey` when starting the server:

```bash
STORAGE_KEY=your-secret-key npm start
```

When enabled, all values written to the database are encrypted with a key derived from your secret using `scrypt`. Database keys (e.g. `message:abc123`) remain unencrypted so prefix-based lookups continue to work. Without a `STORAGE_KEY`, data is stored unencrypted (the default).

## Technology

- **Frontend**: Vanilla HTML, CSS, and JavaScript (compiled with esbuild)
- **Backend**: TypeScript with [MikroServe](https://github.com/mikaelvesavuori/mikroserve)
- **Storage**: [PikoDB](https://github.com/mikaelvesavuori/pikodb) embedded database
- **Auth**: [MikroAuth](https://github.com/mikaelvesavuori/mikroauth) (magic links, passwords, OAuth 2.0)
- **Config**: [MikroConf](https://github.com/mikaelvesavuori/mikroconf) for configuration management
- **IDs**: [MikroID](https://github.com/mikaelvesavuori/mikroid) for unique ID generation
- **Real-time**: Server-Sent Events

## License

MIT. See the [LICENSE](LICENSE) file.
