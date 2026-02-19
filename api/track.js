const { getValue, setValue } = require("./_lib/store");
const { parseBody, sendJson } = require("./_lib/profile");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const body = parseBody(req);
  const event = String(body.event ?? "").trim().slice(0, 50);
  if (!event) {
    return sendJson(res, 400, { error: "event required" });
  }

  const day = new Date().toISOString().slice(0, 10);
  const key = `gb:track:${day}`;

  let current = {};
  const raw = await getValue(key);
  if (raw) {
    try {
      current = JSON.parse(raw) ?? {};
    } catch {
      current = {};
    }
  }

  current[event] = Number(current[event] ?? 0) + 1;
  await setValue(key, JSON.stringify(current));

  return sendJson(res, 200, { ok: true });
};
