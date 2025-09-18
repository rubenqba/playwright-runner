import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { IPlaywrightExecutor } from './executor.interface';
import { Execution, ExecutionStatus } from '../types/execution.types';
import { ExecutionDocument } from '../schemas/execution.schema';
import { ExecutionMetricsDocument } from '../schemas/execution-metrics.schema';
import { ExecutionDetailDocument } from '../schemas/execution-detail.schema';

interface PlaywrightCliResult {
  suites: Array<{
    title: string;
    tests: Array<{
      title: string;
      status: 'passed' | 'failed' | 'skipped';
      duration: number;
      error?: { message: string };
    }>;
  }>;
  stats: {
    duration: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

@Injectable()
export class PlaywrightCliExecutorService implements IPlaywrightExecutor {
  private readonly logger = new Logger(PlaywrightCliExecutorService.name);
  private readonly outputDir = path.join(process.cwd(), 'test-outputs');
  private readonly testTimeout = 300000; // 5 minutos
  private runningTests = new Set<string>();

  constructor(
    @InjectModel('Execution') private executionModel: Model<ExecutionDocument>,
    @InjectModel('ExecutionMetrics') private metricsModel: Model<ExecutionMetricsDocument>,
    @InjectModel('ExecutionDetail') private testDetailModel: Model<ExecutionDetailDocument>,
  ) {
    this.ensureOutputDirectory();
  }

  async executeTest(execution: Execution): Promise<void> {
    const executionDir = path.join(this.outputDir, execution.id);
    this.runningTests.add(execution.id);

    try {
      await this.updateExecutionStatus(execution.id, 'running', new Date());

      this.logger.log(`[CLI] Starting execution ${execution.id}`);

      await fs.mkdir(executionDir, { recursive: true });

      const testResult = await Promise.race([
        this.runPlaywrightCli(execution, executionDir),
        this.createTimeoutPromise(this.testTimeout),
      ]);

      await this.saveResults(execution.id, testResult, executionDir);
      await this.updateExecutionStatus(execution.id, 'completed', undefined, new Date());

      this.logger.log(`[CLI] Execution ${execution.id} completed`);
    } catch (error) {
      this.logger.error(`[CLI] Execution ${execution.id} failed:`, error);
      await this.updateExecutionStatus(
        execution.id,
        'failed',
        undefined,
        new Date(),
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.runningTests.delete(execution.id);
      await this.cleanup(executionDir);
    }
  }

  private async runPlaywrightCli(execution: Execution, executionDir: string): Promise<PlaywrightCliResult> {
    // Crear configuración
    await this.createPlaywrightConfig(executionDir, execution);

    // Crear archivo de test
    const testFile = await this.createTestFile(executionDir, execution);

    try {
      // Ejecutar comando
      await this.executeCliCommand(executionDir, testFile);

      // Parsear resultados
      return await this.parseResults(executionDir);
    } finally {
      await this.cleanupTempFiles(executionDir, testFile);
    }
  }

  private async createPlaywrightConfig(executionDir: string, execution: Execution): Promise<void> {
    const config = {
      testDir: '.',
      outputDir: './results',
      reporter: [['json', { outputFile: './results.json' }]],
      timeout: 60000,
      use: {
        baseURL: execution.baseUrl,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        viewport: execution.executionConfig?.viewport || { width: 1920, height: 1080 },
        headless: execution.executionConfig?.headless !== false,
      },
      projects: [{ name: execution.browser || 'chromium', use: {} }],
    };

    await fs.writeFile(
      path.join(executionDir, 'playwright.config.js'),
      `module.exports = ${JSON.stringify(config, null, 2)};`,
    );
  }

  private async createTestFile(executionDir: string, execution: Execution): Promise<string> {
    const testFile = path.join(executionDir, `test-${uuidv4()}.spec.ts`);

    let testCode = execution.code;
    if (!testCode.includes('import { test, expect }')) {
      testCode = `import { test, expect } from '@playwright/test';\n\n${testCode}`;
    }

    await fs.writeFile(testFile, testCode);
    return testFile;
  }

  private async executeCliCommand(executionDir: string, testFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn('npx', ['playwright', 'test', path.basename(testFile)], {
        cwd: executionDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
      });

      let stderr = '';
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0 || code === 1) {
          // 0 = success, 1 = tests failed but ran
          resolve();
        } else {
          reject(new Error(`Playwright CLI failed with code ${code}. stderr: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`Failed to start Playwright CLI: ${error.message}`));
      });
    });
  }

  private async parseResults(executionDir: string): Promise<PlaywrightCliResult> {
    try {
      const resultsFile = path.join(executionDir, 'results.json');
      const resultsData = await fs.readFile(resultsFile, 'utf8');
      return JSON.parse(resultsData);
    } catch {
      return {
        suites: [],
        stats: { duration: 0, passed: 0, failed: 1, skipped: 0 },
      };
    }
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout);
    });
  }

  // Métodos auxiliares simplificados...
  private async saveResults(executionId: string, result: PlaywrightCliResult, outputDir: string): Promise<void> {
    const metrics = new this.metricsModel({
      execution: executionId,
      totalTests: result.stats.passed + result.stats.failed + result.stats.skipped,
      totalPassed: result.stats.passed,
      totalFailed: result.stats.failed,
      totalSkipped: result.stats.skipped,
      totalDurationMs: result.stats.duration,
      screenshotsCount: 0, // TODO: contar archivos
      videosCount: 0,
    });
    await metrics.save();
  }

  private async updateExecutionStatus(
    id: string,
    status: ExecutionStatus,
    startedAt?: Date,
    completedAt?: Date,
    errorMessage?: string,
  ): Promise<void> {
    const updateData: Partial<ExecutionDocument> = { status };
    if (startedAt) updateData.started = startedAt;
    if (completedAt) updateData.completed = completedAt;
    if (errorMessage) updateData.errorMessage = errorMessage;

    await this.executionModel.findOneAndUpdate({ id }, updateData);
  }

  private async ensureOutputDirectory(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true }).catch(() => {});
  }

  private async cleanup(executionDir: string): Promise<void> {
    await fs.rm(executionDir, { recursive: true, force: true }).catch(() => {});
  }

  private async cleanupTempFiles(executionDir: string, testFile: string): Promise<void> {
    await Promise.allSettled([fs.unlink(testFile), fs.unlink(path.join(executionDir, 'playwright.config.js'))]);
  }
}
