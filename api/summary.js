/* ==========================================================================
   БАНОЧКА — GET /api/summary
   Публичная агрегированная сводка по всем заявкам (для живой карты/счётчика).
   ========================================================================== */
const { list } = require("@vercel/blob");

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

  try {
    const leads = await readAllLeads();

    const summary = { total: 0, preorders: 0, byRole: {}, byCity: {} };

    leads.forEach(function (rec) {
      summary.total++;
      if (rec.type === "preorder") summary.preorders++;

      if (rec.role) {
        summary.byRole[rec.role] = (summary.byRole[rec.role] || 0) + 1;
      }

      if (rec.city) {
        if (!summary.byCity[rec.city]) {
          summary.byCity[rec.city] = { count: 0, roles: {} };
        }
        summary.byCity[rec.city].count++;
        if (rec.role) {
          summary.byCity[rec.city].roles[rec.role] =
            (summary.byCity[rec.city].roles[rec.role] || 0) + 1;
        }
      }
    });

    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read leads" });
  }
};
