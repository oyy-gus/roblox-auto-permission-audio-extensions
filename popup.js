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
  const btnUsername = document.getElementById('btnUsername');
  const btnUniverse = document.getElementById('btnUniverse');
  const btnScan = document.getElementById('btnScan');
  const btnArchiveModerated = document.getElementById('btnArchiveModerated');
  const btnStop = document.getElementById('btnStop');
  const btnPause = document.getElementById('btnPause');
  const btnReset = document.getElementById('btnReset');

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

  // Load Initial Settings
  chrome.storage.local.get(
    ['usernames', 'universeId', 'rbx_auto_active', 'rbx_paused', 'rbx_mode', 'rbx_index', 'rbx_ids', 'rbx_logs', 'rbx_audio_data', 'rbx_moderated_data'],
    (data) => {
      if (data.usernames) {
        inputUsernames.value = Array.isArray(data.usernames) ? data.usernames.join(', ') : data.usernames;
      }
      if (data.universeId !== undefined) {
        inputUniverseId.value = data.universeId;
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
      universeId: universe
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
