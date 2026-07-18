export const RATE_LIMIT_MESSAGE = "Rate limited — try again later";

export function createHourlyIpRateLimiter({ limit = 10, windowMs = 60 * 60 * 1000 } = {}) {
  const callsByIp = new Map();

  return {
    check(ip, now = Date.now()) {
      const cutoff = now - windowMs;
      const recent = (callsByIp.get(ip) ?? []).filter((timestamp) => timestamp > cutoff);
      if (recent.length >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
        callsByIp.set(ip, recent);
        return { allowed: false, remaining: 0, retryAfterSeconds };
      }
      recent.push(now);
      callsByIp.set(ip, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    }
  };
}

export function clientIp(req, trustProxy = false) {
  if (trustProxy) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}
