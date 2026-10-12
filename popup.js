// Roblox Auto Permission - Popup Logic v10.6

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
  const btnArchiveModerated = document.getElementById('btnArchiveModerated');
  const btnStop = document.getElementById('btnStop');
  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');

  // Thumbnail Elements
  const inputThumbnailFile = document.getElementById('inputThumbnailFile');
  const btnSelectThumb = document.getElementById('btnSelectThumb');
  const btnClearThumb = document.getElementById('btnClearThumb');
  const thumbDefaultIcon = document.getElementById('thumbDefaultIcon');
  const thumbImgPreview = document.getElementById('thumbImgPreview');
  const thumbFileName = document.getElementById('thumbFileName');
  const checkIncludeThumbnail = document.getElementById('checkIncludeThumbnail');

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

  let activeJsonTab = 'clean'; // 'clean' | 'moderated'

  function setThumbnailPreview(dataUrl, name) {
    if (dataUrl) {
      thumbImgPreview.src = dataUrl;
      thumbImgPreview.style.display = 'block';
      thumbDefaultIcon.style.display = 'none';
      thumbFileName.textContent = name || 'Gambar dipilih';
      thumbFileName.style.color = '#e4e4e7';
      btnClearThumb.style.display = 'inline-flex';
    } else {
      thumbImgPreview.src = '';
      thumbImgPreview.style.display = 'none';
      thumbDefaultIcon.style.display = 'block';
      thumbFileName.textContent = 'Belum ada gambar dipilih';
      thumbFileName.style.color = 'var(--text-muted)';
      btnClearThumb.style.display = 'none';
    }
  }

  if (btnSelectThumb) {
    btnSelectThumb.addEventListener('click', () => {
      inputThumbnailFile.click();
    });
  }

  if (inputThumbnailFile) {
    inputThumbnailFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) {
        alert("Ukuran gambar terlalu besar! Maksimal 8MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        currentThumbData = event.target.result;
        currentThumbName = file.name;
        setThumbnailPreview(currentThumbData, currentThumbName);
        chrome.storage.local.set({
          rbx_thumb_data: currentThumbData,
          rbx_thumb_name: currentThumbName
        });
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnClearThumb) {
    btnClearThumb.addEventListener('click', () => {
      currentThumbData = null;
      currentThumbName = null;
      if (inputThumbnailFile) inputThumbnailFile.value = '';
      setThumbnailPreview(null, null);
      chrome.storage.local.remove(['rbx_thumb_data', 'rbx_thumb_name']);
    });
  }

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
        inputUsernames.value = Array.isArray(data.usernames) ? data.usernames.join(', ') : data.usernames;
      }
      if (data.universeId !== undefined) {
        inputUniverseId.value = data.universeId;
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
    const universe = inputUniverseId.value.trim();

    chrome.storage.local.set({
      usernames: names,
      universeId: universe,
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
    const universe = inputUniverseId.value.trim();

    if ((mode === 'both' || mode === 'username') && names.length === 0) {
      alert("Masukkan setidaknya 1 Username!");
      return;
    }

    if ((mode === 'both' || mode === 'universe') && !universe) {
      alert("Masukkan Universe ID!");
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
        chrome.tabs.sendMessage(tab.id, { action: 'start', mode: mode });
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
  btnArchiveModerated.addEventListener('click', () => launchProcess('archive_moderated'));

  btnStop.addEventListener('click', async () => {
    await chrome.storage.local.set({
      rbx_auto_active: false,
      rbx_paused: false,
      rbx_needs_rescan: false
    });
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
      await chrome.storage.local.set({ rbx_paused: !isPaused });
      chrome.storage.local.get(['rbx_logs'], (d) => {
        const logs = d.rbx_logs || [];
        logs.push(isPaused ? '[AutoPerm] ▶ DILANJUTKAN.' : '[AutoPerm] ⏸ DIJEDA.');
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
