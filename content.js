// Roblox Auto Permission - Content Script v10.14 (Skip universe "Already added", verifikasi notifikasi untuk yang baru)

(function () {
  'use strict';

  if (window.__RBX_AUTO_PERM_INJECTED__) return;
  window.__RBX_AUTO_PERM_INJECTED__ = true;

  // ── In-memory state (synced instantly via storage listener & messages) ──
  let _state = { active: false, paused: false };
  let _isProcessing = false;
  let hudElement = null;
  let recentLogs = [];

  // Sync state from storage once at startup
  chrome.storage.local.get(['rbx_auto_active', 'rbx_paused'], (d) => {
    _state.active = d.rbx_auto_active === true;
    _state.paused = d.rbx_paused === true;
  });

  // Keep _state in sync whenever popup changes stop/pause
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.rbx_auto_active !== undefined) {
      _state.active = changes.rbx_auto_active.newValue === true;
    }
    if (changes.rbx_paused !== undefined) {
      _state.paused = changes.rbx_paused.newValue === true;
    }
  });

  // Immediate abort error class to instantly unwind async call stack
  class ProcessAbortError extends Error {
    constructor() {
      super('Process aborted by user');
      this.name = 'ProcessAbortError';
    }
  }

  function checkAbort() {
    if (!_state.active) {
      throw new ProcessAbortError();
    }
  }

  function isAbort(err) {
    return err && (err instanceof ProcessAbortError || err.name === 'ProcessAbortError');
  }

  function shouldStop() {
    return !_state.active;
  }

  // Plain wait (non-interruptible, use only for tiny micro-delays < 100ms)
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Pause Helper — freezes execution in 100ms ticks while paused, throws immediately if stopped
  async function waitIfPaused() {
    checkAbort();
    while (_state.paused && _state.active) {
      await wait(100);
    }
    checkAbort();
  }

  // Interruptible wait — checks stop & pause every 100ms. Throws ProcessAbortError if stopped.
  async function iWait(ms) {
    checkAbort();
    const end = Date.now() + ms;
    while (Date.now() < end) {
      checkAbort();
      const slice = Math.min(100, end - Date.now());
      if (slice > 0) await wait(slice);
      while (_state.paused && _state.active) {
        await wait(100);
      }
      checkAbort();
    }
  }

  // Safe navigation — NEVER navigates if process is stopped
  function navigateTo(url) {
    checkAbort();
    log(`Navigasi ke: ${url}`);
    window.location.href = url;
  }

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

  // Check if button/element is disabled across all MUI, Radix, Foundation CSS patterns
  function isButtonDisabled(btn) {
    if (!btn) return true;
    return btn.hasAttribute('disabled') ||
           btn.disabled === true ||
           btn.classList.contains('Mui-disabled') ||
           btn.classList.contains('opacity-[0.5]') ||
           btn.getAttribute('aria-disabled') === 'true' ||
           btn.getAttribute('disabled') !== null;
  }

  // Maximal Click Simulator (Triggers Pointer, Mouse, Focus, and Touch/Keyboard events)
  function simulateClick(el) {
    if (!el || isButtonDisabled(el)) return false;
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    } catch (e) {}
    try {
      el.focus();
    } catch (e) {}

    const opts = { bubbles: true, cancelable: true, view: window, composed: true };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
    return true;
  }

  // Native Value Setter for React 16/17/18+ Controlled Inputs
  function setNativeValue(el, value) {
    if (!el) return;
    const previousValue = el.value;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el), 'value'
    )?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, value);
    } else {
      el.value = value;
    }
    if (el._valueTracker) {
      el._valueTracker.setValue(previousValue);
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: value, composed: true }));
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  // Inject text into an input using execCommand (works best across React versions)
  async function execCommandInsert(el, text) {
    try {
      el.focus();
      await wait(100);
      // Select all & delete first
      document.execCommand('selectAll', false);
      await wait(50);
      document.execCommand('delete', false);
      await wait(100);
      // Insert text via execCommand (triggers native input events React listens to)
      const result = document.execCommand('insertText', false, text);
      await wait(100);
      return result;
    } catch (e) {
      return false;
    }
  }

  // DOM Helpers
  async function waitForElement(selector, timeout = 15000, root = document) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      checkAbort();
      await waitIfPaused();
      if (isErrorOr404Page()) {
        const tryAgainBtn = getTryAgainButton();
        if (tryAgainBtn) {
          log("⚠️ Halaman error Roblox ('Oh noes!') terdeteksi saat menunggu elemen, klik 'Try again'...");
          simulateClick(tryAgainBtn);
          await iWait(2000);
        }
      }
      const el = root.querySelector(selector);
      if (el) return el;
      await iWait(200);
    }
    return null;
  }

  // Find input inside an open dialog — searches document-wide to handle React Portals
  function findDialogInput(placeholderHints = []) {
    // First try inside known dialog roots
    const dialogRoots = [
      ...document.querySelectorAll('[role="dialog"], [data-testid*="modal"], [data-radix-dialog-content]')
    ];
    for (const root of dialogRoots) {
      const inputs = root.querySelectorAll('input');
      for (const inp of inputs) {
        if (inp.type === 'hidden') continue;
        if (placeholderHints.length === 0) return inp;
        const ph = (inp.placeholder || '').toLowerCase();
        for (const hint of placeholderHints) {
          if (ph.includes(hint.toLowerCase())) return inp;
        }
      }
      // If hints didn't match, return first visible input in dialog
      const allInputs = root.querySelectorAll('input:not([type="hidden"])');
      if (allInputs.length > 0 && placeholderHints.length === 0) return allInputs[0];
    }
    // Fallback: search entire document
    const allInputs = document.querySelectorAll('input:not([type="hidden"])');
    for (const inp of allInputs) {
      const ph = (inp.placeholder || '').toLowerCase();
      if (placeholderHints.length === 0) return inp;
      for (const hint of placeholderHints) {
        if (ph.includes(hint.toLowerCase())) return inp;
      }
    }
    return null;
  }

  // Master input filler: tries execCommand first, falls back to setNativeValue char-by-char
  async function fillInput(input, text) {
    if (!input) return false;
    input.scrollIntoView({ block: 'center' });
    simulateClick(input);
    await iWait(200);
    input.focus();
    await iWait(150);

    // Method 1: execCommand (most reliable, bypasses React synthetic event quirks)
    const execOk = await execCommandInsert(input, text);
    if (execOk && input.value === text) {
      log(`[fillInput] execCommand OK: "${text}"`);
      return true;
    }

    // Method 2: setNativeValue + char-by-char typing
    log(`[fillInput] execCommand gagal, coba char-by-char...`);
    setNativeValue(input, '');
    await iWait(150);
    for (const char of text) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true, composed: true }));
      setNativeValue(input, input.value + char);
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true, composed: true }));
      await iWait(80 + Math.random() * 40);
    }
    await iWait(200);

    // Method 3: If still empty, force via ClipboardEvent paste simulation
    if (!input.value) {
      log(`[fillInput] Mencoba simulasi paste...`);
      input.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      setNativeValue(input, text);
      await iWait(200);
    }

    log(`[fillInput] Hasil akhir value: "${input.value}"`);
    return input.value.length > 0;
  }

  async function typeUsername(input, text) {
    return fillInput(input, text);
  }

  async function retry(fn, attempts = 4, delay = 1000) {
    for (let i = 0; i < attempts; i++) {
      checkAbort();
      await waitIfPaused();
      if (isErrorOr404Page()) {
        const tryAgainBtn = getTryAgainButton();
        if (tryAgainBtn) {
          log("⚠️ Halaman error Roblox ('Oh noes!') terdeteksi, klik 'Try again'...");
          simulateClick(tryAgainBtn);
          await iWait(2000);
        }
      }
      if (await fn()) return true;
      await iWait(delay);
    }
    return false;
  }

  function alreadyExists(username) {
    if (!username) return false;
    const lower = username.toLowerCase().trim();
    const cleanUser = lower.startsWith('@') ? lower.slice(1) : lower;

    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    if (bodyText.includes(cleanUser) || bodyText.includes(`@${cleanUser}`)) {
      return true;
    }

    const cells = document.querySelectorAll('td, th, [role="cell"], [data-testid*="permission"], a[href*="users"], a[href*="groups"]');
    for (const cell of cells) {
      const txt = cell.textContent.toLowerCase();
      if (txt.includes(cleanUser)) return true;
    }

    return false;
  }

  function alreadyExistsExperience(universeId) {
    // Roblox does NOT show added experiences in the UI ("After saving, the added experiences will not be visible").
    // Therefore there is no reliable way to check if a universe ID was already added.
    // Always return false so we always attempt to add it.
    return false;
  }

  // Moderation Check Helper
  function getAudioModerationInfo() {
    const pageText = document.body ? document.body.innerText : '';
    const hasModBanner = pageText.includes('Your audio was moderated.') ||
                         pageText.includes('Removed for violations of Roblox Terms of Use');

    // Di Creator Hub, kolom Name adalah <textarea id="name">, bukan <input>
    const nameInput = document.querySelector('textarea#name, textarea[name="name"], input#name, input[name="name"], [data-testid="asset-name-input"]');
    const nameValue = nameInput ? nameInput.value : '';
    const pageTitle = document.title || '';
    const hasHashtagTitle = nameValue.includes('#####') || pageTitle.includes('#####') || pageText.includes('##################################################');

    const descInput = document.querySelector('textarea#description, textarea[name="description"]');
    const descValue = descInput ? descInput.value : '';
    const hasModDesc = descValue.includes('Removed for violations') || descValue.includes('#####');

    const alertBanner = document.querySelector('.MuiAlert-root, [class*="Alert"], [class*="alert"]');
    const hasAlert = alertBanner && alertBanner.textContent.toLowerCase().includes('moderated');

    const unapprovedImg = document.querySelector('img[src*="UnapprovedImage"], img[src*="moderated"]');

    const isModerated = hasModBanner || hasHashtagTitle || hasModDesc || hasAlert || Boolean(unapprovedImg);
    const isRenameNeeded = hasHashtagTitle;

    return {
      isModerated,
      isRenameNeeded,
      reason: isRenameNeeded ? "Judul audio ter-moderasi (PERLU DIGANTI NAMA)" : "Audio ter-moderasi oleh sistem Roblox"
    };
  }

  function isAudioModerated() {
    return getAudioModerationInfo().isModerated;
  }

  // Detects the "Try again" button shown on Roblox crash/error screens
  function getTryAgainButton() {
    for (const btn of document.querySelectorAll('button')) {
      const txt = (btn.textContent?.trim() || '').toLowerCase();
      if (txt === 'try again' || txt.includes('try again') || txt === 'coba lagi') {
        return btn;
      }
    }
    return null;
  }

  // 404 & Crash Page Detector — detects Roblox 404, "Oh noes! Could not load this page", and generic crash pages
  function isErrorOr404Page() {
    const bodyText = (document.body ? document.body.innerText : '').toLowerCase();
    const title = (document.title || '').toLowerCase();

    const is404 = bodyText.includes("we couldn't find the page") ||
                  bodyText.includes('404 page not found') ||
                  title.includes('404') ||
                  document.querySelector('.web-blox-css-tss-5uh6hj-Grid-root-loggedinErrorArea, [class*="loggedinErrorArea"]') !== null;

    const isCrash = bodyText.includes('oh noes!') ||
                    bodyText.includes('could not load this page') ||
                    bodyText.includes('please try again later') ||
                    bodyText.includes('something went wrong');

    const hasTryAgain = getTryAgainButton() !== null;

    return is404 || isCrash || hasTryAgain;
  }

  const is404Page = isErrorOr404Page;

  // Returns null if not moderated, or { level: 'FATAL'|'LOW', reason } if moderated
  function getRowModerationLevel(row) {
    const rowText = row.textContent || '';
    const hasHashtagTitle = rowText.includes('#####') || rowText.includes('##################################################');
    const hasModText = rowText.includes('Removed for violations') || rowText.includes('Your audio was moderated');

    const svgs = row.querySelectorAll('svg');
    let hasModSvg = false;
    for (const svg of svgs) {
      const html = svg.outerHTML.toLowerCase();
      // Word-boundary match so "clock", "block", "banner" etc. are NOT mistaken for ban/lock icons
      if (/\b(ban|prohibited|lock|circle-slash)\b/.test(html) || html.includes('d="m12 2a10 10')) {
        hasModSvg = true;
        break;
      }
    }

    const imgs = row.querySelectorAll('img');
    let hasUnapprovedImg = false;
    for (const img of imgs) {
      const src = img.src || '';
      if (src.includes('UnapprovedImage') || src.includes('moderated')) {
        hasUnapprovedImg = true;
        break;
      }
    }

    // LOW = only rename needed (##### title), FATAL = fully blocked/removed
    if (hasHashtagTitle && !hasModText && !hasUnapprovedImg && !hasModSvg) {
      return { level: 'LOW', reason: 'Judul ter-moderasi — hanya perlu ganti nama' };
    }
    if (hasModText || hasUnapprovedImg || hasModSvg) {
      return { level: 'FATAL', reason: 'Audio diblokir/dihapus oleh sistem Roblox' };
    }
    return null;
  }

  function isRowModerated(row) {
    return getRowModerationLevel(row) !== null;
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
        const idBtn = row.querySelector('button[aria-label*="Asset ID"]');
        if (idBtn) {
          const btnMatch = idBtn.getAttribute('aria-label').match(/\d{8,20}/);
          if (btnMatch) soundId = btnMatch[0];
        }
      }

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
        const modLevel = getRowModerationLevel(row);
        let thumbUrl = "";
        const rowImg = row.querySelector('img');
        if (rowImg && rowImg.src && !rowImg.src.includes('UnapprovedImage') && !rowImg.src.includes('moderated')) {
          thumbUrl = rowImg.src;
        }

        const item = {
          soundId: soundId,
          soundTitle: title || `Audio ${soundId}`,
          soundThumbnail: thumbUrl,
          moderated: modLevel !== null,
          moderationLevel: modLevel ? modLevel.level : null,
          moderationReason: modLevel ? modLevel.reason : null
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

  // Next Page Button Finder (Matches Roblox Foundation UI & MUI Table Pagination)
  function getNextPageButton() {
    const selectors = [
      'button[aria-label="Next page"]',
      'button[aria-label="Go to next page"]',
      'button[title="Go to next page"]',
      'button[aria-label*="next" i]',
      '.MuiPaginationItem-next',
      '.MuiTablePagination-actions button:last-child'
    ];

    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !isButtonDisabled(btn)) {
        return btn;
      }
    }

    const allButtons = Array.from(document.querySelectorAll('button'));
    for (const btn of allButtons) {
      const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      if ((aria.includes('next page') || title.includes('next page')) && !isButtonDisabled(btn)) {
        return btn;
      }
    }

    return null;
  }

  // Check and click First Page button if not on Page 1
  async function resetToFirstPage() {
    const selectors = [
      'button[aria-label="First page"]',
      'button[aria-label="Go to first page"]',
      'button[aria-label="Go to previous page"]',
      'button[title="Go to previous page"]',
      '.MuiTablePagination-actions button:first-child'
    ];

    let prevBtn = null;
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !isButtonDisabled(btn)) {
        prevBtn = btn;
        break;
      }
    }

    if (prevBtn) {
      log("Kembali ke Halaman Pertama (First Page)...");
      while (prevBtn && !isButtonDisabled(prevBtn)) {
        simulateClick(prevBtn);
        await iWait(1500);
        prevBtn = document.querySelector(selectors[0]) || document.querySelector(selectors[1]) || document.querySelector(selectors[2]);
      }
      await iWait(1000);
      await waitForElement('table tbody tr', 10000);
    }
  }

  // Scan All Pages Function (Scans ALL pages on creations table)
  async function scanAllPages(mode) {
    log("=== MEMULAI PEMINDAIAN SELURUH HALAMAN AUDIO ===");
    await waitForElement('table, [role="table"]', 15000);
    await iWait(1000);

    // Reset to page 1 first if on another page
    await resetToFirstPage();

    let allClean = [];
    let allModerated = [];
    let page = 1;

    while (true) {
      await waitIfPaused();
      const stateCheck = await new Promise(resolve => chrome.storage.local.get(['rbx_auto_active'], resolve));
      if (!stateCheck.rbx_auto_active) { log('Scan dihentikan.'); return; }

      const { cleanData, moderatedData } = scanAudioData();
      log(`Halaman ${page}: Ditemukan ${cleanData.length} audio lulus, ${moderatedData.length} audio ter-moderasi`);

      cleanData.forEach(item => {
        const id = item.soundId || item.sound_id;
        if (!allClean.some(x => (x.soundId || x.sound_id) === id)) allClean.push(item);
      });
      moderatedData.forEach(item => {
        const id = item.soundId || item.sound_id;
        if (!allModerated.some(x => (x.soundId || x.sound_id) === id)) allModerated.push(item);
      });

      const nextBtn = getNextPageButton();
      if (!nextBtn) {
        log(`Paginasi selesai: Total ${page} halaman telah dipindai ✔`);
        break;
      }

      log(`Pindah ke Halaman ${page + 1}...`);
      simulateClick(nextBtn);
      page++;
      await iWait(2500);
      await waitForElement('table tbody tr, [role="row"]', 10000);
      await iWait(800);
    }

    const fatalCount = allModerated.filter(d => d.moderationLevel === 'FATAL').length;
    const lowCount = allModerated.filter(d => d.moderationLevel === 'LOW').length;

    log(`================================================`);
    log(`SCAN SELESAI: ${allClean.length} Lulus | ${allModerated.length} Moderasi (${page} hal.)`);
    log(`⛔ FATAL: ${fatalCount} | ⚠️ LOW (ganti nama): ${lowCount}`);
    log(`================================================`);

    const targetIds = (mode === 'archive_moderated') ?
                      allModerated.map(d => d.soundId) :
                      allClean.map(d => d.soundId);

    await chrome.storage.local.set({
      rbx_ids: targetIds,
      rbx_audio_data: allClean,
      rbx_moderated_data: allModerated,
      rbx_thumb_failed: [],
      rbx_exp_failed: [],
      rbx_index: 0,
      rbx_mode: mode,
      rbx_needs_rescan: false
    });

    if (mode === 'scan') {
      await chrome.storage.local.set({ rbx_auto_active: false });
      alert(`SCAN SELESAI ✔\nTotal Halaman: ${page}\nAudio Lulus: ${allClean.length}\n\n⛔ FATAL (diblokir/dihapus): ${fatalCount}\n⚠️ LOW (perlu ganti nama): ${lowCount}\n\nBuka Extension Popup > View JSON untuk detail.`);
      return;
    }

    if (targetIds.length > 0) {
      log(`Mulai proses ${targetIds.length} lagu [mode: ${mode}]...`);
      await iWait(1000);
      if (mode === 'archive_moderated') {
        await processArchiveModerated(allModerated);
      } else {
        const settings = await new Promise(resolve => chrome.storage.local.get(['rbx_include_thumb', 'rbx_thumb_data'], resolve));
        const firstPage = (mode === 'thumbnail' || (settings.rbx_include_thumb && settings.rbx_thumb_data)) ? 'configure' : 'permissions';
        navigateTo(`https://create.roblox.com/dashboard/creations/store/${targetIds[0]}/${firstPage}`);
      }
    } else {
      await chrome.storage.local.set({ rbx_auto_active: false });
      log(`Tidak ada ID lagu untuk diproses pada mode ${mode}!`);
      alert(`Tidak ada lagu yang memerlukan proses pada mode ${mode}!`);
    }
  }

  // Navigate to Next Track Helper
  async function goToNextTrack(currentIndex, ids) {
    checkAbort();
    await waitIfPaused();
    const nextIndex = currentIndex + 1;
    await chrome.storage.local.set({ rbx_index: nextIndex });
    // Slightly longer gap between tracks to avoid Roblox rate limiting ("Oh noes!" pages)
    await iWait(1500);
    checkAbort();

    if (nextIndex < ids.length) {
      const nextId = ids[nextIndex];
      const settings = await new Promise(resolve => chrome.storage.local.get(['rbx_mode', 'rbx_include_thumb', 'rbx_thumb_data'], resolve));
      const mode = settings.rbx_mode || 'both';
      const targetPage = (mode === 'thumbnail' || (settings.rbx_include_thumb && settings.rbx_thumb_data)) ? 'configure' : 'permissions';
      log(`[${nextIndex + 1}/${ids.length}] Otomatis berpindah ke lagu selanjutnya (ID: ${nextId})...`);
      navigateTo(`https://create.roblox.com/dashboard/creations/store/${nextId}/${targetPage}`);
    } else {
      await chrome.storage.local.set({ rbx_auto_active: false });
      const failData = await new Promise(resolve => chrome.storage.local.get(['rbx_thumb_failed', 'rbx_404_ids', 'rbx_exp_failed'], resolve));
      const failed = failData.rbx_thumb_failed || [];
      const skipped404 = failData.rbx_404_ids || [];
      const expFailed = failData.rbx_exp_failed || [];
      log(`============================`);
      log(`SEMUA LAGU SELESAI DIPROSES (${ids.length} Audio) ✔`);
      if (failed.length > 0) log(`⚠️ Thumbnail GAGAL (${failed.length}): ${failed.join(', ')}`);
      if (skipped404.length > 0) log(`🚧 Terlewat karena error/404 (${skipped404.length}): ${skipped404.join(', ')}`);
      if (expFailed.length > 0) log(`⚠️ Universe GAGAL terverifikasi (${expFailed.length}): ${expFailed.join(', ')}`);
      log(`============================`);
      let msg = `SEMUA LAGU SELESAI DIPROSES ✔\nTotal: ${ids.length} audio.`;
      if (failed.length > 0) msg += `\n\n⚠️ Thumbnail gagal: ${failed.length} audio (ID ada di Live Logs).`;
      if (expFailed.length > 0) msg += `\n⚠️ Universe gagal terverifikasi: ${expFailed.length} audio (ID ada di Live Logs).`;
      if (skipped404.length > 0) msg += `\n🚧 Terlewat error/404: ${skipped404.length} audio.`;
      alert(msg);
    }
  }

  // === AUTO ARCHIVE via Roblox API + DOM Fallback ===
  async function getCsrfToken() {
    try {
      const res = await fetch('https://auth.roblox.com/v2/logout', {
        method: 'POST',
        credentials: 'include'
      });
      const token = res.headers.get('x-csrf-token');
      if (token) return token;
    } catch (e) {}
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content');
    return null;
  }

  async function archiveRowBySoundId(soundId) {
    log(`Mencoba archive via API untuk ID: ${soundId}...`);
    try {
      const csrfToken = await getCsrfToken();
      if (csrfToken) {
        const res = await fetch(`https://develop.roblox.com/v1/assets/${soundId}/archive`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-TOKEN': csrfToken, 'Content-Type': 'application/json' }
        });
        if (res.ok) {
          log(`[API] Berhasil diarsip: ID ${soundId} (${res.status})`);
          return true;
        }
        if (res.status === 403) {
          const newToken = res.headers.get('x-csrf-token');
          if (newToken) {
            const retry = await fetch(`https://develop.roblox.com/v1/assets/${soundId}/archive`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'X-CSRF-TOKEN': newToken, 'Content-Type': 'application/json' }
            });
            if (retry.ok) {
              log(`[API Retry] Berhasil diarsip: ID ${soundId}`);
              return true;
            }
          }
        }
        const res2 = await fetch(`https://apis.roblox.com/assets/v1/assets/${soundId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'X-CSRF-TOKEN': csrfToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({ archiveStatus: 'Archived' })
        });
        if (res2.ok) {
          log(`[API v2] Berhasil diarsip: ID ${soundId}`);
          return true;
        }
      }
    } catch (err) {
      log(`Error archive API untuk ID ${soundId}: ${err.message}`);
    }

    log(`API archive tidak berhasil/gagal, mencoba via DOM untuk ID: ${soundId}...`);
    const rows = document.querySelectorAll('table tbody tr, [role="row"]');
    for (const row of rows) {
      const rowText = row.textContent || '';
      const hasId = rowText.includes(soundId) ||
                    Array.from(row.querySelectorAll('a[href]')).some(a => a.href.includes(soundId));

      if (!hasId) continue;

      log(`Baris ditemukan untuk ID ${soundId}, melakukan hover...`);

      // Force hover on the row — the 3-dots button is CSS-invisible until hover
      row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
      row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      row.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, cancelable: true }));

      // Also hover on the last cell where the button lives
      const cells = row.querySelectorAll('td, [role="cell"]');
      const lastCell = cells.length > 0 ? cells[cells.length - 1] : row;
      lastCell.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      lastCell.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

      await iWait(400);

      // Find 3-dots button by icon class
      let moreBtn = lastCell.querySelector('button .icon-filled-three-dots-vertical')?.closest('button') ||
                    lastCell.querySelector('[class*="three-dots"]')?.closest('button') ||
                    lastCell.querySelector('button[aria-haspopup="dialog"]') ||
                    lastCell.querySelector('button');

      if (!moreBtn) {
        const presentationDivs = lastCell.querySelectorAll('[role="presentation"] button, div button');
        for (const btn of presentationDivs) {
          if (btn.querySelector('[class*="three-dots"]') || btn.querySelector('.icon-filled-three-dots-vertical')) {
            moreBtn = btn;
            break;
          }
        }
      }

      if (!moreBtn) {
        const allBtns = lastCell.querySelectorAll('button');
        if (allBtns.length > 0) moreBtn = allBtns[allBtns.length - 1];
      }

      if (!moreBtn) {
        log(`⚠️ Tidak menemukan tombol 3-dots pada baris ID ${soundId}`);
        return false;
      }

      log(`Mengeklik tombol 3-dots (ID: ${soundId})...`);
      moreBtn.style.visibility = 'visible';
      moreBtn.style.opacity = '1';
      simulateClick(moreBtn);
      await iWait(1200);

      let archiveMenuItem = null;
      const menuSearchRoots = [
        document,
        ...Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [data-radix-portal], #radix-portal'))
      ];

      for (const root of menuSearchRoots) {
        const candidates = root.querySelectorAll('[role="menuitem"], [role="option"], [data-radix-collection-item], li, button');
        for (const el of candidates) {
          const txt = el.textContent?.trim() || '';
          if (txt === 'Archive' || (txt.startsWith('Archive') && txt.length < 20)) {
            archiveMenuItem = el;
            break;
          }
        }
        if (archiveMenuItem) break;
      }

      if (!archiveMenuItem) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let node;
        while ((node = walker.nextNode())) {
          if (node.children.length === 0) {
            const txt = node.textContent?.trim() || '';
            if (txt === 'Archive') {
              archiveMenuItem = node.closest('[role="menuitem"], li, button') || node;
              break;
            }
          }
        }
      }

      if (archiveMenuItem) {
        log(`Mengeklik menu "Archive" untuk ID ${soundId}...`);
        simulateClick(archiveMenuItem);
        await iWait(1200);

        const confirmSelectors = [
          '[role="dialog"] button',
          '[data-state="open"] button',
          '.MuiDialogActions-root button',
          '[data-radix-dialog-content] button'
        ];

        for (const sel of confirmSelectors) {
          const btns = document.querySelectorAll(sel);
          for (const btn of btns) {
            const btnText = btn.textContent?.trim() || '';
            if (btnText === 'Archive' || btnText.toLowerCase().includes('archive')) {
              simulateClick(btn);
              log(`✔ Konfirmasi Archive diklik (ID: ${soundId})`);
              await iWait(1200);
              return true;
            }
          }
        }

        log(`⚠️ Dialog konfirmasi Archive tidak muncul untuk ID ${soundId}`);
        return true;
      } else {
        log(`⚠️ Menu "Archive" tidak ditemukan setelah klik 3-dots (ID: ${soundId})`);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await iWait(300);
        return false;
      }
    }

    log(`⚠️ Baris dengan ID ${soundId} tidak ditemukan di tabel`);
    return false;
  }

  async function processArchiveModerated(moderatedList) {
    // Only archive FATAL moderated audio (LOW just needs rename, not archive)
    const fatalList = moderatedList.filter(t => t.moderationLevel === 'FATAL' || !t.moderationLevel);
    log(`Mulai Mengarsip ${fatalList.length} Audio Moderasi FATAL dari ${moderatedList.length} total...`);
    for (let i = 0; i < fatalList.length; i++) {
      await waitIfPaused();
      const stateCheck = await new Promise(resolve => chrome.storage.local.get(['rbx_auto_active'], resolve));
      if (!stateCheck.rbx_auto_active) { log('Archive dihentikan.'); return; }

      const track = fatalList[i];
      const trackName = track.soundTitle || track.title || track.soundId || track.sound_id;
      const trackId = track.soundId || track.sound_id;
      log(`[${i + 1}/${fatalList.length}] Mengarsip: ${trackName} (ID: ${trackId})`);
      const success = await archiveRowBySoundId(trackId);
      if (success) {
        log(`✔ Berhasil Diarsip: ${trackId}`);
      } else {
        log(`⚠️ Gagal diarsip untuk ID: ${trackId}`);
      }
      await iWait(1200);
    }
    await chrome.storage.local.set({ rbx_auto_active: false });
    log("Proses Arsip Audio Moderasi Selesai ✔");
    const lowList = moderatedList.filter(t => t.moderationLevel === 'LOW');
    let msg = `PROSES ARSIP SELESAI ✔\nTotal ${fatalList.length} audio FATAL diarsip.`;
    if (lowList.length > 0) {
      msg += `\n\n⚠️ ${lowList.length} audio LOW tidak diarsip (hanya perlu ganti nama).`;
    }
    alert(msg);
  }

  // Close Modal Dialog Helper (Clicks 'Done' / 'Close' on open dialogs)
  function closeModalDialog(label = 'Done') {
    const dialogs = document.querySelectorAll('[role="dialog"], [data-testid*="modal"], .MuiDialog-root');
    const root = dialogs.length > 0 ? dialogs[dialogs.length - 1] : document;

    const buttons = root.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (text === label || text === 'Done' || text === 'Close' || text === 'Selesai' ||
          text.toLowerCase() === 'done' || text.toLowerCase() === 'close' ||
          ariaLabel === 'close' || ariaLabel === 'done') {
        try {
          if (!isButtonDisabled(btn)) {
            simulateClick(btn);
            log(`Tombol '${text || ariaLabel}' pada dialog diklik ✔`);
            return true;
          }
        } catch(e){}
      }
    }
    return false;
  }

  async function waitDialogClose() {
    for (let i = 0; i < 8; i++) {
      await iWait(250);
      const openDialog = document.querySelector('[data-testid="add-collaborators-modal"], [data-testid="add-experiences-modal"], [role="dialog"]');
      if (!openDialog) return true;
    }
    closeModalDialog('Done');
    await iWait(300);
    return true;
  }

  // Find the Save Changes button (or null)
  function getSaveButton() {
    const byTestId = document.querySelector('button[data-testid="save-button"]');
    if (byTestId) return byTestId;
    for (const btn of document.querySelectorAll('button')) {
      const text = (btn.textContent?.trim() || '').toLowerCase();
      if (text.includes('save changes') || text.includes('simpan perubahan') || text === 'save' || text === 'simpan') {
        return btn;
      }
    }
    return null;
  }

  async function clickSaveChanges() {
    await iWait(300);
    const btn = getSaveButton();
    if (btn) {
      if (isButtonDisabled(btn)) {
        log('Save Changes tidak aktif (sudah tersimpan) ✔');
        return true;
      }
      simulateClick(btn);
      log(`Tombol "${btn.textContent?.trim()}" diklik ✔`);
      await iWait(1500);
      return true;
    }
    return true;
  }

  // DataURL to File Object Converter
  function dataURLtoFile(dataurl, filename = 'thumbnail.png') {
    try {
      const arr = dataurl.split(',');
      const mime = (arr[0].match(/:(.*?);/) || [])[1] || 'image/png';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (e) {
      log(`Gagal konversi DataURL: ${e.message}`);
      return null;
    }
  }

  // Wait until a file input exists on the configure page (SPA renders it late)
  function queryThumbFileInput() {
    return document.querySelector('input[type="file"]') ||
           document.querySelector('[class*="uploadButton"] input') ||
           document.querySelector('input[accept*="image"]');
  }

  async function findThumbFileInput() {
    const start = Date.now();
    while (Date.now() - start < 8000) {
      const inp = queryThumbFileInput();
      if (inp) return inp;
      await iWait(300);
    }
    // Fallback: some UIs only mount the input after clicking an Upload button
    const uploadBtns = Array.from(document.querySelectorAll('button')).filter(b => {
      const txt = (b.textContent?.trim() || '').toLowerCase();
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      // Tombol bernama "Upload" (belum ada thumbnail) atau "Change" (sudah ada thumbnail)
      return txt === 'upload' || txt === 'change' || aria.includes('upload') || aria.includes('change image');
    });
    for (const btn of uploadBtns) {
      simulateClick(btn);
      await iWait(800);
      const inp = queryThumbFileInput();
      if (inp) return inp;
    }
    const nm = document.querySelector('textarea#name, input#name');
    log(`🔎 Diagnostik: input[file]=${document.querySelectorAll('input[type="file"]').length}, nama=${nm ? '"' + nm.value.slice(0, 30) + '"' : 'TIDAK ADA'}, tombol=${document.querySelectorAll('button').length}, judul="${(document.title || '').slice(0, 40)}", path=${location.pathname}`);
    return null;
  }

  // One upload attempt. Returns true ONLY if Save Changes was enabled, clicked, and finished.
  async function attemptThumbnailUpload(file, soundId) {
    // Tandai notifikasi (snackbar) yang SUDAH ada sebagai "basi", supaya notifikasi sukses
    // dari lagu sebelumnya tidak dianggap sebagai tanda upload lagu ini selesai.
    document.querySelectorAll('.MuiSnackbar-root').forEach(el => el.setAttribute('data-rbx-stale', '1'));

    const fileInput = await findThumbFileInput();
    if (!fileInput) {
      log(`⚠️ Elemen upload file tidak ditemukan (ID: ${soundId})`);
      return false;
    }

    log(`Menyematkan file thumbnail: ${file.name} (${Math.round(file.size / 1024)} KB)...`);
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    // Wait for the page to accept the file → Save Changes becomes enabled
    let saveBtn = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const b = getSaveButton();
      if (b && !isButtonDisabled(b)) { saveBtn = b; break; }
      await iWait(300);
    }
    if (!saveBtn) {
      log(`⚠️ Save Changes tidak aktif setelah memilih file (ID: ${soundId})`);
      return false;
    }

    await iWait(600);
    simulateClick(saveBtn);
    log(`Menyimpan thumbnail (ID: ${soundId})...`);

    // Tunggu notifikasi "Changes saved successfully." — tombol Save ikut disabled saat
    // proses upload masih berjalan, jadi tombol TIDAK boleh dipakai sebagai tanda selesai.
    let saved = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 40000) {
      checkAbort();
      // Hanya hitung notifikasi BARU (bukan yang sudah ditandai basi sebelum klik Save)
      const okMsg = document.querySelector('.MuiSnackbar-root:not([data-rbx-stale]) [data-testid="update-success-message"]');
      if (okMsg) {
        saved = true;
        break;
      }
      const snack = document.querySelector('.MuiSnackbar-root:not([data-rbx-stale]) .MuiSnackbarContent-root');
      const snackText = (snack?.textContent || '').trim();
      if (snackText && /fail|error|unable|could not|try again|too large|invalid/i.test(snackText)) {
        log(`⚠️ Roblox menolak thumbnail: "${snackText.slice(0, 80)}" (ID: ${soundId})`);
        return false;
      }
      await iWait(400);
    }
    if (!saved) {
      // Cadangan: kalau Roblox memakai ulang elemen notifikasi lama, terima hasil
      // bila pesan sukses ada dan tombol Save sudah nonaktif setelah 40 detik.
      const anyOk = document.querySelector('[data-testid="update-success-message"]');
      const b = getSaveButton();
      if (anyOk && (!b || isButtonDisabled(b))) {
        log(`ℹ️ Notifikasi memakai elemen lama, dianggap sukses setelah 40 detik (ID: ${soundId})`);
        saved = true;
      } else {
        log(`⚠️ Notifikasi sukses tidak muncul dalam 40 detik (ID: ${soundId})`);
        return false;
      }
    }

    // Beri jeda singkat sebelum pindah halaman
    await iWait(1500);
    return true;
  }

  // Audio Thumbnail Uploader via Configuration Page (3 attempts, verified)
  async function uploadAudioThumbnail(soundId, thumbDataUrl, thumbName) {
    log(`── [THUMBNAIL UPLOAD v10.12 (ID: ${soundId})] ──`);
    if (!thumbDataUrl) {
      log(`⚠️ Data thumbnail tidak ditemukan`);
      return false;
    }

    const file = dataURLtoFile(thumbDataUrl, thumbName || 'thumbnail.png');
    if (!file) {
      log(`⚠️ Gagal memproses file gambar thumbnail`);
      return false;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      checkAbort();
      await waitIfPaused();
      try {
        const ok = await attemptThumbnailUpload(file, soundId);
        if (ok) {
          log(`✔ Thumbnail berhasil diperbarui (ID: ${soundId})`);
          return true;
        }
      } catch (err) {
        if (isAbort(err)) throw err;
        log(`Error upload thumbnail (ID: ${soundId}): ${err.message}`);
      }
      if (attempt < 3) {
        log(`🔄 Upload thumbnail percobaan ${attempt}/3 gagal, coba lagi...`);
        await iWait(2000);
      }
    }
    return false;
  }

  // Collaborators Tab Logic
  async function switchToCollaboratorsTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Collaborators[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Collaborators'));
      if (tab) { simulateClick(tab); await iWait(1000); return true; }
      return false;
    });
  }

  async function openCollaboratorsDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add collaborators') || text.includes('+ Add collaborators')) {
          simulateClick(btn);
          await iWait(1000);
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
    }, 10, 300);
  }

  async function waitDropdown(timeout = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const opts = document.querySelectorAll(
        '[role="listbox"] [role="option"], [role="option"], .MuiAutocomplete-option, [data-testid="autocomplete-option"], .foundation-web-menu-item'
      );
      if (opts.length > 0) return opts;
      await iWait(250);
    }
    return null;
  }

  async function selectUser(username) {
    const opts = document.querySelectorAll(
      '[role="listbox"] [role="option"], [role="option"], .MuiAutocomplete-option, [data-testid="autocomplete-option"], .foundation-web-menu-item'
    );
    for (const opt of opts) {
      if (opt.textContent?.toLowerCase().includes(username.toLowerCase())) {
        simulateClick(opt);
        await iWait(500);
        return true;
      }
    }
    return false;
  }

  async function processCollaborators(usernames) {
    log("── [COLLABORATORS] ──");
    await waitForElement('button#Collaborators[role="tab"], button[role="tab"]', 15000);
    await iWait(600);

    await switchToCollaboratorsTab();
    await iWait(600);

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

      // Find input using document-wide search (handles React portal rendering)
      // Placeholder: "Search for a friend or group"
      let input = findDialogInput(['friend', 'group', 'search']);
      if (!input) {
        // Broader fallback
        input = document.querySelector('[role="dialog"] input:not([type="hidden"]), [data-testid*="modal"] input:not([type="hidden"])');
      }
      if (!input) { log("Input username tidak ditemukan"); continue; }
      log(`Input ditemukan: placeholder="${input.placeholder}"`);

      const filled = await fillInput(input, username);
      if (!filled) { log(`Gagal mengisi input untuk ${username}`); continue; }
      await iWait(600);

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
      await iWait(500);
    }

    closeModalDialog('Done');
    await waitDialogClose();
    await iWait(500);

    if (addedCount > 0) {
      // Tandai notifikasi lama sebagai basi sebelum klik Save
      document.querySelectorAll('.MuiSnackbar-root').forEach(el => el.setAttribute('data-rbx-stale', '1'));
      await clickSaveChanges();
      const res = await waitPermissionAlert(20000);
      if (res.ok === true) {
        log(`✔ Collaborators berhasil disimpan (${addedCount} ditambahkan)`);
      } else if (res.ok === false) {
        log(`⚠️ Notifikasi error Collaborators: "${res.text.slice(0, 80)}"`);
      } else {
        log(`ℹ️ Collaborators selesai (${addedCount} ditambahkan) ✔`);
      }
    } else {
      await clickSaveChanges();
      await iWait(800);
      log(`Collaborators selesai (${addedCount} ditambahkan) ✔`);
    }
    return true;
  }

  // Experiences Tab Logic
  async function switchToExperiencesTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Experiences[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Experiences'));
      if (tab) { simulateClick(tab); await iWait(1000); return true; }
      return false;
    });
  }

  async function openExperiencesDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add experiences')) {
          simulateClick(btn); await iWait(1200); return true;
        }
      }
      return false;
    });
  }

  // Membaca status baris universe di tabel dialog "Add Experiences".
  //   'already' = tombol "Already added" (sudah pernah ditambahkan, tidak ada notifikasi saat Done)
  //   'new'     = tombol "Remove" (baru diusulkan, perlu Done + Save)
  //   null      = status tidak terbaca
  async function detectExperienceRowState(universeId, timeout = 8000) {
    const idStr = String(universeId);
    const readState = (rows) => {
      const texts = [];
      for (const row of rows) {
        for (const b of row.querySelectorAll('button')) {
          texts.push((b.textContent || '').trim().toLowerCase());
        }
      }
      if (texts.some(t => t.includes('remove'))) return 'new';
      if (texts.some(t => t.includes('already added'))) return 'already';
      return null;
    };

    const start = Date.now();
    while (Date.now() - start < timeout) {
      checkAbort();
      const rows = Array.from(document.querySelectorAll('[data-testid="experiences-table"] tr'));
      // Utamakan baris yang memuat ID universe yang kita masukkan
      const matched = rows.filter(r => (r.textContent || '').includes(idStr));
      const s1 = readState(matched);
      if (s1) return s1;
      // Cadangan: bila ID tidak tampil di baris, baca seluruh tabel
      if (matched.length === 0) {
        const s2 = readState(rows);
        if (s2) return s2;
      }
      await iWait(300);
    }
    return null;
  }

  // Satu percobaan menambah Universe ID. Return true HANYA jika notifikasi sukses terverifikasi.
  async function processExperiencesOnce(universeId) {
    if (!universeId) {
      log("Universe ID kosong, dilewati");
      return true;
    }
    log("── [EXPERIENCES] ──");
    // Tandai notifikasi lama sebagai "basi" agar tidak dihitung sebagai hasil percobaan ini
    document.querySelectorAll('.MuiSnackbar-root').forEach(el => el.setAttribute('data-rbx-stale', '1'));
    await switchToExperiencesTab();
    await iWait(800);

    // NOTE: We do NOT check alreadyExistsExperience() here.
    // Roblox hides added experiences from the UI, so we always attempt to add.
    const opened = await openExperiencesDialog();
    if (!opened) { log("Gagal membuka dialog Experiences"); return false; }

    // Wait for dialog to appear
    await waitForElement('[role="dialog"], [data-testid*="modal"]', 10000);
    await iWait(600);
    log("Dialog Experiences terbuka ✔");

    // Find input: placeholder is "Enter experience IDs"
    let input = findDialogInput(['experience', 'Enter experience', 'experience IDs']);
    if (!input) {
      // wait a bit more and retry
      await iWait(800);
      input = findDialogInput(['experience', 'Enter', 'IDs']);
    }
    if (!input) {
      input = document.querySelector('[role="dialog"] input:not([type="hidden"]), [data-testid*="modal"] input:not([type="hidden"])');
    }
    if (!input) { log("⚠️ Input experience tidak ditemukan"); return false; }
    log(`Input ditemukan: placeholder="${input.placeholder}"`);

    // Fill the input
    const filled = await fillInput(input, String(universeId));
    log(`Universe ID ${filled ? 'berhasil' : 'GAGAL'} dimasukkan: "${input.value}"`);
    await iWait(800);

    // Find the Add button — in Experiences dialog it is a sibling button next to the input (not inside dialog subtree always)
    log("Menunggu tombol Add aktif...");
    let addBtn = null;
    const addStart = Date.now();
    while (Date.now() - addStart < 8000) {
      // Search in dialog and also in entire document for the Add button
      const searchRoots = [
        ...document.querySelectorAll('[role="dialog"], [data-testid*="modal"]'),
        document
      ];
      for (const root of searchRoots) {
        for (const btn of root.querySelectorAll('button')) {
          const txt = (btn.textContent?.trim() || '').toLowerCase();
          if (txt === 'add' && !isButtonDisabled(btn)) {
            addBtn = btn;
            break;
          }
        }
        if (addBtn) break;
      }
      if (addBtn) break;
      await iWait(300);
    }

    if (addBtn) {
      simulateClick(addBtn);
      log("Tombol Add diklik ✔");
    } else {
      log("⚠️ Tombol Add tidak aktif/tidak ditemukan — coba Enter sebagai fallback");
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    }
    await iWait(1000);

    // Cek status baris universe di tabel dialog:
    //  - "Already added" → sudah pernah ditambahkan; tidak ada yang perlu disimpan
    //    dan TIDAK ada notifikasi → langsung SKIP.
    //  - "Remove"        → baru diusulkan → lanjut Done + Save + verifikasi notifikasi.
    const rowState = await detectExperienceRowState(universeId, 8000);
    if (rowState === 'already') {
      log(`⚡ SKIP: Universe ${universeId} sudah ditambahkan sebelumnya (Already added) ✔`);
      closeModalDialog('Done');
      await iWait(800);
      await waitDialogClose();
      await iWait(400);
      return true;
    }
    if (rowState === 'new') {
      log(`Universe ${universeId} baru (tombol Remove) — lanjut simpan...`);
    } else {
      log(`⚠️ Status baris universe tidak terbaca, lanjut simpan & verifikasi notifikasi`);
    }

    closeModalDialog('Done');
    await iWait(800);
    await waitDialogClose();
    await iWait(600);
    await clickSaveChanges();

    // Verifikasi lewat notifikasi "Changes Saved — Permission given to N Experience"
    const res = await waitPermissionAlert(20000);
    if (res.ok === true) {
      // Angka di notifikasi (mis. "1 Experience") hanya jumlah universe yang ditambahkan, tidak dipakai untuk verifikasi
      log(`Experiences selesai ✔ — notifikasi: "${res.text.replace(/\s+/g, ' ').slice(0, 80)}"`);
      return true;
    }
    if (res.ok === false) {
      log(`⚠️ Notifikasi ERROR saat menambah Experience: "${res.text.replace(/\s+/g, ' ').slice(0, 80)}"`);
      return false;
    }
    log("⚠️ Notifikasi sukses Experiences tidak muncul dalam 20 detik");
    return false;
  }

  // Menunggu notifikasi (MUI Alert) hasil simpan di halaman Permissions.
  // Hanya membaca notifikasi BARU (yang belum ditandai data-rbx-stale).
  async function waitPermissionAlert(timeout = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      checkAbort();
      const alerts = document.querySelectorAll('.MuiSnackbar-root:not([data-rbx-stale]) .MuiAlert-root');
      for (const a of alerts) {
        const txt = (a.textContent || '').trim();
        const cls = typeof a.className === 'string' ? a.className : '';
        if (cls.includes('MuiAlert-colorError') || /fail|error|unable|could not|try again|invalid/i.test(txt)) {
          return { ok: false, text: txt };
        }
        if (/changes saved|permission given/i.test(txt)) {
          return { ok: true, text: txt };
        }
      }
      await iWait(300);
    }
    return { ok: null, text: '' };
  }

  // Menambah satu atau lebih Universe ID, diulang sampai 3 kali per ID.
  async function processExperiences(universeIdOrIds) {
    // Normalisasi: selalu jadikan array
    const universeIds = Array.isArray(universeIdOrIds)
      ? universeIdOrIds.filter(Boolean)
      : (universeIdOrIds ? [String(universeIdOrIds).trim()].filter(Boolean) : []);

    if (universeIds.length === 0) {
      log("Universe ID kosong, dilewati");
      return true;
    }

    let allOk = true;
    for (const universeId of universeIds) {
      log(`── [EXPERIENCES] Proses Universe ID: ${universeId} ──`);
      let ok = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        checkAbort();
        await waitIfPaused();
        // Mark old snackbars as stale before each attempt
        document.querySelectorAll('.MuiSnackbar-root').forEach(el => el.setAttribute('data-rbx-stale', '1'));
        ok = await processExperiencesOnce(universeId);
        if (ok) break;
        if (attempt < 3) {
          log(`🔄 Experiences Universe ${universeId} belum terverifikasi, ulangi (${attempt}/3)...`);
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await iWait(2000);
        }
      }
      if (!ok) {
        const m = window.location.href.match(/store\/(\d+)\//);
        const curId = m ? m[1] : 'unknown';
        log(`❌ Experiences GAGAL terverifikasi untuk Universe ${universeId} (Audio ID: ${curId})`);
        const fd = await new Promise(resolve => chrome.storage.local.get(['rbx_exp_failed'], resolve));
        const list = fd.rbx_exp_failed || [];
        if (!list.includes(curId)) list.push(curId);
        await chrome.storage.local.set({ rbx_exp_failed: list });
        allOk = false;
      }
    }
    return allOk;
  }

  // ── Clean Name: comprehensive regex engine v2 ───────────────────────────
  function cleanAudioName(rawName) {
    if (!rawName) return rawName;
    let name = rawName;

    // 1. Remove leading track / index numbering e.g. '01 - ', '01. ', 'Track 01 - ', '#01 '
    name = name.replace(/^\s*(?:track\s*|disc\s*|cd\s*|no\.?\s*|side\s*[ab]\s*|vol(?:ume)?\.?\s*\d+\s*|#)?\s*\d{1,3}\s*[-–_.:|\s]\s*/i, '');

    // 2. Remove URLs & domains
    name = name.replace(/https?:\/\/\S+/gi, '');
    name = name.replace(/(?:www\.|bit\.ly|youtu\.be|tinyurl\.com|linktr\.ee|tiktok\.com)\S*/gi, '');

    // 3. Remove hashtags and @mentions
    name = name.replace(/#[a-z0-9_]+/gi, '');
    name = name.replace(/@[a-z0-9_]+/gi, '');

    // 4. Bracketed content tags - remove entire bracket if it contains any known media/promo tag
    const bracketKeywords = [
      // Video / Audio labels
      'official', 'officiel', 'oficial', 'video', 'audio', 'music\\s*video', 'mv', 'm\\/v',
      'visualizer', 'clip', 'videoclip', 'lyric\\s*(?:video|clip)?', 'lyrics?', 'lyrical',
      'performance', 'live\\s*(?:at|session|performance|version)?', 'concert', 'tour', 'unplugged', 'acoustic(?:\\s*version)?',
      // Quality & formats
      'hq', 'hd', '4k', '8k', '1080p', '720p', '480p', '360p', '60fps',
      '320\\s*kbps', '256\\s*kbps', '192\\s*kbps', '128\\s*kbps', '64\\s*kbps',
      'flac', 'wav', 'mp3', 'aac', 'ogg', 'opus', 'lossless', 'hi-?res',
      // Version / editions
      'full\\s*(?:album|version|song|track|length|audio)',
      'extended\\s*(?:version|mix|cut)?', "director'?s?\\s*cut",
      'radio\\s*(?:edit|version|mix)', 'album\\s*version', 'single\\s*version',
      'original\\s*mix', 'club\\s*(?:mix|version)',
      'remaster(?:ed)?(?:\\s*\\d{4})?', 're-?master(?:ed)?',
      'deluxe\\s*(?:edition|version|track)?', 'special\\s*(?:edition|version)',
      'anniversary\\s*(?:edition|version|remaster)?',
      'bonus\\s*(?:track|edition)?', 'b-?side',
      'explicit\\s*(?:version)?', 'clean\\s*(?:version)?', 'radio\\s*safe',
      'censored', 'uncensored',
      // Audio effects & modifications
      'slowed(?:\\s*[+&]?\\s*(?:reverb|\\+\\s*reverb))?',
      'reverb(?:\\s*[+&]?\\s*slowed)?', 'lo-?fi',
      'speed(?:ed)?\\s*up|sped\\s*up', 'speed\\s*down',
      'nightcore', 'daycore', 'pitched\\s*(?:up|down)',
      'bass\\s*boost(?:ed)?', '8d\\s*audio', '3d\\s*audio', '360\\s*audio',
      'spatial\\s*audio', 'surround\\s*sound', 'binaural',
      'echo(?:\\s*effect)?', 'chorus(?:\\s*version)?',
      // DJ / remix tags
      'dj\\s*(?:remix|edit|mix|version|cut)', 'remix(?:ed)?', 'bootleg', 'mashup', 'flip',
      'vip\\s*(?:mix)?', 'festival\\s*(?:mix|edit)', 'extended\\s*dub', 'dub\\s*mix',
      'instrumental\\s*(?:version|mix)?', 'acapella|a\\s*cappella', 'karaoke(?:\\s*version)?',
      'cover', 'remake', 'session', 'demo', 'rough\\s*(?:mix|cut)',
      // Featured / Producer in brackets
      'feat(?:uring)?\\.?\\s+[^\\(\\[\\]\\)]+', 'ft\\.?\\s+[^\\(\\[\\]\\)]+', 'prod(?:uced)?\\.?\\s*by\\s+[^\\(\\[\\]\\)]+',
      // Social / Viral / FYP
      'viral(?:l+)?', 'trend(?:ing)?', 'fyp(?:シ|age)?', 'for\\s*you\\s*(?:page)?',
      'tiktok(?:\\s*viral)?', 'tiktok\\s*(?:song|sound|hit|trend)',
      'reels?', 'shorts?', 'youtube\\s*shorts?', 'instagram\\s*reels?', 'ig\\s*reels?',
      'xyzbca', 'xyzb', 'sound\\s*viral', 'sound\\s*kane', 'jedag\\s*jedug', 'jj\\s*kane', 'mengkane',
      // Indonesian promo / tags
      'terbaru(?:\\s*\\d{4})?', 'terpopuler', 'terhits?', 'terkeren', 'terbaik',
      'nostalgia', 'hits?\\s*(?:lama|lawas|jadul)', 'lagu\\s*lawas', 'lagu\\s*jadul',
      // Streaming & copyright
      'spotify', 'apple\\s*music', 'itunes?', 'deezer', 'tidal', 'soundcloud', 'youtube\\s*music', 'ytmusic',
      'out\\s*now', 'available\\s*now', 'stream\\s*now', 'pre-?save', 'exclusive', 'premiere',
      'copyright\\s*free', 'royalty\\s*free', 'no\\s*copyright', 'free\\s*(?:download|use|to\\s*use)', 'ncs(?:\\s*release)?'
    ];

    const bracketPattern = new RegExp(
      '[\\[\\(][^\\]\\)]*?(?:' + bracketKeywords.join('|') + ')[^\\]\\)]*?[\\]\\)]',
      'gi'
    );

    let prev;
    do {
      prev = name;
      name = name.replace(bracketPattern, ' ');
    } while (name !== prev);

    // 5. Featured artists outside brackets e.g. 'Artist feat. Someone', 'Artist ft. Someone'
    name = name.replace(/\s+(?:ft\.?|feat\.?|featuring|with|w\/)\s+[^–\-|]+(?=$|[-–|])/gi, ' ');
    name = name.replace(/\s+(?:prod(?:uced)?\.?\s*by)\s+[^–\-|]+(?=$|[-–|])/gi, ' ');

    // 6. Platform / channel trailing suffixes
    name = name.replace(/\s*[-–|]\s*(?:topic|vevo|official\s*(?:channel|page|account|audio|video)?|auto[-\s]?generated|provided\s*to\s*youtube|youtube|ytmusic|tidal|spotify|soundcloud)\s*$/gi, '');

    // 7. Trailing & leading viral/promo phrases (e.g. 'Viral TikTok', 'FYP 2024', etc.)
    const viralPhrases = [
      'sound\\s*(?:viral|tiktok|fyp|kane|horeg|seram)',
      'preset\\s*(?:xml|alight\\s*motion|am)',
      'jedag\\s*jedug(?:\\s*kane|\\s*full\\s*bass)?',
      'jj\\s*(?:kane|tipis|berjalan|slow|full\\s*bass)',
      'full\\s*bass(?:\\s*glerr)?',
      'full\\s*album',
      'mengkane|kane\\s*parah|kane\\s*bgt',
      'viral(?:l+)?\\s*tiktok(?:\\s*fyp)?',
      'tiktok\\s*viral(?:l+)?',
      'trend(?:ing)?\\s*tiktok',
      'tiktok\\s*trend(?:ing)?',
      'fyp(?:シ|age)?\\s*tiktok',
      'tiktok', 'reels?', 'shorts', 'youtube\\s*shorts?', 'xyzbca',
      'terbaru\\s*\\d{4}',
      'viral(?:l+)?\\s*\\d{4}',
      'trend(?:ing)?\\s*\\d{4}',
      'viral(?:l+)?', 'fyp(?:シ|age)?', 'trend(?:ing)?',
      'terbaru', 'terpopuler', 'terbaik', 'terhits?'
    ];

    let prevV;
    do {
      prevV = name;
      for (const vp of viralPhrases) {
        name = name.replace(new RegExp('(?:\\s*[-–|,]\\s*|\\s+)' + vp + '(?=\\s*[-–|,]\\s*|\\s*$)', 'gi'), ' ');
        name = name.replace(new RegExp('^\\s*' + vp + '(?:\\s*[-–|,]\\s*|\\s+)', 'gi'), ' ');
      }
      name = name.replace(/\s{2,}/g, ' ').trim();
    } while (name !== prevV);

    // 8. Trailing promo phrases
    name = name.replace(/\s*[-–|,:]\s*(?:out\s*now|available\s*now|listen\s*now|stream\s*now|pre-?save|new\s*single|new\s*release)\s*$/gi, '');

    // 9. Source labels in brackets (e.g. [Sony Music], (Atlantic Records))
    name = name.replace(/\s*[\(\[].*?(?:records?|music|entertainment|label|publishing|group|studios?|dist\.).*?[\)\]]\s*$/gi, '');

    // 10. Parenthetical pure numbers or codes
    name = name.replace(/\s*[\[\(]\s*\d{3,}\s*[\]\)]/g, '');
    name = name.replace(/\s*[\[\(]\s*[a-z]{2,4}\d{3,}\s*[\]\)]/gi, '');

    // 11. Bare year at the end
    name = name.replace(/\s*[-–~]?\s*\b(?:19|20)\d{2}\b\s*$/g, '');

    // 12. Normalize separators and whitespace
    name = name.replace(/\s*[-–_|]+\s*$/g, '');
    name = name.replace(/^\s*[-–_|]+\s*/g, '');
    name = name.replace(/\(\s*\)/g, '');
    name = name.replace(/\[\s*\]/g, '');
    name = name.replace(/\s{2,}/g, ' ').trim();
    name = name.replace(/^[\s\-–_|.,;:!?/]+|[\s\-–_|.,;:!?/]+$/g, '').trim();

    // Fallback: return original if result is empty or too short
    if (!name || name.length < 2) return rawName;
    return name;
  }


  // ── Process Clean Name on configure page ────────────────────────────────
  async function processCleanName(soundId) {
    log(`── [CLEAN NAME] ID: ${soundId} ──`);

    // Wait for the name textarea to appear
    const nameEl = await waitForElement('textarea#name, textarea[name="name"]', 15000);
    if (!nameEl) {
      log(`⚠️ Field nama tidak ditemukan (ID: ${soundId})`);
      return false;
    }

    await iWait(500);
    const originalName = nameEl.value || '';
    if (!originalName) {
      log(`⚠️ Nama kosong, dilewati (ID: ${soundId})`);
      return false;
    }

    const cleaned = cleanAudioName(originalName);
    if (cleaned === originalName) {
      log(`⚡ SKIP: Nama sudah bersih — "${originalName}"`);
      return true;
    }

    // Check moderation — don't rename moderated titles (##### pattern)
    if (originalName.includes('#####')) {
      log(`⚠️ SKIP: Nama ter-moderasi (###), tidak diubah — ID: ${soundId}`);
      return false;
    }

    log(`✏️ Ganti: "${originalName}" → "${cleaned}"`);

    // Enforce 50-char limit (Roblox maxlength)
    const finalName = cleaned.slice(0, 50);

    // Tandai notifikasi (snackbar) yang SUDAH ada sebagai "basi", supaya notifikasi sukses
    // dari lagu/proses sebelumnya tidak dianggap sebagai tanda selesai lagu ini.
    document.querySelectorAll('.MuiSnackbar-root').forEach(el => el.setAttribute('data-rbx-stale', '1'));

    const filled = await fillInput(nameEl, finalName);
    if (!filled) {
      log(`⚠️ Gagal mengisi nama (ID: ${soundId})`);
      return false;
    }
    await iWait(500);

    // Tunggu tombol Save Changes menjadi aktif
    let saveBtn = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 12000) {
      const b = getSaveButton();
      if (b && !isButtonDisabled(b)) { saveBtn = b; break; }
      await iWait(300);
    }
    if (!saveBtn) {
      const b = getSaveButton();
      if (b && isButtonDisabled(b)) {
        log(`ℹ️ Save Changes tidak aktif (sudah tersimpan atau nilai sama) — ID: ${soundId}`);
        return true;
      }
      log(`⚠️ Save Changes tidak aktif setelah mengisi nama (ID: ${soundId})`);
      return false;
    }

    await iWait(600);
    simulateClick(saveBtn);
    log(`Menyimpan perubahan nama (ID: ${soundId})...`);

    // Tunggu notifikasi "Changes saved successfully." — persis seperti di fitur upload thumbnail
    let saved = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 40000) {
      checkAbort();
      // Hanya hitung notifikasi BARU (bukan yang sudah ditandai basi sebelum klik Save)
      const okMsg = document.querySelector('.MuiSnackbar-root:not([data-rbx-stale]) [data-testid="update-success-message"]');
      if (okMsg) {
        saved = true;
        break;
      }
      const snack = document.querySelector('.MuiSnackbar-root:not([data-rbx-stale]) .MuiSnackbarContent-root, .MuiSnackbar-root:not([data-rbx-stale]) .MuiAlert-root');
      const snackText = (snack?.textContent || '').trim();
      if (snackText && /changes saved|saved successfully|berhasil/i.test(snackText)) {
        saved = true;
        break;
      }
      if (snackText && /fail|error|unable|could not|try again|too large|invalid/i.test(snackText)) {
        log(`⚠️ Roblox menolak perubahan nama: "${snackText.slice(0, 80)}" (ID: ${soundId})`);
        return false;
      }
      await iWait(400);
    }

    if (!saved) {
      // Cadangan: kalau Roblox memakai ulang elemen notifikasi lama, terima hasil
      // bila pesan sukses ada dan tombol Save sudah nonaktif setelah 40 detik.
      const anyOk = document.querySelector('[data-testid="update-success-message"]');
      const b = getSaveButton();
      if (anyOk && (!b || isButtonDisabled(b))) {
        log(`ℹ️ Notifikasi memakai elemen lama, dianggap sukses setelah 40 detik (ID: ${soundId})`);
        saved = true;
      } else if (b && isButtonDisabled(b)) {
        log(`✔ Tombol Save nonaktif (perubahan nama tersimpan) — ID: ${soundId}`);
        saved = true;
      } else {
        log(`⚠️ Notifikasi sukses tidak muncul dalam 40 detik (ID: ${soundId})`);
        return false;
      }
    }

    log(`✔ Nama berhasil disimpan: "${finalName}" (ID: ${soundId})`);
    // Beri jeda singkat sebelum navigasi berikutnya
    await iWait(1500);
    return true;
  }

  async function processOneAsset(mode, settings) {
    const usernames = settings.usernames || [];
    // Support both array (new) and string (legacy) for universeId
    const rawUniverseId = settings.universeId;
    const universeIds = Array.isArray(rawUniverseId)
      ? rawUniverseId.filter(Boolean)
      : (rawUniverseId ? [String(rawUniverseId).trim()].filter(Boolean) : []);

    if (mode === "username") {
      await processCollaborators(usernames);
    } else if (mode === "universe") {
      await processExperiences(universeIds);
    } else if (mode === "clean_name") {
      // handled directly in processAssetsLoop via configure page
    } else {
      // 'both': add all usernames AND all universe IDs
      await processCollaborators(usernames);
      await iWait(600);
      await processExperiences(universeIds);
    }
  }

  // Error/404 handling with exponential-ish backoff (helps with Roblox rate limiting)
  const MAX_PAGE_RETRY = 5;

  async function handlePageErrorRetry(id, allData, index, ids, targetPage, data, label) {
    const retryKey = `rbx_retry_${id}`;
    const retryData = await new Promise(resolve => chrome.storage.local.get([retryKey, 'rbx_404_ids'], resolve));
    const retryCount = retryData[retryKey] || 0;

    if (retryCount < MAX_PAGE_RETRY) {
      const delay = 3000 * (retryCount + 1);
      await chrome.storage.local.set({ [retryKey]: retryCount + 1 });
      log(`🔄 [${label}] Percobaan ${retryCount + 1}/${MAX_PAGE_RETRY} — Membuka ulang ID: ${id} dalam ${delay / 1000} detik...`);
      await iWait(delay);
      navigateTo(`https://create.roblox.com/dashboard/creations/store/${id}/${targetPage}`);
    } else {
      await chrome.storage.local.set({ [retryKey]: 0 });
      const songName404 = allData[index]?.soundTitle || allData[index]?.title || id;
      log(`🚧 [${label}] SKIP permanen setelah ${MAX_PAGE_RETRY}x retry: "${songName404}" (ID: ${id})`);
      const skippedList = retryData.rbx_404_ids || [];
      if (!skippedList.includes(id)) {
        skippedList.push(id);
        await chrome.storage.local.set({ rbx_404_ids: skippedList });
      }
      await goToNextTrack(index, ids);
    }
  }

  // Main Asset Loop Controller
  async function processAssetsLoop() {
    if (_isProcessing) return;
    _isProcessing = true;

    try {
      const data = await new Promise(resolve =>
        chrome.storage.local.get(
          [
            'rbx_auto_active', 'rbx_paused', 'rbx_needs_rescan', 'rbx_ids', 'rbx_audio_data', 'rbx_moderated_data',
            'rbx_mode', 'rbx_index', 'usernames', 'universeId', 'rbx_thumb_data', 'rbx_thumb_name', 'rbx_include_thumb',
            'rbx_404_ids', 'rbx_thumb_failed'
          ],
          resolve
        )
      );

      if (data.rbx_auto_active !== true) {
        _state.active = false;
        return;
      }
      _state.active = true;
      _state.paused = data.rbx_paused === true;

      checkAbort();
      await waitIfPaused();

      const ids = data.rbx_ids || [];
      const allData = data.rbx_audio_data || [];
      const mode = data.rbx_mode || 'both';
      let index = parseInt(data.rbx_index || 0, 10);
      const needsRescan = data.rbx_needs_rescan === true;

      if (mode === 'archive_moderated') {
        if (window.location.href.includes('/creations')) {
          await scanAllPages(mode);
        } else {
          navigateTo('https://create.roblox.com/dashboard/creations?activeTab=Audio');
        }
        return;
      }

      if (mode === 'clean_name') {
        if (needsRescan || ids.length === 0) {
          if (window.location.href.includes('/creations')) {
            await scanAllPages(mode);
          } else {
            navigateTo('https://create.roblox.com/dashboard/creations?activeTab=Audio');
          }
          return;
        }
        // On configure page — clean the name
        if (window.location.href.includes('/configure')) {
          const storeMatchClean = window.location.href.match(/store\/(\d+)\/configure/);
          const curIdClean = storeMatchClean ? storeMatchClean[1] : null;
          if (curIdClean === ids[index]) {
            await processCleanName(ids[index]);
            checkAbort();
            await goToNextTrack(index, ids);
            return;
          }
        }
        // Navigate to configure page
        navigateTo(`https://create.roblox.com/dashboard/creations/store/${ids[index]}/configure`);
        return;
      }

      // ALWAYS force full rescan of all pages if fresh start or rbx_needs_rescan flag is active
      if (needsRescan || ids.length === 0) {
        if (window.location.href.includes('/creations')) {
          await scanAllPages(mode);
        } else {
          log("Mengarahkan ke halaman Audio Creations untuk memindai SEMUA halaman ID...");
          navigateTo('https://create.roblox.com/dashboard/creations?activeTab=Audio');
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

      const shouldConfigureFirst = (mode === 'thumbnail' || (data.rbx_include_thumb && data.rbx_thumb_data));
      const targetPage = shouldConfigureFirst ? 'configure' : 'permissions';

      if (currentId !== id) {
        // Before navigating, check if we're currently on a 404 page
        if (is404Page()) {
          await handlePageErrorRetry(id, allData, index, ids, targetPage, data, '404');
          return;
        }
        log(`[${index + 1}/${ids.length}] Navigasi ke ID: ${id} (${targetPage})`);
        navigateTo(`https://create.roblox.com/dashboard/creations/store/${id}/${targetPage}`);
        return;
      }

      // ── 404 & CRASH PAGE CHECK ("Oh noes!"): after landing on the page ──
      await iWait(800);
      if (isErrorOr404Page()) {
        const tryAgainBtn = getTryAgainButton();
        if (tryAgainBtn) {
          log("⚠️ Halaman error Roblox ('Oh noes!') terdeteksi, mencoba klik tombol 'Try again'...");
          simulateClick(tryAgainBtn);
          await iWait(2500);
        }
      }

      if (isErrorOr404Page()) {
        await handlePageErrorRetry(id, allData, index, ids, targetPage, data, 'Error/404');
        return;
      }

      if (pageType === 'configure') {
        // Wait until the configure form is actually rendered (SPA loads late)
        // Tunggu sampai form benar-benar termuat: kolom Name terisi DAN input file ada
        const formStart = Date.now();
        while (Date.now() - formStart < 20000) {
          checkAbort();
          const nameEl = document.querySelector('textarea#name, input#name');
          if (nameEl && nameEl.value && queryThumbFileInput()) break;
          await iWait(300);
        }
        await iWait(800);
        checkAbort();

        const modInfo = getAudioModerationInfo();
        if (modInfo.isModerated) {
          const modLevel = modInfo.isRenameNeeded ? 'LOW' : 'FATAL';
          if (modLevel === 'LOW') {
            log(`⚠️ [LOW] SKIP: Lagu (ID: ${id}) PERLU DIGANTI NAMA! (Judul Ter-moderasi / #####)`);
          } else {
            log(`⛔ [FATAL] SKIP: Lagu (ID: ${id}) DIBLOKIR SISTEM ROBLOX! (${modInfo.reason})`);
          }
          const moderatedList = data.rbx_moderated_data || [];
          if (!moderatedList.some(m => m.soundId === id)) {
            const songTitle = allData[index]?.soundTitle || allData[index]?.title || id;
            moderatedList.push({ soundId: id, soundTitle: songTitle, soundThumbnail: "", moderated: true, moderationLevel: modLevel, moderationReason: modInfo.reason });
            await chrome.storage.local.set({ rbx_moderated_data: moderatedList });
          }
          await goToNextTrack(index, ids);
          return;
        }

        const songName = allData[index]?.soundTitle || allData[index]?.title || id;
        updateHUDInfo(songName, id, index + 1, ids.length, mode);

        let thumbOk = true;
        if (data.rbx_thumb_data) {
          thumbOk = await uploadAudioThumbnail(id, data.rbx_thumb_data, data.rbx_thumb_name);
        }

        if (!thumbOk) {
          // Reload the page and retry the whole upload up to 2 more times before giving up
          const tKey = `rbx_thumbretry_${id}`;
          const tData = await new Promise(resolve => chrome.storage.local.get([tKey, 'rbx_thumb_failed'], resolve));
          const tCount = tData[tKey] || 0;
          if (tCount < 2) {
            await chrome.storage.local.set({ [tKey]: tCount + 1 });
            log(`🔄 Thumbnail gagal — muat ulang halaman & ulangi (${tCount + 1}/2) untuk ID: ${id}`);
            await iWait(3000);
            navigateTo(`https://create.roblox.com/dashboard/creations/store/${id}/configure`);
            return;
          }
          await chrome.storage.local.set({ [tKey]: 0 });
          const failedList = tData.rbx_thumb_failed || [];
          if (!failedList.includes(id)) failedList.push(id);
          await chrome.storage.local.set({ rbx_thumb_failed: failedList });
          log(`❌ Thumbnail GAGAL permanen: "${songName}" (ID: ${id})`);
        }

        if (mode === 'thumbnail') {
          await goToNextTrack(index, ids);
          return;
        }

        log(`Thumbnail selesai, pindah ke Permissions tab (ID: ${id})...`);
        navigateTo(`https://create.roblox.com/dashboard/creations/store/${id}/permissions`);
        return;
      }

      const songName = allData[index]?.soundTitle || allData[index]?.title || id;
      log(`============================`);
      log(`[${index + 1}/${ids.length}] ${songName}`);
      log(`ID: ${id} | Mode: ${mode}`);
      log(`============================`);

      updateHUDInfo(songName, id, index + 1, ids.length, mode);

      await iWait(600);
      checkAbort();
      const modInfo = getAudioModerationInfo();
      if (modInfo.isModerated) {
        const modLevel = modInfo.isRenameNeeded ? 'LOW' : 'FATAL';
        if (modLevel === 'LOW') {
          log(`⚠️ [LOW] SKIP: Lagu "${songName}" (ID: ${id}) PERLU DIGANTI NAMA! (##### ter-moderasi)`);
        } else {
          log(`⛔ [FATAL] SKIP: Lagu "${songName}" (ID: ${id}) DIBLOKIR SISTEM ROBLOX!`);
        }
        const moderatedList = data.rbx_moderated_data || [];
        if (!moderatedList.some(m => m.soundId === id)) {
          moderatedList.push({ soundId: id, soundTitle: songName, soundThumbnail: "", moderated: true, moderationLevel: modLevel, moderationReason: modInfo.reason });
          await chrome.storage.local.set({ rbx_moderated_data: moderatedList });
        }
        await goToNextTrack(index, ids);
        return;
      }

      await processOneAsset(mode, data);
      checkAbort();
      await goToNextTrack(index, ids);
    } catch (err) {
      if (isAbort(err)) {
        log("⏹ Proses dihentikan seketika.");
        return;
      }
      console.error("[AutoPerm Error]", err);
    } finally {
      _isProcessing = false;
    }
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
        <div class="hud-logs-box" id="hudLogs">[AutoPerm] ⚠️ Wajib: Gunakan Bahasa Roblox (Creator Hub) dalam Bahasa Inggris (English).</div>
        <div class="hud-actions">
          <button id="hudPauseBtn" class="hud-action-btn hud-btn-pause">⏸ Jeda</button>
          <button id="hudStopBtn" class="hud-action-btn hud-btn-stop">⏹ Stop</button>
          <button id="hudResetBtn" class="hud-action-btn hud-btn-reset">🔄 Reset</button>
        </div>
      </div>
    `;

    document.body.appendChild(hudElement);

    // Default: start minimized
    hudElement.classList.add('minimized');

    const hudMinBtn = document.getElementById('hudMinBtn');
    hudMinBtn.textContent = '+';
    hudMinBtn.addEventListener('click', () => {
      hudElement.classList.toggle('minimized');
      hudMinBtn.textContent = hudElement.classList.contains('minimized') ? '+' : '—';
    });

    document.getElementById('hudPauseBtn').addEventListener('click', () => {
      _state.paused = !_state.paused;
      chrome.storage.local.set({ rbx_paused: _state.paused });
      log(_state.paused ? '⏸ DIJEDA via HUD' : '▶ DILANJUTKAN via HUD');
      syncHUDState({ rbx_auto_active: _state.active, rbx_paused: _state.paused });
    });

    document.getElementById('hudStopBtn').addEventListener('click', () => {
      _state.active = false;
      _state.paused = false;
      chrome.storage.local.set({ rbx_auto_active: false, rbx_paused: false, rbx_needs_rescan: false });
      log("⏹ DIHENTIKAN via HUD");
      syncHUDState({ rbx_auto_active: false, rbx_paused: false });
    });

    document.getElementById('hudResetBtn').addEventListener('click', () => {
      _state.active = false;
      _state.paused = false;
      chrome.storage.local.set({
        rbx_auto_active: false,
        rbx_paused: false,
        rbx_needs_rescan: false,
        rbx_index: 0,
        rbx_ids: [],
        rbx_audio_data: [],
        rbx_moderated_data: [],
        rbx_thumb_failed: [],
        rbx_logs: []
      });
      log("🔄 State di-reset via HUD");
      syncHUDState({ rbx_auto_active: false, rbx_paused: false, rbx_index: 0 });
    });

    makeDraggable(hudElement, document.getElementById('hudHeader'));

    chrome.storage.local.get(
      ['rbx_auto_active', 'rbx_paused', 'rbx_mode', 'rbx_index', 'rbx_ids', 'rbx_logs'],
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
    const hudPauseBtn = document.getElementById('hudPauseBtn');

    if (!dot) return;

    const active = data.rbx_auto_active === true;
    const paused = data.rbx_paused === true;
    const ids = data.rbx_ids || [];
    const index = parseInt(data.rbx_index || 0, 10);
    const mode = data.rbx_mode || '-';

    if (active && paused) {
      dot.classList.add('active');
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 8px #f59e0b';
    } else if (active) {
      dot.classList.add('active');
      dot.style.background = '';
      dot.style.boxShadow = '';
    } else {
      dot.classList.remove('active');
      dot.style.background = '';
      dot.style.boxShadow = '';
    }

    if (hudPauseBtn) {
      if (paused) {
        hudPauseBtn.textContent = '▶ Lanjut';
        hudPauseBtn.style.background = 'rgba(34,197,94,0.25)';
        hudPauseBtn.style.borderColor = '#22c55e';
        hudPauseBtn.style.color = '#86efac';
      } else {
        hudPauseBtn.textContent = '⏸ Jeda';
        hudPauseBtn.style.background = '';
        hudPauseBtn.style.borderColor = '';
        hudPauseBtn.style.color = '';
      }
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
        ['rbx_auto_active', 'rbx_paused', 'rbx_mode', 'rbx_index', 'rbx_ids', 'rbx_logs'],
        (data) => {
          syncHUDState(data);
        }
      );
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start') {
      log(`Perintah START diterima (${request.mode})`);
      _state.active = true;
      _state.paused = false;
      processAssetsLoop();
      sendResponse({ status: 'started' });
    } else if (request.action === 'stop') {
      _state.active = false;
      _state.paused = false;
      log("⏹ Perintah STOP diterima via pesan");
      syncHUDState({ rbx_auto_active: false, rbx_paused: false });
      sendResponse({ status: 'stopped' });
    } else if (request.action === 'pause') {
      _state.paused = request.paused === true;
      log(_state.paused ? "⏸ Perintah PAUSE diterima via pesan" : "▶ Perintah RESUME diterima via pesan");
      syncHUDState({ rbx_auto_active: _state.active, rbx_paused: _state.paused });
      sendResponse({ status: 'paused', paused: _state.paused });
    }
    return false;
  });

  setTimeout(() => {
    createFloatingHUD();
    processAssetsLoop();
  }, 1500);

})();
