// Roblox Auto Permission - Popup Logic v10.8 (Final)

document.addEventListener('DOMContentLoaded', async () => {
  const inputUsernames = document.getElementById('inputUsernames');
  const inputUniverseId = document.getElementById('inputUniverseId');

  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const progressLabel = document.getElementById('progressLabel');
  const progressPercent = document.getElementById('progressPercent');
  const progressBarFill = document.getElementById('progressBarFill');
  const consoleLog = document.getElementById('consoleLog');

  const btnBoth = document.getElementById('btnBoth');
  const btnThumbnail = document.getElementById('btnThumbnail');
  const btnUsername = document.getElementById('btnUsername');
  const btnUniverse = document.getElementById('btnUniverse');
  const btnScan = document.getElementById('btnScan');
  const btnCleanName = document.getElementById('btnCleanName');
  const btnArchiveModerated = document.getElementById('btnArchiveModerated');
  const btnStop = document.getElementById('btnStop');
  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');

  // ── Thumbnail Elements ──────────────────────────────────────────────────
  const inputThumbnailFile   = document.getElementById('inputThumbnailFile');
  const inputThumbnailCamera = document.getElementById('inputThumbnailCamera');
  const thumbDropZone        = document.getElementById('thumbDropZone');
  const btnSelectThumb       = document.getElementById('btnSelectThumb');
  const btnCameraThumb       = document.getElementById('btnCameraThumb');
  const btnPasteThumb        = document.getElementById('btnPasteThumb');
  const btnClearThumb        = document.getElementById('btnClearThumb');
  const btnOpenTab           = document.getElementById('btnOpenTab');
  const thumbDefaultIcon     = document.getElementById('thumbDefaultIcon');
  const thumbImgPreview      = document.getElementById('thumbImgPreview');
  const thumbFileName        = document.getElementById('thumbFileName');
  const thumbDropText        = document.getElementById('thumbDropText');
  const checkIncludeThumbnail = document.getElementById('checkIncludeThumbnail');
  const inputThumbUrl        = document.getElementById('inputThumbUrl');
  const btnLoadThumbUrl      = document.getElementById('btnLoadThumbUrl');

  let currentThumbData = null;
  let currentThumbName = null;

  const jsonModal = document.getElementById('jsonModal');
  const btnViewJson = document.getElementById('btnViewJson');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCopyJson = document.getElementById('btnCopyJson');
  const jsonOutput = document.getElementById('jsonOutput');

  const btnTabCleanJson = document.getElementById('btnTabCleanJson');
  const btnTabModeratedJson = document.getElementById('btnTabModeratedJson');
  const countClean = document.getElementById('countClean');
  const countModerated = document.getElementById('countModerated');

  let activeJsonTab = 'clean'; // 'clean' | 'moderated' | 'fatal' | 'low'

  const MAX_THUMB_BYTES = 4 * 1024 * 1024; // 4 MB hard cap (compress if >2MB)
  const TARGET_BYTES    = 2 * 1024 * 1024; // target after compression

  // ── Preview helper ──────────────────────────────────────────────────────
  function setThumbnailPreview(dataUrl, name) {
    if (dataUrl) {
      thumbImgPreview.src = dataUrl;
      thumbImgPreview.style.display = 'block';
      if (thumbDefaultIcon) thumbDefaultIcon.style.display = 'none';
      if (thumbDropText) thumbDropText.textContent = name || 'Gambar dipilih ✔';
      if (thumbFileName) {
        const kb = Math.round(dataUrl.length * 0.75 / 1024);
        thumbFileName.textContent = `${name || 'Gambar dipilih'} (≈${kb} KB)`;
        thumbFileName.style.color = '#86efac';
      }
      if (btnClearThumb) btnClearThumb.style.display = 'inline-flex';
      if (thumbDropZone) thumbDropZone.classList.add('has-image');
    } else {
      thumbImgPreview.src = '';
      thumbImgPreview.style.display = 'none';
      if (thumbDefaultIcon) thumbDefaultIcon.style.display = 'block';
      if (thumbDropText) thumbDropText.textContent = 'Seret gambar ke sini atau pilih metode di bawah';
      if (thumbFileName) {
        thumbFileName.textContent = 'Belum ada gambar dipilih';
        thumbFileName.style.color = 'var(--text-muted)';
      }
      if (btnClearThumb) btnClearThumb.style.display = 'none';
      if (thumbDropZone) thumbDropZone.classList.remove('has-image');
    }
  }

  // ── Compression helper (canvas resize) ─────────────────────────────────
  // Returns a Promise<string|null> of a dataURL (JPEG, quality reduced until <targetBytes)
  function compressImage(dataUrl, targetBytes, maxDim = 1024) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        // Downscale if any dimension exceeds maxDim
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // Try progressively lower quality
        let quality = 0.88;
        let result = canvas.toDataURL('image/jpeg', quality);
        while (result.length * 0.75 > targetBytes && quality > 0.3) {
          quality -= 0.08;
          result = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(result);
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  // ── Core: process any image File or Blob ─────────────────────────────────
  async function processImageFile(file, nameHint) {
    if (!file) return;
    const allowedTypes = ['image/png','image/jpeg','image/jpg','image/bmp','image/webp','image/gif'];
    if (!allowedTypes.includes(file.type.toLowerCase()) && !file.type.startsWith('image/')) {
      alert('Format file tidak didukung. Gunakan PNG, JPG, WEBP, atau BMP.');
      return;
    }
    if (file.size > MAX_THUMB_BYTES) {
      alert(`Ukuran gambar terlalu besar (${Math.round(file.size/1024/1024*10)/10} MB). Maksimal 4 MB.`);
      return;
    }
    if (thumbFileName) {
      thumbFileName.textContent = 'Memproses gambar...';
      thumbFileName.style.color = '#fbbf24';
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      let dataUrl = event.target.result;
      const name = nameHint || file.name || 'thumbnail';

      // Auto-compress if over 2MB
      if (dataUrl.length * 0.75 > TARGET_BYTES) {
        if (thumbFileName) thumbFileName.textContent = 'Mengompresi gambar...';
        const compressed = await compressImage(dataUrl, TARGET_BYTES);
        if (compressed) dataUrl = compressed;
      }

      currentThumbData = dataUrl;
      currentThumbName = name;
      setThumbnailPreview(dataUrl, name);

      chrome.storage.local.set({ rbx_thumb_data: dataUrl, rbx_thumb_name: name }, () => {
        if (chrome.runtime.lastError) {
          alert('Gagal menyimpan gambar: ' + chrome.runtime.lastError.message);
        }
      });
    };
    reader.onerror = () => alert('Gagal membaca file gambar.');
    reader.readAsDataURL(file);
  }

  // ── Process image from a URL (fetch as blob) ────────────────────────────
  async function loadFromUrl(url) {
    if (!url || !url.startsWith('http')) { alert('URL tidak valid.'); return; }
    if (thumbFileName) {
      thumbFileName.textContent = 'Mengunduh dari URL...';
      thumbFileName.style.color = '#fbbf24';
    }
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Bukan file gambar');
      const name = url.split('/').pop().split('?')[0] || 'thumb_url.jpg';
      await processImageFile(blob, name);
    } catch (e) {
      alert('Gagal memuat gambar dari URL: ' + e.message + '\n\nCoba download manual lalu pilih file.');
      if (thumbFileName) {
        thumbFileName.textContent = 'Gagal memuat dari URL';
        thumbFileName.style.color = '#f87171';
      }
    }
  }

  // ── Drag & Drop ──────────────────────────────────────────────────────────
  if (thumbDropZone) {
    ['dragenter','dragover'].forEach(evt => {
      thumbDropZone.addEventListener(evt, (e) => {
        e.preventDefault(); e.stopPropagation();
        thumbDropZone.classList.add('drag-over');
      });
    });
    ['dragleave','dragend'].forEach(evt => {
      thumbDropZone.addEventListener(evt, (e) => {
        thumbDropZone.classList.remove('drag-over');
      });
    });
    thumbDropZone.addEventListener('drop', async (e) => {
      e.preventDefault(); e.stopPropagation();
      thumbDropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) { await processImageFile(file, file.name); return; }
      // Handle dropped image URL
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && url.startsWith('http')) await loadFromUrl(url);
    });
    // Click on drop zone = open file picker
    thumbDropZone.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      inputThumbnailFile.click();
    });
  }

  // ── File button ──────────────────────────────────────────────────────────
  if (btnSelectThumb) {
    btnSelectThumb.addEventListener('click', (e) => {
      e.stopPropagation();
      inputThumbnailFile.click();
    });
  }
  if (inputThumbnailFile) {
    inputThumbnailFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await processImageFile(file, file.name);
      e.target.value = ''; // allow re-picking same file
    });
  }

  // ── Camera button (mobile) ───────────────────────────────────────────────
  if (btnCameraThumb) {
    btnCameraThumb.addEventListener('click', (e) => {
      e.stopPropagation();
      inputThumbnailCamera.click();
    });
  }
  if (inputThumbnailCamera) {
    inputThumbnailCamera.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) await processImageFile(file, file.name);
      e.target.value = '';
    });
  }

  // ── Paste button (and Ctrl+V global) ────────────────────────────────────
  async function pasteFromClipboard() {
    try {
      // Modern Clipboard API (Chrome 98+)
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            await processImageFile(blob, 'clipboard_paste.png');
            return;
          }
        }
        alert('Clipboard tidak berisi gambar.\nSalin gambar terlebih dahulu (Ctrl+C pada gambar), lalu klik Paste.');
      } else {
        alert('Paste otomatis tidak didukung di browser ini.\nGunakan Ctrl+V saat halaman ini aktif, atau pilih file manual.');
      }
    } catch (e) {
      alert('Gagal membaca clipboard: ' + e.message + '\n\nPastikan izin clipboard diizinkan, atau pilih file manual.');
    }
  }

  if (btnPasteThumb) {
    btnPasteThumb.addEventListener('click', (e) => {
      e.stopPropagation();
      pasteFromClipboard();
    });
  }

  // Global Ctrl+V paste support (when focus not inside a text input)
  document.addEventListener('paste', async (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await processImageFile(file, 'paste.png');
        return;
      }
    }
  });

  // ── Clear button ─────────────────────────────────────────────────────────
  if (btnClearThumb) {
    btnClearThumb.addEventListener('click', (e) => {
      e.stopPropagation();
      currentThumbData = null;
      currentThumbName = null;
      if (inputThumbnailFile) inputThumbnailFile.value = '';
      if (inputThumbnailCamera) inputThumbnailCamera.value = '';
      if (inputThumbUrl) inputThumbUrl.value = '';
      setThumbnailPreview(null, null);
      chrome.storage.local.remove(['rbx_thumb_data', 'rbx_thumb_name']);
    });
  }

  // ── Open in Tab (HP fallback) ────────────────────────────────────────────
  if (btnOpenTab) {
    btnOpenTab.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
    });
  }

  // ── URL load ─────────────────────────────────────────────────────────────
  if (btnLoadThumbUrl) {
    btnLoadThumbUrl.addEventListener('click', () => {
      const url = inputThumbUrl ? inputThumbUrl.value.trim() : '';
      loadFromUrl(url);
    });
  }
  if (inputThumbUrl) {
    inputThumbUrl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        loadFromUrl(inputThumbUrl.value.trim());
      }
    });
  }

  // ── Checkbox ─────────────────────────────────────────────────────────────
  if (checkIncludeThumbnail) {
    checkIncludeThumbnail.addEventListener('change', () => {
      chrome.storage.local.set({ rbx_include_thumb: checkIncludeThumbnail.checked });
    });
  }

  // Load Initial Settings
  chrome.storage.local.get(
    [
      'usernames', 'universeId', 'rbx_auto_active', 'rbx_paused', 'rbx_mode',
      'rbx_index', 'rbx_ids', 'rbx_logs', 'rbx_audio_data', 'rbx_moderated_data',
      'rbx_thumb_data', 'rbx_thumb_name', 'rbx_include_thumb'
    ],
    (data) => {
      if (data.usernames) {
        inputUsernames.value = Array.isArray(data.usernames) ? data.usernames.join('\n') : data.usernames;
      }
      if (data.universeId !== undefined) {
        inputUniverseId.value = Array.isArray(data.universeId) ? data.universeId.join('\n') : data.universeId;
      }
      if (data.rbx_thumb_data) {
        currentThumbData = data.rbx_thumb_data;
        currentThumbName = data.rbx_thumb_name;
        setThumbnailPreview(data.rbx_thumb_data, data.rbx_thumb_name);
      }
      if (data.rbx_include_thumb !== undefined && checkIncludeThumbnail) {
        checkIncludeThumbnail.checked = data.rbx_include_thumb === true;
      }
      updateUIState(data);
    }
  );

  function saveFormSettings() {
    const rawNames = inputUsernames.value;
    const names = rawNames.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
    const rawUniverse = inputUniverseId.value;
    const universeIds = rawUniverse.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);

    chrome.storage.local.set({
      usernames: names,
      universeId: universeIds,
      rbx_include_thumb: checkIncludeThumbnail ? checkIncludeThumbnail.checked : false
    });
  }

  inputUsernames.addEventListener('input', saveFormSettings);
  inputUniverseId.addEventListener('input', saveFormSettings);

  function updateUIState(data) {
    const active = data.rbx_auto_active === true;
    const paused = data.rbx_paused === true;
    const mode = data.rbx_mode || 'standby';
    const ids = data.rbx_ids || [];
    const index = parseInt(data.rbx_index || 0, 10);
    const logs = data.rbx_logs || [];

    if (active && paused) {
      statusBadge.classList.add('active');
      statusBadge.classList.add('paused');
      statusText.textContent = '⏸ DIJEDA';
    } else if (active) {
      statusBadge.classList.add('active');
      statusBadge.classList.remove('paused');
      statusText.textContent = mode === 'scan' ? 'SCANNING ALL PAGES' :
                               mode === 'archive_moderated' ? 'ARCHIVING MODERATED' :
                               mode === 'thumbnail' ? 'UPLOADING THUMBNAILS' :
                               mode === 'clean_name' ? 'CLEANING NAMES' :
                               `RUNNING (${mode.toUpperCase()})`;
    } else {
      statusBadge.classList.remove('active');
      statusBadge.classList.remove('paused');
      statusText.textContent = 'STANDBY';
    }

    // Update Pause button appearance
    if (btnPause) {
      if (paused) {
        btnPause.textContent = '▶ Lanjutkan';
        btnPause.classList.add('btn-resume');
        btnPause.classList.remove('btn-pause');
      } else {
        btnPause.textContent = '⏸ Jeda';
        btnPause.classList.add('btn-pause');
        btnPause.classList.remove('btn-resume');
      }
    }

    const total = ids.length;
    if (total > 0 && mode !== 'scan') {
      const pct = Math.min(100, Math.round((index / total) * 100));
      progressLabel.textContent = `Progres: ${index} / ${total}`;
      progressPercent.textContent = `${pct}%`;
      progressBarFill.style.width = `${pct}%`;
    } else if (mode === 'scan') {
      progressLabel.textContent = `Memindai Seluruh Halaman Audio...`;
      progressPercent.textContent = ``;
      progressBarFill.style.width = `100%`;
    } else {
      progressLabel.textContent = `Progres: 0 / 0`;
      progressPercent.textContent = `0%`;
      progressBarFill.style.width = `0%`;
    }

    if (logs.length > 0) {
      consoleLog.textContent = logs.join('\n');
      consoleLog.scrollTop = consoleLog.scrollHeight;
    }
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      chrome.storage.local.get(
        ['rbx_auto_active', 'rbx_paused', 'rbx_mode', 'rbx_index', 'rbx_ids', 'rbx_logs', 'rbx_audio_data', 'rbx_moderated_data'],
        (data) => {
          updateUIState(data);
        }
      );
    }
  });

  async function launchProcess(mode) {
    saveFormSettings();

    const rawNames = inputUsernames.value;
    const names = rawNames.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
    const rawUniverse = inputUniverseId.value;
    const universeIds = rawUniverse.split(/[\n,]+/).map(u => u.trim()).filter(Boolean);

    if ((mode === 'both' || mode === 'username') && names.length === 0) {
      alert("Masukkan setidaknya 1 Username!");
      return;
    }

    if ((mode === 'both' || mode === 'universe') && universeIds.length === 0) {
      alert("Masukkan setidaknya 1 Universe ID!");
      return;
    }

    if (mode === 'thumbnail') {
      const thumbData = await new Promise(resolve => chrome.storage.local.get(['rbx_thumb_data'], resolve));
      if (!thumbData.rbx_thumb_data) {
        alert("Pilih file gambar thumbnail terlebih dahulu!");
        return;
      }
    }

    // Force full re-scan of all pages on fresh start
    await chrome.storage.local.set({
      rbx_auto_active: true,
      rbx_paused: false,
      rbx_needs_rescan: true,
      rbx_mode: mode,
      rbx_index: 0,
      rbx_ids: [],
      rbx_audio_data: [],
      rbx_moderated_data: [],
      rbx_404_ids: [],
      rbx_logs: [`[AutoPerm] Memulai pemindaian ulang seluruh halaman untuk mode ${mode.toUpperCase()}...`]
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const targetUrl = 'https://create.roblox.com/dashboard/creations?activeTab=Audio';

    if (tab && tab.url && tab.url.includes('create.roblox.com/dashboard/creations')) {
      if (!tab.url.includes('activeTab=Audio')) {
        chrome.tabs.update(tab.id, { url: targetUrl });
      } else {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'start', mode: mode });
        } catch (e) {
          // Content script belum ada di tab ini: reload tab.
          // Proses otomatis jalan karena rbx_auto_active sudah true di storage.
          chrome.tabs.reload(tab.id);
        }
      }
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
  }

  btnBoth.addEventListener('click', () => launchProcess('both'));
  if (btnThumbnail) btnThumbnail.addEventListener('click', () => launchProcess('thumbnail'));
  btnUsername.addEventListener('click', () => launchProcess('username'));
  btnUniverse.addEventListener('click', () => launchProcess('universe'));
  btnScan.addEventListener('click', () => launchProcess('scan'));
  if (btnCleanName) btnCleanName.addEventListener('click', () => launchProcess('clean_name'));
  btnArchiveModerated.addEventListener('click', () => launchProcess('archive_moderated'));

  async function broadcastTabMessage(message) {
    try {
      const tabs = await chrome.tabs.query({ url: '*://create.roblox.com/*' });
      for (const t of tabs) {
        chrome.tabs.sendMessage(t.id, message).catch(() => {});
      }
    } catch (e) {}
  }

  btnStop.addEventListener('click', async () => {
    await chrome.storage.local.set({
      rbx_auto_active: false,
      rbx_paused: false,
      rbx_needs_rescan: false
    });
    broadcastTabMessage({ action: 'stop' });
    chrome.storage.local.get(['rbx_logs'], (data) => {
      const logs = data.rbx_logs || [];
      logs.push('[AutoPerm] DIHENTIKAN OLEH PENGGUNA.');
      chrome.storage.local.set({ rbx_logs: logs });
    });
  });

  btnPause.addEventListener('click', async () => {
    chrome.storage.local.get(['rbx_paused', 'rbx_auto_active'], async (data) => {
      if (!data.rbx_auto_active) return;
      const isPaused = data.rbx_paused === true;
      const nextPaused = !isPaused;
      await chrome.storage.local.set({ rbx_paused: nextPaused });
      broadcastTabMessage({ action: 'pause', paused: nextPaused });
      chrome.storage.local.get(['rbx_logs'], (d) => {
        const logs = d.rbx_logs || [];
        logs.push(nextPaused ? '[AutoPerm] ⏸ DIJEDA.' : '[AutoPerm] ▶ DILANJUTKAN.');
        chrome.storage.local.set({ rbx_logs: logs });
      });
    });
  });

  btnReset.addEventListener('click', async () => {
    await chrome.storage.local.set({
      rbx_auto_active: false,
      rbx_paused: false,
      rbx_needs_rescan: false,
      rbx_mode: null,
      rbx_index: 0,
      rbx_ids: [],
      rbx_audio_data: [],
      rbx_moderated_data: [],
      rbx_404_ids: [],
      rbx_logs: ['[AutoPerm] State telah di-reset.']
    });
    broadcastTabMessage({ action: 'stop' });
  });

  function normalizeItem(item) {
    return {
      soundId: String(item.soundId || item.sound_id || ""),
      soundTitle: String(item.soundTitle || item.title || ""),
      soundThumbnail: "",
      moderated: Boolean(item.moderated),
      moderationLevel: item.moderationLevel || null,
      moderationReason: item.moderationReason || null
    };
  }

  function renderJsonModal() {
    chrome.storage.local.get(['rbx_audio_data', 'rbx_moderated_data'], (data) => {
      const cleanData = (data.rbx_audio_data || []).map(normalizeItem);
      const moderatedData = (data.rbx_moderated_data || []).map(normalizeItem);
      const fatalData = moderatedData.filter(d => d.moderationLevel === 'FATAL');
      const lowData = moderatedData.filter(d => d.moderationLevel === 'LOW');

      countClean.textContent = cleanData.length;
      countModerated.textContent = moderatedData.length;

      const countFatalEl = document.getElementById('countFatal');
      const countLowEl = document.getElementById('countLow');
      if (countFatalEl) countFatalEl.textContent = fatalData.length;
      if (countLowEl) countLowEl.textContent = lowData.length;

      if (activeJsonTab === 'clean') {
        jsonOutput.value = JSON.stringify(cleanData, null, 2);
      } else if (activeJsonTab === 'fatal') {
        jsonOutput.value = JSON.stringify(fatalData, null, 2);
      } else if (activeJsonTab === 'low') {
        jsonOutput.value = JSON.stringify(lowData, null, 2);
      } else {
        jsonOutput.value = JSON.stringify(moderatedData, null, 2);
      }
    });
  }

  btnViewJson.addEventListener('click', () => {
    activeJsonTab = 'clean';
    renderJsonModal();
    jsonModal.classList.add('open');
  });

  btnTabCleanJson.addEventListener('click', () => {
    activeJsonTab = 'clean';
    renderJsonModal();
  });

  btnTabModeratedJson.addEventListener('click', () => {
    activeJsonTab = 'moderated';
    renderJsonModal();
  });

  const btnTabFatalJson = document.getElementById('btnTabFatalJson');
  const btnTabLowJson = document.getElementById('btnTabLowJson');
  if (btnTabFatalJson) {
    btnTabFatalJson.addEventListener('click', () => {
      activeJsonTab = 'fatal';
      renderJsonModal();
    });
  }
  if (btnTabLowJson) {
    btnTabLowJson.addEventListener('click', () => {
      activeJsonTab = 'low';
      renderJsonModal();
    });
  }

  btnCloseModal.addEventListener('click', () => {
    jsonModal.classList.remove('open');
  });

  btnCopyJson.addEventListener('click', () => {
    jsonOutput.select();
    navigator.clipboard.writeText(jsonOutput.value);
    btnCopyJson.textContent = "Tersalin! ✔";
    setTimeout(() => {
      btnCopyJson.textContent = "Salin JSON";
    }, 2000);
  });
});
