# mantler-api

[![CI](https://github.com/Borgels/mantler-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Borgels/mantler-api/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Borgels/mantler-api/actions/workflows/codeql.yml/badge.svg)](https://github.com/Borgels/mantler-api/actions/workflows/codeql.yml)
[![Release](https://img.shields.io/github/v/release/Borgels/mantler-api)](https://github.com/Borgels/mantler-api/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/badge/runtime-nodejs-green)](https://nodejs.org)

Status: initial public release track (`v0.1.x`).

OpenAI-compatible gateway for exposing Mantler mantles as `/v1/*` inference endpoints.

```text
At a glance
- What this repo is: the API gateway layer translating OpenAI-compatible requests to Mantler backends.
- What it is not: the full control plane UI/business app (see mantler).
- Core endpoints: /v1/models, /v1/chat/completions, /v1/completions.
- Try it locally: npm install && npm run dev
- Probe health: curl -s http://localhost:8787/health
```

## Quickstart

```bash
cp .env.example .env
npm install
npm run dev
```

Server default: `http://localhost:8787`.

## Links

- [Docs home](https://docs.mantler.ai)
- [API overview](https://docs.mantler.ai/api)
- [Authentication](https://docs.mantler.ai/api/authentication)
- [Endpoints](https://docs.mantler.ai/api/endpoints)
- [Usage and limits](https://docs.mantler.ai/api/usage-and-limits)
- [Live OpenAPI docs](https://docs.mantler.ai/api/openapi-reference)

## Security

See [SECURITY.md](SECURITY.md) and rate-limit/auth middleware under `src/middleware/`.

## License

[MIT](LICENSE)
