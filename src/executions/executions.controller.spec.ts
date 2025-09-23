import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { getModelToken } from '@nestjs/mongoose';
import { ExecutionController, ExecutionInputSchema } from './executions.controller';
import { ExecutionDocument } from './schemas/execution.schema';
import { BrowserTypeSchema } from './types/execution.types';
import { z } from 'zod';

describe('ExecutionController', () => {
  let controller: ExecutionController;

  // let mockQueue: any;
  // let mockModel: any;

  beforeEach(async () => {
    const mockDocumentInstance = {
      save: jest.fn().mockResolvedValue({
        id: 'saved-execution-id',
        status: 'queued',
      }),
    };

    const mockExecutionModel = jest.fn().mockImplementation(() => mockDocumentInstance);

    const app: TestingModule = await Test.createTestingModule({
      controllers: [ExecutionController],
      providers: [
        {
          provide: getQueueToken('test-execution'),
          useValue: {
            add: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: getModelToken(ExecutionDocument.name),
          useValue: mockExecutionModel,
        },
      ],
    }).compile();

    controller = app.get<ExecutionController>(ExecutionController);
  });

  it('should return a new execution', () => {
    const input = createMockExecution();
    expect(controller.executeTest(input)).resolves.toEqual({
      executionId: 'saved-execution-id',
      status: 'queued',
      success: true,
    });
  });
});

export type ExecutionInput = z.infer<typeof ExecutionInputSchema>;

function randomString(length: number): string {
  return Math.random().toString(36).substr(2, length);
}

function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function createMockExecution(overrides?: Partial<ExecutionInput>): ExecutionInput {
  const baseInput: ExecutionInput = {
    recording: `rec-${randomString(8)}`,
    baseUrl: randomChoice([
      'https://example.com',
      'https://demo.playwright.dev',
      'https://www.google.com',
      'https://github.com',
      'https://httpbin.org',
    ]),
    code: generatePlaywrightTestCode(),
    browser: randomChoice(BrowserTypeSchema.options),
    executionConfig: {
      headless: true,
      timeout: 30000,
      viewport: { width: 1920, height: 1080 },
      slowMo: 0,
    },
    executedBy: `user-${randomString(6)}`,
  };

  return { ...baseInput, ...overrides };
}

function generatePlaywrightTestCode(): string {
  const testCodes = [
    `await page.goto('https://example.com');
await test.step('Check title', async () => {
  await expect(page).toHaveTitle('Example Domain');
});
await test.step('Click button', async () => {
  await page.click('button');
});`,

    `await page.goto('https://google.com');
await test.step('Search for playwright', async () => {
  await page.fill('input[name="q"]', 'playwright');
  await page.press('input[name="q"]', 'Enter');
});
await test.step('Verify results', async () => {
  await expect(page.locator('h3')).toBeVisible();
});`,

    `await page.goto('https://github.com');
await test.step('Navigate to login', async () => {
  await page.click('text=Sign in');
});
await test.step('Fill login form', async () => {
  await page.fill('input[name="login"]', 'testuser');
  await page.fill('input[name="password"]', 'testpass');
});`,
  ];

  return randomChoice(testCodes);
}
