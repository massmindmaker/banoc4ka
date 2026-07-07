/* ==========================================================================
   БАНОЧКА — POST /api/lead
   Приём заявок (предзаказ / пайщик) с фронта, сохранение в Vercel Blob.
   ========================================================================== */
const { put } = require("@vercel/blob");
const crypto = require("crypto");

const ALLOWED_TYPES = ["preorder", "pai"];
// Роль хранится как русское слово (см. README-контракт в main.js: ROLE_TO_API).
const ALLOWED_ROLES = ["потребитель", "фермер", "цех", "склад", "логистика"];

function isNonEmptyString(v, maxLen) {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (err) {
      body = null;
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { type, name, contact, role, city } = body;

  if (typeof type !== "string" || ALLOWED_TYPES.indexOf(type) === -1) {
    return res.status(400).json({ error: "Invalid or missing type" });
  }
  if (!isNonEmptyString(name, 200)) {
    return res.status(400).json({ error: "Invalid or missing name" });
  }
  if (!isNonEmptyString(contact, 200)) {
    return res.status(400).json({ error: "Invalid or missing contact" });
  }

  const record = {
    type: type,
    name: name.trim(),
    contact: contact.trim(),
    ts: Date.now(),
    ua: req.headers["user-agent"] || ""
  };

  if (type === "preorder") {
    if (typeof role !== "string" || ALLOWED_ROLES.indexOf(role.trim().toLowerCase()) === -1) {
      return res.status(400).json({ error: "Invalid or missing role" });
    }
    if (!isNonEmptyString(city, 100)) {
      return res.status(400).json({ error: "Invalid or missing city" });
    }
    record.role = role.trim().toLowerCase();
    record.city = city.trim();
  } else {
    // type === "pai": роль/город необязательны, но если пришли — тоже валидируем.
    if (role !== undefined && role !== null && role !== "") {
      if (typeof role !== "string" || ALLOWED_ROLES.indexOf(role.trim().toLowerCase()) === -1) {
        return res.status(400).json({ error: "Invalid role" });
      }
      record.role = role.trim().toLowerCase();
    }
    if (city !== undefined && city !== null && city !== "") {
      if (typeof city !== "string" || city.length > 100) {
        return res.status(400).json({ error: "Invalid city" });
      }
      record.city = city.trim();
    }
  }

  const random = crypto.randomBytes(4).toString("hex");
  const pathname = "leads/" + record.ts + "-" + random + ".json";

  try {
    await put(pathname, JSON.stringify(record), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json"
    });
  } catch (err) {
    return res.status(500).json({ error: "Storage error" });
  }

  return res.status(201).json({ ok: true });
};
