// Roblox Auto Permission - Content Script v10.7 (Maximal Button & Interaction Reliability)

(function () {
  'use strict';

  if (window.__RBX_AUTO_PERM_INJECTED__) return;
  window.__RBX_AUTO_PERM_INJECTED__ = true;

  const wait = ms => new Promise(r => setTimeout(r, ms));

  let hudElement = null;
  let recentLogs = [];

  // Pause Helper — waits in loop while rbx_paused is true
  async function waitIfPaused() {
    while (true) {
      const data = await new Promise(resolve => chrome.storage.local.get(['rbx_paused', 'rbx_auto_active'], resolve));
      if (!data.rbx_auto_active) return; // stopped
      if (!data.rbx_paused) return;      // not paused
      await wait(500); // poll every 500ms while paused
    }
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
      const el = root.querySelector(selector);
      if (el) return el;
      await wait(200);
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
    await wait(200);
    input.focus();
    await wait(150);

    // Method 1: execCommand (most reliable, bypasses React synthetic event quirks)
    const execOk = await execCommandInsert(input, text);
    if (execOk && input.value === text) {
      log(`[fillInput] execCommand OK: "${text}"`);
      return true;
    }

    // Method 2: setNativeValue + char-by-char typing
    log(`[fillInput] execCommand gagal, coba char-by-char...`);
    setNativeValue(input, '');
    await wait(150);
    for (const char of text) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true, cancelable: true, composed: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true, cancelable: true, composed: true }));
      setNativeValue(input, input.value + char);
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true, cancelable: true, composed: true }));
      await wait(80 + Math.random() * 40);
    }
    await wait(200);

    // Method 3: If still empty, force via ClipboardEvent paste simulation
    if (!input.value) {
      log(`[fillInput] Mencoba simulasi paste...`);
      input.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      setNativeValue(input, text);
      await wait(200);
    }

    log(`[fillInput] Hasil akhir value: "${input.value}"`);
    return input.value.length > 0;
  }

  async function typeUsername(input, text) {
    return fillInput(input, text);
  }

  async function retry(fn, attempts = 4, delay = 1000) {
    for (let i = 0; i < attempts; i++) {
      if (await fn()) return true;
      await wait(delay);
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
    if (!universeId) return false;
    const cleanId = String(universeId).trim();
    if (!cleanId) return false;

    const bodyText = (document.body ? document.body.innerText : '');
    if (bodyText.includes(cleanId)) return true;

    const cells = document.querySelectorAll('#Experiences td, #Experiences [role="cell"], [data-testid="experiences-permission-tab"] *');
    for (const cell of cells) {
      if (cell.textContent.includes(cleanId)) return true;
    }

    return false;
  }

  // Moderation Check Helper
  function getAudioModerationInfo() {
    const pageText = document.body ? document.body.innerText : '';
    const hasModBanner = pageText.includes('Your audio was moderated.') ||
                         pageText.includes('Removed for violations of Roblox Terms of Use');

    const nameInput = document.querySelector('input#name, input[name="name"], [data-testid="asset-name-input"]');
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

  // 404 Page Detector — checks if current page is a Roblox 404
  function is404Page() {
    const bodyText = document.body ? document.body.innerText : '';
    const title = document.title || '';
    return bodyText.includes("We couldn't find the page you were looking for") ||
           bodyText.includes('404 Page Not Found') ||
           title.includes('404') ||
           document.querySelector('.web-blox-css-tss-5uh6hj-Grid-root-loggedinErrorArea, [class*="loggedinErrorArea"]') !== null;
  }

  // Returns null if not moderated, or { level: 'FATAL'|'LOW', reason } if moderated
  function getRowModerationLevel(row) {
    const rowText = row.textContent || '';
    const hasHashtagTitle = rowText.includes('#####') || rowText.includes('##################################################');
    const hasModText = rowText.includes('Removed for violations') || rowText.includes('Your audio was moderated');

    const svgs = row.querySelectorAll('svg');
    let hasModSvg = false;
    for (const svg of svgs) {
      const html = svg.outerHTML.toLowerCase();
      if (html.includes('ban') || html.includes('prohibited') || html.includes('lock') ||
          html.includes('circle-slash') || html.includes('d="m12 2a10 10')) {
        hasModSvg = true;
        break;
      }
    }

    const imgs = row.querySelectorAll('img');
    let hasUnapprovedImg = false;
    for (const img of imgs) {
      const src = img.src || '';
      if (src.includes('UnapprovedImage') || src.includes('moderated') || src.includes('ban')) {
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
        await wait(1500);
        prevBtn = document.querySelector(selectors[0]) || document.querySelector(selectors[1]) || document.querySelector(selectors[2]);
      }
      await wait(1000);
      await waitForElement('table tbody tr', 10000);
    }
  }

  // Scan All Pages Function (Scans ALL pages on creations table)
  async function scanAllPages(mode) {
    log("=== MEMULAI PEMINDAIAN SELURUH HALAMAN AUDIO ===");
    await waitForElement('table, [role="table"]', 15000);
    await wait(1000);

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
      await wait(2500);
      await waitForElement('table tbody tr, [role="row"]', 10000);
      await wait(800);
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
      await wait(1000);
      if (mode === 'archive_moderated') {
        await processArchiveModerated(allModerated);
      } else {
        const settings = await new Promise(resolve => chrome.storage.local.get(['rbx_include_thumb', 'rbx_thumb_data'], resolve));
        const firstPage = (mode === 'thumbnail' || (settings.rbx_include_thumb && settings.rbx_thumb_data)) ? 'configure' : 'permissions';
        window.location.href = `https://create.roblox.com/dashboard/creations/store/${targetIds[0]}/${firstPage}`;
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
    await wait(600);

    if (nextIndex < ids.length) {
      const nextId = ids[nextIndex];
      const settings = await new Promise(resolve => chrome.storage.local.get(['rbx_mode', 'rbx_include_thumb', 'rbx_thumb_data'], resolve));
      const mode = settings.rbx_mode || 'both';
      const targetPage = (mode === 'thumbnail' || (settings.rbx_include_thumb && settings.rbx_thumb_data)) ? 'configure' : 'permissions';
      log(`[${nextIndex + 1}/${ids.length}] Otomatis berpindah ke lagu selanjutnya (ID: ${nextId})...`);
      window.location.href = `https://create.roblox.com/dashboard/creations/store/${nextId}/${targetPage}`;
    } else {
      await chrome.storage.local.set({ rbx_auto_active: false });
      log(`============================`);
      log(`SEMUA LAGU SELESAI DIPROSES (${ids.length} Audio) ✔`);
      log(`============================`);
      alert(`SEMUA LAGU SELESAI DIPROSES ✔\nTotal: ${ids.length} audio.`);
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

      await wait(400);

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
      await wait(1200);

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
        await wait(1200);

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
              await wait(1200);
              return true;
            }
          }
        }

        log(`⚠️ Dialog konfirmasi Archive tidak muncul untuk ID ${soundId}`);
        return true;
      } else {
        log(`⚠️ Menu "Archive" tidak ditemukan setelah klik 3-dots (ID: ${soundId})`);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(300);
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
      await wait(1200);
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
      await wait(250);
      const openDialog = document.querySelector('[data-testid="add-collaborators-modal"], [data-testid="add-experiences-modal"], [role="dialog"]');
      if (!openDialog) return true;
    }
    closeModalDialog('Done');
    await wait(300);
    return true;
  }

  async function clickSaveChanges() {
    await wait(300);
    for (const btn of document.querySelectorAll('button')) {
      const text = (btn.textContent?.trim() || '').toLowerCase();
      if (text.includes('save changes') || text.includes('simpan perubahan') || text === 'save' || text === 'simpan') {
        if (isButtonDisabled(btn)) {
          log('Save Changes tidak aktif (sudah tersimpan) ✔');
          return true;
        }
        simulateClick(btn);
        log(`Tombol "${btn.textContent?.trim()}" diklik ✔`);
        await wait(1500);
        return true;
      }
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

  // Audio Thumbnail Uploader via Configuration Page
  async function uploadAudioThumbnail(soundId, thumbDataUrl, thumbName) {
    log(`── [THUMBNAIL UPLOAD (ID: ${soundId})] ──`);
    if (!thumbDataUrl) {
      log(`⚠️ Data thumbnail tidak ditemukan`);
      return false;
    }

    const file = dataURLtoFile(thumbDataUrl, thumbName || 'thumbnail.png');
    if (!file) {
      log(`⚠️ Gagal memproses file gambar thumbnail`);
      return false;
    }

    await wait(1200);

    // Look for file input in DOM
    let fileInput = document.querySelector('input[type="file"]');

    if (!fileInput) {
      const uploadBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        const txt = (b.textContent?.trim() || '').toLowerCase();
        return txt === 'upload' || txt.includes('upload');
      });

      for (const btn of uploadBtns) {
        simulateClick(btn);
        await wait(600);
        fileInput = document.querySelector('input[type="file"]');
        if (fileInput) break;
      }
    }

    if (!fileInput) {
      log(`⚠️ Elemen upload file tidak ditemukan pada form konfigurasi`);
      return false;
    }

    try {
      log(`Menyematkan file thumbnail: ${file.name} (${Math.round(file.size / 1024)} KB)...`);
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;

      fileInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      fileInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

      await wait(1500);

      log(`Menyimpan perubahan thumbnail...`);
      await clickSaveChanges();
      await wait(1500);
      log(`✔ Thumbnail berhasil diperbarui (ID: ${soundId})`);
      return true;
    } catch (err) {
      log(`Error upload thumbnail (ID: ${soundId}): ${err.message}`);
      return false;
    }
  }

  // Collaborators Tab Logic
  async function switchToCollaboratorsTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Collaborators[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Collaborators'));
      if (tab) { simulateClick(tab); await wait(1000); return true; }
      return false;
    });
  }

  async function openCollaboratorsDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add collaborators') || text.includes('+ Add collaborators')) {
          simulateClick(btn);
          await wait(1000);
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
      await wait(250);
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
        await wait(500);
        return true;
      }
    }
    return false;
  }

  async function processCollaborators(usernames) {
    log("── [COLLABORATORS] ──");
    await waitForElement('button#Collaborators[role="tab"], button[role="tab"]', 15000);
    await wait(600);

    await switchToCollaboratorsTab();
    await wait(600);

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
      await wait(600);

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
      await wait(500);
    }

    closeModalDialog('Done');
    await waitDialogClose();
    await wait(500);
    await clickSaveChanges();
    await wait(800);
    log(`Collaborators selesai (${addedCount} ditambahkan) ✔`);
    return true;
  }

  // Experiences Tab Logic
  async function switchToExperiencesTab() {
    return await retry(async () => {
      const tab = document.querySelector('button#Experiences[role="tab"]') ||
                  Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.textContent.includes('Experiences'));
      if (tab) { simulateClick(tab); await wait(1000); return true; }
      return false;
    });
  }

  async function openExperiencesDialog() {
    return await retry(async () => {
      for (const btn of document.querySelectorAll('button')) {
        const text = btn.textContent?.trim() || '';
        if (text.includes('Add experiences')) {
          simulateClick(btn); await wait(1200); return true;
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

    if (alreadyExistsExperience(universeId)) {
      log(`⚡ INSTANT SKIP: Universe ID (${universeId}) SUDAH ADA pada lagu ini ✔`);
      return;
    }

    const opened = await openExperiencesDialog();
    if (!opened) { log("Gagal membuka dialog Experiences"); return; }

    // Wait for dialog to appear
    await waitForElement('[role="dialog"], [data-testid*="modal"]', 10000);
    await wait(600);
    log("Dialog Experiences terbuka ✔");

    // Find input: placeholder is "Enter experience IDs"
    let input = findDialogInput(['experience', 'Enter experience', 'experience IDs']);
    if (!input) {
      // wait a bit more and retry
      await wait(800);
      input = findDialogInput(['experience', 'Enter', 'IDs']);
    }
    if (!input) {
      input = document.querySelector('[role="dialog"] input:not([type="hidden"]), [data-testid*="modal"] input:not([type="hidden"])');
    }
    if (!input) { log("⚠️ Input experience tidak ditemukan"); return; }
    log(`Input ditemukan: placeholder="${input.placeholder}"`);

    // Fill the input
    const filled = await fillInput(input, String(universeId));
    log(`Universe ID ${filled ? 'berhasil' : 'GAGAL'} dimasukkan: "${input.value}"`);
    await wait(800);

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
      await wait(300);
    }

    if (addBtn) {
      simulateClick(addBtn);
      log("Tombol Add diklik ✔");
    } else {
      log("⚠️ Tombol Add tidak aktif/tidak ditemukan — coba Enter sebagai fallback");
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    }
    await wait(1000);

    closeModalDialog('Done');
    await wait(800);
    await waitDialogClose();
    await wait(600);
    await clickSaveChanges();
    await wait(800);
    log("Experiences selesai ✔");
  }

  async function processOneAsset(mode, settings) {
    const usernames = settings.usernames || [];
    const universeId = settings.universeId || "";

    if (mode === "username") {
      await processCollaborators(usernames);
    } else if (mode === "universe") {
      await processExperiences(universeId);
    } else {
      await processCollaborators(usernames);
      await wait(600);
      await processExperiences(universeId);
    }
  }

  // Main Asset Loop Controller
  async function processAssetsLoop() {
    chrome.storage.local.get(
      [
        'rbx_auto_active', 'rbx_needs_rescan', 'rbx_ids', 'rbx_audio_data', 'rbx_moderated_data',
        'rbx_mode', 'rbx_index', 'usernames', 'universeId', 'rbx_thumb_data', 'rbx_thumb_name', 'rbx_include_thumb'
      ],
      async (data) => {
        if (data.rbx_auto_active !== true) return;

        const ids = data.rbx_ids || [];
        const allData = data.rbx_audio_data || [];
        const mode = data.rbx_mode || 'both';
        let index = parseInt(data.rbx_index || 0, 10);
        const needsRescan = data.rbx_needs_rescan === true;

        if (mode === 'archive_moderated') {
          if (window.location.href.includes('/creations')) {
            await scanAllPages(mode);
          } else {
            window.location.href = 'https://create.roblox.com/dashboard/creations?activeTab=Audio';
          }
          return;
        }

        // ALWAYS force full rescan of all pages if fresh start or rbx_needs_rescan flag is active
        if (needsRescan || ids.length === 0) {
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

        const shouldConfigureFirst = (mode === 'thumbnail' || (data.rbx_include_thumb && data.rbx_thumb_data));
        const targetPage = shouldConfigureFirst ? 'configure' : 'permissions';

        if (currentId !== id) {
          // Before navigating, check if we're currently on a 404 page
          // (Roblox sometimes redirects 404 URLs to dashboard/other pages)
          if (is404Page()) {
            const retryKey = `rbx_retry_${id}`;
            const retryData = await new Promise(resolve => chrome.storage.local.get([retryKey], resolve));
            const retryCount = retryData[retryKey] || 0;
            const MAX_RETRY = 3;

            if (retryCount < MAX_RETRY) {
              await chrome.storage.local.set({ [retryKey]: retryCount + 1 });
              log(`🔄 [404] Percobaan ${retryCount + 1}/${MAX_RETRY} — Membuka ulang halaman ID: ${id} dalam 3 detik...`);
              await wait(3000);
              window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/${targetPage}`;
            } else {
              await chrome.storage.local.set({ [retryKey]: 0 });
              const songName404 = allData[index]?.soundTitle || allData[index]?.title || id;
              log(`🚧 [404] SKIP permanen setelah ${MAX_RETRY}x retry: "${songName404}" (ID: ${id})`);
              const skippedList = data.rbx_404_ids || [];
              if (!skippedList.includes(id)) {
                skippedList.push(id);
                await chrome.storage.local.set({ rbx_404_ids: skippedList });
              }
              await goToNextTrack(index, ids);
            }
            return;
          }
          log(`[${index + 1}/${ids.length}] Navigasi ke ID: ${id} (${targetPage})`);
          window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/${targetPage}`;
          return;
        }

        // ── 404 CHECK: after landing on the page ──
        await wait(800);
        if (is404Page()) {
          const retryKey = `rbx_retry_${id}`;
          const retryData = await new Promise(resolve => chrome.storage.local.get([retryKey], resolve));
          const retryCount = retryData[retryKey] || 0;
          const MAX_RETRY = 3;

          if (retryCount < MAX_RETRY) {
            await chrome.storage.local.set({ [retryKey]: retryCount + 1 });
            log(`🔄 [404] Percobaan ${retryCount + 1}/${MAX_RETRY} — Reload halaman ID: ${id} dalam 3 detik...`);
            await wait(3000);
            window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/${targetPage}`;
          } else {
            await chrome.storage.local.set({ [retryKey]: 0 });
            const songName404 = allData[index]?.soundTitle || allData[index]?.title || id;
            log(`🚧 [404] SKIP permanen setelah ${MAX_RETRY}x retry: "${songName404}" (ID: ${id})`);
            const skippedList = data.rbx_404_ids || [];
            if (!skippedList.includes(id)) {
              skippedList.push(id);
              await chrome.storage.local.set({ rbx_404_ids: skippedList });
            }
            await goToNextTrack(index, ids);
          }
          return;
        }

        if (pageType === 'configure') {
          await wait(600);
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

          if (data.rbx_thumb_data) {
            await uploadAudioThumbnail(id, data.rbx_thumb_data, data.rbx_thumb_name);
          }

          if (mode === 'thumbnail') {
            await goToNextTrack(index, ids);
            return;
          }

          log(`Thumbnail selesai, pindah ke Permissions tab (ID: ${id})...`);
          window.location.href = `https://create.roblox.com/dashboard/creations/store/${id}/permissions`;
          return;
        }

        const songName = allData[index]?.soundTitle || allData[index]?.title || id;
        log(`============================`);
        log(`[${index + 1}/${ids.length}] ${songName}`);
        log(`ID: ${id} | Mode: ${mode}`);
        log(`============================`);

        updateHUDInfo(songName, id, index + 1, ids.length, mode);

        await wait(600);
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
        <div class="hud-logs-box" id="hudLogs">[AutoPerm] ⚠️ Wajib: Gunakan Bahasa Roblox (Creator Hub) dalam Bahasa Inggris (English).</div>
        <div class="hud-actions">
          <button id="hudPauseBtn" class="hud-action-btn hud-btn-pause">⏸ Jeda</button>
          <button id="hudStopBtn" class="hud-action-btn hud-btn-stop">⏹ Stop</button>
          <button id="hudResetBtn" class="hud-action-btn hud-btn-reset">🔄 Reset</button>
        </div>
      </div>
    `;

    document.body.appendChild(hudElement);

    const hudMinBtn = document.getElementById('hudMinBtn');
    hudMinBtn.addEventListener('click', () => {
      hudElement.classList.toggle('minimized');
      hudMinBtn.textContent = hudElement.classList.contains('minimized') ? '+' : '—';
    });

    document.getElementById('hudPauseBtn').addEventListener('click', () => {
      chrome.storage.local.get(['rbx_paused'], (data) => {
        const isPaused = data.rbx_paused === true;
        chrome.storage.local.set({ rbx_paused: !isPaused });
        log(isPaused ? '▶ DILANJUTKAN via HUD' : '⏸ DIJEDA via HUD');
      });
    });

    document.getElementById('hudStopBtn').addEventListener('click', () => {
      chrome.storage.local.set({ rbx_auto_active: false, rbx_paused: false, rbx_needs_rescan: false });
      log("⏹ DIHENTIKAN via HUD");
    });

    document.getElementById('hudResetBtn').addEventListener('click', () => {
      chrome.storage.local.set({
        rbx_auto_active: false,
        rbx_paused: false,
        rbx_needs_rescan: false,
        rbx_index: 0,
        rbx_ids: [],
        rbx_audio_data: [],
        rbx_moderated_data: [],
        rbx_logs: []
      });
      log("🔄 State di-reset via HUD");
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
      processAssetsLoop();
      sendResponse({ status: 'started' });
    }
  });

  setTimeout(() => {
    createFloatingHUD();
    processAssetsLoop();
  }, 1500);

})();
