export type Nullable<T> = T | null;

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
