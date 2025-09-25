import { BullRootModuleOptions } from '@nestjs/bull';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export type BullRedisOptions = {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
};

const schema = z.object({
  REDIS_HOST: z.hostname().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
});

function validateRedisConfig(env: Record<string, string | undefined>) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const formatted = z.prettifyError(parsed.error);
    console.error('Invalid Redis configuration:', formatted);
    throw new Error('Invalid Redis configuration');
  }

  return {
    host: parsed.data.REDIS_HOST,
    port: parsed.data.REDIS_PORT,
    username: parsed.data.REDIS_USERNAME,
    password: parsed.data.REDIS_PASSWORD,
  } as BullRootModuleOptions;
}

export default registerAs('db.redis', () => {
  const data = validateRedisConfig(process.env);
  return data;
});
