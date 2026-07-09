/* ==========================================================================
   БАНОЧКА — POST /api/lead
   Приём заявок (предзаказ / пайщик) с фронта, сохранение в Vercel Blob.

   Юридика: требует явного consent:true (152-ФЗ, см. privacy.html/offer.html) —
   без него 400. Анти-спам: honeypot-поле "website" (боты его заполняют, люди
   не видят — CSS position:absolute;left:-9999px) и rate-limit 5 заявок/10 мин
   на IP (состояние в Vercel Blob, ip хранится только в виде sha256-хеша).
   ========================================================================== */
const { put, head } = require("@vercel/blob");
const crypto = require("crypto");

const ALLOWED_TYPES = ["preorder", "pai"];
// Роль хранится как русское слово (см. README-контракт в main.js: ROLE_TO_API).
const ALLOWED_ROLES = ["потребитель", "фермер", "цех", "склад", "логистика"];

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 минут

function isNonEmptyString(v, maxLen) {
  return typeof v === "string" && v.trim().length > 0 && v.length <= maxLen;
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(ip).digest("hex");
}

// Rate-limit: скользящее окно 10 минут, состояние — Vercel Blob
// (ratelimit/<sha256(ip)>.json), т.к. serverless-функции не гарантируют
// разделяемую память между вызовами (каждый вызов может попасть в новый
// контейнер). Возвращает true, если заявку МОЖНО принять.
async function checkAndRecordRateLimit(ip) {
  const pathname = "ratelimit/" + hashIp(ip) + ".json";
  const now = Date.now();

  let timestamps = [];
  try {
    const info = await head(pathname);
    if (info && info.url) {
      const resp = await fetch(info.url);
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.timestamps)) {
          timestamps = data.timestamps;
        }
      }
    }
  } catch (err) {
    // Blob не найден или ошибка чтения — считаем, что истории ещё нет.
    timestamps = [];
  }

  const recent = timestamps.filter(function (ts) {
    return typeof ts === "number" && now - ts < RATE_LIMIT_WINDOW_MS;
  });

  if (recent.length >= RATE_LIMIT_MAX) {
    // Всё равно сохраняем обрезанный список, чтобы файл не рос бесконечно.
    try {
      await put(pathname, JSON.stringify({ timestamps: recent }), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json"
      });
    } catch (err) {
      // Не критично — просто не обновили таймстемпы, лимит всё равно сработал.
    }
    return false;
  }

  recent.push(now);
  try {
    await put(pathname, JSON.stringify({ timestamps: recent }), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json"
    });
  } catch (err) {
    // Если запись лимита не удалась — не блокируем легитимную заявку из-за инфры.
  }

  return true;
}

// Уведомление админу в Telegram. Опционально: если нет env — тихо пропускаем.
// Ошибка отправки логируется, но НЕ влияет на ответ клиенту (best-effort).
async function notifyTelegram(record) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const lines = [
    "Новая заявка «Баночка» (" + record.type + ")",
    "Имя: " + record.name,
    "Контакт: " + record.contact
  ];
  if (record.role) lines.push("Роль: " + record.role);
  if (record.city) lines.push("Город: " + record.city);

  try {
    const resp = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") })
    });
    if (!resp.ok) {
      console.error("Telegram notify: bad status", resp.status);
    }
  } catch (err) {
    console.error("Telegram notify failed:", err && err.message);
  }
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

  const ip = getClientIp(req);
  const allowed = await checkAndRecordRateLimit(ip);
  if (!allowed) {
    return res.status(429).json({ error: "too many requests" });
  }

  const { type, name, contact, role, city, website, consent } = body;

  // Honeypot: скрытое от людей поле "website". Заполнено => бот. Отвечаем
  // так, будто всё прошло успешно, но ничего не сохраняем — не даём боту
  // понять, что его отфильтровали.
  if (typeof website === "string" && website.trim().length > 0) {
    return res.status(201).json({ ok: true });
  }

  // Юридика: без явного согласия на обработку ПДн заявку не принимаем.
  if (consent !== true) {
    return res.status(400).json({ error: "consent required" });
  }

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
    ua: req.headers["user-agent"] || "",
    consent: true,
    consentTs: Date.now()
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

  // Best-effort — не блокирует и не проваливает ответ клиенту.
  await notifyTelegram(record);

  return res.status(201).json({ ok: true });
};
