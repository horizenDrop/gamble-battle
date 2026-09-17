const { getValue, setValue, withLock } = require("./_lib/store");
const { parseBody, sendJson } = require("./_lib/profile");

const MAX_TRACKED_EVENTS_PER_DAY = 100;
const DAY_TTL_MS = 45 * 24 * 60 * 60 * 1000;
const EVENT_NAME_RE = /^[a-z0-9_.-]{2,50}$/;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const event = String(body.event ?? "").trim().toLowerCase().slice(0, 50);
  // The counters live in one JSON document, so arbitrary event names from the
  // client would let anyone grow it without bound.
  if (!EVENT_NAME_RE.test(event)) {
    return sendJson(res, 400, { error: "event required" });
  }

  const day = new Date().toISOString().slice(0, 10);
  const key = `gb:track:${day}`;

  await withLock(`track:${day}`, 2_000, async () => {
    let current = {};
    const raw = await getValue(key);
    if (raw) {
      try {
        current = JSON.parse(raw) ?? {};
      } catch {
        current = {};
      }
    }

    if (current[event] === undefined && Object.keys(current).length >= MAX_TRACKED_EVENTS_PER_DAY) {
      return;
    }

    current[event] = Number(current[event] ?? 0) + 1;
    await setValue(key, JSON.stringify(current), DAY_TTL_MS);
  });

  return sendJson(res, 200, { ok: true });
};
