// Roblox Auto Permission - Content Script v10.5 (Full Multi-Page Scan & Reliable Auto Archive)

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
    if (!username) return false;
    const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
    return bodyText.includes(username.toLowerCase());
  }

  // Moderation Check Helper
  function isAudioModerated() {
    const pageText = document.body ? document.body.innerText : '';
    if (pageText.includes('Your audio was moderated.') ||
        pageText.includes('Removed for violations of Roblox Terms of Use')) {
      return true;
    }

    const descInput = document.querySelector('textarea#description, textarea[name="description"]');
    if (descInput && descInput.value.includes('Removed for violations of Roblox Terms of Use')) {
      return true;
    }

    const alertBanner = document.querySelector('.MuiAlert-root, [class*="Alert"], [class*="alert"]');
    if (alertBanner && alertBanner.textContent.toLowerCase().includes('moderated')) {
      return true;
    }

    return false;
  }

  function isRowModerated(row) {
    const svgs = row.querySelectorAll('svg');
    for (const svg of svgs) {
      const html = svg.outerHTML.toLowerCase();
      if (html.includes('ban') || html.includes('prohibited') || html.includes('lock') ||
          html.includes('circle-slash') || html.includes('d="m12 2a10 10') ||
          svg.getAttribute('data-testid')?.includes('Chevron') === false && html.includes('path')) {
        // If row SVG contains prohibition symbol or ban icon shape
        if (html.includes('ban') || html.includes('prohibit') || html.includes('slash')) return true;
      }
    }

    const rowText = row.textContent || '';
    if (rowText.includes('#####') || rowText.includes('Removed for violations')) {
      return true;
    }

    const img = row.querySelector('img');
    if (img && (img.src.includes('moderated') || img.src.includes('ban'))) {
      return true;
    }

    return false;
  }

  // Table Scanner
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

  // Next Page Button Finder (Comprehensive MUI & ARIA Paginator Selector)
  function getNextPageButton() {
    // 1. Direct attribute & class selectors
    const candidates = [
      'button[aria-label="Go to next page"]:not([disabled])',
      'button[aria-label="Next page"]:not([disabled])',
      'button[aria-label*="next" i]:not([disabled])',
      '.MuiPaginationItem-next:not([disabled])',
      'button.MuiPaginationItem-root:last-child:not([disabled])',
      'ul.MuiPagination-ul li:last-child button:not([disabled])',
      'nav[aria-label*="pagination" i] button:last-child:not([disabled])'
    ];

    for (const sel of candidates) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) return btn;
    }

    // 2. Search all buttons inside pagination nav or bottom container for SVG icons
    const paginators = document.querySelectorAll('nav, ul.MuiPagination-ul, table ~ div');
    for (const pag of paginators) {
      const btns = Array.from(pag.querySelectorAll('button:not([disabled])'));
      for (const btn of btns) {
        const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
        const svg = btn.querySelector('svg');
        const svgTestId = svg ? (svg.getAttribute('data-testid') || '').toLowerCase() : '';

        if (aria.includes('next') || svgTestId.includes('chevronright') || svgTestId.includes('navigatenext')) {
          return btn;
        }
      }

      // If last button in pagination is active and not disabled
      if (btns.length > 0) {
        const lastBtn = btns[btns.length - 1];
        const aria = (lastBtn.getAttribute('aria-label') || '').toLowerCase();
        if (aria.includes('next') || aria.includes('go to next')) {
          return lastBtn;
        }
      }
    }

    return null;
  }

  // Scan All Pages Function (Scans ALL pages on creations table)
  async function scanAllPages(mode) {
    log("=== MEMULAI SCAN SEMUA HALAMAN AUDIO ===");
    await waitForElement('table, [role="table"]', 15000);
    await wait(1200);

    let allClean = [];
    let allModerated = [];
    let page = 1;

    while (true) {
      const { cleanData, moderatedData } = scanAudioData();
      log(`Halaman ${page}: Ditemukan ${cleanData.length} audio lulus, ${moderatedData.length} audio ter-moderasi`);

      // Merge unique
      cleanData.forEach(item => {
        if (!allClean.some(x => x.sound_id === item.sound_id)) allClean.push(item);
      });
      moderatedData.forEach(item => {
        if (!allModerated.some(x => x.sound_id === item.sound_id)) allModerated.push(item);
      });

      const nextBtn = getNextPageButton();
      if (!nextBtn) {
        log(`Paginasi selesai: Total ${page} halaman telah dipindai ✔`);
        break;
      }

      log(`Pindah dari Halaman ${page} ke Halaman ${page + 1}...`);
      nextBtn.click();
      page++;
      await wait(3000); // Wait for next page table rows to render
      await waitForElement('table, [role="table"]', 10000);
      await wait(1000);
    }

    log(`================================================`);
    log(`SCAN SELESAI: Total ${allClean.length} Audio Lulus | ${allModerated.length} Ter-Moderasi`);
    log(`================================================`);

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
      alert(`SCAN SELESAI ✔\nTotal Halaman: ${page}\nAudio Lulus: ${allClean.length}\nAudio Moderasi: ${allModerated.length}\nBuka Extension Popup untuk melihat JSON.`);
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

  // Navigate to Next Track Helper
  async function goToNextTrack(currentIndex, ids) {
    const nextIndex = currentIndex + 1;
    await chrome.storage.local.set({ rbx_index: nextIndex });
    await wait(800);

    if (nextIndex < ids.length) {
      const nextId = ids[nextIndex];
      log(`[${nextIndex + 1}/${ids.length}] Otomatis berpindah ke lagu selanjutnya (ID: ${nextId})...`);
      window.location.href = `https://create.roblox.com/dashboard/creations/store/${nextId}/permissions`;
    } else {
      await chrome.storage.local.set({ rbx_auto_active: false });
      log(`============================`);
      log(`SEMUA LAGU SELESAI DIPROSES (${ids.length} Audio) ✔`);
      log(`============================`);
      alert(`SEMUA LAGU SELESAI DIPROSES ✔\nTotal: ${ids.length} audio.`);
    }
  }

  // Auto Archive Action on Roblox Table Row
  async function archiveRowBySoundId(soundId) {
    const rows = document.querySelectorAll('table tbody tr, [role="row"]');

    for (const row of rows) {
      const rowText = row.textContent || '';
      const hasId = rowText.includes(soundId) ||
                    Array.from(row.querySelectorAll('a[href]')).some(a => a.href.includes(soundId));

      if (hasId) {
        const cells = row.querySelectorAll('td, [role="cell"]');
        const lastCell = cells.length > 0 ? cells[cells.length - 1] : row;

        // Search for 3-dots button in the last cell or row
        let moreBtn = lastCell.querySelector('button') ||
                      row.querySelector('button[aria-label*="option" i], button[aria-label*="more" i], button[aria-label*="menu" i]');

        if (!moreBtn) {
          const rowBtns = row.querySelectorAll('button');
          if (rowBtns.length > 0) {
            moreBtn = rowBtns[rowBtns.length - 1];
          }
        }

        if (!moreBtn) {
          log(`⚠️ Tidak menemukan tombol 3 dots pada baris ID ${soundId}`);
          return false;
        }

        log(`Mengeklik menu 3-dots (ID: ${soundId})...`);
        moreBtn.click();
        await wait(1000);

        // Search for 'Archive' menu item across all active popovers/menus
        const menuSelectors = [
          '[role="menu"] [role="menuitem"]',
          '[role="menuitem"]',
          '.MuiPopover-root li',
          '.MuiPopover-root button',
          '.MuiMenu-list li',
          'div[role="presentation"] li',
          'div[role="menu"] div'
        ];

        let archiveMenuItem = null;
        for (const sel of menuSelectors) {
          const items = document.querySelectorAll(sel);
          for (const item of items) {
            const txt = item.textContent?.trim() || '';
            if (txt === 'Archive' || txt.includes('Archive')) {
              archiveMenuItem = item;
              break;
            }
          }
          if (archiveMenuItem) break;
        }

        if (!archiveMenuItem) {
          const allEls = document.querySelectorAll('.MuiPopover-root *, [role="menu"] *');
          for (const el of allEls) {
            if (el.children.length === 0 && el.textContent?.trim() === 'Archive') {
              archiveMenuItem = el;
              break;
            }
          }
        }

        if (archiveMenuItem) {
          archiveMenuItem.click();
          log(`Mengeklik pilihan "Archive" untuk ID ${soundId}...`);
          await wait(1200);

          // Check if confirmation modal dialog appears
          const dialogBtns = document.querySelectorAll('[role="dialog"] button, .MuiDialogActions-root button');
          for (const btn of dialogBtns) {
            const btnText = btn.textContent?.trim() || '';
            if (btnText === 'Archive' || btnText.includes('Archive')) {
              btn.click();
              log(`Konfirmasi Archive diklik ✔`);
              await wait(1000);
              break;
            }
          }
          return true;
        } else {
          log(`⚠️ Pilihan menu "Archive" tidak ditemukan pada popover`);
        }
      }
    }

    return false;
  }

  async function processArchiveModerated(moderatedList) {
    log(`Mulai Mengarsip ${moderatedList.length} Audio Moderasi...`);
    for (let i = 0; i < moderatedList.length; i++) {
      const track = moderatedList[i];
      log(`[${i + 1}/${moderatedList.length}] Mengarsip: ${track.title} (ID: ${track.sound_id})`);
      const success = await archiveRowBySoundId(track.sound_id);
      if (success) {
        log(`✔ Berhasil Diarsip: ${track.sound_id}`);
      } else {
        log(`⚠️ Gagal diarsip untuk ID: ${track.sound_id}`);
      }
      await wait(1500);
    }
    await chrome.storage.local.set({ rbx_auto_active: false });
    log("Proses Arsip Audio Moderasi Selesai ✔");
    alert(`PROSES ARSIP SELESAI ✔\nTotal ${moderatedList.length} audio telah diarsip.`);
  }

  // Close Modal Dialog Helper
  function closeModalDialog(label = 'Done') {
    const buttons = document.querySelectorAll(
      '[role="dialog"] button, [data-testid*="modal"] button, .MuiDialogActions-root button, button'
    );
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text === label || text === 'Done' || text === 'Close') {
        try { btn.click(); return true; } catch(e){}
      }
    }
    return false;
  }

  async function waitDialogClose() {
    for (let i = 0; i < 8; i++) {
      await wait(300);
      const openDialog = document.querySelector('[data-testid="add-collaborators-modal"], [data-testid="add-experiences-modal"], [role="dialog"]');
      if (!openDialog) return true;
    }
    closeModalDialog('Done');
    await wait(400);
    return true;
  }

  async function clickSaveChanges() {
    await wait(400);
    for (const btn of document.querySelectorAll('button')) {
      const text = btn.textContent?.trim() || '';
      if (text.includes('Save Changes')) {
        if (btn.disabled) {
          log('Save Changes tidak aktif (sudah tersimpan) ✔');
          return true;
        }
        btn.click();
        log('Save Changes diklik ✔');
        return true;
      }
    }
    return true;
  }

  // Collaborators Tab Logic
  async function switchToCollaboratorsTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Collaborators[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Collaborators'));
      if (tab) { tab.click(); await wait(1200); return true; }
      return false;
    });
  }

  async function openCollaboratorsDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add collaborators') || text.includes('+ Add collaborators')) {
          btn.click();
          await wait(1200);
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
    }, 10, 400);
  }

  async function waitDropdown(timeout = 6000) {
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
        opt.click(); await wait(600); return true;
      }
    }
    return false;
  }

  async function processCollaborators(usernames) {
    log("── [COLLABORATORS] ──");
    await waitForElement('button#Collaborators[role="tab"], button[role="tab"]', 15000);
    await wait(800);

    await switchToCollaboratorsTab();
    await wait(800);

    const missingUsernames = usernames.filter(u => !alreadyExists(u));

    if (missingUsernames.length === 0) {
      log(`⚡ INSTANT SKIP: Semua username (${usernames.join(', ')}) SUDAH ADA pada lagu ini ✔`);
      return true;
    }

    log(`Proses penambahan ${missingUsernames.length} user: ${missingUsernames.join(', ')}`);

    const opened = await openCollaboratorsDialog();
    if (!opened) { log("Gagal membuka dialog Collaborators"); return false; }

    const dialog = await waitCollaboratorsDialog();
    const dialogRoot = dialog || document;

    let addedCount = 0;
    for (const username of missingUsernames) {
      log(`Proses user: ${username}`);
      if (alreadyExists(username)) {
        log(`Skip ${username} - sudah ada`);
        continue;
      }

      const input = dialogRoot.querySelector(
        'input[placeholder*="Search"] input, input[placeholder*="friend"], input[placeholder*="Search"], [data-testid="autocomplete"] input, input[type="text"], input'
      ) || document.querySelector('[role="dialog"] input, [data-testid="add-collaborators-modal"] input');

      if (!input) { log("Input username tidak ditemukan"); continue; }

      setNativeValue(input, '');
      await wait(300);
      await typeUsername(input, username);
      await wait(500);

      const opts = await waitDropdown(6000);
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
      addedCount++;
      await wait(600);
    }

    closeModalDialog('Done');
    await waitDialogClose();
    await wait(600);
    await clickSaveChanges();
    await wait(1000);
    log(`Collaborators selesai (${addedCount} ditambahkan) ✔`);
    return true;
  }

  // Experiences Tab Logic
  async function switchToExperiencesTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Experiences[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Experiences'));
      if (tab) { tab.click(); await wait(1200); return true; }
      return false;
    });
  }

  async function openExperiencesDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add experiences')) {
          btn.click(); await wait(1500); return true;
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
    await wait(800);

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
    await wait(800);

    log("Menunggu tombol Add...");
    let addBtn = null;
    const addStart = Date.now();
    while (Date.now() - addStart < 6000) {
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
    await wait(1000);

    closeModalDialog('Done');
    await wait(1000);
    await waitDialogClose();
    await wait(800);
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
      await wait(800);
      await processExperiences(universeId);
    }
  }

  // Main Asset Loop Controller
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

        // ALWAYS ensure full scan if IDs list is empty or starting fresh
        if (ids.length === 0) {
          if (window.location.href.includes('/creations')) {
            await scanAllPages(mode);
          } else {
            log("Mengarahkan ke halaman Audio Creations untuk memindai SEMUA halaman ID...");
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
        const storeMatch = window.location.href.match(/store\/(\d+)\/(permissions|configure)/);
        const currentId = storeMatch ? storeMatch[1] : null;
        const pageType = storeMatch ? storeMatch[2] : null;

        if (currentId !== id) {
          log(`[${index + 1}/${ids.length}] Navigasi ke ID: ${id}`);
          window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/permissions`;
          return;
        }

        if (pageType === 'configure') {
          await wait(800);
          if (isAudioModerated()) {
            log(`⚠️ SKIP: Lagu (ID: ${id}) TERKENA MODERASI!`);
            const moderatedList = data.rbx_moderated_data || [];
            if (!moderatedList.some(m => m.sound_id === id)) {
              moderatedList.push({ title: allData[index]?.title || id, sound_id: id, moderated: true });
              await chrome.storage.local.set({ rbx_moderated_data: moderatedList });
            }
            await goToNextTrack(index, ids);
            return;
          }

          log(`Pindah dari Configure ke Permissions tab (ID: ${id})...`);
          window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/permissions`;
          return;
        }

        const songName = allData[index]?.title || id;
        log(`============================`);
        log(`[${index + 1}/${ids.length}] ${songName}`);
        log(`ID: ${id} | Mode: ${mode}`);
        log(`============================`);

        updateHUDInfo(songName, id, index + 1, ids.length, mode);

        await wait(800);
        if (isAudioModerated()) {
          log(`⚠️ SKIP: Lagu "${songName}" (ID: ${id}) TERKENA MODERASI!`);
          const moderatedList = data.rbx_moderated_data || [];
          if (!moderatedList.some(m => m.sound_id === id)) {
            moderatedList.push({ title: songName, sound_id: id, moderated: true });
            await chrome.storage.local.set({ rbx_moderated_data: moderatedList });
          }
          await goToNextTrack(index, ids);
          return;
        }

        await processOneAsset(mode, data);
        await goToNextTrack(index, ids);
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
        <div class="hud-logs-box" id="hudLogs">[AutoPerm] Multi-Page Scanner & Reliable Auto Archive active.</div>
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
