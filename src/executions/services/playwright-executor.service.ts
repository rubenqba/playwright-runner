import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import {
  Execution,
  ExecutionDetail,
  ExecutionMetrics,
  TestStatus,
  TestExecutionResult,
  ExecutionUpdateData,
} from '@/executions/types';
import { ExecutionDocument, ExecutionMetricsDocument, ExecutionDetailDocument } from '@/executions/schemas';
import { IPlaywrightExecutor } from './executor.interface';

@Injectable()
export class PlaywrightExecutorService implements IPlaywrightExecutor {
  private readonly logger = new Logger(PlaywrightExecutorService.name);
  private readonly outputDir = path.join(process.cwd(), 'test-outputs');

  constructor(
    @InjectModel(ExecutionDocument.name)
    private executionModel: Model<Execution>,
    @InjectModel(ExecutionMetricsDocument.name)
    private metricsModel: Model<ExecutionMetricsDocument>,
    @InjectModel(ExecutionDetailDocument.name)
    private testDetailModel: Model<ExecutionDetailDocument>,
  ) {
    // Crear directorio de salida si no existe
    if (!fsSync.existsSync(this.outputDir)) {
      fsSync.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async executeTest(execution: Execution): Promise<void> {
    const executionDir = path.join(this.outputDir, execution.id);
    let browser: Browser | null = null;

    try {
      // Crear directorio para esta ejecución
      await fs.mkdir(executionDir, { recursive: true });

      // Actualizar estado a 'running'
      await this.updateExecutionStatus(execution.id, {
        status: 'running',
        startedAt: new Date(),
      });

      this.logger.log(`Starting execution ${execution.id}`);

      // Configurar Playwright
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const context = await browser.newContext({
        recordVideo: { dir: executionDir },
        viewport: { width: 1920, height: 1080 },
      });

      const page = await context.newPage();

      // Ejecutar el código de prueba de manera segura
      const testResult = await this.executeTestCode(
        page,
        execution.code,
        execution.baseUrl,
        executionDir,
        execution.id,
      );

      await context.close();
      await browser.close();
      browser = null;

      // Guardar métricas y detalles
      await this.saveExecutionResults(execution.id, testResult, executionDir);

      // Actualizar estado a 'completed'
      await this.updateExecutionStatus(execution.id, {
        status: 'completed',
        completedAt: new Date(),
      });

      this.logger.log(`Execution ${execution.id} completed successfully`);
    } catch (error) {
      this.logger.error(`Execution ${execution.id} failed:`, error);

      if (browser) {
        await browser.close();
      }

      // Actualizar estado a 'failed'
      await this.updateExecutionStatus(execution.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async executeTestCode(
    page: Page,
    testCode: string,
    baseUrl: string | undefined,
    outputDir: string,
    executionId: string,
  ): Promise<TestExecutionResult> {
    const startTime = Date.now();
    const testDetails: ExecutionDetail[] = [];

    try {
      // Navegar a la URL base si se proporciona
      if (baseUrl) {
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
      }

      // Crear un contexto seguro para ejecutar el código
      const testContext = {
        page,
        expect: (await import('@playwright/test')).expect,
        test: {
          step: async (name: string, fn: () => Promise<void>): Promise<void> => {
            const stepStart = Date.now();
            const testId = `exec_${new Date().getTime()}`;

            try {
              this.logger.log(`Executing step: ${name}`);
              await fn();

              const duration = Date.now() - stepStart;
              const testDetail: ExecutionDetail = {
                execution: executionId,
                title: name,
                status: 'passed' as TestStatus,
                durationMs: duration,
                startedAt: new Date(stepStart),
                completedAt: new Date(stepStart + duration),
                created: new Date(),
              };

              testDetails.push(testDetail);
            } catch (error) {
              const duration = Date.now() - stepStart;

              // Tomar screenshot en caso de error
              const screenshotPath = path.join(outputDir, `error-${testId}.png`);
              await page.screenshot({ path: screenshotPath, fullPage: true });

              const testDetail: ExecutionDetail = {
                execution: executionId,
                title: name,
                status: 'failed' as TestStatus,
                durationMs: duration,
                startedAt: new Date(stepStart),
                completedAt: new Date(stepStart + duration),
                errorMessage: error instanceof Error ? error.message : 'Unknown error',
                screenshotPath,
                created: new Date(),
              };

              testDetails.push(testDetail);
              throw error;
            }
          },
        },
      };

      // Ejecutar el código en un contexto aislado
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const AsyncFunction = Object.getPrototypeOf(
        async function () {},
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ).constructor;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const testFunction = new AsyncFunction('page', 'expect', 'test', testCode);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await testFunction(testContext.page, testContext.expect, testContext.test);

      const totalDuration = Date.now() - startTime;

      const result: TestExecutionResult = {
        totalDurationMs: totalDuration,
        testDetails,
        success: true,
      };

      return result;
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      const result: TestExecutionResult = {
        totalDurationMs: totalDuration,
        testDetails,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      return result;
    }
  }

  private async updateExecutionStatus(executionId: string, updateData: ExecutionUpdateData): Promise<void> {
    await this.executionModel.findOneAndUpdate({ id: executionId }, updateData);
  }

  private async saveExecutionResults(
    executionId: string,
    testResult: TestExecutionResult,
    outputDir: string,
  ): Promise<void> {
    // Contar archivos generados
    const files = await fs.readdir(outputDir);
    const screenshots = files.filter((f) => f.endsWith('.png')).length;
    const videos = files.filter((f) => f.endsWith('.webm')).length;

    // Guardar métricas
    const metricsData: Partial<ExecutionMetrics> = {
      execution: executionId,
      totalTests: testResult.testDetails.length,
      totalPassed: testResult.testDetails.filter((t) => t.status === 'passed').length,
      totalFailed: testResult.testDetails.filter((t) => t.status === 'failed').length,
      totalSkipped: 0,
      totalDurationMs: testResult.totalDurationMs,
      averageTestDurationMs:
        testResult.testDetails.length > 0 ? testResult.totalDurationMs / testResult.testDetails.length : 0,
      screenshotsCount: screenshots,
      videosCount: videos,
    };

    const metrics = new this.metricsModel(metricsData);
    await metrics.save();

    // Guardar detalles de tests
    for (const detail of testResult.testDetails) {
      const testDetail = new this.testDetailModel(detail);
      await testDetail.save();
    }
  }
}
