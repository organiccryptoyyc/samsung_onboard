import { config } from './config.js';
import { upstream } from './errors.js';

const cache = new Map();

// fetch with a hard deadline and JSON parsing; every failure becomes a 424 ApiError.
export async function getJson(source, url, { method = 'GET', headers = {}, body, ttlMs = 0, allow404 = false } = {}) {
  const key = ttlMs ? `${method} ${url} ${body ? JSON.stringify(body) : ''}` : null;
  if (key) {
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.upstreamDeadlineMs),
    });
  } catch (e) {
    throw upstream(source, e.name === 'TimeoutError' ? 'no answer before the deadline' : 'could not connect', { url });
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw upstream(source, `non-JSON reply (HTTP ${res.status})`, { url });
  }
  if (res.status === 404 && allow404) return null;
  if (!res.ok) throw upstream(source, `HTTP ${res.status}`, { url, reply: data });
  if (key) cache.set(key, { value: data, until: Date.now() + ttlMs });
  return data;
}

export function clearCache() {
  cache.clear();
}
