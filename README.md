# Roblox Auto Permission - Extension (Manifest V3)

Extension browser modern untuk Microsoft Edge & Google Chrome yang mengotomatisasi penambahan **Collaborators**, **Experiences**, **Scan & Archiving Audio Moderated** pada aset Audio di **Roblox Creator Dashboard** (`create.roblox.com`).

---

> [!WARNING]
> **PERINGATAN PENTING BAHASA ROBLOX:**
> Bahasa akun Roblox / Creator Hub **WAJIB** disetel ke **English (Bahasa Inggris)**. Ekstensi ini bekerja dengan mendeteksi elemen DOM dan API Roblox (seperti `"Add collaborators"`, `"Save Changes"`, `"Archive"`, `"Done"`, dll.). Jika menggunakan bahasa lain (seperti Indonesia), beberapa fitur DOM **TIDAK AKAN BEKERJA**.

---

## 🌟 Fitur Utama

- **Fitur Jeda & Lanjutkan (Pause & Resume)**: Menghentikan sementara proses kapan saja di tengah jalan tanpa kehilangan progres, dan dapat dilanjutkan kembali dengan 1 klik.
- **Auto Archive via Roblox API + DOM Fallback**: Mengarsip audio yang ter-moderasi langsung menggunakan Roblox API (`develop.roblox.com/v1/assets/{id}/archive`), bypass semua kendala UI/hover/Radix portal. Jika API dibatasi, ekstensi otomatis beralih ke simulasi hover & click DOM.
- **Tingkatan Moderasi (FATAL vs LOW)**:
  - 🛑 **FATAL**: Audio diblokir/dihapus sistem -> Otomatis diarsip.
  - ⚠️ **LOW**: Judul audio ter-moderasi (`#####`) -> Dicatat sebagai perlu ganti nama, tidak diarsip.
- **Auto Reload 404 Pages**: Jika halaman permission audio mengembalikan error 404, ekstensi tidak membolos (*skip*), melainkan melakukan muat ulang (*reload*) halaman dan mengulanginya otomatis.
- **Auto Navigation & Pagination**: Memindai seluruh daftar audio berhalaman (pagination), secara otomatis berpindah dari satu audio ke audio berikutnya (`/store/{id}/permissions`).
- **5 Mode Operasi**:
  1. 🚀 **Start Both**: Menambahkan Collaborators (Username) dan Experiences (Universe ID).
  2. 👤 **Start Username**: Hanya menambahkan Collaborators.
  3. 🎮 **Start Universe**: Hanya menambahkan Experiences.
  4. 🔍 **Scan Only**: Memindai seluruh audio dan mengkategorikan moderasi tanpa memberikan izin.
  5. 📦 **Archive Moderated**: Mengarsip semua audio ter-moderasi kategori FATAL.
- **Real-Time Progress & Log Console**: Persentase progres dan log aktivitas real-time yang tersimpan otomatis di `chrome.storage`.
- **Audio List JSON Exporter**: Menyimpan daftar lagu hasil scan lengkap dengan `title`, `sound_id`, dan `moderationLevel`, dapat disalin dengan 1 klik.

---

## 📁 Struktur File Extension

```
auto-permission-audio-roblox-extensions/
├── manifest.json       # Manifest V3 Configuration (Edge & Chrome)
├── background.js       # Service Worker & Badge Indicator
├── popup.html          # HTML Tampilan Popup Extension
├── popup.css           # Styling Modern Dark Glassmorphism
├── popup.js            # Logika Interaktif Popup & Storage Sync
├── content.js          # Automation Script Injected ke Roblox
├── content.css         # Styling Floating HUD di Halaman Roblox
├── icons/              # Ikon Extension Auto Permissions (16px, 48px, 128px)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # Panduan Penggunaan
```

---

## 🛠️ Cara Install Extension di Microsoft Edge / Chrome

1. Buka **Microsoft Edge** (`edge://extensions`) atau **Google Chrome** (`chrome://extensions`).
2. Aktifkan mode pengembang (**Developer mode**) di toggle samping/atas menu.
3. Klik tombol **Load unpacked** (Muat tanpa kemasan).
4. Pilih folder repositori ekstensi ini (`roblox-auto-permission-audio-extensions`).
5. Extension **Roblox Auto Permission - Pro Tool** akan terpasang dan muncul di toolbar browser.

---

## 🚀 Cara Penggunaan

1. Klik ikon extension di toolbar browser untuk membuka **Popup UI**.
2. Masukkan **Usernames** (contoh: `GussJTM`) dan **Universe ID** (contoh: `12345678`).
3. Pilih mode yang ingin dijalankan:
   - Klik **🚀 Start Both** untuk memproses Collaborators + Experiences.
   - Atau pilih **👤 Start Username**, **🎮 Start Universe**, **🔍 Scan Only**, atau **📦 Archive Moderated**.
4. Extension akan membuka halaman `https://create.roblox.com/dashboard/creations?activeTab=Audio` secara otomatis, Pastikan anda sudah login terlebih dahulu.
5. **Floating HUD** akan muncul di pojok kanan atas halaman Roblox untuk menampilkan aktivitas live.
6. Untuk menjeda/melanjutkan, klik tombol **Pause / Resume** di Popup atau Floating HUD.
7. Setelah selesai, klik tombol **View JSON** di Popup untuk melihat / menyalin daftar lagu hasil scan.

---

## 🛡️ Catatan Keamanan & Rate Limit

- **Rate Limit Safe**: Ekstensi menggunakan jeda waktu (*delay*) sekuensial 1–2 detik antar proses sehingga aman dari blokir *Rate Limit* (`HTTP 429`) Roblox.
- **Keamanan Data**: Seluruh konfigurasi dan hasil scan tersimpan secara lokal di browser Anda (`chrome.storage.local`).
