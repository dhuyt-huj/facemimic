/**
 * FaceMimic Backend
 * ================
 * Receives user-uploaded clip + face photo → uploads to APIMODELS R2 → creates Seedance 2.5 edit task → polls → returns result URL
 * Hides API key from frontend. CORS-enabled for H5.
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---- CONFIG ----
const API_KEY = process.env.APIMODELS_KEY || 'sk_8e7b43dcbc4e44316924dc4b53932a9110588d4929deea43771054001e4c8a6c';
const API_BASE = 'https://api.apimodels.app/api/v1';
const PORT = process.env.PORT || 8766;

// Seedance 2.5 prompt: swap ENTIRE person, keep clip's actions/expressions
const SWAP_PROMPT = `The person from the reference image should appear in video1. Fully replace the entire person in video1 with the person from the reference image - including face, head, hair, body, clothes and all appearance features. The person from the reference image should perform all the exact same actions, facial expressions, tongue movements, eye movements, head poses and body motions as the original person in video1. Keep the background, lighting, camera motion and composition from video1 completely unchanged.`;

// ---- TEMPLATES (预置经典桥段，URL 需提前上传到 APIMODELS R2) ----
// 用 APIMODELS /api/v1/files 上传后拿到的 publicUrl，填这里
const TEMPLATES = {
  'girl-tongue': {
    id: 'girl-tongue',
    name: 'Girl 吐舌',
    desc: '俏皮吐舌表情杀',
    duration: 4,
    cover: '',
    videoUrl: 'https://r2.apimodels.app/uploads/cmwrnulf2000308k1ggif0hgs/1795364825364_uychuoo.mp4'
  }
  // 以后加更多模板，上传视频到 R2 后填 URL 进来：
  // 'kuangqiang': { id:'kuangqiang', name:'狂飙名场面', duration:8, cover:'...', videoUrl:'...' }
};

// ---- REDEEM CODES (一次性兑换码) ----
// CloudBase/Docker containers: __dirname (/app) may be read-only.
// Prefer writable dirs: /tmp (CloudBase), /data (Render), or __dirname (local dev).
const DATA_DIR = process.env.RENDER_PERSISTENT_DISK_PATH
  || process.env.CLOUDBASE_RUNTIME_DIR
  || (fs.existsSync('/tmp') ? '/tmp' : __dirname);
fs.mkdirSync(DATA_DIR, { recursive: true });
const CODES_FILE = path.join(DATA_DIR, 'codes.json');

function loadCodes() {
  try { return JSON.parse(fs.readFileSync(CODES_FILE, 'utf-8')); }
  catch { return {}; }
}
function saveCodes(codes) {
  fs.writeFileSync(CODES_FILE, JSON.stringify(codes, null, 2));
}
function genCode() {
  // FK-XXXX-XXXX（每段 4 位大写字母数字，易读）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混 0/O/1/I
  const seg = () => {
    let s = '';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  return `FK-${seg()}-${seg()}`;
}

// 检查码是否有效且未用
function verifyAndMarkUsed(code) {
  const codes = loadCodes();
  const c = codes[code];
  if (!c) return { ok: false, error: '兑换码不存在' };
  if (c.used) return { ok: false, error: '兑换码已被使用过' };
  c.used = true;
  c.usedAt = new Date().toISOString();
  saveCodes(codes);
  return { ok: true };
}

// ---- ADMIN 小工具（本地用，无鉴权——只有你自己能访问 localhost）----
// 生成 N 个新码：POST http://localhost:8766/api/admin/gen-codes?count=10
app.post('/api/admin/gen-codes', (req, res) => {
  const count = Math.max(1, Math.min(50, parseInt(req.query.count) || parseInt(req.body.count) || 1));
  const codes = loadCodes();
  const newCodes = [];
  for (let i = 0; i < count; i++) {
    let c;
    do { c = genCode(); } while (codes[c]);
    codes[c] = { used: false, createdAt: new Date().toISOString() };
    newCodes.push(c);
  }
  saveCodes(codes);
  console.log(`\n🎟️  新生成 ${count} 个兑换码：\n${newCodes.map(c => '   ' + c).join('\n')}\n`);
  res.json({ count, codes: newCodes });
});

// 查看所有码（调试用）
app.get('/api/admin/list-codes', (req, res) => {
  const codes = loadCodes();
  const arr = Object.entries(codes).map(([code, info]) => ({ code, ...info }));
  res.json({ total: arr.length, used: arr.filter(c => c.used).length, codes: arr });
});

// 前端调用：校验兑换码并标记已用（用户点"开始生成"时先调这个）
app.post('/api/verify-code', express.json(), (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ ok: false, error: '请输入兑换码' });
  const result = verifyAndMarkUsed(code.trim().toUpperCase());
  if (result.ok) {
    res.json({ ok: true });
  } else {
    res.status(400).json(result);
  }
});

// 接口：返回模板列表
app.get('/api/templates', (req, res) => {
  res.json(Object.values(TEMPLATES).map(t => ({
    id: t.id, name: t.name, desc: t.desc, duration: t.duration, cover: t.cover, videoUrl: t.videoUrl
  })));
});

// ---- MULTER: receive uploads ----
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB per file
  fileFilter: (req, file, cb) => {
    const ok = ['.mp4', '.mov', '.jpg', '.jpeg', '.png', '.webp'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('不支持的文件类型'), ok);
  }
});

// ---- RETRY WRAPPER ----
async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[${label}] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1500 * attempt)); // backoff: 1.5s, 3s, 4.5s
    }
  }
}

// ---- HTTP HELPERS ----
function postFile(url, filepath, contentType) {
  return new Promise((resolve, reject) => {
    const boundary = '----FaceMimicBoundary' + Date.now();
    const fileData = fs.readFileSync(filepath);
    const fname = path.basename(filepath);

    let body = '';
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fname}"\r\n`;
    body += `Content-Type: ${contentType}\r\n\r\n`;

    const head = Buffer.from(body, 'utf-8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const payload = Buffer.concat([head, fileData, tail]);

    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      },
      timeout: 180000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('上传超时')); });
    req.write(payload);
    req.end();
  });
}

function postJSON(url, obj) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(obj);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 120000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(body);
    req.end();
  });
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: { 'Authorization': `Bearer ${API_KEY}` },
      timeout: 30000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Bad JSON: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.end();
  });
}

// ---- API ROUTES ----

// 0. Upload custom video to R2 (duration ≤ 6s enforced by frontend, backend does basic sanity)
const videoUpload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const ok = ['.mp4', '.mov', '.webm'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('只支持 MP4/MOV/WEBM'), ok);
  }
});

app.post('/api/upload-video', videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '需要上传视频文件' });

    // Backend safety: cap duration at 6s if client bypasses
    const duration = Math.min(6, Math.max(2, parseInt(req.body.duration) || 4));

    console.log(`[${new Date().toISOString()}] Uploading custom video (${req.file.size} bytes, duration=${duration}s)...`);
    const contentType = req.file.mimetype || 'video/mp4';
    const upRes = await withRetry(() => postFile(`${API_BASE}/files`, req.file.path, contentType), 'video-upload');
    console.log('Custom video uploaded to R2.');

    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({ videoUrl: upRes.data.publicUrl, duration });
  } catch (err) {
    console.error('UPLOAD VIDEO ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// 1. Create swap task: templateId + face photo  OR  custom videoUrl + duration + face photo
app.post('/api/swap', upload.single('face'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '需要上传人脸照片' });

    let videoUrl, duration, sourceLabel;

    if (req.body.templateId && TEMPLATES[req.body.templateId]) {
      const tmpl = TEMPLATES[req.body.templateId];
      videoUrl = tmpl.videoUrl;
      duration = tmpl.duration;
      sourceLabel = `template:${tmpl.name}`;
    } else if (req.body.videoUrl && req.body.duration) {
      videoUrl = req.body.videoUrl;
      duration = Math.min(6, Math.max(2, parseInt(req.body.duration)));
      sourceLabel = 'custom-video';
    } else {
      return res.status(400).json({ error: '请选择模板或上传自定义视频' });
    }

    const facePath = req.file.path;
    console.log(`[${new Date().toISOString()}] Source: ${sourceLabel} (${duration}s), uploading face (${req.file.size} bytes)...`);

    const faceRes = await withRetry(() => postFile(`${API_BASE}/files`, facePath, 'image/jpeg'), 'face-upload');
    console.log('Face uploaded.');

    const faceUrl = faceRes.data.publicUrl;
    try { fs.unlinkSync(facePath); } catch {}

    console.log('Creating Seedance 2.0 Mini edit task...');
    const taskRes = await withRetry(() => postJSON(`${API_BASE}/video/generations`, {
      model: 'seedance-2.0-mini',
      prompt: SWAP_PROMPT,
      reference_video_urls: [videoUrl],
      reference_image_urls: [faceUrl],
      task_type: 'edit',
      duration
    }), 'create-task');

    try { fs.unlinkSync(facePath); } catch {}

    const taskId = taskRes.data.taskId;
    const credits = taskRes.data.reservedCredits;
    console.log(`Task created: ${taskId} (reserved $${credits})`);

    res.json({ taskId, credits });
  } catch (err) {
    console.error('ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Poll task status
app.get('/api/swap/:taskId', async (req, res) => {
  try {
    const data = await getJSON(`${API_BASE}/video/generations?task_id=${req.params.taskId}`);
    const task = data.data;

    // Friendly error messages for known failures
    let friendlyMsg = null;
    if (task.state === 'failed') {
      const raw = (task.failMsg || '').toLowerCase();
      if (raw.includes('content') || raw.includes('safety') || raw.includes('nsfw') || raw.includes('policy') || raw.includes('sensitive')) {
        friendlyMsg = '素材被 AI 安全审核拦截了（敏感内容），请换一段普通视频或照片试试';
      } else if (raw.includes('face') && (raw.includes('detect') || raw.includes('no') || raw.includes('not'))) {
        friendlyMsg = '没检测到清晰人脸，请换一张正脸、光线充足的照片';
      } else if (raw.includes('timeout') || raw.includes('timed out')) {
        friendlyMsg = 'AI 处理超时了，换一段更短的视频试试';
      } else {
        friendlyMsg = `AI 生成失败: ${task.failMsg || '未知原因'}`;
      }
    }

    res.json({
      state: task.state,
      videoUrl: task.state === 'completed' ? task.resultUrls[0] : null,
      credits: task.credits,
      failMsg: friendlyMsg
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- SERVE H5 STATIC FILES ----
app.use(express.static(__dirname, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// ---- START ----
app.listen(PORT, () => {
  console.log(`\n🚀 FaceMimic Backend running on http://localhost:${PORT}`);
  console.log(`   H5:  http://localhost:${PORT}/index.html`);
  console.log(`   API: POST /api/swap (clip + face → taskId)`);
  console.log(`         GET  /api/swap/:taskId (poll status)\n`);
});
