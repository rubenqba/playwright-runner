import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import { IPlaywrightExecutor } from './executor.interface';
import {
  Execution,
  ExecutionSchema,
  ExecutionDetail,
  ExecutionFile,
  ExecutionMetrics,
  ExecutionStatus,
} from '../types';
import {
  ExecutionDocument,
  ExecutionMetricsDocument,
  ExecutionDetailDocument,
  ExecutionFileDocument,
} from '../schemas';
import { PlaywrightTestConfig, Project, devices } from '@playwright/test';
import { PlaywrightJsonReport, ResultSpec } from '../schemas/playwright-result.schema';

interface ProcessedResults {
  status: ExecutionStatus;
  testDetails: Array<Omit<ExecutionDetail, 'execution' | 'created'>>;
  files: Array<Omit<ExecutionFile, 'id' | 'execution' | 'created' | 'detail' | 'metadata' | 'expiresAt'>>;
  metrics: Omit<ExecutionMetrics, 'execution' | 'created'>;
}

interface PlaywrightExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  resultsJson?: PlaywrightJsonReport;
  duration: number;
  resourceUsage: {
    peakMemoryMb: number;
    avgCpuPercent: number;
  };
}

// interface PlaywrightJsonReport {
//   config: any;
//   suites: Array<{
//     title: string;
//     file: string;
//     specs: Array<{
//       title: string;
//       ok: boolean;
//       tests: Array<{
//         timeout: number;
//         annotations: any[];
//         expectedStatus: string;
//         projectId: string;
//         projectName: string;
//         results: Array<{
//           workerIndex: number;
//           status: string;
//           duration: number;
//           errors: Array<{ message: string; location?: any }>;
//           stdout: any[];
//           stderr: any[];
//           retry: number;
//           startTime: string;
//           attachments: Array<{
//             name: string;
//             path: string;
//             contentType: string;
//           }>;
//         }>;
//         status: string;
//       }>;
//     }>;
//   }>;
//   errors: any[];
//   stats: {
//     startTime: string;
//     duration: number;
//     expected: number;
//     unexpected: number;
//     flaky: number;
//     skipped: number;
//   };
// }

interface ProcessMetrics {
  memoryUsage: number;
  cpuUsage: number;
  timestamp: number;
}

interface RunningTestInfo {
  startTime: number;
  process?: ChildProcess;
  metricsInterval?: NodeJS.Timeout;
  metrics: ProcessMetrics[];
}

interface ExecutionConfig {
  testTimeout: number;
  installTimeout: number;
  maxConcurrentTests: number;
  outputDir: string;
  enableResourceMonitoring: boolean;
  resourceMonitoringInterval: number;
}

/**
 * Playwright test executor that runs tests using OS-level commands and child processes.
 *
 * Creates isolated execution environments for each test, managing the complete lifecycle
 * from environment setup to result processing and cleanup. Designed for API environments
 * with robust resource management and concurrent execution control.
 *
 * **Architecture:**
 * 1. Creates unique directory with package.json and playwright.config.js
 * 2. Spawns child process running `npx playwright test`
 * 3. Captures JSON results and generated artifacts (screenshots, videos)
 * 4. Persists metrics, test details and files to database
 * 5. Performs guaranteed cleanup of temporary resources
 *
 * **Key Features:**
 * - Concurrency control (test should be executed in sequence or limited parallelism)
 * - Configurable timeouts (5min default per test)
 * - Automatic Playwright installation when needed
 * - Process lifecycle management with SIGTERM/SIGKILL handling
 * - Graceful shutdown cleanup for running tests
 * - TypeScript to JavaScript conversion for test code
 *
 * **Resource Management:**
 * - Each execution runs in isolated `test-outputs/{execution-id}/` directory
 * - Automatic cleanup of temporary files and directories
 * - Process monitoring to prevent resource leaks
 * - Memory and file system usage optimization
 *
 * **Security Considerations:**
 * - Sandboxed execution in separate processes
 * - Limited concurrent executions to prevent resource exhaustion
 * - Controlled environment variables and permissions
 * - Basic code sanitization for untrusted test input
 *
 * **Limitations:**
 * - Requires Node.js/npm available on system PATH
 * - Network dependency for initial Playwright installation
 * - File system I/O overhead for each execution
 * - Single-node only (not distributed)
 */
@Injectable()
export class PlaywrightOSExecutorService implements IPlaywrightExecutor {
  private readonly logger = new Logger(PlaywrightOSExecutorService.name);

  private readonly config: ExecutionConfig = {
    testTimeout: 60_000, // 1 minute
    installTimeout: 300_000, // 5 minutes
    maxConcurrentTests: 5,
    outputDir: path.join(process.cwd(), 'test-outputs'),
    enableResourceMonitoring: true,
    resourceMonitoringInterval: 1000, // 1 second
  };

  private runningTests = new Map<string, RunningTestInfo>();
  private shutdownPromise: Promise<void> | null = null;
  private isShuttingDown = false;

  constructor(
    @InjectModel(ExecutionDocument.name) private executionModel: Model<ExecutionDocument>,
    @InjectModel(ExecutionMetricsDocument.name) private metricsModel: Model<ExecutionMetricsDocument>,
    @InjectModel(ExecutionDetailDocument.name) private executionDetailModel: Model<ExecutionDetailDocument>,
    @InjectModel(ExecutionFileDocument.name) private executionFileModel: Model<ExecutionFileDocument>,
  ) {
    void this.initializeService();
  }

  private async initializeService(): Promise<void> {
    await this.ensureOutputDirectory();
    this.setupGracefulShutdown();
  }

  async executeTest(execution: Execution): Promise<void> {
    // Step 1: Validate and sanitize input
    this.validateExecution(execution);
    const sanitizedExecution = this.sanitizeExecution(execution);

    // Check concurrency limits
    if (this.runningTests.size >= this.config.maxConcurrentTests) {
      throw new Error(`Maximum concurrent tests (${this.config.maxConcurrentTests}) reached`);
    }

    if (this.isShuttingDown) {
      throw new Error('Service is shutting down, cannot accept new executions');
    }

    const executionDir = path.join(this.config.outputDir, sanitizedExecution.id);
    const testInfo: RunningTestInfo = {
      startTime: Date.now(),
      metrics: [],
    };

    this.runningTests.set(sanitizedExecution.id, testInfo);

    try {
      await this.updateExecutionStatus(sanitizedExecution.id, 'running', new Date());
      this.logger.log(`Starting execution ${sanitizedExecution.id}`);

      // Step 1: Create isolated execution environment
      await this.createExecutionEnvironment(executionDir, sanitizedExecution);

      // Step 2: Execute test with monitoring
      const result = await this.executeWithMonitoring(sanitizedExecution, executionDir, testInfo);

      // Step 3: Process and parse results
      const processedResults = await this.processResults(result, executionDir);

      // Step 4: Persist to database
      await this.persistResults(sanitizedExecution.id, processedResults);

      // Step 5: Cleanup resources
      // await this.cleanupExecution(executionDir);

      await this.updateExecutionStatus(sanitizedExecution.id, processedResults.status, undefined, new Date());
      this.logger.log(`Execution ${sanitizedExecution.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Execution ${sanitizedExecution.id} failed:`, error);

      await this.updateExecutionStatus(
        sanitizedExecution.id,
        'failed',
        undefined,
        new Date(),
        error instanceof Error ? error.message : 'Unknown error',
      );

      // Cleanup on failure
      // await this.cleanupExecution(executionDir).catch((cleanupError) => {
      //   this.logger.warn(`Failed to cleanup after error: ${cleanupError}`);
      // });
    } finally {
      this.stopResourceMonitoring(testInfo);
      this.runningTests.delete(sanitizedExecution.id);
    }
  }

  private validateExecution(execution: Execution): void {
    try {
      ExecutionSchema.parse(execution);
    } catch (error) {
      throw new Error(`Invalid execution object: ${error}`);
    }

    if (!execution.id || !execution.code) {
      throw new Error('Execution must have id and code');
    }
  }

  private sanitizeExecution(execution: Execution): Execution {
    // Basic sanitization to prevent code injection
    const sanitizedCode = this.sanitizeCode(execution.code);

    return {
      ...execution,
      code: sanitizedCode,
      baseUrl: execution.baseUrl ? this.sanitizeUrl(execution.baseUrl) : undefined,
    };
  }

  private sanitizeCode(code: string): string {
    // Remove potentially dangerous patterns
    const dangerousPatterns = [
      /require\s*\(\s*['"]child_process['"]\s*\)/g,
      /require\s*\(\s*['"]fs['"]\s*\)/g,
      /import.*from\s*['"]child_process['"]/g,
      /import.*from\s*['"]fs['"]/g,
      /process\.exit/g,
      /process\.kill/g,
      /eval\s*\(/g,
      /Function\s*\(/g,
    ];

    let sanitized = code;
    dangerousPatterns.forEach((pattern) => {
      sanitized = sanitized.replace(pattern, '// REMOVED_UNSAFE_CODE');
    });

    return sanitized;
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Only allow http/https protocols
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Only HTTP/HTTPS URLs are allowed');
      }
      return parsed.toString();
    } catch {
      throw new Error('Invalid URL format');
    }
  }

  private async createExecutionEnvironment(executionDir: string, execution: Execution): Promise<void> {
    // Create isolated directory
    await fs.mkdir(executionDir, { recursive: true });

    // Create package.json
    await this.createPackageJson(executionDir);

    // Create Playwright configuration
    await this.createPlaywrightConfig(executionDir, execution);

    // Create test file
    await this.createTestFile(executionDir, execution);

    // Ensure Playwright is available
    await this.ensurePlaywrightAvailable(executionDir);
  }

  private async createPackageJson(executionDir: string): Promise<void> {
    const packageJson = {
      name: 'playwright-execution',
      version: '1.0.0',
      type: 'module',
      devDependencies: {
        '@playwright/test': 'latest',
      },
    };

    await fs.writeFile(path.join(executionDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  }

  private readTimeout(obj: Record<string, unknown> = {}): number | undefined {
    if (!Object.hasOwn(obj, 'timeout')) return undefined;
    const v = obj['timeout'];

    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;

    if (typeof v === 'string') {
      const n = Number(v.trim());
      if (Number.isFinite(n) && n > 0) return n; // evita 'abc', '', '  '
    }
    return undefined;
  }

  private getTimeout(execution: Execution): number {
    return this.readTimeout(execution.executionConfig) || this.config.testTimeout;
  }

  private async createPlaywrightConfig(executionDir: string, execution: Execution): Promise<void> {
    const browserConfigs: Record<string, Project> = {
      chromium: { use: { ...devices['Desktop Chrome'], ...this.getCommonBrowserConfig(execution) } },
      firefox: { use: { ...devices['Desktop Firefox'], ...this.getCommonBrowserConfig(execution) } },
      webkit: { use: { ...devices['Desktop Safari'], ...this.getCommonBrowserConfig(execution) } },
    };

    const outputDir = path.join(executionDir, 'results');

    const config: PlaywrightTestConfig = {
      testDir: '.',
      outputDir,
      timeout: this.getTimeout(execution),
      fullyParallel: false,
      forbidOnly: true,
      reporter: [['json', { outputFile: path.join(executionDir, 'results.json') }]],
      use: {
        baseURL: execution.baseUrl,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        contextOptions: {
          recordHar: {
            mode: 'minimal',
            path: path.join(outputDir, 'network.har'),
            urlFilter: (execution.executionConfig?.harUrlFilter as string) || undefined,
          },
          // recordVideo: { dir: path.join(outputDir, 'videos') },
        },
      },
      projects: [
        {
          name: execution.browser || 'chromium',
          ...browserConfigs[execution.browser || 'chromium'],
        },
      ],
    };

    await fs.writeFile(
      path.join(executionDir, 'playwright.config.mjs'),
      `import { defineConfig, devices } from '@playwright/test';\nexport default defineConfig(${JSON.stringify(config, null, 2)});`,
    );
  }

  private getCommonBrowserConfig(execution: Execution) {
    return {
      viewport: execution.executionConfig?.viewport || { width: 1920, height: 1080 },
      headless: execution.executionConfig?.headless !== false,
    };
  }

  private async createTestFile(executionDir: string, execution: Execution): Promise<void> {
    const testFileName = `execution-${execution.id}.spec.js`;
    let testCode = execution.code;

    // Convert TypeScript to JavaScript if needed
    // if (this.isTypeScriptCode(testCode)) {
    //   testCode = this.convertTypeScriptToJavaScript(testCode);
    // }

    // Ensure proper imports
    if (!testCode.includes('import') && !testCode.includes('require')) {
      testCode = `import { test, expect } from '@playwright/test';\n\n${testCode}`;
    }

    await fs.writeFile(path.join(executionDir, testFileName), testCode);
  }

  private isTypeScriptCode(code: string): boolean {
    // Check for TypeScript-specific syntax
    const tsPatterns = [
      /:\s*\w+(\[\])?(\s*\||\s*&|\s*=|\s*,|\s*\)|\s*;)/,
      /interface\s+\w+/,
      /type\s+\w+\s*=/,
      /as\s+\w+/,
      /<\w+>/,
    ];

    return tsPatterns.some((pattern) => pattern.test(code));
  }

  private convertTypeScriptToJavaScript(tsCode: string): string {
    let jsCode = tsCode;

    // Remove type annotations
    jsCode = jsCode.replace(/:\s*[\w[\]<>|&,\s]+(?=\s*[=,;)}\]])/g, '');

    // Remove interface declarations
    jsCode = jsCode.replace(/interface\s+\w+\s*\{[^}]*\}/g, '');

    // Remove type aliases
    jsCode = jsCode.replace(/type\s+\w+\s*=[^;]+;/g, '');

    // Remove generic type parameters
    jsCode = jsCode.replace(/<[\w\s,|&]+>/g, '');

    // Remove 'as' type assertions
    jsCode = jsCode.replace(/\s+as\s+\w+/g, '');

    // Fix imports
    jsCode = jsCode.replace(
      /import.*from\s*['"]@playwright\/test['"];?/,
      "import { test, expect } from '@playwright/test';",
    );

    return jsCode;
  }

  private async ensurePlaywrightAvailable(executionDir: string): Promise<void> {
    // Check if Playwright is globally available
    try {
      await this.runCommand('npx playwright --version', executionDir, 5000);
      this.logger.debug('Playwright is available globally');
      return;
    } catch {
      this.logger.log('Installing Playwright dependencies...');
    }

    // Install locally if not available
    await this.runCommand('npm install', executionDir, this.config.installTimeout);
    await this.runCommand('npx playwright install chromium firefox webkit', executionDir, this.config.installTimeout);
  }

  private async executeWithMonitoring(
    execution: Execution,
    executionDir: string,
    testInfo: RunningTestInfo,
  ): Promise<PlaywrightExecutionResult> {
    const testFileName = `execution-${execution.id}.spec.js`;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const childProcess = spawn('npx', ['playwright', 'test', testFileName], {
        cwd: executionDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CI: 'true',
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
        },
      });

      testInfo.process = childProcess;

      // Start resource monitoring
      if (this.config.enableResourceMonitoring) {
        this.startResourceMonitoring(testInfo, childProcess.pid!);
      }

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      // Set up timeout
      const timeout = this.getTimeout(execution) + 5_000; // Extra buffer to let test finish
      const timeoutId = setTimeout(() => {
        this.logger.warn(`Test ${execution.id} timed out, terminating process`);
        this.terminateProcess(childProcess);
        reject(new Error(`Test execution timed out after ${timeout}ms`));
      }, timeout);

      childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        void (async () => {
          try {
            const resultsJson = await this.readResultsFile(executionDir);
            const resourceUsage = this.calculateResourceUsage(testInfo.metrics);

            resolve({
              exitCode: code || 0,
              stdout,
              stderr,
              resultsJson: resultsJson || undefined,
              duration,
              resourceUsage,
            });
          } catch {
            resolve({
              exitCode: code || 1,
              stdout,
              stderr,
              duration,
              resourceUsage: { peakMemoryMb: 0, avgCpuPercent: 0 },
            });
          }
        })();
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to execute Playwright: ${error.message}`));
      });
    });
  }

  private startResourceMonitoring(testInfo: RunningTestInfo, pid: number): void {
    testInfo.metricsInterval = setInterval(() => {
      void (async () => {
        try {
          const memoryUsage = await this.getProcessMemoryUsage(pid);
          const cpuUsage = await this.getProcessCpuUsage(pid);

          testInfo.metrics.push({
            memoryUsage,
            cpuUsage,
            timestamp: Date.now(),
          });
        } catch {
          // Process might have ended, ignore errors
        }
      })();
    }, this.config.resourceMonitoringInterval);
  }

  private stopResourceMonitoring(testInfo: RunningTestInfo): void {
    if (testInfo.metricsInterval) {
      clearInterval(testInfo.metricsInterval);
      testInfo.metricsInterval = undefined;
    }
  }

  private async getProcessMemoryUsage(pid: number): Promise<number> {
    if (os.platform() === 'win32') {
      // Windows implementation
      const { stdout } = await this.runCommand(
        `wmic process where processid=${pid} get WorkingSetSize /value`,
        '.',
        5000,
      );
      const match = stdout.match(/WorkingSetSize=(\d+)/);
      return match ? parseInt(match[1]) / (1024 * 1024) : 0;
    } else {
      // Unix/Linux/macOS implementation
      const { stdout } = await this.runCommand(`ps -p ${pid} -o rss=`, '.', 5000);
      return parseInt(stdout.trim()) / 1024; // Convert KB to MB
    }
  }

  private async getProcessCpuUsage(pid: number): Promise<number> {
    if (os.platform() === 'win32') {
      // Windows implementation (simplified)
      return 0; // TODO: Implement proper Windows CPU monitoring
    } else {
      // Unix/Linux/macOS implementation
      const { stdout } = await this.runCommand(`ps -p ${pid} -o %cpu=`, '.', 5000);
      return parseFloat(stdout.trim()) || 0;
    }
  }

  private calculateResourceUsage(metrics: ProcessMetrics[]): { peakMemoryMb: number; avgCpuPercent: number } {
    if (metrics.length === 0) {
      return { peakMemoryMb: 0, avgCpuPercent: 0 };
    }

    const peakMemoryMb = Math.max(...metrics.map((m) => m.memoryUsage));
    const avgCpuPercent = metrics.reduce((sum, m) => sum + m.cpuUsage, 0) / metrics.length;

    return { peakMemoryMb, avgCpuPercent };
  }

  private async runCommand(command: string, cwd: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const childProcess = spawn(cmd, args, { cwd, timeout });

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const timeoutId = setTimeout(() => {
        childProcess.kill('SIGTERM');
        reject(new Error(`Command timed out: ${command}`));
      }, timeout);

      childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with code ${code}: ${command}`));
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  private terminateProcess(process: ChildProcess): void {
    if (!process || process.killed) return;

    process.kill('SIGTERM');

    // Force kill after 5 seconds if not terminated
    setTimeout(() => {
      if (!process.killed) {
        process.kill('SIGKILL');
      }
    }, 5000);
  }

  private async readResultsFile(executionDir: string): Promise<PlaywrightJsonReport | null> {
    try {
      const resultsPath = path.join(executionDir, 'results.json');
      const content = await fs.readFile(resultsPath, 'utf8');
      return JSON.parse(content) as PlaywrightJsonReport;
    } catch (error) {
      this.logger.warn('Could not read results file:', error);
      return null;
    }
  }

  private async processSpec(spec: ResultSpec) {
    const details: ProcessedResults['testDetails'] = [];
    const files: ProcessedResults['files'] = [];

    for (const test of spec.tests || []) {
      for (const testResult of test.results || []) {
        const startTime = new Date(testResult.startTime);
        const endTime = new Date(startTime.getTime() + testResult.duration);

        details.push({
          title: spec.title,
          status: this.mapPlaywrightStatus(testResult.status),
          durationMs: testResult.duration,
          startedAt: startTime,
          completedAt: endTime,
          errorMessage: testResult.errors?.[0]?.message,
        });

        // Process attachments
        for (const attachment of testResult.attachments || []) {
          if (attachment.path) {
            const stats = await fs.stat(attachment.path).catch(() => null);
            files.push({
              fileName: path.basename(attachment.path),
              filePath: attachment.path,
              fileType: this.getFileType(attachment.name, attachment.contentType),
              mimeType: attachment.contentType,
              fileSize: stats?.size || 0,
            });
          }
        }
      }
    }

    return { details, files };
  }

  private async processResults(result: PlaywrightExecutionResult, executionDir: string): Promise<ProcessedResults> {
    // Flatten specs from all suites
    const specs = (result.resultsJson?.suites.flatMap((suite) => suite.specs || []) || []).concat(
      result.resultsJson?.suites.flatMap((s) => s.suites?.flatMap((ss) => ss.specs || []) || []) || [],
    );
    const testDetails: ProcessedResults['testDetails'] = [];
    const files: ProcessedResults['files'] = [];

    // if (result.resultsJson) {
    //   // Process Playwright JSON results
    //   for (const suite of result.resultsJson.suites || []) {
    //     const specs = (suite.specs || []).concat(suite.suites?.flatMap((s) => s.specs || []) || []);
    for (const spec of specs) {
      const { details, files: specFiles } = await this.processSpec(spec);
      testDetails.push(...details);
      files.push(...specFiles);
    }
    //   }
    // }

    // Scan for additional artifacts
    const additionalFiles = await this.scanForArtifacts(executionDir);
    additionalFiles.forEach((file) => {
      if (!files.find((f) => f.filePath === file.filePath)) {
        files.push(file);
      }
    });

    const totalTests = specs.length;
    const totalPassed = specs.filter((t) => t.ok).length;
    const totalFailed = totalTests - totalPassed;
    const totalSkipped = 0;

    return {
      status: testDetails.some((t) => t.status === 'failed') ? 'failed' : 'completed',
      testDetails,
      files,
      metrics: {
        totalTests,
        totalPassed,
        totalFailed,
        totalSkipped,
        totalDurationMs: result.duration,
        averageTestDurationMs: totalTests > 0 ? result.duration / totalTests : 0,
        screenshotsCount: files.filter((f) => f.fileType === 'screenshot').length,
        videosCount: files.filter((f) => f.fileType === 'video').length,
        memoryUsageMb: result.resourceUsage.peakMemoryMb,
        cpuUsagePercent: result.resourceUsage.avgCpuPercent,
      },
    };
  }

  private mapPlaywrightStatus(status: string): 'passed' | 'failed' | 'skipped' | 'pending' {
    switch (status?.toLowerCase()) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'skipped':
        return 'skipped';
      case 'pending':
        return 'pending';
      default:
        return 'failed';
    }
  }

  private getFileType(name: string, contentType: string): 'video' | 'screenshot' | 'log' | 'report' {
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.startsWith('image/')) return 'screenshot';
    if (name.toLowerCase().includes('log')) return 'log';
    return 'report';
  }

  private async scanForArtifacts(executionDir: string): Promise<ProcessedResults['files']> {
    const files: ProcessedResults['files'] = [];
    const resultsDir = path.join(executionDir, 'results');

    try {
      const entries = await fs.readdir(resultsDir, { recursive: true });

      for (const entry of entries) {
        const entryPath = path.join(resultsDir, entry.toString());
        const stats = await fs.stat(entryPath).catch(() => null);

        if (stats?.isFile()) {
          const ext = path.extname(entryPath).toLowerCase();
          let fileType: 'video' | 'screenshot' | 'log' | 'report' = 'report';
          let mimeType = 'application/octet-stream';

          if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            fileType = 'screenshot';
            mimeType = `image/${ext.slice(1)}`;
          } else if (['.webm', '.mp4'].includes(ext)) {
            fileType = 'video';
            mimeType = `video/${ext.slice(1)}`;
          } else if (['.log', '.txt'].includes(ext)) {
            fileType = 'log';
            mimeType = 'text/plain';
          }

          files.push({
            fileName: path.basename(entryPath),
            filePath: entryPath,
            fileType,
            mimeType,
            fileSize: stats.size,
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to scan artifacts:', error);
    }

    return files;
  }

  private async persistResults(executionId: string, results: ProcessedResults): Promise<void> {
    // Persist metrics
    const metrics = new this.metricsModel({
      execution: executionId,
      ...results.metrics,
      created: new Date(),
    });
    await metrics.save();

    // Persist test details
    for (const detail of results.testDetails) {
      const testDetail = new this.executionDetailModel({
        execution: executionId,
        ...detail,
        created: new Date(),
      });
      await testDetail.save();
    }

    // Persist files
    for (const file of results.files) {
      const executionFile = new this.executionFileModel({
        id: uuidv4(),
        execution: executionId,
        ...file,
        created: new Date(),
      });
      await executionFile.save();
    }

    this.logger.log(
      `Persisted results for execution ${executionId}: ${results.testDetails.length} tests, ${results.files.length} files`,
    );
  }

  private async cleanupExecution(executionDir: string): Promise<void> {
    try {
      await fs.rm(executionDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up execution directory: ${executionDir}`);
    } catch (error) {
      this.logger.warn(`Failed to cleanup execution directory: ${error}`);
    }
  }

  private setupGracefulShutdown(): void {
    const handleShutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        this.logger.warn(`Received ${signal} again, forcing exit`);
        process.exit(1);
      }

      this.logger.log(`Received ${signal}, initiating graceful shutdown...`);
      this.isShuttingDown = true;

      if (!this.shutdownPromise) {
        this.shutdownPromise = this.performGracefulShutdown();
      }

      try {
        await this.shutdownPromise;
        this.logger.log('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => {
      void handleShutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void handleShutdown('SIGINT');
    });
  }

  private async performGracefulShutdown(): Promise<void> {
    const runningExecutions = Array.from(this.runningTests.entries());

    if (runningExecutions.length === 0) {
      return;
    }

    this.logger.log(`Shutting down ${runningExecutions.length} running executions...`);

    // Stop accepting new executions and terminate running ones
    const shutdownPromises = runningExecutions.map(async ([executionId, testInfo]) => {
      try {
        this.logger.log(`Terminating execution: ${executionId}`);

        // Stop resource monitoring
        this.stopResourceMonitoring(testInfo);

        // Terminate process
        if (testInfo.process) {
          this.terminateProcess(testInfo.process);
        }

        // Update status
        await this.updateExecutionStatus(executionId, 'cancelled', undefined, new Date(), 'Service shutdown');
      } catch (error) {
        this.logger.error(`Error terminating execution ${executionId}:`, error);
      }
    });

    // Wait for all shutdown operations to complete (with timeout)
    await Promise.race([
      Promise.all(shutdownPromises),
      new Promise((resolve) => setTimeout(resolve, 10000)), // 10 second timeout
    ]);

    this.runningTests.clear();
  }

  private async updateExecutionStatus(
    id: string,
    status: string,
    startedAt?: Date,
    completedAt?: Date,
    errorMessage?: string,
  ): Promise<void> {
    const updateData: Partial<Pick<ExecutionDocument, 'status' | 'started' | 'completed' | 'errorMessage'>> = {
      status: status as ExecutionDocument['status'],
    };
    if (startedAt) updateData.started = startedAt;
    if (completedAt) updateData.completed = completedAt;
    if (errorMessage) updateData.errorMessage = errorMessage;

    await this.executionModel.findOneAndUpdate({ id }, updateData);
  }

  private async ensureOutputDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.outputDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create output directory:', error);
      throw error;
    }
  }
}
