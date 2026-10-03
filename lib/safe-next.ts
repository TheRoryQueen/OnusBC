/**
 * Where to send someone after signing in: only a path on this site. Rejects "//host", "/\host" (browsers
 * treat a backslash like a slash), control characters, and anything else that resolves to another origin.
 */
export function safeNext(next: string | null | undefined, fallback = "/map") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u001f]/.test(next)) return fallback;
  try {
    const base = "https://onus.invalid";
    const u = new URL(next, base);
    return u.origin === base ? `${u.pathname}${u.search}${u.hash}` : fallback;
  } catch {
    return fallback;
  }
}
