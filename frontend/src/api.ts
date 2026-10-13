export type Item = {
  id: number;
  sku: string;
  name: string;
  category: string;
  location: string;
  quantity: number;
  reorder_point: number;
  version: number;
  archived: boolean;
  created_at: string;
};
export type Movement = {
  id: number;
  item_id: number;
  name: string;
  sku: string;
  delta: number;
  balance: number;
  note: string;
  created_at: string;
};
export type Summary = { items: number; units: number; low: number; out: number };
export type Page<T> = { items: T[]; total: number };
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-Stockroom-Request': '1', ...options.headers },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`;
    try {
      const body = await response.json();
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail))
        message = body.detail
          .map((e: { loc: string[]; msg: string }) => `${e.loc.at(-1)}: ${e.msg}`)
          .join('; ');
    } catch {
      /* An upstream proxy may return an HTML error page. */
    }
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function errorMessage(error: unknown) {
  return error instanceof TypeError
    ? 'Could not reach Stockroom. Check your connection and try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';
}
