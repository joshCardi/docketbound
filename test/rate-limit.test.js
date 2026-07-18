import test from "node:test";
import assert from "node:assert/strict";
import { clientIp, createHourlyIpRateLimiter, RATE_LIMIT_MESSAGE } from "../src/lib/rate-limit.js";

test("permits 10 GPT calls per IP per hour, then blocks", () => {
  assert.equal(RATE_LIMIT_MESSAGE, "Rate limited — try again later");
  const limiter = createHourlyIpRateLimiter();
  const start = Date.UTC(2026, 6, 18, 12);
  for (let count = 0; count < 10; count += 1) assert.equal(limiter.check("203.0.113.10", start + count).allowed, true);
  const blocked = limiter.check("203.0.113.10", start + 10);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("isolates IP buckets and resets after the rolling hour", () => {
  const limiter = createHourlyIpRateLimiter({ limit: 1, windowMs: 3_600_000 });
  const start = 1_000_000;
  assert.equal(limiter.check("one", start).allowed, true);
  assert.equal(limiter.check("one", start + 1).allowed, false);
  assert.equal(limiter.check("two", start + 1).allowed, true);
  assert.equal(limiter.check("one", start + 3_600_001).allowed, true);
});

test("uses forwarded client IP only when proxy trust is explicit", () => {
  const req = { headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" }, socket: { remoteAddress: "127.0.0.1" } };
  assert.equal(clientIp(req, false), "127.0.0.1");
  assert.equal(clientIp(req, true), "198.51.100.7");
});
