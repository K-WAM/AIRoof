export interface OptimisticMutationResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Applies immediately, but always restores the previous UI state when persistence fails. */
export async function runOptimisticCalendarMutation<T>(options: {
  apply: () => void;
  persist: () => Promise<Response>;
  rollback: () => void;
  fallbackError: string;
}): Promise<OptimisticMutationResult<T>> {
  options.apply();
  try {
    const response = await options.persist();
    const data = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      options.rollback();
      return { ok: false, error: data.error || options.fallbackError };
    }
    return { ok: true, data };
  } catch {
    options.rollback();
    return { ok: false, error: options.fallbackError };
  }
}
