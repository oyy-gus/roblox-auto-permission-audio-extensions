// ==UserScript==
// @name         Auto Permission - oyy-gus
// @namespace    http://tampermonkey.net/
// @version      10.0
// @match        https://create.roblox.com/dashboard/creations*
// @match        https://create.roblox.com/dashboard/creations/store/*/permissions*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const usernames  = ["TBR SOCIETY"];   // Nickname
    const universeId = "";  // Universe

    const wait = ms => new Promise(r => setTimeout(r, ms));

    const originalLog = console.log;
    function log(msg) { originalLog.apply(console, [`[AutoPerm] ${msg}`]); }

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
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, value);
        el.dispatchEvent(new Event('input',  { bubbles: true }));
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
            input.dispatchEvent(new KeyboardEvent('keyup',   { key: char, bubbles: true }));
            await wait(120 + Math.random() * 80);
        }
    }

    async function retry(fn, attempts = 3, delay = 1000) {
        for (let i = 0; i < attempts; i++) {
            if (await fn()) return true;
            await wait(delay);
        }
        return false;
    }

    function alreadyExists(username) {
        return document.body.innerText.toLowerCase().includes(username.toLowerCase());
    }

    function scanAudioData() {
        const rows = document.querySelectorAll(
            'table[data-testid="media-list-table"] tbody tr'
        );
        const data = [];
        rows.forEach(row => {
            const link   = row.querySelector('a[href*="/dashboard/creations/store/"]');
            const nameEl = row.querySelector('th');
            if (link && nameEl) {
                const match = link.href.match(/store\/(\d+)\/configure/);
                if (match) {
                    data.push({
                        title: nameEl.textContent.trim(),
                        sound_id: match[1]
                    });
                }
            }
        });
        return data;
    }

    function getNextPageButton() {
        return document.querySelector(
            'nav[aria-label="pagination navigation"] button[aria-label="Go to next page"]:not([disabled])'
        ) || null;
    }

    async function scanAllPages(mode) {
        log("Mulai scan semua halaman Audio...");
        await waitForElement('table[data-testid="media-list-table"]', 15000);
        await wait(1000);

        let allData = [];
        let page = 1;

        while (true) {
            const data = scanAudioData();
            log(`Halaman ${page}: ${data.length} lagu ditemukan`);
            allData = allData.concat(data);

            const nextBtn = getNextPageButton();
            if (!nextBtn) { log("Scan selesai"); break; }

            log("Pindah halaman...");
            nextBtn.click();
            page++;
            await wait(2000);
            await waitForElement('table[data-testid="media-list-table"]', 10000);
            await wait(1000);
        }

        log(`============================`);
        log(`SCAN SELESAI: ${allData.length} lagu`);
        log(`============================`);
        console.log("%c📋 AUDIO LIST JSON:", "color:#00ff88;font-size:14px;font-weight:bold;");
        console.log(JSON.stringify(allData, null, 2));
        console.table(allData);

        const ids = allData.map(d => d.sound_id);
        localStorage.setItem("rbx_ids",        JSON.stringify(ids));
        localStorage.setItem("rbx_audio_data", JSON.stringify(allData));
        localStorage.setItem("rbx_index",      "0");
        localStorage.setItem("rbx_auto_active","true");
        localStorage.setItem("rbx_mode",       mode);  // simpan mode

        if (ids.length > 0) {
            log(`Mulai proses ${ids.length} lagu... [mode: ${mode}]`);
            await wait(1000);
            location.href = `https://create.roblox.com/dashboard/creations/store/${ids[0]}/permissions`;
        } else {
            alert("Tidak ada ID ditemukan!");
        }
    }

    async function switchToCollaboratorsTab() {
        return await retry(async () => {
            const tab = document.querySelector('button#Collaborators[role="tab"]');
            if (tab) { tab.click(); await wait(1500); return true; }
            return false;
        });
    }

    async function openCollaboratorsDialog() {
        return await retry(async () => {
            const btn = document.querySelector(
                'button.web-blox-css-tss-1qglsej-Typography-buttonMedium-addCollaboratorsButton'
            );
            if (btn) { btn.click(); await wait(1500); return true; }
            for (const b of document.querySelectorAll('button')) {
                const span = b.querySelector('span.web-blox-css-tss-1283320-Button-textContainer');
                if (span?.textContent?.trim() === 'Add collaborators') {
                    b.click(); await wait(1500); return true;
                }
            }
            return false;
        });
    }

    async function waitDropdown(timeout = 8000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const opts = document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]');
            if (opts.length > 0) return opts;
            await wait(300);
        }
        return null;
    }

    async function selectUser(username) {
        const opts = document.querySelectorAll('[role="listbox"] [role="option"], [role="option"]');
        for (const opt of opts) {
            if (opt.textContent?.toLowerCase().includes(username.toLowerCase())) {
                opt.click(); await wait(700); return true;
            }
        }
        return false;
    }

    function clickDialogButton(dialog, label) {
        const actions = dialog.querySelector('.MuiDialogActions-root');
        const root    = actions || dialog;
        for (const btn of root.querySelectorAll('button')) {
            const span = btn.querySelector('span.web-blox-css-tss-1283320-Button-textContainer');
            if (span?.textContent?.trim() === label) { btn.click(); return true; }
        }
        return false;
    }

    async function waitDialogClose(selector = '[data-testid="add-collaborators-modal"]') {
        for (let i = 0; i < 20; i++) {
            await wait(500);
            if (!document.querySelector(selector)) return true;
        }
        return false;
    }

    async function clickSaveChanges() {
        await wait(500);
        for (const btn of document.querySelectorAll('button')) {
            const span = btn.querySelector('span.web-blox-css-tss-1283320-Button-textContainer');
            if (span?.textContent?.trim() === 'Save Changes') {
                btn.click(); log('Save Changes ✔'); return true;
            }
        }
        return false;
    }

    async function processCollaborators() {
        log("── [COLLABORATORS] ──");
        await waitForElement('button#Collaborators[role="tab"]', 15000);
        await wait(1000);

        await switchToCollaboratorsTab();
        await wait(1500);

        const opened = await openCollaboratorsDialog();
        if (!opened) { log("Gagal buka dialog Collaborators"); return; }

        const dialog = await waitForElement('[data-testid="add-collaborators-modal"]', 10000);
        if (!dialog) { log("Dialog tidak muncul"); return; }
        log("Dialog terbuka ✔");

        for (const username of usernames) {
            log(`Proses: ${username}`);
            if (alreadyExists(username)) { log("Skip - sudah ada"); continue; }

            const input = dialog.querySelector('[data-testid="autocomplete"] input.MuiAutocomplete-input');
            if (!input) { log("Input tidak ditemukan"); continue; }

            setNativeValue(input, '');
            await wait(300);
            await typeUsername(input, username);
            await wait(500);

            const opts = await waitDropdown(8000);
            if (!opts || opts.length === 0) {
                log("Dropdown tidak muncul"); setNativeValue(input, ''); continue;
            }

            const selected = await selectUser(username);
            if (!selected) {
                log("User tidak ditemukan di dropdown"); setNativeValue(input, ''); continue;
            }

            log(`${username} dipilih ✔`);
            await wait(800);
        }

        clickDialogButton(dialog, 'Done');
        await waitDialogClose('[data-testid="add-collaborators-modal"]');
        await wait(1000);
        await clickSaveChanges();
        await wait(2000);
        log("Collaborators selesai ✔");
    }

    async function switchToExperiencesTab() {
        return await retry(async () => {
            const tab = document.querySelector('button#Experiences[role="tab"]');
            if (tab) { tab.click(); await wait(1500); return true; }
            return false;
        });
    }

    async function openExperiencesDialog() {
        return await retry(async () => {
            for (const btn of document.querySelectorAll('button')) {
                const span = btn.querySelector('span.web-blox-css-tss-1283320-Button-textContainer');
                if (span?.textContent?.trim() === 'Add experiences') {
                    btn.click(); await wait(2000); return true;
                }
            }
            return false;
        });
    }

    async function processExperiences() {
        log("── [EXPERIENCES] ──");
        await switchToExperiencesTab();
        await wait(1500);

        const opened = await openExperiencesDialog();
        if (!opened) { log("Gagal buka dialog Experiences"); return; }

        const dialog = await waitForElement('[data-testid="add-experiences-modal"]', 10000);
        if (!dialog) { log("Dialog Experiences tidak muncul"); return; }
        log("Dialog Experiences terbuka ✔");

        const input = await waitForElement('#proposed-experience-search', 8000);
        if (!input) { log("Input experience tidak ditemukan"); return; }

        input.focus();
        setNativeValue(input, universeId);
        log(`Universe ID dimasukkan: ${universeId}`);
        await wait(1000);

        log("Menunggu tombol Add aktif...");
        let addBtn = null;
        const addStart = Date.now();
        while (Date.now() - addStart < 8000) {
            for (const btn of dialog.querySelectorAll('button')) {
                const span = btn.querySelector('span.web-blox-css-tss-1283320-Button-textContainer');
                const text = span?.textContent?.trim() || btn.textContent?.trim();
                if (text === 'Add' && !btn.disabled) { addBtn = btn; break; }
            }
            if (addBtn) break;
            await wait(300);
        }

        if (addBtn) {
            addBtn.click();
            log("Tombol Add diklik ✔");
        } else {
            log("Tombol Add tidak aktif / tidak ditemukan, coba klik Done saja");
        }
        await wait(1500);

        for (const btn of dialog.querySelectorAll('button')) {
            const span = btn.querySelector('span.web-blox-css-tss-1283320-Button-textContainer');
            const text = span?.textContent?.trim() || btn.textContent?.trim();
            if (text === 'Done') { btn.click(); log("Done diklik ✔"); break; }
        }
        await wait(1500);

        for (let i = 0; i < 10; i++) {
            await wait(500);
            if (!document.querySelector('[data-testid="add-experiences-modal"]')) break;
        }
        await wait(1000);
        log("Experiences selesai ✔");
    }

    async function processOneAsset(mode) {
        if (mode === "username") {
            await processCollaborators();
        } else if (mode === "universe") {
            await processExperiences();
        } else {
            await processCollaborators();
            await wait(1000);
            await processExperiences();
        }
    }

    async function processAssets() {
        if (localStorage.getItem("rbx_auto_active") !== "true") return;

        const ids     = JSON.parse(localStorage.getItem("rbx_ids")        || "[]");
        const allData = JSON.parse(localStorage.getItem("rbx_audio_data") || "[]");
        const mode    = localStorage.getItem("rbx_mode") || "both";
        let   index   = parseInt(localStorage.getItem("rbx_index")        || "0");

        if (ids.length === 0) { log("Tidak ada ID, jalankan startUsername() / startUniverse() / scanAndStart() dulu"); return; }

        if (index >= ids.length) {
            log(`============================`);
            log(`SEMUA SELESAI! Total: ${ids.length} lagu [mode: ${mode}]`);
            log(`============================`);
            console.log("%c✅ FINAL AUDIO LIST JSON:", "color:#00ff88;font-size:16px;font-weight:bold;");
            console.log(JSON.stringify(allData, null, 2));
            console.table(allData);
            alert(`SEMUA SELESAI ✔\nTotal: ${ids.length} lagu\nMode: ${mode}\nLihat Console untuk JSON lengkap`);
            localStorage.removeItem("rbx_index");
            localStorage.removeItem("rbx_auto_active");
            localStorage.removeItem("rbx_ids");
            localStorage.removeItem("rbx_audio_data");
            localStorage.removeItem("rbx_mode");
            return;
        }

        const id        = ids[index];
        const currentId = location.href.match(/store\/(\d+)\/permissions/)?.[1];

        if (currentId !== id) {
            location.href = `https://create.roblox.com/dashboard/creations/store/${id}/permissions`;
            return;
        }

        console.clear();
        const songName = allData[index]?.title || id;
        log(`============================`);
        log(`[${index + 1}/${ids.length}] ${songName}`);
        log(`ID: ${id} | Mode: ${mode}`);
        log(`============================`);

        await processOneAsset(mode);

        localStorage.setItem("rbx_index", index + 1);
        await wait(2000);

        if (index + 1 < ids.length) {
            location.href = `https://create.roblox.com/dashboard/creations/store/${ids[index + 1]}/permissions`;
        } else {
            localStorage.setItem("rbx_index", ids.length);
            location.href = `https://create.roblox.com/dashboard/creations/store/${id}/permissions`;
        }
    }

    window.scanOnly = async function () {
        if (!location.href.includes('/creations')) {
            alert("Buka dulu: https://create.roblox.com/dashboard/creations?activeTab=Audio");
            return;
        }
        log("Mode: SCAN ONLY (tidak ada proses)");
        await waitForElement('table[data-testid="media-list-table"]', 15000);
        await wait(1000);

        let allData = [];
        let page = 1;

        while (true) {
            const data = scanAudioData();
            log(`Halaman ${page}: ${data.length} lagu ditemukan`);
            allData = allData.concat(data);

            const nextBtn = getNextPageButton();
            if (!nextBtn) { log("Scan selesai"); break; }

            log("Pindah halaman...");
            nextBtn.click();
            page++;
            await wait(2000);
            await waitForElement('table[data-testid="media-list-table"]', 10000);
            await wait(1000);
        }

        localStorage.setItem("rbx_audio_data", JSON.stringify(allData));

        log(`============================`);
        log(`SCAN SELESAI: ${allData.length} lagu`);
        log(`============================`);
        console.log("%c📋 SCAN ONLY — AUDIO LIST JSON:", "color:#00ccff;font-size:14px;font-weight:bold;");
        console.log(JSON.stringify(allData, null, 2));
        console.table(allData);
        log(`Data juga tersimpan, panggil showAudioList() untuk lihat lagi`);
    };

    window.startUsername = async function () {
        if (!location.href.includes('/creations')) {
            alert("Buka dulu: https://create.roblox.com/dashboard/creations?activeTab=Audio");
            return;
        }
        log("Mode: USERNAME ONLY");
        await scanAllPages("username");
    };

    window.startUniverse = async function () {
        if (!location.href.includes('/creations')) {
            alert("Buka dulu: https://create.roblox.com/dashboard/creations?activeTab=Audio");
            return;
        }
        log("Mode: UNIVERSE ONLY");
        await scanAllPages("universe");
    };

    window.scanAndStart = async function () {
        if (!location.href.includes('/creations')) {
            alert("Buka dulu: https://create.roblox.com/dashboard/creations?activeTab=Audio");
            return;
        }
        log("Mode: BOTH (Username + Universe)");
        await scanAllPages("both");
    };

    window.showAudioList = function () {
        const data = JSON.parse(localStorage.getItem("rbx_audio_data") || "[]");
        console.log(`Total: ${data.length} lagu`);
        console.table(data);
        console.log(JSON.stringify(data, null, 2));
    };

    window.stopAuto = function () {
        localStorage.removeItem("rbx_auto_active");
        log("STOPPED");
    };

    window.resetAuto = function () {
        localStorage.removeItem("rbx_index");
        localStorage.removeItem("rbx_auto_active");
        localStorage.removeItem("rbx_ids");
        localStorage.removeItem("rbx_audio_data");
        localStorage.removeItem("rbx_mode");
        log("RESET DONE");
    };

    window.statusAuto = function () {
        const active = localStorage.getItem("rbx_auto_active") === "true";
        const ids    = JSON.parse(localStorage.getItem("rbx_ids") || "[]");
        const index  = parseInt(localStorage.getItem("rbx_index") || "0");
        const mode   = localStorage.getItem("rbx_mode") || "-";
        log(`============================`);
        log(`STATUS  : ${active ? "AKTIF" : "TIDAK AKTIF"}`);
        log(`MODE    : ${mode}`);
        log(`PROGRESS: ${index} / ${ids.length}`);
        log(`SISA    : ${ids.length - index} lagu`);
        log(`============================`);
    };

    console.clear();
    log(`============================`);
    log(`ROBLOX AUTO PERMISSION v10.0`);
    log(`============================`);
    log(`scanOnly()       - Scan + tampilkan JSON (tanpa proses)`);
    log(`startUsername()  - Hanya tambah Collaborators`);
    log(`startUniverse()  - Hanya tambah Experiences`);
    log(`scanAndStart()   - Keduanya (Collab + Exp)`);
    log(`showAudioList()  - Lihat daftar lagu hasil scan`);
    log(`statusAuto()     - Cek progress`);
    log(`stopAuto()       - Stop`);
    log(`resetAuto()      - Reset`);
    log(`============================`);

    setTimeout(() => {
        if (localStorage.getItem("rbx_auto_active") === "true") {
            if (location.href.includes('/permissions')) {
                processAssets();
            }
        }
    }, 5000);

})();