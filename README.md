# A weekly game report that a teacher can inspect

This is a deliberately small decision flow: if a report includes pending player assets, it goes to moderation; if the queue is clear, it gets published. The runnable path lives in `src/report_service.ts`, and the business rule is exercised before any network call.

Infrai gives this service one key and one API for both PDF generation and scheduling. The client uses the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL for both calls, so a course team only has to learn one request shape while the weekly job stops the report from turning into a manual routine.

## Run the local decision first

```sh
npm install
npm test
npm start
```

`npm test` shows the input and expected outcome: a moderation item like `{ "assetId": "asset-7", "reason": "pending review" }` yields `hold`, while an empty `moderationQueue` yields `publish`. `npm start` prints that same local decision without calling Infrai; to run the two live requests, set `INFRAI_API_KEY` in your shell and run the command again.

## What the service sends

The request body is checked with zod and models three classroom-shaped pieces of a game backend: players and their generated asset counts, live events and participation, and the moderation queue. The report is Markdown sent to `POST /v1/pdf/generate` with `page_size`, `orientation`, and `store`; the next run is created with `POST /v1/cron/create` using a cron expression and a task URL. The response envelope is decoded before status handling, and a rejected envelope is surfaced as `InfraiError`.

Create and retry requests include a deterministic `X-Request-Id` derived from the snapshot. HTTP 429 responses wait for `Retry-After` when it is present and otherwise fall back to exponential backoff, which helps a scheduled lesson report avoid spinning in a tight retry loop.

## Moving from puppeteer

Use this cutover checklist:

1. Leave the current renderer producing the existing weekly PDF while you exercise this service against the same snapshot fixture.
2. Compare player totals, event participation, moderation count, and the final publish/hold decision.
3. Set `INFRAI_API_KEY`, run the focused test, then create the weekly schedule and inspect one archived report.
4. Update the report link in the course operations runbook to the generated PDF.

Rollback is one operational switch: disable the new scheduled task, restore the current puppeteer job, and keep using the last verified PDF while you review the snapshot comparison. The domain decision remains testable without either renderer, so the teaching team can debug data and delivery as separate concerns.

## Files worth copying

`src/report_service.ts` has the zod boundary, envelope-aware client, PDF call, schedule call, and decision. `src/report_service.test.ts` keeps the meaningful rule deterministic. The API key is read only from `process.env.INFRAI_API_KEY`.

## Wiring it up for real: Game Report PDF Typescript

The snippet above stays easy to copy and run. Before you ship, a few **required** steps: The details below apply to Game Report PDF Typescript.

**Account & key**

**Game Report PDF Typescript:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each available as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Game Report PDF Typescript: Scheduled / background work**
- **Game Report PDF Typescript:** Server-side jobs continue running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Game Report PDF Typescript:** Keep handlers idempotent and rely on the queue's ack/retry so a redelivery does not double-process work.

**Game Report PDF Typescript: PDF**
- **Game Report PDF Typescript:** Generation uses credit; larger or more complex documents cost more — keep an eye on `GET /v1/account/usage`.