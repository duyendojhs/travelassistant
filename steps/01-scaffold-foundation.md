# Step 01 - Scaffold Foundation

## Goal

Create the production-ready project skeleton without implementing provider-backed features.

## Scope

Create:

- `apps/web` for Next.js App Router with TypeScript.
- `apps/api` for FastAPI.
- `packages/shared` for shared API types or generated clients.
- `infra/docker` for local services.
- `tests` or app-local test folders.
- Root scripts and documentation needed to run locally.

## Requirements

- Use relative paths only.
- Do not import code directly from `../ts` or `../UI`.
- Keep old folders untouched.
- Add `.gitignore` protections for `.env`, `.env.local`, virtualenvs, node_modules, local DB files, media, build outputs, and vector DB files.
- Add `.env.example` or update the existing one using the env contract.
- Frontend must be TypeScript.
- Backend must be typed Python where practical.

## Suggested Stack

- Web: Next.js, React, TypeScript, CSS modules or Tailwind only if configured cleanly.
- API: FastAPI, Pydantic Settings, Uvicorn.
- Package manager: choose one and document it. Prefer npm if no monorepo tool is already installed.

## Validation

Run whatever applies after scaffold:

```powershell
npm --version
python --version
```

If app packages are created and dependencies installed:

```powershell
npm run lint
npm run typecheck
python -m compileall apps/api
```

Skip commands that cannot run yet and explain why.

## End Report

Report:

- Created folders.
- Package/runtime choice.
- Commands run.
- Any skipped checks.

## API Key Notice For Next Step

Step 02 does not require AI provider keys. It needs only local configuration values from `.env.example`.
