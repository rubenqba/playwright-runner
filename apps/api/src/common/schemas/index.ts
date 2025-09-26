import { z } from 'zod';

export const DateTimeSchema = z.iso.datetime().transform((date) => new Date(date));
