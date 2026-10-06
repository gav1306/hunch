# Hunch

Turn a hunch about your own life ("does coffee wreck my sleep?") into a small
personal trial: a baseline phase, an intervention phase, daily check-ins, and a
verdict at the end.

Next.js (App Router) · Prisma on Postgres · Better Auth · Inngest · Mastra agents.

## Local setup

```bash
cp .env.example .env   # fill in the values
npm install
npm run dev            # starts Postgres via docker compose, then next dev
```

## Checks

```bash
npm run typecheck
npm run lint
npm test               # unit tests
npm run test:eval      # agent evals (hits the LLM provider)
```

See `PLAN.md`, `RESEARCH.md` and `RULES.md` for the product plan and design rules.
