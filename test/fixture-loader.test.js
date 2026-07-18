import test from "node:test";
import assert from "node:assert/strict";
import { daysUntilDate, loadFixture, presentParticipationInstructions } from "../src/lib/fixture-loader.js";

test("loads NOAA deadline and participation instructions from frozen raw sources", async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.deadline, "2026-08-07");
  assert.equal(fixture.fixtureSha256, "1ef25fe46f9b47701c0f4a62fe75952550368e1c687644b63d4cadccb834196f");
  assert.match(fixture.sourceSpans.deadline.text, /August 7, 2026/);
  assert.match(fixture.participationInstructions, /Federal e-Rulemaking Portal/);
  assert.equal(fixture.sourceSpans.addresses.text, fixture.participationInstructions);
  assert.ok(fixture.sourceSpans.operative.start < fixture.sourceSpans.operative.end);
  assert.equal(fixture.participationPresentation.raw, fixture.sourceSpans.addresses.text);
  assert.equal(fixture.participationPresentation.methods.length, 2);
  assert.match(fixture.participationPresentation.methods[0], /NOAA-NMFS-2025-0471/);
  assert.doesNotMatch(fixture.participationPresentation.intro, /2025- 0471/);
  assert.match(fixture.participationPresentation.methods[1], /263 13th Avenue South/);
  const { raw, ...rendered } = fixture.participationPresentation;
  assert.doesNotMatch(JSON.stringify(rendered), /<bullet>|<a href|``/);
});

test("computes a neutral calendar-day deadline countdown", () => {
  assert.equal(daysUntilDate("2026-08-07", new Date(2026, 6, 18, 23, 59)), 20);
  assert.equal(daysUntilDate("2026-08-07", new Date(2026, 7, 8)), 0);
});

test("faithful presentation changes markup only, not the bound raw span", () => {
  const raw = "ADDRESSES: Visit <a href=\"https://example.gov\">https://example.gov</a>. <bullet> Enter ``D-01'' in Search. <bullet> Mail: 1 Main St. Instructions: Do not alter.";
  const view = presentParticipationInstructions(raw);
  assert.equal(view.raw, raw);
  assert.equal(view.methods[0], "Enter “D-01” in Search.");
  assert.equal(view.methods[1], "Mail: 1 Main St.");
});
