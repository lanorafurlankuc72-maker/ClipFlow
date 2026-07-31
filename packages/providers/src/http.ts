export async function fetchJson<T>(
  url: URL,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<T> {
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(url, { ...init, signal });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 180);
      throw new Error(`Provider request failed (${response.status}): ${detail}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function safeTitle(value: string | null | undefined, fallback: string): string {
  const title = value?.trim();
  return title || fallback;
}
