/**
 * FaceSwap H5 Frontend
 * 选模板 + 上传人脸照片 → POST /api/swap → poll → show result
 */

const $ = (id) => document.getElementById(id);

// ---- STATE ----
const state = {
  templateId: null,      // 内置模板 id，或 'custom' 表示自定义视频
  customVideoUrl: null,  // 自定义视频上传后的 R2 URL
  customDuration: null,  // 自定义视频时长
  faceFile: null,
  faceUrl: null,
  taskId: null,
  templates: [],
  codeVerified: false
};

// ---- TOAST ----
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.hidden = true, 2500);
}

// ---- LOAD TEMPLATES ----
async function loadTemplates() {
  try {
    const res = await fetch('/api/templates');
    state.templates = await res.json();
    renderTemplates();
  } catch (err) {
    console.error('加载模板失败', err);
    toast('模板加载失败，刷新试试');
  }
}

function renderTemplates() {
  const grid = $('templatesGrid');
  const isCustomSelected = state.templateId === 'custom';

  // 内置模板卡片 + 自定义卡片
  const cards = state.templates.map(t => `
    <div class="template-card ${state.templateId === t.id ? 'is-selected' : ''}" data-id="${t.id}">
      <div class="template-card__cover">
        <video class="template-card__video" preload="metadata" muted loop playsinline
               src="${t.videoUrl}"></video>
        <div class="template-card__duration">${t.duration}秒</div>
        <div class="template-card__check" hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="template-card__play-hint">点击预览</div>
      </div>
      <div class="template-card__info">
        <h3>${t.name}</h3>
        <p>${t.desc}</p>
      </div>
    </div>
  `).join('');

  // 自定义视频卡片
  let customCard;
  if (isCustomSelected && state.customVideoUrl) {
    customCard = `
      <div class="template-card is-selected template-card--custom" data-id="custom">
        <div class="template-card__cover">
          <video class="template-card__video" preload="metadata" muted loop playsinline
                 src="${state.customVideoUrl}"></video>
          <div class="template-card__duration">${state.customDuration}秒</div>
          <div class="template-card__check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <div class="template-card__custom-tag">自定义</div>
        </div>
        <div class="template-card__info">
          <h3>我的视频</h3>
          <p>已上传，点击可重选</p>
        </div>
      </div>
    `;
  } else {
    customCard = `
      <div class="template-card template-card--add" data-id="__add__">
        <div class="template-card__cover template-card__cover--empty">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </div>
        <div class="template-card__info">
          <h3>自定义视频</h3>
          <p>上传自己的模板 · ≤6秒</p>
        </div>
      </div>
    `;
  }

  grid.innerHTML = cards + customCard;

  // 给内置模板卡片绑定事件
  grid.querySelectorAll('.template-card').forEach(el => {
    const id = el.dataset.id;

    // "自定义" 加号卡片 → 打开上传弹窗
    if (id === '__add__') {
      el.addEventListener('click', () => openCustomModal());
      return;
    }

    // 已选的自定义卡片 → 重新打开上传弹窗可重选
    if (id === 'custom') {
      const video = el.querySelector('.template-card__video');
      const playPreview = () => video.play().catch(()=>{});
      const pausePreview = () => video.pause();
      el.addEventListener('mouseenter', playPreview);
      el.addEventListener('mouseleave', pausePreview);
      el.addEventListener('click', () => openCustomModal());
      return;
    }

    // 内置模板卡片：hover 播放 + 点击只弹窗预览
    const video = el.querySelector('.template-card__video');

    const playPreview = () => video.play().catch(() => {});
    const pausePreview = () => video.pause();

    el.addEventListener('mouseenter', playPreview);
    el.addEventListener('mouseleave', pausePreview);
    el.addEventListener('touchstart', playPreview, { passive: true });
    el.addEventListener('touchend', pausePreview);

    el.addEventListener('click', () => {
      pausePreview();
      openPreview(state.templates.find(t => t.id === id));
    });
  });
}

function selectTemplate(id) {
  state.templateId = id;
  if (id !== 'custom') {
    state.customVideoUrl = null;
    state.customDuration = null;
  }
  renderTemplates();
  updateGenerateBtn();
}

loadTemplates();

// ---- PREVIEW MODAL ----
function openPreview(tmpl) {
  if (!tmpl) return;
  $('previewTitle').textContent = tmpl.name;
  $('previewDesc').textContent = `${tmpl.duration}秒 · ${tmpl.desc}`;
  $('previewModal').dataset.templateId = tmpl.id;
  const v = $('previewVideo');
  v.src = tmpl.videoUrl;
  v.muted = false;
  $('previewModal').hidden = false;
  document.body.style.overflow = 'hidden';
  v.play().catch(()=>{});
}

function closePreview() {
  $('previewModal').hidden = true;
  $('previewModal').dataset.templateId = '';
  const v = $('previewVideo');
  v.pause(); v.removeAttribute('src'); v.load();
  document.body.style.overflow = '';
}

$('previewClose').addEventListener('click', closePreview);
$('previewModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('preview-modal__backdrop')) closePreview();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePreview(); });

// 预览弹窗里的「就用这个」→ 确认选中
$('previewConfirm').addEventListener('click', () => {
  const id = $('previewModal').dataset.templateId;
  if (id) {
    selectTemplate(id);
    closePreview();
    toast('已选中：' + (state.templates.find(t => t.id === id)?.name || '模板'));
  }
});

// ---- FACE UPLOAD ----
const faceZone = $('faceUploadZone');
const faceInput = $('faceInput');

faceZone.addEventListener('click', () => faceInput.click());
faceZone.addEventListener('dragover', (e) => { e.preventDefault(); faceZone.classList.add('is-drag'); });
faceZone.addEventListener('dragleave', () => faceZone.classList.remove('is-drag'));
faceZone.addEventListener('drop', (e) => {
  e.preventDefault();
  faceZone.classList.remove('is-drag');
  const f = e.dataTransfer.files.find(f => f.type.startsWith('image/'));
  if (f) handleFace(f);
});
faceInput.addEventListener('change', (e) => e.target.files[0] && handleFace(e.target.files[0]));

function handleFace(file) {
  state.faceFile = file;
  state.faceUrl = URL.createObjectURL(file);
  $('faceImg').src = state.faceUrl;
  $('faceEmpty').hidden = true;
  $('facePreview').hidden = false;
  updateGenerateBtn();
}

$('faceRemove').addEventListener('click', (e) => {
  e.stopPropagation();
  // Clean up blob URL safely
  const img = $('faceImg');
  try { img.removeAttribute('src'); } catch {}
  if (state.faceUrl) {
    setTimeout(() => { try { URL.revokeObjectURL(state.faceUrl); } catch {} }, 100);
  }
  state.faceFile = null;
  state.faceUrl = null;
  $('faceInput').value = '';
  $('faceEmpty').hidden = false;
  $('facePreview').hidden = true;
  updateGenerateBtn();
});

// ---- GENERATE BUTTON ----
function updateGenerateBtn() {
  $('generateBtn').disabled = !(state.templateId && state.faceFile);
}

const PROGRESS_STEPS = [
  'AI 正在读取模板…',
  '提取人物特征中…',
  '融合脸部 identity…',
  '重建身体动作…',
  '渲染输出视频…'
];

$('generateBtn').addEventListener('click', async () => {
  if (!state.faceFile) return;
  const hasSource = state.templateId && (state.templateId !== 'custom' || state.customVideoUrl);
  if (!hasSource) return;

  // 未验证 → 先弹兑换码
  if (!state.codeVerified) {
    openRedeem();
    return;
  }

  // UI: show generating panel
  $('generateBtn').hidden = true;
  $('generatingPanel').hidden = false;
  $('section-result').hidden = true;
  setProgress(5, PROGRESS_STEPS[0]);

  try {
    const fd = new FormData();
    if (state.templateId === 'custom') {
      fd.append('videoUrl', state.customVideoUrl);
      fd.append('duration', state.customDuration);
    } else {
      fd.append('templateId', state.templateId);
    }
    fd.append('face', state.faceFile);

    setProgress(15, '上传人脸照片到云端…');
    const res = await fetch('/api/swap', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '提交失败');

    state.taskId = data.taskId;
    console.log('Task created:', state.taskId, 'reserved credits:', data.credits);

    await pollTask();

  } catch (err) {
    console.error(err);
    toast(err.message || '生成失败，请重试');
    $('generateBtn').hidden = false;
    $('generatingPanel').hidden = true;
  }
});

function setProgress(pct, text) {
  $('progressFill').style.width = pct + '%';
  $('generatingPercent').textContent = Math.round(pct) + '%';
  if (text) $('generatingText').textContent = text;
}

async function pollTask() {
  const pollStart = Date.now();
  setProgress(25, PROGRESS_STEPS[1]);

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const res = await fetch(`/api/swap/${state.taskId}`);
    const data = await res.json();
    const elapsed = (Date.now() - pollStart) / 1000;

    if (data.state === 'completed' && data.videoUrl) {
      const pct = 25 + Math.min(70, i * 2);
      setProgress(pct, PROGRESS_STEPS[4]);
      await new Promise(r => setTimeout(r, 300));
      showResult(data.videoUrl);
      return;
    }
    if (data.state === 'failed') {
      throw new Error(data.failMsg || 'AI 生成失败，请换一段视频或照片试试');
    }

    const pct = Math.min(85, 25 + (elapsed / 300) * 60);
    const stepIdx = Math.min(3, Math.floor(elapsed / 90));
    setProgress(pct, PROGRESS_STEPS[stepIdx]);
  }
  throw new Error('生成超时，请稍后再来查看结果');
}

function showResult(url) {
  setProgress(100, '生成完成！');
  setTimeout(() => {
    $('generatingPanel').hidden = true;
    $('generateBtn').hidden = false;
    $('generateBtn').disabled = true;
    $('section-result').hidden = false;
    $('resultVideo').src = url;
    $('downloadBtn').href = url;
    setTimeout(() => $('resultVideo').play(), 200);
  }, 600);
}

// ---- RETRY ----
$('retryBtn').addEventListener('click', () => {
  $('section-result').hidden = true;
  state.taskId = null;
  state.templateId = null;
  state.customVideoUrl = null;
  state.customDuration = null;
  renderTemplates();
  updateGenerateBtn();
  $('section-templates').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- CUSTOM VIDEO MODAL ----
let customFile = null;
let customDuration = 0;
let customObjectUrl = null;

function openCustomModal() {
  $('customModal').hidden = false;
  document.body.style.overflow = 'hidden';
  // Reset UI
  $('customEmpty').hidden = false;
  $('customPreview').hidden = true;
  $('customUploading').hidden = true;
  customFile = null;
  customDuration = 0;
}

function closeCustomModal() {
  $('customModal').hidden = true;
  document.body.style.overflow = '';
  // Clean preview
  const v = $('customVideo');
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  if (customObjectUrl) { try { URL.revokeObjectURL(customObjectUrl); } catch {} }
  customObjectUrl = null;
  $('customInput').value = '';
}

$('customClose').addEventListener('click', closeCustomModal);
$('customModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('preview-modal__backdrop')) closeCustomModal();
});

const customZone = $('customUpload');
customZone.addEventListener('click', (e) => {
  if (e.target.closest('.custom-upload__preview') || e.target.closest('.custom-upload__uploading')) return;
  $('customInput').click();
});
customZone.addEventListener('dragover', (e) => { e.preventDefault(); customZone.classList.add('is-drag'); });
customZone.addEventListener('dragleave', () => customZone.classList.remove('is-drag'));
customZone.addEventListener('drop', (e) => {
  e.preventDefault();
  customZone.classList.remove('is-drag');
  const f = e.dataTransfer.files.find(f => f.type.startsWith('video/'));
  if (f) handleCustomFile(f);
});
$('customInput').addEventListener('change', (e) => e.target.files[0] && handleCustomFile(e.target.files[0]));

function handleCustomFile(file) {
  customFile = file;
  customObjectUrl = URL.createObjectURL(file);

  const v = $('customVideo');
  v.src = customObjectUrl;
  v.onloadedmetadata = () => {
    customDuration = Math.round(v.duration * 10) / 10;
    $('customDuration').textContent = `${customDuration}秒 · ${(file.size/1024/1024).toFixed(1)}MB`;

    if (customDuration > 6) {
      toast(`视频 ${customDuration}秒 超过 6 秒限制，请剪短后再传`);
      // Keep in preview so user knows what happened but don't enable upload
      $('customUploadBtn').disabled = true;
      $('customUploadBtn').textContent = '视频超过6秒限制';
    } else {
      $('customUploadBtn').disabled = false;
      $('customUploadBtn').textContent = '上传并使用';
    }
  };

  $('customEmpty').hidden = true;
  $('customPreview').hidden = false;
}

$('customRemove').addEventListener('click', (e) => {
  e.stopPropagation();
  const v = $('customVideo');
  try { v.pause(); v.removeAttribute('src'); v.load(); } catch {}
  if (customObjectUrl) { try { URL.revokeObjectURL(customObjectUrl); } catch {} }
  customObjectUrl = null;
  customFile = null;
  customDuration = 0;
  $('customInput').value = '';
  $('customEmpty').hidden = false;
  $('customPreview').hidden = true;
});

$('customUploadBtn').addEventListener('click', async () => {
  if (!customFile || customDuration > 6) return;

  $('customPreview').hidden = true;
  $('customUploading').hidden = false;

  try {
    const fd = new FormData();
    fd.append('video', customFile);
    fd.append('duration', customDuration);

    const res = await fetch('/api/upload-video', { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');

    // Set as selected custom template
    state.templateId = 'custom';
    state.customVideoUrl = data.videoUrl;
    state.customDuration = data.duration;

    closeCustomModal();
    renderTemplates();
    updateGenerateBtn();
    toast('自定义视频上传成功！');
  } catch (err) {
    console.error(err);
    toast(err.message || '上传失败');
    $('customUploading').hidden = true;
    $('customPreview').hidden = false;
  }
});

// ---- REDEEM CODE (生成时才弹) ----
function openRedeem() {
  $('redeemModal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('redeemInput').focus(), 100);
}
function closeRedeem() {
  $('redeemModal').hidden = true;
  document.body.style.overflow = '';
  state.codeVerified = true;
  // 验证通过后自动触发生成
  setTimeout(() => $('generateBtn').click(), 100);
}

$('redeemBtn').addEventListener('click', verifyRedeemCode);
$('redeemClose').addEventListener('click', () => {
  $('redeemModal').hidden = true;
  document.body.style.overflow = '';
});
$('redeemModal').addEventListener('click', (e) => {
  if (e.target.classList.contains('preview-modal__backdrop')) {
    $('redeemModal').hidden = true;
    document.body.style.overflow = '';
  }
});
$('redeemInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') verifyRedeemCode();
});

async function verifyRedeemCode() {
  const input = $('redeemInput');
  const hint = $('redeemHint');
  const loader = $('redeemLoader');
  const btn = $('redeemBtn');

  const code = input.value.trim().toUpperCase();
  if (!code) {
    hint.textContent = '请输入兑换码';
    hint.className = 'redeem-modal__hint is-error';
    hint.hidden = false;
    return;
  }

  hint.hidden = true;
  loader.hidden = false;
  btn.disabled = true;

  try {
    const res = await fetch('/api/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      hint.textContent = '✅ 验证通过';
      hint.className = 'redeem-modal__hint is-ok';
      hint.hidden = false;
      loader.hidden = true;
      btn.disabled = true;
      btn.textContent = '已验证';
      input.disabled = true;
      setTimeout(closeRedeem, 700);
    } else {
      throw new Error(data.error || '验证失败');
    }
  } catch (err) {
    hint.textContent = '❌ ' + err.message;
    hint.className = 'redeem-modal__hint is-error';
    hint.hidden = false;
    loader.hidden = true;
    btn.disabled = false;
    btn.textContent = '验证';
    setTimeout(() => { hint.hidden = true; }, 2500);
  }
}
