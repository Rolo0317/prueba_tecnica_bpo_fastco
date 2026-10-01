export interface Paginated<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/** Respuesta paginada uniforme para todos los listados de la API. */
export function toPaginated<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return { data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}
