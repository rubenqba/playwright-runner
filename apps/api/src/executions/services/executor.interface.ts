import { Execution } from '../types/execution.types';

export interface IPlaywrightExecutor {
  executeTest(execution: Execution): Promise<void>;
}

export const PLAYWRIGHT_EXECUTOR_TOKEN = Symbol('PLAYWRIGHT_EXECUTOR');
