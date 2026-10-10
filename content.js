// Roblox Auto Permission - Content Script v10.2 (With Moderation Detection & Auto Archive)

(function () {
  'use strict';

  if (window.__RBX_AUTO_PERM_INJECTED__) return;
  window.__RBX_AUTO_PERM_INJECTED__ = true;

  const wait = ms => new Promise(r => setTimeout(r, ms));

  let hudElement = null;
  let recentLogs = [];

  // Log Helper
  async function log(msg) {
    const formatted = `[AutoPerm] ${msg}`;
    console.log(`%c${formatted}`, 'color:#00f2fe;font-weight:bold;');

    recentLogs.push(formatted);
    if (recentLogs.length > 50) recentLogs.shift();

    const hudLogs = document.getElementById('hudLogs');
    if (hudLogs) {
      hudLogs.textContent = recentLogs.join('\n');
      hudLogs.scrollTop = hudLogs.scrollHeight;
    }

    chrome.storage.local.get(['rbx_logs'], (data) => {
      const logs = data.rbx_logs || [];
      logs.push(formatted);
      if (logs.length > 50) logs.shift();
      chrome.storage.local.set({ rbx_logs: logs });
    });
  }

  // DOM Helpers
  async function waitForElement(selector, timeout = 15000, root = document) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = root.querySelector(selector);
      if (el) return el;
      await wait(200);
    }
    return null;
  }

  function setNativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set ||
                   Object.getOwnPropertyDescriptor(Element.prototype, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function typeUsername(input, text) {
    input.focus();
    input.click();
    await wait(300);
    setNativeValue(input, '');
    await wait(200);
    for (const char of text) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      setNativeValue(input, input.value + char);
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
      await wait(100 + Math.random() * 60);
    }
  }

  async function retry(fn, attempts = 4, delay = 1200) {
    for (let i = 0; i < attempts; i++) {
      if (await fn()) return true;
      await wait(delay);
    }
    return false;
  }

  function alreadyExists(username) {
    return document.body.innerText.toLowerCase().includes(username.toLowerCase());
  }

  // Moderation Check Helper on Active Page
  function isAudioModerated() {
    const pageText = document.body.innerText || '';
    if (pageText.includes('Your audio was moderated.') ||
        pageText.includes('Removed for violations of Roblox Terms of Use')) {
      return true;
    }

    const descInput = document.querySelector('textarea#description, textarea[name="description"]');
    if (descInput && descInput.value.includes('Removed for violations of Roblox Terms of Use')) {
      return true;
    }

    const alertBanner = document.querySelector('.MuiAlert-root, [class*="Alert"], [class*="alert"]');
    if (alertBanner && alertBanner.textContent.includes('moderated')) {
      return true;
    }

    return false;
  }

  // Detect Moderated Icon in Table Row
  function isRowModerated(row) {
    // 1. Check if row contains ban/prohibition circle icon or document-with-ban icon
    const svgs = row.querySelectorAll('svg');
    for (const svg of svgs) {
      const html = svg.outerHTML.toLowerCase();
      // Look for ban icon shapes (slashed circle) or data-icon
      if (html.includes('ban') || html.includes('prohibited') || html.includes('lock') ||
          html.includes('circle-slash') || html.includes('d="m12 2a10 10')) {
        return true;
      }
    }

    // 2. Check row text for hashtags moderation or removed text
    const rowText = row.textContent || '';
    if (rowText.includes('#####') || rowText.includes('Removed for violations')) {
      return true;
    }

    // 3. Check image/icon element src or background
    const img = row.querySelector('img');
    if (img && (img.src.includes('moderated') || img.src.includes('ban'))) {
      return true;
    }

    return false;
  }

  // Robust Table Scanner (Separates Clean & Moderated Audio)
  function scanAudioData() {
    const rows = document.querySelectorAll('table tbody tr, [role="row"]');
    const cleanData = [];
    const moderatedData = [];
    const seenIds = new Set();

    rows.forEach(row => {
      let soundId = null;
      let title = null;

      const links = row.querySelectorAll('a[href]');
      links.forEach(link => {
        const match = link.href.match(/(?:store|creations)\/(\d+)/);
        if (match && !soundId) {
          soundId = match[1];
        }
        if (!title && link.textContent.trim()) {
          title = link.textContent.trim();
        }
      });

      if (!soundId) {
        const cells = row.querySelectorAll('td, th, [role="cell"]');
        cells.forEach(cell => {
          const txt = cell.textContent.trim();
          if (/^\d{8,20}$/.test(txt) && !soundId) {
            soundId = txt;
          }
        });
      }

      if (!title) {
        const firstCell = row.querySelector('th, td:first-child');
        if (firstCell) title = firstCell.textContent.trim();
      }

      if (soundId && !seenIds.has(soundId)) {
        seenIds.add(soundId);
        const item = {
          title: title || `Audio ${soundId}`,
          sound_id: soundId,
          moderated: isRowModerated(row)
        };

        if (item.moderated) {
          moderatedData.push(item);
        } else {
          cleanData.push(item);
        }
      }
    });

    return { cleanData, moderatedData };
  }

  function getNextPageButton() {
    return document.querySelector(
      'nav[aria-label*="pagination"] button[aria-label*="next"]:not([disabled]), ' +
      'nav[aria-label*="pagination"] button[aria-label*="Go to next page"]:not([disabled]), ' +
      'button[aria-label="Go to next page"]:not([disabled])'
    ) || null;
  }

  async function scanAllPages(mode) {
    log("Mulai scan semua halaman Audio...");
    await waitForElement('table, [role="table"]', 15000);
    await wait(1000);

    let allClean = [];
    let allModerated = [];
    let page = 1;

    while (true) {
      const { cleanData, moderatedData } = scanAudioData();
      log(`Halaman ${page}: ${cleanData.length} audio lulus, ${moderatedData.length} audio ter-moderasi`);
      allClean = allClean.concat(cleanData);
      allModerated = allModerated.concat(moderatedData);

      const nextBtn = getNextPageButton();
      if (!nextBtn) {
        log("Scan selesai seluruh halaman.");
        break;
      }

      log("Pindah ke halaman berikutnya...");
      nextBtn.click();
      page++;
      await wait(2000);
      await waitForElement('table, [role="table"]', 10000);
      await wait(1000);
    }

    log(`============================`);
    log(`SCAN SELESAI: ${allClean.length} LULUS, ${allModerated.length} TER-MODERASI`);
    log(`============================`);

    const targetIds = (mode === 'archive_moderated') ?
                      allModerated.map(d => d.sound_id) :
                      allClean.map(d => d.sound_id);

    await chrome.storage.local.set({
      rbx_ids: targetIds,
      rbx_audio_data: allClean,
      rbx_moderated_data: allModerated,
      rbx_index: 0,
      rbx_mode: mode
    });

    if (mode === 'scan') {
      await chrome.storage.local.set({ rbx_auto_active: false });
      alert(`SCAN SELESAI ✔\nAudio Lulus: ${allClean.length}\nAudio Moderasi: ${allModerated.length}\nBuka Extension Popup untuk melihat JSON.`);
      return;
    }

    if (targetIds.length > 0) {
      log(`Mulai proses ${targetIds.length} lagu [mode: ${mode}]...`);
      await wait(1000);
      if (mode === 'archive_moderated') {
        await processArchiveModerated(allModerated);
      } else {
        window.location.href = `https://create.roblox.com/dashboard/creations/store/${targetIds[0]}/permissions`;
      }
    } else {
      await chrome.storage.local.set({ rbx_auto_active: false });
      log(`Tidak ada ID lagu untuk diproses pada mode ${mode}!`);
      alert(`Tidak ada lagu yang memerlukan proses pada mode ${mode}!`);
    }
  }

  // Auto Archive Action on Table Row
  async function archiveRowBySoundId(soundId) {
    const rows = document.querySelectorAll('table tbody tr, [role="row"]');
    for (const row of rows) {
      if (row.textContent.includes(soundId)) {
        // Find 3 dots button on right side of row
        const moreBtn = row.querySelector('button[aria-label*="More"], button[aria-label*="options"], button:last-child');
        if (moreBtn) {
          moreBtn.click();
          await wait(600);

          // Find popup menu item 'Archive'
          const menuItems = document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menuitem"], li, button');
          for (const item of menuItems) {
            if (item.textContent.trim() === 'Archive') {
              item.click();
              await wait(1000);

              // Check if confirmation modal pops up
              const confirmBtn = document.querySelector('[role="dialog"] button:not([aria-label="Close"])');
              if (confirmBtn && confirmBtn.textContent.includes('Archive')) {
                confirmBtn.click();
                await wait(1000);
              }
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  async function processArchiveModerated(moderatedList) {
    log(`Mulai Mengarsip ${moderatedList.length} Audio yang Terkena Moderasi...`);
    for (let i = 0; i < moderatedList.length; i++) {
      const track = moderatedList[i];
      log(`[${i + 1}/${moderatedList.length}] Mengarsip: ${track.title} (ID: ${track.sound_id})`);
      const success = await archiveRowBySoundId(track.sound_id);
      if (success) {
        log(`✔ Berhasil Diarsip: ${track.sound_id}`);
      } else {
        log(`⚠️ Gagal klik tombol Archive untuk ID: ${track.sound_id}`);
      }
      await wait(1500);
    }
    await chrome.storage.local.set({ rbx_auto_active: false });
    log("Proses Arsip Audio Moderasi Selesai ✔");
    alert(`PROSES ARSIP SELESAI ✔\nTotal ${moderatedList.length} audio telah diarsip.`);
  }

  // Collaborators Tab Logic
  async function switchToCollaboratorsTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Collaborators[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Collaborators'));
      if (tab) { tab.click(); await wait(1500); return true; }
      return false;
    });
  }

  async function openCollaboratorsDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add collaborators') || text.includes('+ Add collaborators')) {
          btn.click();
          await wait(1500);
          return true;
        }
      }
      return false;
    });
  }

  async function waitCollaboratorsDialog() {
    return await retry(async () => {
      const dialog = document.querySelector('[data-testid="add-collaborators-modal"]') ||
                     document.querySelector('[role="dialog"]') ||
                     Array.from(document.querySelectorAll('div')).find(d => d.textContent?.includes('Add Collaborators') && d.querySelector('input'));
      return dialog || false;
    }, 10, 500);
  }

  async function waitDropdown(timeout = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const opts = document.querySelectorAll(
        '[role="listbox"] [role="option"], [role="option"], .MuiAutocomplete-option, [data-testid="autocomplete-option"]'
      );
      if (opts.length > 0) return opts;
      await wait(300);
    }
    return null;
  }

  async function selectUser(username) {
    const opts = document.querySelectorAll(
      '[role="listbox"] [role="option"], [role="option"], .MuiAutocomplete-option, [data-testid="autocomplete-option"]'
    );
    for (const opt of opts) {
      if (opt.textContent?.toLowerCase().includes(username.toLowerCase())) {
        opt.click(); await wait(700); return true;
      }
    }
    return false;
  }

  function clickDialogButton(dialog, label) {
    const buttons = dialog.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === label || text.includes(label)) {
        btn.click();
        return true;
      }
    }
    return false;
  }

  async function waitDialogClose() {
    for (let i = 0; i < 20; i++) {
      await wait(500);
      const openDialog = document.querySelector('[data-testid="add-collaborators-modal"], [data-testid="add-experiences-modal"]');
      if (!openDialog) return true;
    }
    return false;
  }

  async function clickSaveChanges() {
    await wait(500);
    for (const btn of document.querySelectorAll('button')) {
      const text = btn.textContent?.trim() || '';
      if (text.includes('Save Changes')) {
        btn.click();
        log('Save Changes ✔');
        return true;
      }
    }
    return false;
  }

  async function processCollaborators(usernames) {
    log("── [COLLABORATORS] ──");
    await waitForElement('button#Collaborators[role="tab"], button[role="tab"]', 15000);
    await wait(1000);

    await switchToCollaboratorsTab();
    await wait(1500);

    const opened = await openCollaboratorsDialog();
    if (!opened) { log("Gagal membuka dialog Collaborators"); return; }

    const dialog = await waitCollaboratorsDialog();
    if (!dialog) { log("Dialog Collaborators tidak muncul"); return; }
    log("Dialog Collaborators terbuka ✔");

    for (const username of usernames) {
      log(`Proses user: ${username}`);
      if (alreadyExists(username)) { log(`Skip ${username} - sudah ada`); continue; }

      const input = dialog.querySelector('input[placeholder*="Search"] input, input[placeholder*="friend"], input[placeholder*="Search"], [data-testid="autocomplete"] input, input[type="text"], input');
      if (!input) { log("Input username tidak ditemukan"); continue; }

      setNativeValue(input, '');
      await wait(300);
      await typeUsername(input, username);
      await wait(500);

      const opts = await waitDropdown(8000);
      if (!opts || opts.length === 0) {
        log(`Dropdown tidak muncul untuk ${username}`);
        setNativeValue(input, '');
        continue;
      }

      const selected = await selectUser(username);
      if (!selected) {
        log(`User ${username} tidak ditemukan di pilihan dropdown`);
        setNativeValue(input, '');
        continue;
      }

      log(`${username} berhasil dipilih ✔`);
      await wait(800);
    }

    clickDialogButton(dialog, 'Done');
    await waitDialogClose();
    await wait(1000);
    await clickSaveChanges();
    await wait(2000);
    log("Collaborators selesai ✔");
  }

  // Experiences Tab Logic
  async function switchToExperiencesTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Experiences[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Experiences'));
      if (tab) { tab.click(); await wait(1500); return true; }
      return false;
    });
  }

  async function openExperiencesDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add experiences')) {
          btn.click(); await wait(2000); return true;
        }
      }
      return false;
    });
  }

  async function processExperiences(universeId) {
    if (!universeId) {
      log("Universe ID kosong, dilewati");
      return;
    }
    log("── [EXPERIENCES] ──");
    await switchToExperiencesTab();
    await wait(1500);

    const opened = await openExperiencesDialog();
    if (!opened) { log("Gagal membuka dialog Experiences"); return; }

    const dialog = await waitForElement('[data-testid="add-experiences-modal"], [role="dialog"]', 10000);
    if (!dialog) { log("Dialog Experiences tidak muncul"); return; }
    log("Dialog Experiences terbuka ✔");

    const input = await waitForElement('#proposed-experience-search, input[placeholder*="search"], input[type="text"], input', 8000, dialog);
    if (!input) { log("Input experience tidak ditemukan"); return; }

    input.focus();
    setNativeValue(input, universeId);
    log(`Universe ID dimasukkan: ${universeId}`);
    await wait(1000);

    log("Menunggu tombol Add...");
    let addBtn = null;
    const addStart = Date.now();
    while (Date.now() - addStart < 8000) {
      for (const btn of dialog.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text === 'Add' && !btn.disabled) { addBtn = btn; break; }
      }
      if (addBtn) break;
      await wait(300);
    }

    if (addBtn) {
      addBtn.click();
      log("Tombol Add diklik ✔");
    } else {
      log("Tombol Add tidak aktif / tidak ditemukan");
    }
    await wait(1500);

    clickDialogButton(dialog, 'Done');
    await wait(1500);
    await waitDialogClose();
    await wait(1000);
    log("Experiences selesai ✔");
  }

  async function processOneAsset(mode, settings) {
    const usernames = settings.usernames || ["TBR SOCIETY"];
    const universeId = settings.universeId || "";

    if (mode === "username") {
      await processCollaborators(usernames);
    } else if (mode === "universe") {
      await processExperiences(universeId);
    } else {
      await processCollaborators(usernames);
      await wait(1000);
      await processExperiences(universeId);
    }
  }

  // Asset Loop Controller with Moderation Safeguard
  async function processAssetsLoop() {
    chrome.storage.local.get(
      ['rbx_auto_active', 'rbx_ids', 'rbx_audio_data', 'rbx_moderated_data', 'rbx_mode', 'rbx_index', 'usernames', 'universeId'],
      async (data) => {
        if (data.rbx_auto_active !== true) return;

        const ids = data.rbx_ids || [];
        const allData = data.rbx_audio_data || [];
        const mode = data.rbx_mode || 'both';
        let index = parseInt(data.rbx_index || 0, 10);

        if (mode === 'archive_moderated') {
          if (window.location.href.includes('/creations')) {
            await scanAllPages(mode);
          } else {
            window.location.href = 'https://create.roblox.com/dashboard/creations?activeTab=Audio';
          }
          return;
        }

        if (ids.length === 0) {
          if (window.location.href.includes('/creations')) {
            await scanAllPages(mode);
          } else {
            log("Mengarahkan ke halaman Audio Creations...");
            window.location.href = 'https://create.roblox.com/dashboard/creations?activeTab=Audio';
          }
          return;
        }

        if (index >= ids.length) {
          log(`============================`);
          log(`SEMUA SELESAI! Total: ${ids.length} lagu [mode: ${mode}]`);
          log(`============================`);

          await chrome.storage.local.set({
            rbx_auto_active: false,
            rbx_index: ids.length
          });

          alert(`SEMUA SELESAI ✔\nTotal: ${ids.length} lagu\nMode: ${mode}\nBuka Extension Popup untuk melihat JSON.`);
          return;
        }

        const id = ids[index];
        const match = window.location.href.match(/store\/(\d+)\/(?:permissions|configure)/);
        const currentId = match ? match[1] : null;

        if (currentId !== id) {
          log(`[${index + 1}/${ids.length}] Navigasi ke ID: ${id}`);
          window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/permissions`;
          return;
        }

        const songName = allData[index]?.title || id;
        log(`============================`);
        log(`[${index + 1}/${ids.length}] ${songName}`);
        log(`ID: ${id} | Mode: ${mode}`);
        log(`============================`);

        updateHUDInfo(songName, id, index + 1, ids.length, mode);

        // Check if page indicates Audio Moderated!
        await wait(1000);
        if (isAudioModerated()) {
          log(`⚠️ SKIP: Lagu "${songName}" (ID: ${id}) TERKENA MODERASI!`);

          // Save track to moderated data list
          const moderatedList = data.rbx_moderated_data || [];
          if (!moderatedList.some(m => m.sound_id === id)) {
            moderatedList.push({ title: songName, sound_id: id, moderated: true });
            await chrome.storage.local.set({ rbx_moderated_data: moderatedList });
          }

          // Skip to next track
          const nextIndex = index + 1;
          await chrome.storage.local.set({ rbx_index: nextIndex });
          await wait(1500);

          if (nextIndex < ids.length) {
            window.location.href = `https://create.roblox.com/dashboard/creations/store/${ids[nextIndex]}/permissions`;
          } else {
            await chrome.storage.local.set({ rbx_auto_active: false });
            alert(`SEMUA SELESAI ✔\nTotal: ${ids.length} lagu.`);
          }
          return;
        }

        await processOneAsset(mode, data);

        const nextIndex = index + 1;
        await chrome.storage.local.set({ rbx_index: nextIndex });
        await wait(2000);

        if (nextIndex < ids.length) {
          window.location.href = `https://create.roblox.com/dashboard/creations/store/${ids[nextIndex]}/permissions`;
        } else {
          await chrome.storage.local.set({ rbx_auto_active: false });
          alert(`SEMUA SELESAI ✔\nTotal: ${ids.length} lagu.`);
        }
      }
    );
  }

  // Floating HUD Controller Widget
  function createFloatingHUD() {
    if (document.getElementById('rbx-auto-perm-hud')) return;

    hudElement = document.createElement('div');
    hudElement.id = 'rbx-auto-perm-hud';
    hudElement.innerHTML = `
      <div class="hud-header" id="hudHeader">
        <div class="hud-title">
          <span id="hudDot" class="hud-status-dot"></span>
          <span>AutoPerm HUD</span>
        </div>
        <div class="hud-controls">
          <button id="hudMinBtn" class="hud-btn-mini" title="Minimize">—</button>
        </div>
      </div>
      <div class="hud-body">
        <div class="hud-progress-info">
          <span id="hudProgressText">Progress: 0 / 0</span>
          <span id="hudProgressPct">0%</span>
        </div>
        <div class="hud-progress-bar-bg">
          <div id="hudBarFill" class="hud-progress-bar-fill"></div>
        </div>
        <div class="hud-song-info" id="hudSongInfo">
          Status: <strong>Idle</strong>
        </div>
        <div class="hud-logs-box" id="hudLogs">[AutoPerm] Filter moderasi otomatis aktif.</div>
        <div class="hud-actions">
          <button id="hudStopBtn" class="hud-action-btn hud-btn-stop">Stop</button>
          <button id="hudResetBtn" class="hud-action-btn hud-btn-reset">Reset</button>
        </div>
      </div>
    `;

    document.body.appendChild(hudElement);

    const hudMinBtn = document.getElementById('hudMinBtn');
    hudMinBtn.addEventListener('click', () => {
      hudElement.classList.toggle('minimized');
      hudMinBtn.textContent = hudElement.classList.contains('minimized') ? '+' : '—';
    });

    document.getElementById('hudStopBtn').addEventListener('click', () => {
      chrome.storage.local.set({ rbx_auto_active: false });
      log("DIHENTIKAN via HUD");
    });

    document.getElementById('hudResetBtn').addEventListener('click', () => {
      chrome.storage.local.set({
        rbx_auto_active: false,
        rbx_index: 0,
        rbx_ids: [],
        rbx_audio_data: [],
        rbx_moderated_data: [],
        rbx_logs: []
      });
      log("State di-reset via HUD");
    });

    makeDraggable(hudElement, document.getElementById('hudHeader'));

    chrome.storage.local.get(
      ['rbx_auto_active', 'rbx_mode', 'rbx_index', 'rbx_ids', 'rbx_logs'],
      (data) => {
        syncHUDState(data);
      }
    );
  }

  function syncHUDState(data) {
    const dot = document.getElementById('hudDot');
    const hudProgressText = document.getElementById('hudProgressText');
    const hudProgressPct = document.getElementById('hudProgressPct');
    const hudBarFill = document.getElementById('hudBarFill');
    const hudLogs = document.getElementById('hudLogs');

    if (!dot) return;

    const active = data.rbx_auto_active === true;
    const ids = data.rbx_ids || [];
    const index = parseInt(data.rbx_index || 0, 10);
    const mode = data.rbx_mode || '-';

    if (active) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }

    if (ids.length > 0) {
      const pct = Math.min(100, Math.round((index / ids.length) * 100));
      hudProgressText.textContent = `Progress: ${index} / ${ids.length} (${mode})`;
      hudProgressPct.textContent = `${pct}%`;
      hudBarFill.style.width = `${pct}%`;
    } else {
      hudProgressText.textContent = `Mode: ${mode}`;
      hudProgressPct.textContent = `0%`;
      hudBarFill.style.width = `0%`;
    }

    if (data.rbx_logs && hudLogs) {
      hudLogs.textContent = data.rbx_logs.join('\n');
      hudLogs.scrollTop = hudLogs.scrollHeight;
    }
  }

  function updateHUDInfo(songName, id, current, total, mode) {
    const info = document.getElementById('hudSongInfo');
    if (info) {
      info.innerHTML = `[${current}/${total}] <strong>${songName}</strong> (ID: ${id})`;
    }
  }

  function makeDraggable(elmnt, header) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
      elmnt.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      chrome.storage.local.get(
        ['rbx_auto_active', 'rbx_mode', 'rbx_index', 'rbx_ids', 'rbx_logs'],
        (data) => {
          syncHUDState(data);
        }
      );
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start') {
      log(`Perintah START diterima (${request.mode})`);
      processAssetsLoop();
      sendResponse({ status: 'started' });
    }
  });

  setTimeout(() => {
    createFloatingHUD();
    processAssetsLoop();
  }, 2000);

})();
