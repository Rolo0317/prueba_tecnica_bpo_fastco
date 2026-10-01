export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

export const emptyPagination = (pageSize: number = DEFAULT_PAGE_SIZE): Pagination => ({
  page: 1,
  pageSize,
  total: 0,
  totalPages: 0,
});
