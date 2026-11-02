# SkillProof

AI skill-verified hiring platform. The single source of truth is [`PROJECT_SPEC.md`](PROJECT_SPEC.md).

## Quick start
```bash
cp .env.example .env
make up            # api :8000, web :3000, postgres, redis, worker
open http://localhost:3000/uz
curl localhost:8000/health
```

## Development
| | Backend (`/backend`) | Frontend (`/frontend`) |
|---|---|---|
| install | `uv sync` | `pnpm install` |
| run | `uv run uvicorn app.main:app --reload` | `pnpm dev` |
| test | `uv run pytest` | `pnpm test`, `pnpm test:e2e` |
| lint | `uv run ruff check . && uv run mypy app` | `pnpm lint && pnpm typecheck` |

`make test`, `make lint`, `make migrate`, `make screenshots`.

No API keys are needed: LLM, STT and TTS use mock providers by default.

Docs: `docs/DECISIONS.md`, `docs/CHANGELOG.md`, `docs/API.md`, phase reports in `docs/reports/`.
