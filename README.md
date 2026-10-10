# Roblox Auto Permission - Extension Microsoft Edge (Manifest V3)

Extension browser modern untuk Microsoft Edge & Google Chrome yang mengotomatisasi penambahan **Collaborators** dan **Experiences** pada aset Audio di **Roblox Creator Dashboard** (`create.roblox.com`).

Extension ini merupakan konversi dan peningkatan fitur lengkap dari script Tampermonkey sebelumnya (`contoh.md`), kini dilengkapi dengan **Popup Dashboard UI**, **Floating Controller (HUD) di Halaman Roblox**, **Manajemen State Otomatis**, dan **Viewer/Export JSON**.

---

## 🌟 Fitur Utama

- **Popup UI Dashboard (Glassmorphism Dark Theme)**: Antarmuka modern untuk mengonfigurasi list Usernames, Universe ID, serta kontrol Start, Stop, Reset, dan Progress Bar.
- **Floating HUD Controller (di Halaman Roblox)**: Floating widget yang muncul langsung di halaman Roblox Creator Dashboard untuk memantau status secara live, melihat log aktif, serta tombol pause/stop darurat.
- **Auto Navigation & Pagination**: Memindai seluruh daftar audio berhalaman (pagination), secara otomatis berpindah dari satu audio ke audio berikutnya (`/store/{id}/permissions`).
- **4 Mode Operasi**:
  1. 🚀 **Start Both**: Menambahkan Collaborators (Username) dan Experiences (Universe ID).
  2. 👤 **Start Username**: Hanya menambahkan Collaborators.
  3. 🎮 **Start Universe**: Hanya menambahkan Experiences.
  4. 🔍 **Scan Only**: Hanya memindai seluruh audio dan menghasilkan list JSON tanpa memproses izin.
- **Real-Time Progress & Log Console**: Persentase progres dan log aktivitas real-time yang tersimpan otomatis di `chrome.storage`.
- **Audio List JSON Exporter**: Menyimpan daftar lagu hasil scan lengkap dengan `title` & `sound_id`, dapat disalin dengan 1 klik.

---

## 📁 Struktur File Extension

```
ex/
├── manifest.json       # Manifest V3 Configuration (Edge & Chrome)
├── background.js       # Service Worker & Badge Indicator
├── popup.html          # HTML Tampilan Popup Extension
├── popup.css           # Styling Modern Dark Glassmorphism
├── popup.js            # Logika Interaktif Popup & Storage Sync
├── content.js          # Automation Script Injected ke Roblox
├── content.css         # Styling Floating HUD di Halaman Roblox
├── icons/              # Ikon Extension (16px, 48px, 128px)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # Panduan Penggunaan
```

---

## 🛠️ Cara Install Extension di Microsoft Edge

1. Buka **Microsoft Edge**.
2. Ketik `edge://extensions` pada address bar dan tekan **Enter**.
3. Aktifkan mode pengembang (**Developer mode**) di toggle sebelah kiri bawah/samping menu.
4. Klik tombol **Load unpacked** (Muat tanpa kemasan).
5. Pilih folder tempat extension ini berada: `C:\Users\RDP\Desktop\ex`.
6. Extension **Roblox Auto Permission - Pro Tool** akan terpasang dan muncul di toolbar Microsoft Edge.

---

## 🚀 Cara Penggunaan

1. Buka atau klik ikon extension di toolbar Edge untuk membuka **Popup UI**.
2. Masukkan **Usernames** (contoh: `TBR SOCIETY`) dan **Universe ID** (contoh: `12345678`).
3. Pilih mode yang ingin dijalankan:
   - Klik **🚀 Start Both** untuk memproses Collaborators + Experiences.
   - Atau klik **👤 Start Username** / **🎮 Start Universe** / **🔍 Scan Only**.
4. Extension akan membuka halaman `https://create.roblox.com/dashboard/creations?activeTab=Audio` secara otomatis.
5. **Floating HUD** akan muncul di pojok kanan atas halaman Roblox untuk menampilkan aktivitas live.
6. Untuk berhenti kapan saja, klik tombol **Stop** di Popup atau di Floating HUD.
7. Setelah selesai, klik tombol **View JSON** di Popup untuk melihat / menyalin daftar lagu hasil scan.

---

## 🛡️ Catatan Tambahan

- **Keamanan Data**: Seluruh konfigurasi dan hasil scan tersimpan secara lokal di browser Anda (`chrome.storage.local`).
- **Simpan Pengaturan**: Pengaturan Username dan Universe ID yang Anda ketik akan tersimpan otomatis saat Anda mengetik.
