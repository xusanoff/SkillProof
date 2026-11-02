# SkillProof — web (Next.js)

Stack: Next.js 16 (App Router, Cache Components), TypeScript strict, Tailwind v4, shadcn/ui (Radix),
next-intl (`/uz` default, `/ru`, `/en`), TanStack Query, openapi-fetch, Motion.

```bash
pnpm install
pnpm dev                 # http://localhost:3000 → /uz
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm start               # production server
pnpm test:e2e            # Playwright against BASE_URL; the API is mocked with page.route (no backend needed)
PHASE=1 BASE_URL=http://localhost:3100 pnpm screenshots
                         # → ../docs/reports/phase-$PHASE/img, from the REAL stack (web + API);
                         #   seeds its own users/company via the API. INVITE_TOKEN=… adds the invitation page.
pnpm gen:api             # regenerate src/lib/api/schema.d.ts from $OPENAPI_URL
```

- Env vars: see `.env.example`. The app name lives only in `src/config/app.ts`.
- `/api/*` is proxied to `API_INTERNAL_URL` at runtime by `src/app/api/[...path]/route.ts`.
- Add a language: `src/i18n/routing.ts` → `locales`, plus `messages/<code>.json`.
- Design tokens: `src/app/globals.css` (semantic → shadcn aliases → score/suspicion states).
- Auth: httpOnly cookies only. The API client (`src/lib/api/client.ts`) refreshes once on 401
  (shared between concurrent requests) and retries; guards are client-side (`RequireAuth`, D-017/D-018).
- Search autosuggest: swap `defaultSuggestSource` in `src/features/search/suggest.ts` (Phase 2).
