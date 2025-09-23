# Playwright Runner Service

## Architecture Overview

This is a NestJS microservice that orchestrates Playwright test executions via Redis queue processing. Tests are stored in MongoDB, executed asynchronously, and their results are persisted with metrics collection.

**Key Components:**
- `src/executions/` - Core execution module containing controllers, processors, schemas, and services
- `src/app.module.ts` - Wires together MongoDB (Mongoose), Redis (Bull), and ConfigService with global validation
- `src/config/env.schema.ts` - Zod-based environment validation enforcing required MONGODB_URI and optional Redis settings

## Development Workflow

**Prerequisites:**
- Use `pnpm` for package management (lockfile assumes pnpm 9+)
- Start dependencies: `docker compose up -d` (MongoDB + Redis) or use VS Code tasks

**Core Commands:**
```bash
pnpm start:dev    # Hot-reload development server
pnpm lint         # ESLint with auto-fix
pnpm format       # Prettier formatting
pnpm test:cov     # Jest with coverage report
```

**Environment Setup:**
- Copy `.env.local` or `.env` with `MONGODB_URI`, `REDIS_HOST`, `REDIS_PORT`
- Config validation happens at startup via `envSchema.parse()` in `app.module.ts`

## Code Patterns & Conventions

**NestJS Module Organization:**
- Services end with `Service`, controllers with `Controller`, processors with `Processor`
- Use dependency injection tokens: `PLAYWRIGHT_EXECUTOR_TOKEN` for service abstraction
- Feature modules (like `ExecutionsModule`) register their own Bull queues and Mongoose schemas

**Queue Processing Pattern:**
```typescript
// Controller enqueues with Bull
await this.testQueue.add('execute-test', { execution });

// Processor handles async execution
@Process('execute-test')
async handleTestExecution(job: Job<TestExecutionJobData>) {
  await this.executor.executeTest(job.data.execution);
}
```

**Data Validation:**
- Use Zod schemas for request validation: `ExecutionInputSchema.parse(data)`
- Mongoose schemas mirror TypeScript types from `src/executions/types/`
- Status tracking: `queued` → `running` → `completed|failed`

**Service Abstraction:**
- `IPlaywrightExecutor` interface allows swapping execution strategies
- Current implementation: `PlaywrightCliExecutorService` spawns CLI processes
- Alternative implementations: `PlaywrightInlineExecutorService`, `PlaywrightSOExecutorService`

## Database Schema

**Collections:**
- `executions` - Main execution records with status tracking
- `execution_metrics` - Performance metrics (duration, pass/fail counts)
- `execution_details` - Individual test results within executions

**Key Relationships:**
- One execution → multiple execution details
- Execution status lifecycle tracked with timestamps (`started`, `completed`)

## Testing Considerations

- Unit tests use `*.spec.ts` alongside source files
- E2E tests in `test/app.e2e-spec.ts` require MongoDB/Redis connectivity
- Mock external dependencies (Playwright CLI) in unit tests
- Coverage reports output to `coverage/` directory

## Critical Integration Points

**Playwright Execution:**
- Dynamic test file generation in temp directories
- CLI process spawning with timeout handling (5min default)
- Results parsing from JSON output files
- Cleanup of temporary test artifacts

**Queue Management:**
- Bull Redis integration for background processing
- Job timeout and retry policies
- Running test tracking via `Set<string>` to prevent duplicates

When adding new execution strategies, implement `IPlaywrightExecutor` and update the provider in `ExecutionsModule`.
