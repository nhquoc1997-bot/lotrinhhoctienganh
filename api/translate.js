// Trạm dịch Bob English — chạy trên Vercel (Serverless Function)
// Thứ tự: Google (nhanh nhất, gọi từ máy chủ) → MyMemory → Gemini (chỉ khi 2 cái trên lỗi và có GEMINI_API_KEY)
// Có bộ nhớ đệm: kết quả giống nhau được trả ngay, không tốn lượt dịch.

const MAX_CHARS = 6000;
const cache = new Map(); // bộ nhớ đệm trong máy chủ (mất khi máy chủ khởi động lại)
const CACHE_LIMIT = 5000;
const LANGS = new Set(['vi', 'en', 'auto']);
const LANG_NAME = { vi: 'Vietnamese', en: 'English', auto: 'the detected language' };

// Giới hạn nhẹ chống lạm dụng: tối đa 120 yêu cầu / phút / IP
const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > 60000) { rec.t = now; rec.n = 0; }
  rec.n++;
  hits.set(ip, rec);
  if (hits.size > 10000) hits.clear();
  return rec.n > 120;
}

function remember(key, value) {
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, options = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 1. Gemini ----------
async function viaGemini(text, sl, tl) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Chưa cấu hình GEMINI_API_KEY');
  const models = [process.env.GEMINI_MODEL, 'gemini-flash-lite-latest', 'gemini-flash-latest'].filter(Boolean);
  const isWord = text.trim().split(/\s+/).length <= 3 && text.length < 40;
  const prompt =
    `Translate the following text from ${LANG_NAME[sl]} to ${LANG_NAME[tl]}.\n` +
    (isWord
      ? `It is a short word or phrase for an English learner: give the most common meaning only (at most 2 meanings separated by ", "). `
      : `Keep the meaning, tone and line breaks. Use natural, everyday language suitable for English learners. `) +
    `Return ONLY the translation, with no quotes, notes or explanations.\n\nTEXT:\n${text}`;

  let lastErr;
  for (const model of models) {
    for (let attempt = 0; attempt < 1; attempt++) {
      try {
        const data = await fetchJSON(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: model.includes('2.5')
                ? { temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } }
                : { temperature: 0.2 },
            }),
          },
          20000
        );
        const out = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
        if (out) return out;
        throw new Error('Gemini trả về rỗng');
      } catch (e) {
        lastErr = e;
        if (e.status === 404 || e.status === 400) break; // tên model không dùng được → thử model kế
        if (e.status === 429 || (e.status >= 500)) { await sleep(600 * (attempt + 1)); continue; }
        break;
      }
    }
  }
  throw lastErr || new Error('Gemini lỗi');
}

// ---------- 2. Google (gọi từ máy chủ, chia đoạn) ----------
function splitChunks(text, size) {
  if (text.length <= size) return [text];
  const parts = text.match(/[^.!?\n]+[.!?\n]*\s*/g) || [text];
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + p).length > size && cur) { chunks.push(cur); cur = ''; }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
    } else cur += p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function viaGoogle(text, sl, tl) {
  const out = [];
  for (const chunk of splitChunks(text, 1800)) {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(chunk)}`;
    const data = await fetchJSON(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 6000);
    out.push((data?.[0] || []).map((s) => (s && s[0]) || '').join(''));
  }
  const res = out.join('').trim();
  if (!res) throw new Error('Google trả về rỗng');
  return res;
}

// ---------- 3. MyMemory ----------
async function viaMyMemory(text, sl, tl) {
  const src = sl === 'auto' ? (tl === 'vi' ? 'en' : 'vi') : sl;
  const out = [];
  for (const chunk of splitChunks(text, 480)) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${src}|${tl}`;
    const data = await fetchJSON(url, {}, 6000);
    const t = data?.responseData?.translatedText;
    if (!t || data.responseStatus >= 400 || /MYMEMORY WARNING/i.test(t)) throw new Error('MyMemory hết lượt');
    out.push(t);
  }
  return out.join(' ').trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  let body = {};
  if (req.method === 'POST') {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  }
  const q = String(body.text ?? body.q ?? req.query.q ?? '').trim();
  const sl = String(body.sl ?? req.query.sl ?? 'auto');
  const tl = String(body.tl ?? req.query.tl ?? 'vi');

  if (!q) return res.status(400).json({ error: 'Thiếu nội dung cần dịch.' });
  if (q.length > MAX_CHARS) return res.status(413).json({ error: `Đoạn văn quá dài (tối đa ${MAX_CHARS} ký tự). Hãy chia nhỏ ra.` });
  if (!LANGS.has(sl) || !LANGS.has(tl) || tl === 'auto') return res.status(400).json({ error: 'Ngôn ngữ không hợp lệ.' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) {
    res.setHeader('Retry-After', '20');
    return res.status(429).json({ error: 'Bạn dịch hơi nhanh, vui lòng đợi vài giây rồi thử lại.' });
  }

  const key = `${sl}|${tl}|${q}`;
  if (cache.has(key)) {
    res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
    return res.status(200).json({ text: cache.get(key), provider: 'cache' });
  }

  const providers = [
    ['google', viaGoogle],
    ['mymemory', viaMyMemory],
    ['gemini', viaGemini],
  ];
  const errors = [];
  for (const [name, fn] of providers) {
    try {
      const text = await fn(q, sl, tl);
      remember(key, text);
      // Cho CDN của Vercel lưu kết quả 30 ngày → lần sau trả ngay, không tốn lượt
      res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
      return res.status(200).json({ text, provider: name });
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  console.error('Tất cả dịch vụ dịch đều lỗi:', errors);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({ error: 'Máy chủ dịch đang bận, vui lòng thử lại sau vài giây.', details: errors });
}
