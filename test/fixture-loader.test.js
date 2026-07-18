import test from "node:test";
import assert from "node:assert/strict";
import { loadFixture } from "../src/lib/fixture-loader.js";

test("loads NOAA deadline and participation instructions from frozen raw sources", async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.deadline, "2026-08-07");
  assert.match(fixture.sourceSpans.deadline.text, /August 7, 2026/);
  assert.match(fixture.participationInstructions, /Federal e-Rulemaking Portal/);
  assert.equal(fixture.sourceSpans.addresses.text, fixture.participationInstructions);
  assert.ok(fixture.sourceSpans.operative.start < fixture.sourceSpans.operative.end);
});
