/* Bob English — bộ dịch dùng chung cho mọi trang.
 * Cách dùng: const en = await bobTranslate('xin chào', 'vi', 'en');
 * - Gọi trạm dịch /api/translate (Gemini + dự phòng) thay vì gọi thẳng Google.
 * - Lưu kết quả trên máy học viên → từ đã dịch thì hiện ngay, không tốn lượt.
 * - Xếp hàng tối đa 3 yêu cầu cùng lúc, tự thử lại khi máy chủ bận.
 */
(function () {
  // Trên Vercel (kể cả tên miền riêng) dùng trạm dịch cùng trang.
  // Mở từ GitHub Pages hoặc mở file trực tiếp thì gọi trạm dịch trên Vercel.
  var host = location.hostname;
  var API = window.BOB_TRANSLATE_API ||
    ((location.protocol === 'file:' || !host || host.endsWith('github.io'))
      ? 'https://lotrinhhoctienganh.vercel.app/api/translate'
      : '/api/translate');

  var LS_KEY = 'bob_translate_cache_v1';
  var LS_MAX = 3000;
  var mem = {};
  try { mem = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { mem = {}; }
  var saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var keys = Object.keys(mem);
        if (keys.length > LS_MAX) keys.slice(0, keys.length - LS_MAX).forEach(function (k) { delete mem[k]; });
        localStorage.setItem(LS_KEY, JSON.stringify(mem));
      } catch (e) { /* bộ nhớ đầy → bỏ qua */ }
    }, 300);
  }

  var running = 0, queue = [], MAX_PARALLEL = 3;
  function runNext() {
    if (running >= MAX_PARALLEL || !queue.length) return;
    var job = queue.shift();
    running++;
    job().finally(function () { running--; runNext(); });
  }
  function enqueue(fn) {
    return new Promise(function (resolve, reject) {
      queue.push(function () { return fn().then(resolve, reject); });
      runNext();
    });
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var inflight = {};

  async function callApi(text, sl, tl) {
    var url = API + '?sl=' + sl + '&tl=' + tl + '&q=' + encodeURIComponent(text);
    var useGet = url.length < 1800; // GET → được CDN lưu tạm, nhanh hơn
    var lastMsg = 'Máy chủ dịch đang bận, vui lòng thử lại sau vài giây.';
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var res = useGet
          ? await fetch(url)
          : await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, sl: sl, tl: tl }) });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && data.text) return data.text;
        if (data.error) lastMsg = data.error;
        if (res.status === 400 || res.status === 413) break; // lỗi đầu vào, thử lại cũng vô ích
      } catch (e) { lastMsg = 'Mất kết nối mạng, vui lòng kiểm tra Internet.'; }
      await sleep(800 * (attempt + 1) + Math.random() * 400);
    }
    throw new Error(lastMsg);
  }

  window.bobTranslate = function (text, sl, tl) {
    text = String(text || '').trim();
    sl = sl || 'auto'; tl = tl || 'vi';
    if (!text) return Promise.resolve('');
    var key = sl + '|' + tl + '|' + text;
    if (mem[key]) return Promise.resolve(mem[key]);
    if (inflight[key]) return inflight[key];
    var p = enqueue(function () { return callApi(text, sl, tl); }).then(function (out) {
      mem[key] = out; persist();
      return out;
    }).finally(function () { delete inflight[key]; });
    inflight[key] = p;
    return p;
  };
})();
