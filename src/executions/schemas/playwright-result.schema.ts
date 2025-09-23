// schemas/playwright-json-report.schema.ts
import { z } from 'zod';

/* ----------------------------- Common pieces ----------------------------- */

export const LocationSchema = z.object({
  file: z.string(),
  column: z.number().int(),
  line: z.number().int(),
});

export const AttachmentSchema = z.object({
  name: z.string(),
  contentType: z.string(),
  path: z.string(),
});

export const SingleErrorSchema = z.object({
  location: LocationSchema,
  message: z.string(),
});

export const ResultErrorSchema = z.object({
  message: z.string(),
  stack: z.string(),
  location: LocationSchema,
  snippet: z.string(),
});

/* ------------------------------- Config --------------------------------- */

const ReporterSchema = z.union([
  z.string(),
  z.tuple([
    z.string(),
    z.object({}).passthrough(), // opciones del reporter (p. ej., { outputFile })
  ]),
]);

const MetadataSchema = z.object({
  actualWorkers: z.number().int(),
});

export const ProjectSchema = z.object({
  outputDir: z.string(),
  repeatEach: z.number().int(),
  retries: z.number().int(),
  metadata: MetadataSchema,
  id: z.string(),
  name: z.string(),
  testDir: z.string(),
  testIgnore: z.array(z.any()), // en tu JSON es []
  testMatch: z.array(z.string()),
  timeout: z.number().int(),
});

export const ReportSlowTestsSchema = z.object({
  max: z.number().int(),
  threshold: z.number().int(),
});

export const ConfigSchema = z.object({
  configFile: z.string(),
  rootDir: z.string(),
  forbidOnly: z.boolean(),
  fullyParallel: z.boolean(),
  globalSetup: z.null(), // según tu JSON
  globalTeardown: z.null(),
  globalTimeout: z.number().int(),
  grep: z.record(z.string(), z.unknown()), // en tu JSON es {}
  grepInvert: z.null(), // en tu JSON es null
  maxFailures: z.number().int(),
  metadata: MetadataSchema,
  preserveOutput: z.enum(['always', 'never', 'failures-only']),
  reporter: z.array(ReporterSchema),
  reportSlowTests: ReportSlowTestsSchema,
  quiet: z.boolean(),
  projects: z.array(ProjectSchema),
  shard: z.null(),
  updateSnapshots: z.string(), // 'missing' en tu JSON
  updateSourceMethod: z.string(), // 'patch' en tu JSON
  version: z.string(),
  workers: z.number().int(),
  webServer: z.null(),
});

/* -------------------------------- Suites -------------------------------- */

export const TestResultStatusEnum = z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']).or(z.string());

export const TestResultSchema = z.object({
  workerIndex: z.number().int(),
  parallelIndex: z.number().int(),
  status: TestResultStatusEnum,
  duration: z.number(),
  error: ResultErrorSchema.optional(),
  errors: z.array(SingleErrorSchema),
  stdout: z.array(z.union([z.string(), z.object({})])),
  stderr: z.array(z.union([z.string(), z.object({})])),
  retry: z.number().int(),
  startTime: z.iso.datetime(), // ISO 8601
  annotations: z.array(z.object({})),
  attachments: z.array(AttachmentSchema),
  errorLocation: LocationSchema.optional(),
});

export const TestInstanceSchema = z.object({
  timeout: z.number().int(),
  annotations: z.array(z.object({})),
  expectedStatus: TestResultStatusEnum,
  projectId: z.string(),
  projectName: z.string(),
  results: z.array(TestResultSchema),
  status: z.string(), // 'unexpected' en tu JSON
});

export const SpecSchema = z.object({
  title: z.string(),
  ok: z.boolean(),
  tags: z.array(z.string()),
  tests: z.array(TestInstanceSchema),
  id: z.string(),
  file: z.string(),
  line: z.number().int(),
  column: z.number().int(),
});

// Recursión para suites anidadas
export const SuiteSchema = z.object({
  title: z.string(),
  file: z.string(),
  column: z.number().int(),
  line: z.number().int(),
  specs: z.array(SpecSchema),
});

/* --------------------------------- Root --------------------------------- */

export const StatsSchema = z.object({
  startTime: z.iso.datetime(),
  duration: z.number(), // puede ser decimal (ms con fracción)
  expected: z.number().int(),
  skipped: z.number().int(),
  unexpected: z.number().int(),
  flaky: z.number().int(),
});

export const PlaywrightJsonReportSchema = z.object({
  config: ConfigSchema,
  suites: z.array(SuiteSchema.extend({ suites: z.array(SuiteSchema).optional() })),
  errors: z.array(z.any()),
  stats: StatsSchema,
});

export type ResultSpec = z.infer<typeof SpecSchema>;
export type PlaywrightJsonReport = z.infer<typeof PlaywrightJsonReportSchema>;

/* --------------------------------- Uso ---------------------------------- */
// import report from './results.json' with { type: 'json' };
// const parsed = PlaywrightJsonReportSchema.parse(report);
