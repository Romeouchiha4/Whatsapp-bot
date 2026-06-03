// ═══════════════════════════════════════════════════════════════
//  🤖  ITX ROMEO BOT  v4.0  —  WhatsApp Bot + Dashboard
// ═══════════════════════════════════════════════════════════════
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino    = require('pino');
const fs      = require('fs');
const express = require('express');

// ── Express setup
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// ── Global state
let sock       = null;
let botStatus  = { connected: false, phone: '', uptime: null, msgCount: 0, lookupCount: 0 };

// ── Settings
const SETTINGS_FILE = './settings.json';
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE)); } catch (_) {}
}
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// ════════════════════════════════════════════════════════════════
//  🌐  DASHBOARD HTML  (embedded — no extra files needed)
// ════════════════════════════════════════════════════════════════
const DASHBOARD_HTML = /* html */`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>ITX ROMEO — Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { mono: ['Space Mono','monospace'], sans: ['DM Sans','sans-serif'] },
          colors: {
            brand: { 50:'#fff1f2', 100:'#ffe4e6', 200:'#fecdd3', 300:'#fda4af',
                     400:'#fb7185', 500:'#f43f5e', 600:'#e11d48', 700:'#be123c',
                     800:'#9f1239', 900:'#881337', 950:'#4c0519' }
          }
        }
      }
    }
  </script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#050505;color:#e8e8e0;font-family:'DM Sans',sans-serif;min-height:100vh;overflow-x:hidden;}
    .noise{position:fixed;inset:0;pointer-events:none;opacity:.04;z-index:0;
      background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");}
    .grid-bg{position:fixed;inset:0;pointer-events:none;z-index:0;
      background-image:linear-gradient(rgba(244,63,94,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(244,63,94,.04) 1px,transparent 1px);
      background-size:40px 40px;}
    .card{background:rgba(18,18,18,.9);border:1px solid rgba(244,63,94,.12);border-radius:16px;backdrop-filter:blur(12px);}
    .card-glow{box-shadow:0 0 40px rgba(244,63,94,.08),inset 0 1px 0 rgba(255,255,255,.04);}
    .btn-primary{background:linear-gradient(135deg,#e11d48,#be123c);color:#fff;border:none;cursor:pointer;
      transition:all .2s;font-family:'DM Sans',sans-serif;font-weight:600;}
    .btn-primary:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(225,29,72,.3);}
    .btn-primary:active{transform:translateY(0);}
    .btn-danger{background:rgba(220,38,38,.15);color:#fca5a5;border:1px solid rgba(220,38,38,.3);cursor:pointer;
      transition:all .2s;font-family:'DM Sans',sans-serif;font-weight:500;}
    .btn-danger:hover{background:rgba(220,38,38,.25);}
    .btn-ghost{background:rgba(255,255,255,.05);color:#a8a8a0;border:1px solid rgba(255,255,255,.08);cursor:pointer;
      transition:all .2s;font-family:'DM Sans',sans-serif;font-weight:500;}
    .btn-ghost:hover{background:rgba(255,255,255,.1);}
    input{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#e8e8e0;
      font-family:'DM Sans',sans-serif;transition:all .2s;}
    input:focus{outline:none;border-color:rgba(244,63,94,.5);box-shadow:0 0 0 3px rgba(244,63,94,.1);}
    input::placeholder{color:rgba(255,255,255,.25);}
    .tag{font-family:'Space Mono',monospace;font-size:.7rem;background:rgba(244,63,94,.1);
      color:#fb7185;border:1px solid rgba(244,63,94,.2);border-radius:6px;padding:2px 8px;}
    .dot-online{width:8px;height:8px;background:#22c55e;border-radius:50%;
      animation:pulse-dot 2s ease-in-out infinite;box-shadow:0 0 0 0 rgba(34,197,94,.4);}
    .dot-offline{width:8px;height:8px;background:#6b7280;border-radius:50%;}
    @keyframes pulse-dot{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4);}50%{box-shadow:0 0 0 6px rgba(34,197,94,0);}}
    .code-box{font-family:'Space Mono',monospace;background:rgba(244,63,94,.06);
      border:1px dashed rgba(244,63,94,.3);border-radius:12px;letter-spacing:.25em;}
    .stat-num{font-family:'Space Mono',monospace;}
    .fade-in{animation:fadeIn .4s ease both;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    .slide-up{animation:slideUp .5s cubic-bezier(.22,1,.36,1) both;}
    @keyframes slideUp{from{opacity:0;transform:translateY(30px);}to{opacity:1;transform:translateY(0);}}
    .shimmer{position:relative;overflow:hidden;}
    .shimmer::after{content:'';position:absolute;inset:0;
      background:linear-gradient(90deg,transparent,rgba(255,255,255,.04),transparent);
      animation:shimmer 2s infinite;}
    @keyframes shimmer{from{transform:translateX(-100%);}to{transform:translateX(100%);}}
    ::-webkit-scrollbar{width:4px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:rgba(244,63,94,.3);border-radius:2px;}
  </style>
</head>
<body>
  <div class="noise"></div>
  <div class="grid-bg"></div>

  <!-- ── LOGIN SCREEN -->
  <div id="loginScreen" class="relative z-10 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-sm slide-up">

      <!-- Logo -->
      <div class="text-center mb-10">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style="background:linear-gradient(135deg,rgba(244,63,94,.2),rgba(190,18,60,.1));border:1px solid rgba(244,63,94,.2);">
          <span style="font-size:1.8rem;">🤖</span>
        </div>
        <h1 class="text-2xl font-bold tracking-tight" style="font-family:'Space Mono',monospace;">
          <span style="color:#f43f5e;">ITX</span> ROMEO
        </h1>
        <p class="text-sm mt-1" style="color:#6b7280;">WhatsApp Bot Control Panel</p>
      </div>

      <!-- Card -->
      <div class="card card-glow p-6">
        <!-- Login Form -->
        <div id="loginForm">
          <p class="text-xs mb-4" style="color:#6b7280;">
            WhatsApp number daalo — pairing code milega
            <br/><span style="color:#4b5563;">اپنا واٹس ایپ نمبر ڈالیں</span>
          </p>
          <input id="phoneInput" type="tel" placeholder="+92 300 1234567"
            class="w-full px-4 py-3 rounded-xl text-sm mb-3"/>
          <button onclick="requestPair()" class="btn-primary w-full py-3 rounded-xl text-sm mb-3">
            🔗 Get Pairing Code / پیئرنگ کوڈ لیں
          </button>
          <button onclick="resetBot()" class="btn-danger w-full py-2.5 rounded-xl text-xs">
            🗑️ Reset Previous Session / پرانا سیشن ڈیلیٹ کریں
          </button>
          <div id="statusMsg" class="mt-3 text-center text-xs min-h-4"></div>
        </div>

        <!-- Pairing Section -->
        <div id="pairingSection" class="hidden text-center">
          <p class="text-xs mb-1" style="color:#9ca3af;">WhatsApp میں یہ کوڈ ڈالیں</p>
          <p class="text-xs mb-4" style="color:#6b7280;">Linked Devices → Link a Device → Enter Code</p>
          <div class="code-box py-5 px-4 mb-4">
            <span id="codeDisplay" class="text-3xl font-bold" style="color:#f43f5e;letter-spacing:.3em;"></span>
          </div>
          <p class="text-xs mb-4" style="color:#f59e0b;">⏳ Code 60 seconds mein expire hoga</p>
          <p class="text-xs mb-4" style="color:#6b7280;">Connected hone ka wait kar raha hun...<br/>منتظر ہوں...</p>
          <button onclick="showLoginForm()" class="btn-ghost px-4 py-2 rounded-lg text-xs">
            ← Back / واپس
          </button>
          <div id="statusMsg2" class="mt-3 text-center text-xs min-h-4"></div>
        </div>
      </div>

      <p class="text-center text-xs mt-4" style="color:#374151;">
        © 2025 𝐈𝐭𝐱 𝐑𝐎𝐌𝐄𝐎 — All rights reserved
      </p>
    </div>
  </div>

  <!-- ── DASHBOARD -->
  <div id="dashboard" class="hidden relative z-10 min-h-screen">

    <!-- Header -->
    <header class="sticky top-0 z-20 px-6 py-4 flex items-center justify-between"
      style="background:rgba(5,5,5,.85);backdrop-filter:blur(20px);border-bottom:1px solid rgba(244,63,94,.08);">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-9 h-9 rounded-xl"
          style="background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.15);">
          🤖
        </div>
        <div>
          <h1 class="font-bold text-sm" style="font-family:'Space Mono',monospace;color:#f43f5e;">ITX ROMEO</h1>
          <p id="headerPhone" class="text-xs" style="color:#6b7280; font-family:'Space Mono',monospace;"></p>
        </div>
      </div>
      <div id="statusBadge" class="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
        style="background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.15);color:#86efac;">
        <div class="dot-online"></div>
        <span>Connected / منسلک</span>
      </div>
    </header>

    <!-- Body -->
    <main class="max-w-4xl mx-auto px-4 py-6 space-y-4">

      <!-- Stats Row -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 fade-in">
        <div class="card card-glow p-4 shimmer">
          <p class="text-xs mb-2" style="color:#6b7280;">Status / حالت</p>
          <p id="statStatus" class="stat-num text-base font-bold" style="color:#22c55e;">🟢 Online</p>
        </div>
        <div class="card card-glow p-4 shimmer">
          <p class="text-xs mb-2" style="color:#6b7280;">Messages / پیغامات</p>
          <p id="statMsgs" class="stat-num text-2xl font-bold" style="color:#f43f5e;">0</p>
        </div>
        <div class="card card-glow p-4 shimmer">
          <p class="text-xs mb-2" style="color:#6b7280;">Lookups / تلاش</p>
          <p id="statLookups" class="stat-num text-2xl font-bold" style="color:#fb923c;">0</p>
        </div>
        <div class="card card-glow p-4 shimmer">
          <p class="text-xs mb-2" style="color:#6b7280;">Uptime / وقت</p>
          <p id="statUptime" class="stat-num text-2xl font-bold" style="color:#a78bfa;">0m</p>
        </div>
      </div>

      <!-- Commands -->
      <div class="grid md:grid-cols-2 gap-3 fade-in" style="animation-delay:.1s;">

        <!-- AI -->
        <div class="card card-glow p-5">
          <h3 class="font-semibold text-sm mb-3 flex items-center gap-2">
            🧠 <span>AI Commands / اے آئی</span>
          </h3>
          <div class="space-y-2.5">
            <div class="flex items-start gap-2.5">
              <span class="tag">.ai</span>
              <span class="text-xs" style="color:#9ca3af;">AI se koi bhi sawal / کوئی بھی سوال</span>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="tag">.roast</span>
              <span class="text-xs" style="color:#9ca3af;">Kisi ko roast karo / روسٹ کریں</span>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="tag">.joke</span>
              <span class="text-xs" style="color:#9ca3af;">Funny joke / مزاحیہ جوک</span>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="tag">.quote</span>
              <span class="text-xs" style="color:#9ca3af;">Motivational quote / حوصلہ افزا</span>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="tag">.shayari</span>
              <span class="text-xs" style="color:#9ca3af;">Urdu shayari / اردو شاعری</span>
            </div>
          </div>
        </div>

        <!-- Lookup -->
        <div class="card card-glow p-5">
          <h3 class="font-semibold text-sm mb-3 flex items-center gap-2">
            🔍 <span>Number Lookup / نمبر تلاش</span>
          </h3>
          <div class="space-y-2.5">
            <div class="flex items-start gap-2.5">
              <span class="tag">.n</span>
              <span class="text-xs" style="color:#9ca3af;">SIM + CNIC info / سم اور شناختی کارڈ</span>
            </div>
            <div class="flex items-start gap-2.5">
              <span class="tag">auto</span>
              <span class="text-xs" style="color:#9ca3af;">Sirf number bhejo — auto lookup / صرف نمبر بھیجیں</span>
            </div>
            <div class="mt-2 p-3 rounded-xl" style="background:rgba(251,146,60,.05);border:1px solid rgba(251,146,60,.15);">
              <p class="text-xs font-semibold mb-1" style="color:#fb923c;">🔰 Number Banned? / نمبر بند ہے؟</p>
              <a href="https://rmnumber.vercel.app" target="_blank"
                class="text-xs underline" style="color:#fb7185;">
                🌐 https://rmnumber.vercel.app
              </a>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t" style="border-color:rgba(255,255,255,.05);">
            <h3 class="font-semibold text-sm mb-2 flex items-center gap-2">
              ⚡ <span>Utilities / یوٹیلٹی</span>
            </h3>
            <div class="flex gap-2 flex-wrap">
              <span class="tag">.ping</span>
              <span class="tag">.info</span>
              <span class="tag">.menu</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="card card-glow p-5 fade-in" style="animation-delay:.2s;">
        <h3 class="font-semibold text-sm mb-4 flex items-center gap-2">
          ⚙️ <span>Controls / کنٹرولز</span>
        </h3>
        <div class="flex gap-3 flex-wrap">
          <button onclick="resetBot()" class="btn-danger px-4 py-2.5 rounded-xl text-sm">
            🗑️ Reset Session / سیشن ری سیٹ
          </button>
          <button onclick="checkStatus()" class="btn-ghost px-4 py-2.5 rounded-xl text-sm">
            🔄 Refresh / تازہ کریں
          </button>
        </div>
        <p id="ctrlMsg" class="mt-3 text-xs" style="color:#6b7280;min-height:16px;"></p>
      </div>

    </main>
  </div>

  <script>
    let pollTimer;

    async function requestPair() {
      const phone = document.getElementById('phoneInput').value.trim();
      if (!phone) return setStatus('⚠️ Number daalo pehle / پہلے نمبر ڈالیں', '#f59e0b');
      setStatus('⏳ Requesting... / درخواست جاری ہے...', '#60a5fa');
      try {
        const r = await fetch('/api/pair', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ phone })
        });
        const d = await r.json();
        if (d.code) {
          document.getElementById('loginForm').classList.add('hidden');
          document.getElementById('pairingSection').classList.remove('hidden');
          document.getElementById('codeDisplay').textContent = d.code;
          setStatus('', '');
          startPoll();
        } else {
          setStatus('❌ ' + (d.error || 'Failed / ناکام'), '#f87171');
        }
      } catch (e) {
        setStatus('❌ Server error: ' + e.message, '#f87171');
      }
    }

    async function resetBot() {
      if (!confirm('Previous session delete karna chahte ho? / پرانا سیشن ڈیلیٹ کریں؟')) return;
      const r = await fetch('/api/reset', { method:'POST' });
      const d = await r.json();
      if (d.success) {
        document.getElementById('ctrlMsg').textContent = '✅ Reset ho gaya! / ری سیٹ ہوگیا';
        setTimeout(() => location.reload(), 1500);
      }
    }

    function showLoginForm() {
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('pairingSection').classList.add('hidden');
    }

    function setStatus(msg, color) {
      const el = document.getElementById('statusMsg');
      if (el) { el.textContent = msg; el.style.color = color || '#9ca3af'; }
      const el2 = document.getElementById('statusMsg2');
      if (el2) { el2.textContent = msg; el2.style.color = color || '#9ca3af'; }
    }

    function startPoll() {
      clearInterval(pollTimer);
      pollTimer = setInterval(checkStatus, 2500);
    }

    async function checkStatus() {
      try {
        const r = await fetch('/api/status');
        const d = await r.json();
        if (d.connected) {
          clearInterval(pollTimer);
          document.getElementById('loginScreen').classList.add('hidden');
          document.getElementById('dashboard').classList.remove('hidden');
          document.getElementById('headerPhone').textContent = '+' + (d.phone || '');
          document.getElementById('statMsgs').textContent    = d.msgCount    || 0;
          document.getElementById('statLookups').textContent = d.lookupCount || 0;
          if (d.uptimeMs) {
            const mins = Math.floor(d.uptimeMs / 60000);
            const hrs  = Math.floor(mins / 60);
            document.getElementById('statUptime').textContent = hrs > 0 ? hrs + 'h ' + (mins % 60) + 'm' : mins + 'm';
          }
          startPoll(); // keep refreshing stats
        }
      } catch (_) {}
    }

    checkStatus();
    startPoll();
  </script>
</body>
</html>`;

// ── Serve dashboard at /
app.get('*', (req, res) => res.send(DASHBOARD_HTML));

// ── API: Status
app.get('/api/status', (req, res) => {
  res.json({
    connected   : botStatus.connected,
    phone       : botStatus.phone,
    msgCount    : botStatus.msgCount,
    lookupCount : botStatus.lookupCount,
    uptimeMs    : botStatus.uptime ? Date.now() - botStatus.uptime : 0
  });
});

// ── API: Request pairing code
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body || {};
  if (!phone) return res.json({ error: 'Phone number required / نمبر ضروری ہے' });
  const clean = phone.replace(/[^0-9]/g, '');
  if (!sock)              return res.json({ error: 'Bot initializing, thodi der mein try karo' });
  if (botStatus.connected) return res.json({ error: 'Already connected / پہلے سے جڑا ہوا ہے' });
  try {
    const code = await sock.requestPairingCode(clean);
    res.json({ code });
  } catch (e) {
    res.json({ error: e.message });
  }
});

// ── API: Reset session
app.post('/api/reset', (req, res) => {
  try {
    if (fs.existsSync('./auth_info')) fs.rmSync('./auth_info', { recursive: true, force: true });
    botStatus = { connected: false, phone: '', uptime: null, msgCount: 0, lookupCount: 0 };
    res.json({ success: true });
    setTimeout(() => { if (sock) { try { sock.end(); } catch (_) {} } startBot(); }, 500);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`\n🌐 Dashboard → http://localhost:${PORT}\n`));

// ════════════════════════════════════════════════════════════════
//  🧠  GROK AI
// ════════════════════════════════════════════════════════════════
const GROK_URL   = 'https://grok-api-red.vercel.app/chat/completions';
const GROK_MODEL = 'grok-4.1-fast';

async function getAI(prompt, temp = 0.7) {
  try {
    const r = await fetch(GROK_URL, {
      method : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body   : JSON.stringify({ model: GROK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: temp })
    });
    const d = await r.json();
    if (d.choices) return d.choices[0].message.content;
    throw new Error(JSON.stringify(d));
  } catch (e) {
    return '❌ *Error / غلطی:* AI server busy hai, thodi der baad try karo!\nاے آئی سرور مصروف ہے۔';
  }
}

// ════════════════════════════════════════════════════════════════
//  🔍  NUMBER LOOKUP + CNIC SEARCH
// ════════════════════════════════════════════════════════════════
function normalizeNumber(raw) {
  let n = raw.replace(/[^0-9]/g, '');
  if      (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
  else if (n.startsWith('3') && n.length === 10) n = '92' + n;
  else if (n.startsWith('0092'))                 n = n.slice(2);
  return n;
}

// Detect any Pakistani mobile number in a message
const PK_NUM_RE = /(?:\+92|0092|92|0)[\s\-.]?3\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}/g;
function extractPKNumber(text) {
  const m = text.match(PK_NUM_RE);
  return m ? m[0] : null;
}

async function fetchSIMData(queryParam) {
  const r = await fetch(`https://ramzan-simdata.deno.dev/?${queryParam}`);
  return r.json();
}

function formatRecord(d, idx, prefix = '🔹') {
  const addr = (!d.address || ['NULL','no','N/A'].includes(d.address)) ? 'N/A' : d.address;
  return (
    `*${prefix} Record #${idx + 1} / ریکارڈ نمبر ${idx + 1}*\n` +
    `  *📞 Number / نمبر:* +${d.number}\n` +
    `  *👤 Name / نام:* ${d.name}\n` +
    `  *🪪 CNIC / شناختی کارڈ:* ${d.cnic}\n` +
    `  *📍 Address / پتہ:* ${addr}\n`
  );
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(d => seen.has(d.number) ? false : (seen.add(d.number), true));
}

async function lookupNumber(rawNum) {
  try {
    const num  = normalizeNumber(rawNum);
    const data = await fetchSIMData(`number=${num}`);

    if (!data.success || !data.data?.length) {
      return (
        `╔══════════════════════╗\n` +
        `║ 📱 *NUMBER LOOKUP / نمبر تلاش* ║\n` +
        `╚══════════════════════╝\n\n` +
        `❌ *Not Found / نہیں ملا*\n` +
        `*📞 Number / نمبر:* +${num}\n\n` +
        `*🔰 Number Banned? / نمبر بند ہے؟*\n` +
        `Check here / یہاں چیک کریں:\n` +
        `🌐 https://rmnumber.vercel.app\n\n` +
        `— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
      );
    }

    const cnic    = data.linked_cnic;
    const records = dedupe(data.data);

    let txt = '';
    txt += `╔══════════════════════╗\n`;
    txt += `║ 📱 *NUMBER LOOKUP / نمبر تلاش* ║\n`;
    txt += `╚══════════════════════╝\n\n`;
    txt += `*🔍 Query / تلاش:* +${data.query_number || num}\n`;
    txt += `*🪪 CNIC / شناختی کارڈ:* ${cnic}\n`;
    txt += `*📊 Total SIMs / کل سمز:* ${data.total_sims_found}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    records.forEach((d, i) => {
      txt += formatRecord(d, i, '🔹') + '\n';
    });

    // ── CNIC Search
    if (cnic && !['N/A', 'NULL', 'null', 'undefined'].includes(String(cnic))) {
      const cnicData = await fetchSIMData(`cnic=${cnic}`).catch(() => null);
      if (cnicData?.success && cnicData.data?.length) {
        const cnicRecords = dedupe(cnicData.data);
        txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        txt += `*🪪 CNIC Ke Saray Numbers / شناختی کارڈ کے تمام نمبر*\n`;
        txt += `*CNIC / شناختی کارڈ:* ${cnic}\n\n`;
        cnicRecords.forEach((d, i) => {
          txt += formatRecord(d, i, '🔸') + '\n';
        });
      }
    }

    txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `*🔰 Number Banned? / نمبر بند ہے؟*\n`;
    txt += `🌐 https://rmnumber.vercel.app\n\n`;
    txt += `— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`;

    botStatus.lookupCount++;
    return txt;

  } catch (e) {
    console.error('Lookup error:', e.message);
    return (
      `❌ *Lookup Failed / تلاش ناکام*\n` +
      `Server se connect nahi ho saka.\n` +
      `سرور سے رابطہ نہیں ہوسکا۔\n\n` +
      `— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
    );
  }
}

// ════════════════════════════════════════════════════════════════
//  🧘  HUMAN-LIKE BEHAVIOR  (anti-ban)
// ════════════════════════════════════════════════════════════════
const DELAYS = [
  [400,  900],   // fast reply
  [800,  1800],  // normal
  [1200, 2500],  // thinking
];

async function humanDelay(tier = 1) {
  const [min, max] = DELAYS[tier];
  const ms = Math.floor(Math.random() * (max - min)) + min;
  await new Promise(r => setTimeout(r, ms));
}

async function sendWithPresence(sockInst, jid, text, quoted) {
  try { await sockInst.sendPresenceUpdate('composing', jid); } catch (_) {}
  await humanDelay(Math.floor(Math.random() * 3));
  try { await sockInst.sendPresenceUpdate('paused', jid); } catch (_) {}
  return sockInst.sendMessage(jid, { text }, quoted ? { quoted } : {});
}

// ════════════════════════════════════════════════════════════════
//  🚀  BOT START
// ════════════════════════════════════════════════════════════════
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const { version }          = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth             : state,
    printQRInTerminal: false,
    logger           : pino({ level: 'silent' }),
    browser          : Browsers.ubuntu('Chrome'),
    syncFullHistory  : false,
    getMessage       : async () => ({ conversation: '' })
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      botStatus.connected = true;
      botStatus.uptime    = Date.now();
      botStatus.phone     = (sock.user?.id || '').split(':')[0].split('@')[0];
      console.log('🔥 Bot Live! Dashboard → http://localhost:' + PORT);
    }
    if (connection === 'close') {
      botStatus.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('⚡ Reconnecting...');
        setTimeout(startBot, 4000);
      } else {
        console.log('🔴 Logged out. Open dashboard to reconnect.');
      }
    }
  });

  // ─────────────────────────────────────────────────────────
  //  💬  MESSAGE HANDLER
  // ─────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

      const from     = msg.key.remoteJid;
      const isGroup  = from.endsWith('@g.us');
      const isFromMe = msg.key.fromMe;
      const sender   = isGroup ? (msg.key.participant || '') : from;

      const body = msg.message;
      const text = (
        body.conversation                                ||
        body.extendedTextMessage?.text                   ||
        body.imageMessage?.caption                       ||
        body.videoMessage?.caption                       ||
        body.buttonsResponseMessage?.selectedDisplayText ||
        body.listResponseMessage?.title                  || ''
      ).trim();

      if (!text) return;

      botStatus.msgCount++;

      // Mark read + small delay (human-like)
      try { await sock.readMessages([msg.key]); } catch (_) {}
      await humanDelay(0);

      const reply = (t) => sendWithPresence(sock, from, t, msg);
      const quoted = body.extendedTextMessage?.contextInfo?.participant;

      // ─────────────────────────────────────────────
      //  COMMANDS  (start with .)
      // ─────────────────────────────────────────────
      if (text.startsWith('.')) {
        const parts   = text.slice(1).trim().split(/ +/);
        const command = parts.shift().toLowerCase();
        const args    = parts;

        switch (command) {

          // ── .n  (number lookup)
          case 'n': {
            // Support: .n 03001234567  |  .n 0300 1234567  |  .n +92 300 1234567
            const raw = args.join('').replace(/[\s\-\.]/g, '');
            if (!raw) return reply(
              `❌ *Usage / استعمال:*\n` +
              `\`.n 03001234567\`\n` +
              `\`.n +92 300 1234567\`\n` +
              `\`.n 923001234567\`\n\n` +
              `_Ya sirf number bhejo — auto lookup hoga! / یا صرف نمبر بھیجیں!_`
            );
            await reply('🔍 *Searching... / تلاش جاری ہے...*');
            reply(await lookupNumber(raw));
            break;
          }

          // ── .ai
          case 'ai': {
            if (!args.length) return reply(
              `❌ *Sawal likh bhai! / سوال لکھیں!*\n*Usage:* \`.ai <sawal>\``
            );
            await reply('🧠 *Soch raha hun... / سوچ رہا ہوں...*');
            const res = await getAI(
              `Tera owner "𝐈𝐭𝐱 𝐑𝐎𝐌𝐄𝐎" hai. Sawal: "${args.join(' ')}". Roman Urdu mein jawab de, clear aur short.`
            );
            reply(`${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
            break;
          }

          // ── .roast
          case 'roast': {
            await reply('🔥 *Roasting... / روسٹ ہو رہا ہے...*');
            const target = quoted ? `@${quoted.split('@')[0]}` : 'is banda';
            const res    = await getAI(
              `Ek zabardast Roman Urdu roast likho ${target} ke liye. Sirf 2-3 lines. Street style. Emojis daalo.`, 0.9
            );
            await sock.sendMessage(from, {
              text    : `${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
              mentions: quoted ? [quoted] : []
            }, { quoted: msg });
            break;
          }

          // ── .joke
          case 'joke': {
            await reply('😂 *Joke loading... / جوک آرہا ہے...*');
            const res = await getAI(`Ek funny Roman Urdu joke sunao. Sirf 2-3 lines. Emojis lazmi.`, 0.9);
            reply(`${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
            break;
          }

          // ── .quote
          case 'quote': {
            await reply('💭 *Soch raha hun... / سوچ رہا ہوں...*');
            const res = await getAI(`Ek powerful motivational quote Roman Urdu mein. Bold. Max 3 lines.`, 0.8);
            reply(`${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
            break;
          }

          // ── .shayari
          case 'shayari': {
            await reply('🌹 *Shayari likh raha hun... / شاعری لکھ رہا ہوں...*');
            const res = await getAI(`Ek khoobsurat romantic ya dard bhari Urdu shayari. 4 lines.`, 0.9);
            reply(`${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
            break;
          }

          // ── .ping
          case 'ping': {
            const lat = Math.abs(Date.now() - msg.messageTimestamp * 1000);
            const up  = process.uptime();
            const h   = Math.floor(up / 3600);
            const m   = Math.floor((up % 3600) / 60);
            const s   = Math.floor(up % 60);
            const spd = lat < 100 ? '🟢 Fast' : lat < 500 ? '🟡 Medium' : '🔴 Slow';
            reply(
              `╔══ 🏓 *PING* 🏓 ══╗\n\n` +
              `*⚡ Latency / رفتار:* ${lat}ms ${spd}\n` +
              `*⏱️ Uptime / وقت:* ${h}h ${m}m ${s}s\n` +
              `*🚀 Status / حالت:* Online ✅\n\n` +
              `╚═════════════════╝\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
            );
            break;
          }

          // ── .info
          case 'info':
            reply(
              `╔══ 🤖 *BOT INFO / بوٹ معلومات* 🤖 ══╗\n\n` +
              `*👨‍💻 Creator / بنانے والا:* 𝐈𝐭𝐱 𝐑𝐎𝐌𝐄𝐎\n` +
              `*🚀 Version / ورژن:* 4.0 Pro\n` +
              `*🧠 AI:* Grok (${GROK_MODEL})\n` +
              `*🔍 Lookup / تلاش:* SIM + CNIC Data\n` +
              `*🛡️ Anti-Ban / بین سے بچاؤ:* Human-like\n` +
              `*⚡ System / سسٹم:* Running Smooth ✅\n\n` +
              `╚══════════════════════════╝\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
            );
            break;

          // ── .menu / .help
          case 'menu':
          case 'help':
            reply(
              `╔════════════════════════╗\n` +
              `║  🤖 *𝐈𝐓𝐗 𝐑𝐎𝐌𝐄𝐎 𝐌𝐄𝐍𝐔*   ║\n` +
              `╚════════════════════════╝\n\n` +

              `*🧠 AI COMMANDS / اے آئی*\n` +
              `┣ *.ai* [sawal] — AI se poochho / سوال پوچھیں\n` +
              `┣ *.roast* — Kisi ko roast karo / روسٹ کریں\n` +
              `┣ *.joke* — Funny joke / مزاحیہ جوک\n` +
              `┣ *.quote* — Motivational quote / اقتباس\n` +
              `┗ *.shayari* — Urdu shayari / شاعری\n\n` +

              `*🔍 LOOKUP / نمبر تلاش*\n` +
              `┣ *.n* [number] — SIM + CNIC info\n` +
              `┗ _Ya sirf number bhejo! / صرف نمبر بھیجیں!_ 📲\n\n` +

              `*🔰 Number Banned? / نمبر بند ہے؟*\n` +
              `┗ 🌐 https://rmnumber.vercel.app\n\n` +

              `*⚡ UTILS / یوٹیلٹی*\n` +
              `┣ *.ping* — Speed check / رفتار\n` +
              `┗ *.info* — Bot info / بوٹ معلومات\n\n` +

              `╚════════════════════════╝\n` +
              `— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
            );
            break;
        }

        return; // command handled
      }

      // ─────────────────────────────────────────────
      //  AUTO NUMBER DETECTION  (no command needed)
      //  — any format: 0300..., +92 3..., 923...
      // ─────────────────────────────────────────────
      const detected = extractPKNumber(text);
      if (detected) {
        await reply('🔍 *Searching... / تلاش جاری ہے...*');
        reply(await lookupNumber(detected));
      }

    } catch (e) {
      console.error('MSG Error:', e.message);
    }
  });
}

// ── Boot
startBot();
