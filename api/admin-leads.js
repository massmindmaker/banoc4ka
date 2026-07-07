/* ==========================================================================
   БАНОЧКА — GET /api/admin-leads
   Полный список заявок для админки. Требует Authorization: Bearer <ADMIN_PASSWORD>.
   ========================================================================== */
const { list } = require("@vercel/blob");
const crypto = require("crypto");

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function readAllLeads() {
  const leads = [];
  let cursor;
  let hasMore = true;

  while (hasMore) {
    const result = await list({ prefix: "leads/", cursor: cursor, limit: 1000 });
    const blobs = result.blobs || [];

    const records = await Promise.all(
      blobs.map(async function (blob) {
        try {
          const resp = await fetch(blob.url);
          if (!resp.ok) return null;
          return await resp.json();
        } catch (err) {
          return null;
        }
      })
    );

    records.forEach(function (rec) {
      if (rec && typeof rec === "object") leads.push(rec);
    });

    cursor = result.cursor;
    hasMore = !!result.hasMore;
  }

  return leads;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const expectedPassword = process.env.ADMIN_PASSWORD || "";
  const authHeader = req.headers["authorization"] || "";
  const expectedHeader = "Bearer " + expectedPassword;

  if (!expectedPassword || !safeEqual(authHeader, expectedHeader)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const leads = await readAllLeads();
    leads.sort(function (a, b) {
      return (b.ts || 0) - (a.ts || 0);
    });
    return res.status(200).json(leads);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read leads" });
  }
};
