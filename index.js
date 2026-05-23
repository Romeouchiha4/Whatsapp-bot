const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino    = require('pino');
const rl      = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const fs      = require('fs');
const path    = require('path');
const express = require('express');

const question = (t) => new Promise(r => rl.question(t, r));

// ═══════════════════════════════════════════════
// 🌐 WEB SERVER
// ═══════════════════════════════════════════════
const app  = express();
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));
app.get('/{*path}', (req, res) => {
    const f = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(f)) res.sendFile(f);
    else res.send('𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺 Bot is Live 🔥');
});
app.listen(PORT, () => console.log(`🌐 Web server live → http://localhost:${PORT}`));

// ═══════════════════════════════════════════════
// ⚙️ SETTINGS
// ═══════════════════════════════════════════════
const SETTINGS_FILE = './settings.json';
let settings = { lockedJid: null };
if (fs.existsSync(SETTINGS_FILE)) {
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE)); } catch (_) {}
}
const saveSettings = () => fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));

// ═══════════════════════════════════════════════
// ⚠️ WARNINGS STORE
// ═══════════════════════════════════════════════
const WARN_FILE = './warnings.json';
let warnData = {};
if (fs.existsSync(WARN_FILE)) {
    try { warnData = JSON.parse(fs.readFileSync(WARN_FILE)); } catch (_) {}
}
const saveWarnings = () => fs.writeFileSync(WARN_FILE, JSON.stringify(warnData, null, 2));

function getWarn(groupJid, userJid, type) {
    const key = `${groupJid}|${userJid}`;
    if (!warnData[key]) warnData[key] = { link: 0, abuse: 0 };
    return warnData[key][type] || 0;
}
function addWarn(groupJid, userJid, type) {
    const key = `${groupJid}|${userJid}`;
    if (!warnData[key]) warnData[key] = { link: 0, abuse: 0 };
    warnData[key][type] = (warnData[key][type] || 0) + 1;
    saveWarnings();
    return warnData[key][type];
}
function resetWarn(groupJid, userJid) {
    const key = `${groupJid}|${userJid}`;
    delete warnData[key];
    saveWarnings();
}

// ═══════════════════════════════════════════════
// 🛡️ AUTO-MOD RULES
// ═══════════════════════════════════════════════
const LINK_REGEX = /(?:https?:\/\/|www\.)\S+|(?:bit\.ly|t\.me|wa\.me|youtu\.be|tinyurl\.com|is\.gd)\/\S+/i;

const ABUSE_WORDS = [
    'fuck','fucker','fuckers','fucking','bitch','bastard','asshole','ass','dick','pussy','sex','porn',
    'nude','nudes','horny','slut','whore','cunt','nigga','nigger','shit','motherfucker','mf',
    'madarchod','maderchod','madar chod','mc','bkl','bhenchod','bhen chod','bc',
    'chutiya','chutiye','choot','lund','lun','teri maa','maa ki','teri ma',
    'gaand','gand','randi','harami','kutta','kutti','suar','sala','saali',
    'phudi','phuddi','lavda','lauda','laude','choday','chodo','chodna',
    'teri maa ki','maa di','maa di phudi','teri phudi','tere maa',
    'wlyat','wlayati','ullu','ullad','ullat'
];

function containsAbuse(text) {
    const lower = text.toLowerCase();
    return ABUSE_WORDS.some(w => {
        const re = new RegExp(`(^|[\\s,.!?])(${w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})([\\s,.!?]|$)`, 'i');
        return re.test(lower) || lower.includes(w);
    });
}
function containsLink(text) { return LINK_REGEX.test(text); }

// ═══════════════════════════════════════════════
// 🧠 GROK AI
// ═══════════════════════════════════════════════
const GROK_URL   = 'https://grok-api-red.vercel.app/chat/completions';
const GROK_MODEL = 'grok-4.1-fast';

async function getAI(prompt, temp = 0.7) {
    try {
        const res  = await fetch(GROK_URL, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ model: GROK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: temp })
        });
        const data = await res.json();
        if (data.choices) return data.choices[0].message.content;
        throw new Error(JSON.stringify(data));
    } catch (e) {
        console.error('AI Error:', e.message);
        return '❌ *𝐄𝐫𝐫𝐨𝐫:* AI server busy hai, thodi der baad try karo!';
    }
}

// ═══════════════════════════════════════════════
// 🔍 NUMBER LOOKUP
// ═══════════════════════════════════════════════
function normalizeNumber(raw) {
    let n = raw.replace(/[^0-9]/g, '');
    if      (n.startsWith('0'))                    n = '92' + n.slice(1);
    else if (n.startsWith('3') && n.length === 10) n = '92' + n;
    return n;
}

async function lookupNumber(rawNum) {
    try {
        const num  = normalizeNumber(rawNum);
        const res  = await fetch(`https://ramzan-simdata.deno.dev/?number=${num}`);
        const data = await res.json();
        if (!data.success || !data.data?.length) return `❌ *𝐍𝐨𝐭 𝐅𝐨𝐮𝐧𝐝:* +${num}`;
        const seen   = new Set();
        const unique = data.data.filter(d => seen.has(d.number) ? false : (seen.add(d.number), true));
        let txt  = `╔═══════════════════╗\n`;
            txt += `║  📱 *𝐍𝐔𝐌𝐁𝐄𝐑 𝐋𝐎𝐎𝐊𝐔𝐏*  ║\n`;
            txt += `╚═══════════════════╝\n\n`;
            txt += `*🔍 Query:* +${data.query_number}\n`;
            txt += `*🪪 CNIC:* ${data.linked_cnic}\n`;
            txt += `*📊 Total SIMs:* ${data.total_sims_found}\n`;
            txt += `━━━━━━━━━━━━━━━━━━━━\n\n`;
        unique.forEach((d, i) => {
            const addr = (!d.address || d.address === 'NULL' || d.address === 'no') ? 'N/A' : d.address;
            txt += `*🔹 SIM #${i + 1}*\n`;
            txt += `  *📞 Number:* +${d.number}\n`;
            txt += `  *👤 Name:* ${d.name}\n`;
            txt += `  *🪪 CNIC:* ${d.cnic}\n`;
            txt += `  *📍 Address:* ${addr}\n\n`;
        });
        txt += `— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`;
        return txt;
    } catch (e) {
        console.error('Lookup error:', e.message);
        return '❌ *𝐋𝐨𝐨𝐤𝐮𝐩 𝐅𝐚𝐢𝐥𝐞𝐝:* Server se connect nahi ho saka.';
    }
}

// ═══════════════════════════════════════════════
// 🎮 FUN DATA
// ═══════════════════════════════════════════════
const EIGHT_BALL = [
    '✅ *Bilkul haan!*', '✅ *Pakka haan!*', '✅ *Bilkul sahi!*',
    '✅ *100% hoga!*', '🤔 *Shayad...*', '🤔 *Abhi clear nahi.*',
    '🤔 *Baad mein poochho.*', '❌ *Nahi lagta.*', '❌ *Bilkul nahi!*',
    '❌ *Aisa mat socho!*', '🔮 *Kismat theek karo pehle.*', '🎯 *Dil se socho...*'
];
const TRUTHS = [
    'Kabhi kisi se pyaar hua hai? 💕',
    'Life ka sabse bada jhooth kab bola? 🤥',
    'Kisi ki back mein burai ki hai? 😏',
    'Kab roya tha last time aur kyun? 😢',
    'Kisi ka number save hai secretly? 👀',
    'Kya koi secret crush hai abhi? 🫣',
    'Kabhi exam mein cheating ki? 📝',
    'Kab parents se chhupa ke kuch kiya? 🤫'
];
const DARES = [
    'Agle 5 messages mein sirf emojis use karo! 😂',
    'Group mein apni embarrassing photo bhejo! 📸',
    'Kisi bhi group member ko "best friend" bol diya aaj! 🤝',
    'Apna status "Main bewaqoof hoon" likh do 5 min ke liye! 😜',
    'Kisi ek member ko genuine compliment do! 💯',
    'Apna ringtone wala gana gao aur voice note bhejo! 🎵',
    'Agle ek ghante mein sirf formal language use karo! 🎩',
    'Group mein apna ek DM screenshot share karo (edited ok hai)! 📱'
];

// ═══════════════════════════════════════════════
// 🔧 BOT HELPER
// ═══════════════════════════════════════════════
function getBotJid(sock) {
    // sock.user.id can be "923001234567:8@s.whatsapp.net" or "923001234567@s.whatsapp.net"
    const raw = sock.user?.id || '';
    const num = raw.split(':')[0].split('@')[0];
    return num + '@s.whatsapp.net';
}

// ═══════════════════════════════════════════════
// 🚀 BOT START
// ═══════════════════════════════════════════════
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version }          = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth             : state,
        printQRInTerminal: false,
        logger           : pino({ level: 'silent' }),
        browser          : Browsers.ubuntu('Chrome'),
        syncFullHistory  : false
    });

    if (!sock.authState.creds.me?.id) {
        setTimeout(async () => {
            const phone = await question('WhatsApp Number (92xxx): ');
            const code  = await sock.requestPairingCode(phone.trim());
            console.log(`\n📲 PAIRING CODE: ${code}\n`);
        }, 2000);
    }

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'close') setTimeout(startBot, 3000);
        if (connection === 'open')  console.log('🔥 Bot Live! 𝐈𝐭𝐱 𝐑𝐎𝐌𝐄𝐎 scene on hai!');
    });

    // ─────────────────────────────────────
    // 🔒 GROUP META HELPER
    // ─────────────────────────────────────
    async function getGroupInfo(groupJid) {
        try {
            const meta    = await sock.groupMetadata(groupJid);
            const admins  = meta.participants.filter(p => p.admin).map(p => p.id);
            const botJid  = getBotJid(sock);
            const botIsAdmin = admins.some(a => a.split(':')[0].split('@')[0] === botJid.split('@')[0]);
            return { meta, admins, botJid, botIsAdmin };
        } catch (_) {
            return { meta: null, admins: [], botJid: getBotJid(sock), botIsAdmin: false };
        }
    }

    // ─────────────────────────────────────
    // ⚠️ VIOLATION HANDLER
    // ─────────────────────────────────────
    async function handleViolation(groupJid, userJid, msg, type) {
        const userNum  = userJid.split('@')[0];
        const count    = addWarn(groupJid, userJid, type);
        const MAX_WARN = 3;
        const remaining = MAX_WARN - count;
        const { botIsAdmin } = await getGroupInfo(groupJid);

        if (count >= MAX_WARN) {
            resetWarn(groupJid, userJid);
            await sock.sendMessage(groupJid, {
                text: `🚫 *@${userNum} ko group se nikal diya gaya!*\n\n` +
                      `*⚡ Wajah:* ${type === 'link' ? '🔗 Link share karna' : '🤬 Gandi zuban'}\n` +
                      `*📊 Warnings:* 3/3 — Limit cross!\n\n` +
                      `— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                mentions: [userJid]
            }, { quoted: msg });

            if (botIsAdmin) {
                try { await sock.groupParticipantsUpdate(groupJid, [userJid], 'remove'); }
                catch (_) { await sock.sendMessage(groupJid, { text: '❌ *Kick nahi hua — wo admin hai ya protected hai.*' }); }
            }
        } else {
            const emoji  = type === 'link' ? '🔗' : '🤬';
            const reason = type === 'link' ? 'Link share karna mana hai!' : 'Gandi zuban use karna mana hai!';
            await sock.sendMessage(groupJid, {
                text: `┌─── ⚠️ *WARNING* ───┐\n\n` +
                      `👤 *@${userNum}*\n` +
                      `${emoji} *Wajah:* ${reason}\n` +
                      `📊 *Count:* ${count}/${MAX_WARN}\n` +
                      `⏳ *Bacha:* ${remaining} warning${remaining > 1 ? 's' : ''}\n\n` +
                      `_${count === 2 ? '🔴 Agli baar seedha KICK!' : '🟡 Sambhal ke raho!'}_\n\n` +
                      `└─────────────────┘\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                mentions: [userJid]
            }, { quoted: msg });
        }

        if (botIsAdmin) {
            try { await sock.sendMessage(groupJid, { delete: msg.key }); } catch (_) {}
        }
    }

    // ─────────────────────────────────────
    // 👋 WELCOME / LEAVE
    // ─────────────────────────────────────
    sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (settings.lockedJid && id !== settings.lockedJid) return;
        for (const participant of participants) {
            try {
                const num     = (typeof participant === 'string' ? participant : participant.id) || '';
                const userNum = num.split('@')[0];
                if (action === 'add') {
                    await sock.sendMessage(id, {
                        text    : `╔══ 🎉 *WELCOME* 🎉 ══╗\n\n` +
                                  `*👋 Aagaye @${userNum}!*\n\n` +
                                  `📌 Rules zaroor parho\n` +
                                  `😊 Enjoy karo group!\n\n` +
                                  `╚══ 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺 ══╝`,
                        mentions: [num]
                    });
                } else if (action === 'remove' || action === 'leave') {
                    await sock.sendMessage(id, {
                        text    : `╔══ 👋 *ALVIDA* 👋 ══╗\n\n` +
                                  `*@${userNum} chale gaye* 😢\n\n` +
                                  `_Group unhe miss karega... maybe!_ 😂\n\n` +
                                  `╚══ 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺 ══╝`,
                        mentions: [num]
                    });
                }
            } catch (_) {}
        }
    });

    // ─────────────────────────────────────
    // 💬 MESSAGE HANDLER
    // ─────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message || msg.key.remoteJid === 'status@broadcast') return;

            const from     = msg.key.remoteJid;
            const isGroup  = from.endsWith('@g.us');
            const isFromMe = msg.key.fromMe;
            const sender   = isGroup ? (msg.key.participant || '') : from;

            const body = msg.message;
            const text =
                body.conversation                                ||
                body.extendedTextMessage?.text                   ||
                body.imageMessage?.caption                       ||
                body.videoMessage?.caption                       ||
                body.buttonsResponseMessage?.selectedDisplayText ||
                body.listResponseMessage?.title                  || '';

            // ── AUTO-MOD (groups only, non-admin, non-owner)
            if (isGroup && !isFromMe && text) {
                const { admins } = await getGroupInfo(from);
                const senderIsAdmin = admins.some(a => a.split(':')[0].split('@')[0] === sender.split(':')[0].split('@')[0]);

                if (!senderIsAdmin) {
                    if (containsLink(text))  { await handleViolation(from, sender, msg, 'link');  return; }
                    if (containsAbuse(text)) { await handleViolation(from, sender, msg, 'abuse'); return; }
                }
            }

            if (!text.startsWith('.')) return;
            if (!isFromMe && isGroup && settings.lockedJid && from !== settings.lockedJid) return;

            const reply = (t) => sock.sendMessage(from, { text: t }, { quoted: msg });

            // ── ADMIN / SENDER CHECK
            let isBotAdmin = false, isSenderAdmin = false;
            if (isGroup) {
                const { admins, botJid } = await getGroupInfo(from);
                // Check sender admin — normalize JID for comparison
                const senderNum = sender.split(':')[0].split('@')[0];
                isSenderAdmin   = isFromMe || admins.some(a => a.split(':')[0].split('@')[0] === senderNum);
                isBotAdmin      = admins.some(a => a.split(':')[0].split('@')[0] === botJid.split('@')[0]);
            }

            const NOT_ADMIN  = `╔═══════════════════╗\n❌ *𝐀𝐃𝐌𝐈𝐍 𝐎𝐍𝐋𝐘!*\n╚═══════════════════╝\n\n🚫 *You are not admin!*\nYe command sirf admins ke liye hai bhai.\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`;
            const BOT_NO_ADM = `╔═══════════════════╗\n⚠️ *𝐁𝐎𝐓 𝐀𝐃𝐌𝐈𝐍 𝐂𝐇𝐀𝐇𝐈𝐘𝐄!*\n╚═══════════════════╝\n\n🔧 Bot ko admin banao pehle taake ye command kaam kare!\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`;

            const args    = text.slice(1).trim().split(/ +/);
            const command = args.shift().toLowerCase();
            const quoted  = body.extendedTextMessage?.contextInfo?.participant;

            // ═══════════════════════════════════
            // COMMANDS
            // ═══════════════════════════════════
            switch (command) {

                // ── OWNER ONLY
                case 'setjid':
                    if (!isFromMe) return;
                    settings.lockedJid = from; saveSettings();
                    reply('🔒 *𝐆𝐫𝐨𝐮𝐩 𝐋𝐨𝐜𝐤𝐞𝐝!* — Bot sirf is group mein active hai.');
                    break;

                case 'resetjid':
                    if (!isFromMe) return;
                    settings.lockedJid = null; saveSettings();
                    reply('🔓 *𝐔𝐧𝐥𝐨𝐜𝐤𝐞𝐝!* — Bot ab sab jagah active hai.');
                    break;

                // ── ADMIN: TAGALL
                case 'tagall': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    const { meta } = await getGroupInfo(from);
                    const users    = meta.participants.map(u => u.id);
                    let   txt      = `╔══ 📣 *TAG ALL* 📣 ══╗\n\n`;
                    if (args.length) txt += `*📢 Notice:* ${args.join(' ')}\n\n`;
                    users.forEach(u => txt += `👤 @${u.split('@')[0]}\n`);
                    txt += `\n╚══ 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺 ══╝`;
                    await sock.sendMessage(from, { text: txt, mentions: users });
                    break;
                }

                // ── ADMIN: KICK
                case 'kick': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);

                    let target = quoted;
                    if (!target && args[0]) target = normalizeNumber(args[0]) + '@s.whatsapp.net';
                    if (!target) return reply(
                        `*📖 Usage:* \`.kick 923001234567\`\n_Ya kisi ka reply karke .kick likho_`
                    );
                    try {
                        await sock.groupParticipantsUpdate(from, [target], 'remove');
                        await sock.sendMessage(from, {
                            text    : `👢 *@${target.split('@')[0]} ko kick kar diya!* Bye bye! 😂\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                            mentions: [target]
                        });
                    } catch (_) { reply('❌ *Kick nahi hua* — wo admin hai ya protected!'); }
                    break;
                }

                // ── ADMIN: KICKALL
                case 'kickall': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);
                    const { meta, admins, botJid } = await getGroupInfo(from);
                    const botNum = botJid.split('@')[0];
                    const toKick = meta.participants
                        .filter(p => {
                            const n = p.id.split(':')[0].split('@')[0];
                            const isAdmin = admins.some(a => a.split(':')[0].split('@')[0] === n);
                            return !isAdmin && n !== botNum;
                        })
                        .map(p => p.id);

                    if (!toKick.length) return reply('🤷 *Koi nahi hai kick karne ke liye!*');
                    await reply(`⚡ *${toKick.length} logon ko kick kar raha hun...*`);
                    let kicked = 0;
                    for (const uid of toKick) {
                        try {
                            await sock.groupParticipantsUpdate(from, [uid], 'remove');
                            kicked++;
                            await new Promise(r => setTimeout(r, 700));
                        } catch (_) {}
                    }
                    reply(`✅ *${kicked}/${toKick.length} log kick ho gaye!* Group saaf!\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── ADMIN: ADD
                case 'add': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);
                    if (!args[0]) return reply(`*📖 Usage:* \`.add 923001234567\``);
                    const numToAdd = normalizeNumber(args[0]) + '@s.whatsapp.net';
                    try {
                        await sock.groupParticipantsUpdate(from, [numToAdd], 'add');
                        await sock.sendMessage(from, {
                            text    : `✅ *@${numToAdd.split('@')[0]} ko group mein add kar diya!* 🎉\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                            mentions: [numToAdd]
                        });
                    } catch (e) {
                        reply(`❌ *Add nahi hua!*\n_Wajah: ${e.message || 'Number invalid ya privacy issue'}_`);
                    }
                    break;
                }

                // ── ADMIN: PROMOTE
                case 'promote': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);
                    const target = quoted || (args[0] ? normalizeNumber(args[0]) + '@s.whatsapp.net' : null);
                    if (!target) return reply(`*📖 Usage:* \`.promote 923001234567\` ya reply karo`);
                    try {
                        await sock.groupParticipantsUpdate(from, [target], 'promote');
                        await sock.sendMessage(from, {
                            text    : `⭐ *@${target.split('@')[0]} ab Admin ban gaya!* Mubarak! 🎉\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                            mentions: [target]
                        });
                    } catch (_) { reply('❌ *Promote nahi hua!*'); }
                    break;
                }

                // ── ADMIN: DEMOTE
                case 'demote': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);
                    const target = quoted || (args[0] ? normalizeNumber(args[0]) + '@s.whatsapp.net' : null);
                    if (!target) return reply(`*📖 Usage:* \`.demote 923001234567\` ya reply karo`);
                    try {
                        await sock.groupParticipantsUpdate(from, [target], 'demote');
                        await sock.sendMessage(from, {
                            text    : `📉 *@${target.split('@')[0]} ka admin status le liya gaya.* 😬\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                            mentions: [target]
                        });
                    } catch (_) { reply('❌ *Demote nahi hua!*'); }
                    break;
                }

                // ── ADMIN: MUTE / UNMUTE
                case 'mute': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);
                    try {
                        await sock.groupSettingUpdate(from, 'announcement');
                        reply('🔇 *Group Mute kar diya!* Sirf admins likh sakte hain.\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺');
                    } catch (_) { reply('❌ *Mute nahi hua!*'); }
                    break;
                }

                case 'unmute': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isBotAdmin)    return reply(BOT_NO_ADM);
                    try {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        reply('🔊 *Group Unmute ho gaya!* Sab likh sakte hain.\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺');
                    } catch (_) { reply('❌ *Unmute nahi hua!*'); }
                    break;
                }

                // ── ADMIN: WARNINGS
                case 'warnings': {
                    if (!isGroup) return reply('❌ *Sirf group mein kaam karta hai.*');
                    const targetJid = quoted || (args[0] ? normalizeNumber(args[0]) + '@s.whatsapp.net' : sender);
                    const targetNum = targetJid.split('@')[0];
                    const lw = getWarn(from, targetJid, 'link');
                    const aw = getWarn(from, targetJid, 'abuse');
                    reply(
                        `╔═══ ⚠️ *WARNINGS* ⚠️ ═══╗\n\n` +
                        `*👤 User:* @${targetNum}\n\n` +
                        `🔗 *Link warns:* ${lw}/3 ${'🟥'.repeat(lw)}${'⬜'.repeat(3-lw)}\n` +
                        `🤬 *Abuse warns:* ${aw}/3 ${'🟥'.repeat(aw)}${'⬜'.repeat(3-aw)}\n\n` +
                        `╚═══════════════════╝\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
                    );
                    break;
                }

                // ── ADMIN: CLEARWARN
                case 'clearwarn': {
                    if (!isSenderAdmin) return reply(NOT_ADMIN);
                    if (!isGroup) return reply('❌ *Sirf group mein kaam karta hai.*');
                    const targetJid = quoted || (args[0] ? normalizeNumber(args[0]) + '@s.whatsapp.net' : null);
                    if (!targetJid) return reply(`*📖 Usage:* \`.clearwarn 923001234567\` ya reply karo`);
                    resetWarn(from, targetJid);
                    await sock.sendMessage(from, {
                        text    : `✅ *@${targetJid.split('@')[0]} ki saari warnings clear!* Fresh start! 🌟\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                        mentions: [targetJid]
                    });
                    break;
                }

                // ── USER: ADMIN LIST
                case 'adminlist': {
                    if (!isGroup) return reply('❌ *Sirf group mein kaam karta hai.*');
                    const { meta, admins } = await getGroupInfo(from);
                    let txt = `╔══ 👑 *ADMIN LIST* 👑 ══╗\n\n`;
                    admins.forEach((a, i) => txt += `*${i+1}.* 👑 @${a.split('@')[0]}\n`);
                    txt += `\n*Total: ${admins.length} admins*\n╚═══════════════════╝`;
                    await sock.sendMessage(from, { text: txt, mentions: admins });
                    break;
                }

                // ── USER: MEMBERS
                case 'members': {
                    if (!isGroup) return reply('❌ *Sirf group mein kaam karta hai.*');
                    const { meta } = await getGroupInfo(from);
                    reply(
                        `╔══ 👥 *GROUP INFO* ══╗\n\n` +
                        `*📛 Name:* ${meta.subject}\n` +
                        `*👥 Members:* ${meta.participants.length}\n` +
                        `*👑 Admins:* ${meta.participants.filter(p => p.admin).length}\n` +
                        `*📅 Created:* ${new Date(meta.creation * 1000).toLocaleDateString('en-PK')}\n\n` +
                        `╚═══════════════════╝\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
                    );
                    break;
                }

                // ── NUMBER LOOKUP
                case 'n': {
                    if (!args.length) return reply(`❌ *Usage:* \`.n 03338872681\``);
                    await reply('🔍 *Searching...*');
                    reply(await lookupNumber(args[0]));
                    break;
                }

                // ── AI
                case 'ai': {
                    if (!args.length) return reply(`❌ *Sawal toh likh bhai!*\n*Usage:* \`.ai <sawal>\``);
                    await reply('🧠 *𝐒𝐨𝐜𝐡 𝐫𝐚𝐡𝐚 𝐡𝐮...*');
                    const res = await getAI(
                        `Tera owner "𝐈𝐭𝐱 𝐑𝐎𝐌𝐄𝐎" hai. Sawal: "${args.join(' ')}". Roman Urdu me short aur bold format me jawab de.`
                    );
                    reply(`${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                case 'roast': {
                    await reply('🔥 *Roasting in progress...*');
                    const target = quoted ? `@${quoted.split('@')[0]}` : 'is banda ya bandi';
                    const res    = await getAI(
                        `Ek khatarnak Roman Urdu roast likho ${target} ke liye. Sirf 2-3 lines. Street style. Emojis zaroor lagao.`, 0.9
                    );
                    await sock.sendMessage(from, { text: `${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`, mentions: quoted ? [quoted] : [] }, { quoted: msg });
                    break;
                }

                case 'joke': {
                    await reply('😂 *Joke loading...*');
                    reply(await getAI(`Ek funny Roman Urdu joke sunao. Sirf 2-3 lines. Emojis lazmi.`, 0.9) + '\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺');
                    break;
                }

                case 'quote': {
                    await reply('💭 *Soch raha hun...*');
                    reply(await getAI(`Ek powerful motivational quote Roman Urdu mein de. Bold format. Max 3 lines.`, 0.8) + '\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺');
                    break;
                }

                case 'shayari': {
                    await reply('🌹 *Shayari likh raha hun...*');
                    reply(await getAI(`Ek romantic ya dard bhari Urdu shayari likho. 4 lines. Beautiful.`, 0.9) + '\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺');
                    break;
                }

                // ── FUN: 8BALL
                case '8ball': {
                    if (!args.length) return reply(`*🎱 Usage:* \`.8ball kya mai pass hounga?\``);
                    const ans = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
                    reply(`*🎱 Magic 8-Ball*\n\n*❓ Sawal:* ${args.join(' ')}\n\n*🔮 Jawab:* ${ans}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── FUN: TOSS
                case 'toss': {
                    const res = Math.random() > 0.5 ? '🪙 *HEADS!*' : '🪙 *TAILS!*';
                    reply(`*🪙 Coin Toss*\n\n${res}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── FUN: DICE
                case 'dice': {
                    const num = Math.floor(Math.random() * 6) + 1;
                    const faces = ['', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
                    reply(`*🎲 Dice Roll*\n\n${faces[num]} *${num} aaya!*\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── FUN: SHIP
                case 'ship': {
                    const target1 = quoted ? `@${quoted.split('@')[0]}` : (args[0] || 'Tum');
                    const target2 = args[args.length - 1] !== args[0] ? args[args.length - 1] : 'Romeo';
                    const pct     = Math.floor(Math.random() * 101);
                    const hearts  = pct >= 70 ? '❤️❤️❤️' : pct >= 40 ? '💛💛' : '💔';
                    reply(
                        `*💘 SHIP METER*\n\n` +
                        `${target1} + ${target2}\n\n` +
                        `*${pct}%* ${hearts}\n` +
                        `${'█'.repeat(Math.floor(pct/10))}${'░'.repeat(10 - Math.floor(pct/10))}\n\n` +
                        `${pct >= 70 ? '🔥 Perfect match!' : pct >= 40 ? '😊 Theek hai!' : '💀 Bhai maafi maango!'}\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
                    );
                    break;
                }

                // ── FUN: TRUTH
                case 'truth': {
                    const t = TRUTHS[Math.floor(Math.random() * TRUTHS.length)];
                    reply(`*🫣 TRUTH*\n\n${t}\n\n_Sach bolna hoga!_ 😏\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── FUN: DARE
                case 'dare': {
                    const d = DARES[Math.floor(Math.random() * DARES.length)];
                    reply(`*😈 DARE*\n\n${d}\n\n_Karna toh hoga!_ 🔥\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── FUN: RATE
                case 'rate': {
                    const subject = args.join(' ') || (quoted ? `@${quoted.split('@')[0]}` : 'Tum khud');
                    const score   = Math.floor(Math.random() * 11);
                    const bars    = '⭐'.repeat(score) + '☆'.repeat(10 - score);
                    reply(`*⭐ RATE METER*\n\n*${subject}*\n\n${bars}\n*${score}/10*\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`);
                    break;
                }

                // ── FUN: SLAP
                case 'slap': {
                    if (!quoted) return reply(`_Kisi ka reply karo pehle_ 😂`);
                    const victim = `@${quoted.split('@')[0]}`;
                    const senderNum = `@${sender.split('@')[0]}`;
                    await sock.sendMessage(from, {
                        text    : `👋 *${senderNum} ne ${victim} ko THAPPAR maar diya!* 😂💥\n\n_Auuu!_ 🤕\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                        mentions: [quoted, sender]
                    }, { quoted: msg });
                    break;
                }

                // ── FUN: HUG
                case 'hug': {
                    if (!quoted) return reply(`_Kisi ka reply karo pehle_ 🤗`);
                    const target = `@${quoted.split('@')[0]}`;
                    const sndr   = `@${sender.split('@')[0]}`;
                    await sock.sendMessage(from, {
                        text    : `🤗 *${sndr} ne ${target} ko hug diya!* Kitna pyaara! 💕\n\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`,
                        mentions: [quoted, sender]
                    }, { quoted: msg });
                    break;
                }

                // ── UTILS: PING
                case 'ping': {
                    const latency = Math.abs(Date.now() - msg.messageTimestamp * 1000);
                    const up = process.uptime();
                    const h  = Math.floor(up / 3600);
                    const mn = Math.floor((up % 3600) / 60);
                    const s  = Math.floor(up % 60);
                    const speed = latency < 100 ? '🟢 Fast' : latency < 500 ? '🟡 Medium' : '🔴 Slow';
                    reply(
                        `╔══ 🏓 *PING* 🏓 ══╗\n\n` +
                        `*⚡ Latency:* ${latency}ms ${speed}\n` +
                        `*⏱️ Uptime:* ${h}h ${mn}m ${s}s\n` +
                        `*🚀 Status:* Online ✅\n\n` +
                        `╚═════════════════╝\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
                    );
                    break;
                }

                // ── UTILS: INFO
                case 'info':
                    reply(
                        `╔══ 🤖 *BOT INFO* 🤖 ══╗\n\n` +
                        `*👨‍💻 Creator:* 𝐈𝐭𝐱 𝐑𝐎𝐌𝐄𝐎\n` +
                        `*🚀 Version:* 3.0.0 (Uchiha Pro)\n` +
                        `*🧠 AI:* Grok (${GROK_MODEL})\n` +
                        `*🔍 Lookup:* SIM Data API\n` +
                        `*🛡️ AutoMod:* Links + Abuse\n` +
                        `*⚡ System:* Running Smooth\n\n` +
                        `╚═════════════════════╝\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
                    );
                    break;

                // ── MENU
                case 'menu':
                case 'help':
                    reply(
                        `╔═══════════════════════╗\n` +
                        `║  🤖 *𝐈𝐓𝐗 𝐑𝐎𝐌𝐄𝐎 𝐌𝐄𝐍𝐔*  ║\n` +
                        `╚═══════════════════════╝\n\n` +

                        `*🧠 AI COMMANDS*\n` +
                        `┣ *.ai* [sawal] — AI se poochho\n` +
                        `┣ *.roast* — Kisi ko roast karo\n` +
                        `┣ *.joke* — Funny joke\n` +
                        `┣ *.quote* — Motivational quote\n` +
                        `┗ *.shayari* — Dil se shayari\n\n` +

                        `*🎮 FUN COMMANDS*\n` +
                        `┣ *.8ball* [sawal] — Magic 8 ball\n` +
                        `┣ *.toss* — Heads ya tails\n` +
                        `┣ *.dice* — Dice roll (1-6)\n` +
                        `┣ *.ship* — Love meter\n` +
                        `┣ *.truth* — Sach bolna hoga\n` +
                        `┣ *.dare* — Dare karo\n` +
                        `┣ *.rate* [cheez] — Rate karo\n` +
                        `┣ *.slap* — Thappar maar do\n` +
                        `┗ *.hug* — Pyaar se hug karo\n\n` +

                        `*🔍 LOOKUP*\n` +
                        `┗ *.n* [number] — SIM info\n\n` +

                        `*📊 GROUP INFO*\n` +
                        `┣ *.adminlist* — Admins ki list\n` +
                        `┗ *.members* — Group info\n\n` +

                        `*🛡️ WARNINGS (Auto-Mod)*\n` +
                        `┣ *.warnings* [reply/@user]\n` +
                        `┗ *.clearwarn* [reply/@user] 👑\n\n` +

                        `*👑 ADMIN ONLY*\n` +
                        `┣ *.tagall* [message]\n` +
                        `┣ *.kick* [number/reply]\n` +
                        `┣ *.kickall* — Sabko kick karo\n` +
                        `┣ *.add* [number] — Add karo\n` +
                        `┣ *.promote* [reply/@user]\n` +
                        `┣ *.demote* [reply/@user]\n` +
                        `┣ *.mute* — Group band karo\n` +
                        `┗ *.unmute* — Group kholo\n\n` +

                        `*⚡ UTILS*\n` +
                        `┣ *.ping* — Bot speed check\n` +
                        `┗ *.info* — Bot info\n\n` +

                        `╚═══════════════════════╝\n` +
                        `_👑 Admin commands sirf admins ke liye_\n— 𝕴𝖙𝖝 𝕽𝕺𝕸𝕰𝕺`
                    );
                    break;
            }

        } catch (e) { console.error('MSG Error:', e.message); }
    });
}

// ═══════════════════════════════════════════════
// 🚀 BOOT
// ═══════════════════════════════════════════════
if (!fs.existsSync('./public')) fs.mkdirSync('./public', { recursive: true });
startBot();
