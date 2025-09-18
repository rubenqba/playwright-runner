import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { IPlaywrightExecutor } from './executor.interface';
import { Execution } from '../types/execution.types';
import { ExecutionDocument } from '../schemas/execution.schema';
import { ExecutionMetricsDocument } from '../schemas/execution-metrics.schema';
import { ExecutionDetailDocument } from '../schemas';

const execAsync = promisify(exec);

interface PlaywrightOSResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  resultsJson?: any;
  duration: number;
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  error?: string;
  suite: string;
}

@Injectable()
export class PlaywrightOSExecutorService implements IPlaywrightExecutor {
  private readonly logger = new Logger(PlaywrightOSExecutorService.name);
  private readonly outputDir = path.join(process.cwd(), 'test-outputs');
  private readonly testTimeout = 300000; // 5 minutos
  private readonly maxConcurrentTests = 5;
  private runningTests = new Map<string, { startTime: number; process?: any }>();

  constructor(
    @InjectModel('Execution') private executionModel: Model<ExecutionDocument>,
    @InjectModel('ExecutionMetrics') private metricsModel: Model<ExecutionMetricsDocument>,
    @InjectModel('TestDetail') private testDetailModel: Model<ExecutionDetailDocument>,
  ) {
    this.ensureOutputDirectory();
    this.setupGracefulShutdown();
  }

  async executeTest(execution: Execution): Promise<void> {
    if (this.runningTests.size >= this.maxConcurrentTests) {
      throw new Error(`Maximum concurrent tests (${this.maxConcurrentTests}) reached`);
    }

    const executionDir = path.join(this.outputDir, execution.id);
    const startTime = Date.now();

    this.runningTests.set(execution.id, { startTime });

    try {
      await this.updateExecutionStatus(execution.id, 'running', new Date());

      this.logger.log(`[OS] Starting execution ${execution.id}`);

      // Preparar entorno de ejecución
      await this.prepareExecutionEnvironment(executionDir, execution);

      // Ejecutar con timeout y control de proceso
      const result = await this.executeWithTimeout(execution, executionDir);

      // Procesar y guardar resultados
      await this.processAndSaveResults(execution.id, result, executionDir);

      await this.updateExecutionStatus(execution.id, 'completed', undefined, new Date());

      this.logger.log(`[OS] Execution ${execution.id} completed successfully`);
    } catch (error) {
      this.logger.error(`[OS] Execution ${execution.id} failed:`, error);

      await this.updateExecutionStatus(
        execution.id,
        'failed',
        undefined,
        new Date(),
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.runningTests.delete(execution.id);
      await this.cleanupExecutionEnvironment(executionDir);
    }
  }

  private async prepareExecutionEnvironment(executionDir: string, execution: Execution): Promise<void> {
    // Crear directorio
    await fs.mkdir(executionDir, { recursive: true });

    // Crear package.json mínimo
    await this.createPackageJson(executionDir);

    // Crear configuración de Playwright
    await this.createPlaywrightConfig(executionDir, execution);

    // Crear archivo de test
    await this.createTestFile(executionDir, execution);

    // Instalar dependencias si no existen
    await this.ensurePlaywrightInstalled(executionDir);
  }

  private async createPackageJson(executionDir: string): Promise<void> {
    const packageJson = {
      name: 'playwright-test-execution',
      version: '1.0.0',
      type: 'module',
      devDependencies: {
        '@playwright/test': '^1.40.0',
      },
    };

    await fs.writeFile(path.join(executionDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  }

  private async createPlaywrightConfig(executionDir: string, execution: Execution): Promise<void> {
    const config = {
      testDir: '.',
      outputDir: './test-results',
      reporter: [
        ['json', { outputFile: './results.json' }],
        ['html', { outputFolder: './html-report', open: 'never' }],
      ],
      timeout: 60000,
      expect: { timeout: 10000 },
      fullyParallel: false,
      forbidOnly: true,
      retries: 0,
      workers: 1,
      use: {
        baseURL: execution.baseUrl,
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        viewport: execution.executionConfig?.viewport || { width: 1920, height: 1080 },
        headless: execution.executionConfig?.headless !== false,
        ignoreHTTPSErrors: true,
        actionTimeout: 30000,
      },
      projects: [
        {
          name: execution.browser || 'chromium',
          use: {},
        },
      ],
    };

    await fs.writeFile(
      path.join(executionDir, 'playwright.config.js'),
      `export default ${JSON.stringify(config, null, 2)};`,
    );
  }

  private async createTestFile(executionDir: string, execution: Execution): Promise<void> {
    const testFileName = `execution-${execution.id}.spec.js`;
    let testCode = execution.code;

    // Asegurar que tenga los imports necesarios
    if (!testCode.includes('import') && !testCode.includes('require')) {
      testCode = `import { test, expect } from '@playwright/test';\n\n${testCode}`;
    }

    // Convertir TypeScript a JavaScript si es necesario
    if (testCode.includes(': ')) {
      testCode = this.convertTStoJS(testCode);
    }

    await fs.writeFile(path.join(executionDir, testFileName), testCode);
  }

  private convertTStoJS(tsCode: string): string {
    // Conversión básica de TypeScript a JavaScript
    return tsCode
      .replace(/: \w+(\[\])?/g, '') // Remover type annotations
      .replace(/interface \w+ \{[^}]*\}/g, '') // Remover interfaces
      .replace(/import.*from ['"]@playwright\/test['"];/, "import { test, expect } from '@playwright/test';");
  }

  private async ensurePlaywrightInstalled(executionDir: string): Promise<void> {
    try {
      // Verificar si Playwright está disponible globalmente
      await execAsync('npx playwright --version', { cwd: executionDir });
      this.logger.debug(`[OS] Playwright already available`);
    } catch {
      this.logger.log(`[OS] Installing Playwright dependencies...`);

      // Instalar Playwright
      await this.runCommand('npm install @playwright/test', executionDir, 120000);
      await this.runCommand('npx playwright install chromium', executionDir, 180000);
    }
  }

  private async executeWithTimeout(execution: Execution, executionDir: string): Promise<PlaywrightOSResult> {
    const testFileName = `execution-${execution.id}.spec.js`;
    const command = `npx playwright test ${testFileName} --reporter=json`;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const childProcess = spawn('npx', ['playwright', 'test', testFileName, '--reporter=json'], {
        cwd: executionDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CI: 'true',
          PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || '/ms-playwright',
        },
        shell: true,
      });

      // Actualizar referencia del proceso
      const runningTest = this.runningTests.get(execution.id);
      if (runningTest) {
        runningTest.process = childProcess;
      }

      let stdout = '';
      let stderr = '';

      childProcess.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      childProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Timeout
      const timeoutId = setTimeout(() => {
        this.logger.warn(`[OS] Test ${execution.id} timed out, killing process`);
        childProcess.kill('SIGTERM');

        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill('SIGKILL');
          }
        }, 5000);

        reject(new Error(`Test execution timed out after ${this.testTimeout}ms`));
      }, this.testTimeout);

      childProcess.on('close', async (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        this.logger.debug(`[OS] Process exited with code ${code}`);

        try {
          // Intentar leer resultados JSON
          const resultsJson = await this.readResultsFile(executionDir);

          resolve({
            exitCode: code || 0,
            stdout,
            stderr,
            resultsJson,
            duration,
          });
        } catch (error) {
          resolve({
            exitCode: code || 1,
            stdout,
            stderr,
            duration,
          });
        }
      });

      childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to execute Playwright: ${error.message}`));
      });
    });
  }

  private async runCommand(command: string, cwd: string, timeout: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcess = exec(command, { cwd, timeout }, (error, stdout, stderr) => {
        if (error) {
          this.logger.error(`[OS] Command failed: ${command}`, error);
          reject(new Error(`Command failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  private async readResultsFile(executionDir: string): Promise<any> {
    try {
      const resultsPath = path.join(executionDir, 'results.json');
      const resultsContent = await fs.readFile(resultsPath, 'utf8');
      return JSON.parse(resultsContent);
    } catch (error) {
      this.logger.warn(`[OS] Could not read results file:`, error);
      return null;
    }
  }

  private async processAndSaveResults(
    executionId: string,
    result: PlaywrightOSResult,
    executionDir: string,
  ): Promise<void> {
    const testResults = this.parseTestResults(result);
    const fileStats = await this.countArtifacts(executionDir);

    // Guardar métricas
    const metrics = new this.metricsModel({
      execution: executionId,
      totalTests: testResults.length,
      totalPassed: testResults.filter((t) => t.status === 'passed').length,
      totalFailed: testResults.filter((t) => t.status === 'failed').length,
      totalSkipped: testResults.filter((t) => t.status === 'skipped').length,
      totalDurationMs: result.duration,
      averageTestDurationMs:
        testResults.length > 0 ? testResults.reduce((sum, t) => sum + t.duration, 0) / testResults.length : 0,
      screenshotsCount: fileStats.screenshots,
      videosCount: fileStats.videos,
    });

    await metrics.save();

    // Guardar detalles de cada test
    for (const testResult of testResults) {
      const testDetail = new this.testDetailModel({
        id: uuidv4(),
        execution: executionId,
        title: `${testResult.suite} > ${testResult.name}`,
        state: testResult.status,
        durationMs: testResult.duration,
        startedAt: new Date(Date.now() - testResult.duration),
        completedAt: new Date(),
        errorMessage: testResult.error,
        createdAt: new Date(),
      });

      await testDetail.save();
    }

    this.logger.log(`[OS] Saved results for execution ${executionId}: ${testResults.length} tests`);
  }

  private parseTestResults(result: PlaywrightOSResult): TestResult[] {
    if (!result.resultsJson) {
      // Fallback: parsear desde stdout/stderr
      return this.parseFromOutput(result.stdout, result.stderr, result.exitCode);
    }

    const tests: TestResult[] = [];

    try {
      const json = result.resultsJson;

      for (const suite of json.suites || []) {
        for (const spec of suite.specs || []) {
          for (const test of spec.tests || []) {
            tests.push({
              name: test.title || spec.title,
              suite: suite.title || 'Unknown Suite',
              status: this.mapPlaywrightStatus(test.status),
              duration: test.duration || 0,
              error: test.error?.message,
            });
          }
        }
      }
    } catch (error) {
      this.logger.warn(`[OS] Failed to parse JSON results:`, error);
      return this.parseFromOutput(result.stdout, result.stderr, result.exitCode);
    }

    return tests;
  }

  private parseFromOutput(stdout: string, stderr: string, exitCode: number): TestResult[] {
    // Parsing básico desde la salida de texto cuando no hay JSON
    const tests: TestResult[] = [];

    if (exitCode === 0) {
      tests.push({
        name: 'Test Execution',
        suite: 'Default',
        status: 'passed',
        duration: 0,
      });
    } else {
      tests.push({
        name: 'Test Execution',
        suite: 'Default',
        status: 'failed',
        duration: 0,
        error: stderr || 'Test execution failed',
      });
    }

    return tests;
  }

  private mapPlaywrightStatus(status: string): 'passed' | 'failed' | 'skipped' {
    switch (status) {
      case 'passed':
        return 'passed';
      case 'failed':
        return 'failed';
      case 'skipped':
        return 'skipped';
      default:
        return 'failed';
    }
  }

  private async countArtifacts(executionDir: string): Promise<{ screenshots: number; videos: number }> {
    try {
      const resultsDir = path.join(executionDir, 'test-results');
      const files = await fs.readdir(resultsDir, { recursive: true });

      return {
        screenshots: files.filter((f) => String(f).endsWith('.png')).length,
        videos: files.filter((f) => String(f).endsWith('.webm')).length,
      };
    } catch {
      return { screenshots: 0, videos: 0 };
    }
  }

  private setupGracefulShutdown(): void {
    const cleanup = async () => {
      this.logger.log(`[OS] Shutting down, cleaning up ${this.runningTests.size} running tests`);

      for (const [executionId, testInfo] of this.runningTests.entries()) {
        if (testInfo.process) {
          this.logger.log(`[OS] Killing test process for execution ${executionId}`);
          testInfo.process.kill('SIGTERM');
        }
      }

      // Dar tiempo para que los procesos terminen limpiamente
      setTimeout(() => {
        for (const [executionId, testInfo] of this.runningTests.entries()) {
          if (testInfo.process && !testInfo.process.killed) {
            testInfo.process.kill('SIGKILL');
          }
        }
      }, 5000);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  // Métodos auxiliares...
  private async updateExecutionStatus(
    id: string,
    status: string,
    startedAt?: Date,
    completedAt?: Date,
    errorMessage?: string,
  ): Promise<void> {
    const updateData: any = { status };
    if (startedAt) updateData.startedAt = startedAt;
    if (completedAt) updateData.completedAt = completedAt;
    if (errorMessage) updateData.errorMessage = errorMessage;

    await this.executionModel.findOneAndUpdate({ id }, updateData);
  }

  private async ensureOutputDirectory(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true }).catch(() => {});
  }

  private async cleanupExecutionEnvironment(executionDir: string): Promise<void> {
    try {
      await fs.rm(executionDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`[OS] Failed to cleanup execution directory: ${error}`);
    }
  }
}
