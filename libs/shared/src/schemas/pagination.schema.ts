import { z } from 'zod';

// search and pagination
export const SearchParamsSchema = z.object({
  query: z.string().trim().min(2).max(100).optional().describe('Search query'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
});

export const makeSortSchema = <K extends readonly [string, ...string[]]>(keys: K) =>
  z
    // acepta "a,desc" o ["a,desc","b,asc"]
    .union([z.string(), z.array(z.string())])
    .optional()
    // normaliza a array de strings
    .transform((raw) => (raw == null ? [] : Array.isArray(raw) ? raw : [raw]))
    // parsea "campo,dir?" → { by, dir }
    .transform((arr) =>
      arr.map((s) => {
        const [byRaw, dirRaw] = s
          .split(',')
          .map((x) => x?.trim())
          .filter(Boolean);
        const by = byRaw ?? ''; // se valida abajo
        const dir = dirRaw?.toLowerCase() === 'desc' ? 'desc' : 'asc';
        return { by, dir } as const;
      }),
    )
    // valida que el campo esté permitido
    .refine((arr) => arr.every((it) => (keys as readonly string[]).includes(it.by)), {
      message: 'Campo de orden no permitido',
    })
    // estrecha el tipo de `by` al union K[number]
    .transform((arr) => arr.map((it) => ({ by: it.by as K[number], dir: it.dir })));

export type SortItem<K extends readonly string[]> = { by: K[number]; dir: 'asc' | 'desc' };

export const queryOf = <T extends z.ZodObject, K extends readonly [string, ...string[]]>(item: T, sortableKeys: K) => {
  return SearchParamsSchema.extend({ sort: makeSortSchema(sortableKeys), filters: item.optional() });
};

const PageBase = z.object({
  meta: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

// Factory
export const pageOf = <T extends z.ZodObject>(item: T) => PageBase.extend({ items: z.array(item) });

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Page<T> = {
  data: T[];
  pagination: Pagination;
};
