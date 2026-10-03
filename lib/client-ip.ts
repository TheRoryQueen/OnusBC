/**
 * The caller's IP, for rate limits. On Vercel the platform sets x-real-ip and overwrites x-forwarded-for, so
 * a client can't spoof them there; locally they are whatever the request says (tests use that).
 */
export function clientIp(request: Request) {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
