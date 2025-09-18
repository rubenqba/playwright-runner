# Repository Guidelines

## Project Structure & Module Organization
This service is a NestJS runner focused on orchestrating Playwright executions. Application code lives in `src/`. Core wiring resides in `src/app.module.ts`, while the `executions/` subtree holds queue processors, HTTP controllers, and supporting `schemas/`, `services/`, and `types/`. Runtime bootstrap logic sits in `src/main.ts`, pulling configuration from `src/config/env.schema.ts`. End-to-end harnesses and Jest config live under `test/`, and build artifacts output to `dist/` after a production build.

## Build, Test, and Development Commands
Install dependencies with `pnpm install` (the lockfile assumes pnpm 9+). Use `pnpm start:dev` for a hot-reload Nest server, or `pnpm start` for a single run. Package a deployable build with `pnpm build`, then start it from compiled sources via `pnpm start:prod`. Lint and auto-fix code with `pnpm lint`, and format TypeScript with `pnpm format`.

## Coding Style & Naming Conventions
TypeScript 5 with ES modules is the standard. Follow Nest patterns: modules in PascalCase, injectable services ending in `Service`, controllers ending in `Controller`, and queue processors ending in `Processor`. Use camelCase for variables and function names. Source files use two-space indentation, single quotes, and trailing commas where Prettier enforces them. Run `pnpm lint` and `pnpm format` before submitting changes.

## Testing Guidelines
Unit tests belong next to their subjects as `*.spec.ts` files. Execute the suite with `pnpm test`; keep coverage healthy with `pnpm test:cov`, which writes results to `coverage/`. End-to-end scenarios live in `test/app.e2e-spec.ts` and run via `pnpm test:e2e`. When adding new behaviour, include focused assertions and prefer deterministic data factories over randomised inputs.

## Commit & Pull Request Guidelines
Commits follow Conventional Commit semantics, e.g. `feat: add execution retention policy`. Write imperative, concise summaries and push logically complete changes. Before opening a pull request, ensure `pnpm lint && pnpm test` pass, describe the motivation, link any tracking tickets, and add screenshots or logs for UI or workflow changes. Flag configuration impacts and call out any manual steps required for deployment or local setup.
