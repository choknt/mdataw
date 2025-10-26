require('dotenv').config();
const express = require('express');
const serverless = require('serverless-http');
const { connect, Key, AccessLog, Entry } = require('./db');
const { embedMessageInPngBuffer, extractMessageFromPngBuffer } = require('./utils/watermark');
const { sendMessage, sendFile } = require('./utils/discord');
const multer = require('multer');
const upload = multer({ limits: { fileSize: 6 * 1024 * 1024 } });
const crypto = require('crypto');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const app = express();
app.use(helmet({ contentSecurityPolicy:false }));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(mongoSanitize());
app.use(hpp());
const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 400 });
app.use(apiLimiter);
connect().catch(console.error);
function genKey(len=5){ const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let s=''; for(let i=0;i<len;i++) s+=chars[Math.floor(Math.random()*chars.length)]; return s; }
function getClientIp(req){ const xf = req.headers['x-forwarded-for']; if (xf) return xf.split(',')[0].trim(); return req.socket.remoteAddress || ''; }
app.post('/access', async (req, res) => {
  try {
    const accessKey = req.headers['x-access-key'] || req.body.key;
    if (!accessKey) return res.status(401).json({ error: 'NO_KEY' });
    const keyDoc = await Key.findOne({ key: accessKey });
    if (!keyDoc) return res.status(403).json({ error: 'INVALID_KEY' });
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const fp = req.body.fingerprint || req.headers['x-fingerprint'] || 'none';
    await AccessLog.create({ keyId: keyDoc._id, userId: keyDoc.userId||keyDoc.name, ip, ua, fp, ts: new Date(), note: 'ACCESS' });
    sendMessage(`➡️ Access by **${keyDoc.userId||keyDoc.name}**\nIP: ${ip}\nUA: ${ua}\nFP: ${fp}`);
    res.json({ ok:true, userId: keyDoc.userId||keyDoc.name, email: keyDoc.email||'', ipSeen: ip, fingerprint: fp, isAdmin: keyDoc.isAdmin, adminCode: keyDoc.adminCode||'' });
  } catch(e) { console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.post('/save', upload.single('screenshot'), async (req, res) => {
  try {
    const accessKey = req.headers['x-access-key'] || req.body.key;
    if (!accessKey) return res.status(401).json({ error: 'NO_KEY' });
    const keyDoc = await Key.findOne({ key: accessKey });
    if (!keyDoc) return res.status(403).json({ error: 'INVALID_KEY' });
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';
    const fp = req.body.fingerprint || req.headers['x-fingerprint'] || 'none';
    await AccessLog.create({ keyId: keyDoc._id, userId: keyDoc.userId||keyDoc.name, ip, ua, fp, ts: new Date(), note: 'SAVE_CLICK' });
    if (!req.file || !req.file.buffer) return res.status(400).json({ error: 'NO_FILE' });
    const buf = req.file.buffer;
    const forensicMsg = `user:${keyDoc.userId||keyDoc.name}|ts:${new Date().toISOString()}|ip:${ip}`;
    let stamped = buf;
    try { stamped = await embedMessageInPngBuffer(buf, forensicMsg); } catch(e) { console.error('embed failed', e); }
    try { await sendFile(stamped, `capture_${Date.now()}.png`, `Capture by ${keyDoc.userId||keyDoc.name}`); } catch(e){ console.error('discord send fail', e); }
    res.json({ ok:true });
  } catch(e){ console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.post('/admin/create-key', async (req,res) => {
  try {
    const secret = req.body.admin_secret || req.headers['x-admin-secret'];
    if (secret !== (process.env.ADMIN_SECRET||'admin_secret')) return res.status(403).json({ error:'NO_ADMIN' });
    const name = req.body.name || req.body.userId || 'unknown';
    const userId = req.body.userId || '';
    const email = req.body.email || '';
    const isAdmin = !!req.body.isAdmin;
    const key = genKey(5);
    const adminCode = isAdmin ? Math.random().toString(36).slice(2,10).toUpperCase() : '';
    const doc = await Key.create({ key, name, userId, email, isAdmin, adminCode });
    await AccessLog.create({ keyId: doc._id, userId: doc.userId||doc.name, ip: getClientIp(req), ua: req.headers['user-agent']||'', fp:'admin-create', ts:new Date(), note:'ADMIN_CREATE' });
    sendMessage(`🛠️ Admin created key: ${doc.name} / ${doc.key}`);
    res.json({ ok:true, key: doc.key, adminCode: doc.adminCode||'' });
  } catch(e){ console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.get('/admin/list', async (req,res)=>{
  try {
    const secret = req.headers['x-admin-secret'] || req.query.admin_secret;
    if (secret !== (process.env.ADMIN_SECRET||'admin_secret')) return res.status(403).json({ error:'NO_ADMIN' });
    const list = await Key.find().lean();
    res.json({ ok:true, list });
  } catch(e){ console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.post('/entry/create', async (req,res)=>{
  try {
    const accessKey = req.headers['x-access-key'] || req.body.key;
    if (!accessKey) return res.status(401).json({ error: 'NO_KEY' });
    const keyDoc = await Key.findOne({ key: accessKey });
    if (!keyDoc) return res.status(403).json({ error: 'INVALID_KEY' });
    const title = (req.body.title||'').slice(0,200);
    const content = (req.body.content||'').slice(0,5000);
    const month = Number(req.body.month) || 0;
    const year = Number(req.body.year) || 0;
    const e = await Entry.create({ keyId: keyDoc._id, userId: keyDoc.userId||keyDoc.name, title, content, month, year });
    await AccessLog.create({ keyId: keyDoc._id, userId: keyDoc.userId||keyDoc.name, ip: getClientIp(req), ua: req.headers['user-agent']||'', fp: req.body.fingerprint||'none', ts:new Date(), note:'ENTRY_CREATE' });
    res.json({ ok:true, entryId: e._id });
  } catch(e){ console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.get('/entries', async (req,res)=>{
  try {
    const accessKey = req.headers['x-access-key'] || req.query.key;
    if (!accessKey) return res.status(401).json({ error: 'NO_KEY' });
    const keyDoc = await Key.findOne({ key: accessKey });
    if (!keyDoc) return res.status(403).json({ error: 'INVALID_KEY' });
    const month = Number(req.query.month) || 0;
    const year = Number(req.query.year) || 0;
    const list = await Entry.find({ month, year }).lean();
    res.json({ ok:true, list });
  } catch(e){ console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.post('/verify/extract', upload.single('image'), async (req,res)=>{
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ error:'NO_FILE' });
    const msg = await extractMessageFromPngBuffer(req.file.buffer);
    res.json({ ok: !!msg, msg });
  } catch(e){ console.error(e); res.status(500).json({ error:'ERR' }); }
});
app.get('/healthz', (req,res)=>res.json({ ok:true }));
module.exports = app;
module.exports.handler = serverless(app);
