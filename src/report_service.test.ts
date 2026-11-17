import test from "node:test";
import assert from "node:assert/strict";
import { chooseReport } from "./report_service.ts";

test("a report waits while a player asset needs moderation", () => {
  const decision = chooseReport({ period: "week-1", players: [], liveEvents: [], moderationQueue: [{ assetId: "asset-7", reason: "pending review" }] });
  assert.equal(decision, "hold");
});

test("a clear moderation queue permits publication", () => {
  const decision = chooseReport({ period: "week-2", players: [], liveEvents: [], moderationQueue: [] });
  assert.equal(decision, "publish");
});
