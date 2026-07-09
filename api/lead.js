/* ==========================================================================
   БАНОЧКА — POST /api/lead
   Приём заявок (предзаказ / пайщик) с фронта, сохранение в Vercel Blob.

   Юридика: требует явного consent:true (152-ФЗ, см. privacy.html/offer.html) —
   без него 400. Анти-спам: honeypot-поле "website" (боты его заполняют, люди
   не видят — CSS position:absolute;left:-9999px) и rate-limit 5 заявок/10 мин
   на IP (ip хранится только в виде sha256-хеша).

   ВАЖНО про rate-limit: состояние держится В ПАМЯТИ функции (module-level
   Map), а НЕ в Vercel Blob. Изначально лимит был реализован через Blob
   (ratelimit/<hash>.json), но эмпирическая проверка показала, что Blob не
   даёт надёжной read-after-write консистентности при быстром overwrite
   одного и того же pathname: даже через get(..., {useCache:false}) — то
   есть в обход публичного CDN, напрямую в origin — при 6 последовательных
   вызовах чтение иногда внезапно возвращало пустой массив вместо только что
   записанных таймстемпов (см. итерацию 5 в тесте: записали 3 таймстемпа,
   прочитали 0). Blob рассчитан на объекты, которые не перезаписываются
   часто, а не на "живой счётчик". Поэтому лимит хранится в памяти процесса:
   он переживает повторные вызовы на одном тёплом (warm) инстансе функции,
   но НЕ персистентен между инстансами — при холодном старте или если
   Vercel поднимет несколько параллельных инстансов под нагрузкой, счётчик
   на каждом инстансе свой. Для защиты от обычного спама (один бот/скрипт,
   бьющий в один инстанс) этого достаточно; от распределённой атаки — нет.
   ========================================================================== */
const { put } = require("@vercel/blob");
const crypto = require("crypto");

const ALLOWED_TYPES = ["preorder", "pai"];
// Роль хранится как русское слово (см. README-контракт в main.js: ROLE_TO_API).
const ALLOWED_ROLES = ["потребитель", "фермер", "цех", "склад", "логистика"];

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 минут

// module-level — живёт, пока жив тёплый инстанс функции (см. комментарий выше).
const rateLimitStore = new Map(); // sha256(ip) -> timestamps[]

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

// Rate-limit: скользящее окно 10 минут. Возвращает true, если заявку МОЖНО принять.
function checkAndRecordRateLimit(ip) {
  const key = hashIp(ip);
  const now = Date.now();

  const existing = rateLimitStore.get(key) || [];
  const recent = existing.filter(function (ts) {
    return now - ts < RATE_LIMIT_WINDOW_MS;
  });

  if (recent.length >= RATE_LIMIT_MAX) {
    rateLimitStore.set(key, recent);
    return false;
  }

  recent.push(now);
  rateLimitStore.set(key, recent);
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
  const allowed = checkAndRecordRateLimit(ip);
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
