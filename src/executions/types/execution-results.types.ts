import { type ExecutionDetail } from './execution.types';

export interface TestExecutionResult {
  totalDurationMs: number;
  testDetails: ExecutionDetail[];
  success: boolean;
  error?: string;
}

export interface ExecutionUpdateData {
  status: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

export interface TestStepContext {
  page: any; // Page type from playwright
  expect: any; // Expect type from playwright
  test: {
    step: (name: string, fn: () => Promise<void>) => Promise<void>;
  };
}
