<div align="center">

# 🛡️ Roblox Auto Permission

### Extension Browser · Manifest V3

<p>
  <img src="https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge-2563EB?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome and Edge">
  <img src="https://img.shields.io/badge/Manifest-V3-7C3AED?style=for-the-badge" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Platform-Roblox%20Creator%20Dashboard-111827?style=for-the-badge&logo=roblox&logoColor=white" alt="Roblox Creator Dashboard">
</p>

**Otomatisasi pengelolaan izin, pemindaian moderasi, pengarsipan audio, dan unggah thumbnail di Roblox Creator Dashboard.**

</div>

---

> [!WARNING]
> **⚠️ PERSYARATAN BAHASA AKUN**
>
> Bahasa akun Roblox / Creator Hub **wajib disetel ke English (Bahasa Inggris)**. Ekstensi mendeteksi elemen DOM dan teks antarmuka Roblox, seperti `Add collaborators`, `Save Changes`, `Archive`, dan `Done`.
>
> Jika Creator Hub menggunakan bahasa lain, termasuk Bahasa Indonesia, beberapa fitur otomatisasi mungkin **tidak berfungsi dengan benar**.
>
> **🔧 Kompatibilitas situs:** Ekstensi ini bergantung pada struktur halaman, elemen antarmuka, dan perilaku API Roblox Creator Dashboard. Jika Roblox mengubah desain, teks tombol, struktur DOM, alur halaman, atau API-nya, sebagian fitur atau seluruh ekstensi dapat berhenti berfungsi sewaktu-waktu. Jika itu terjadi, ekstensi mungkin perlu diperbarui agar kembali kompatibel.

## ✨ Fitur Utama

### ⏯️ Kontrol Proses

- **Pause & Resume** — jeda proses kapan saja dan lanjutkan kembali tanpa kehilangan progres yang tersimpan.
- **Progres dan log real-time** — pantau persentase progres serta aktivitas melalui konsol log.
- **Penyimpanan progres lokal** — status dan log disimpan melalui `chrome.storage`.

### 🔐 Pengelolaan Izin Otomatis

- **Start Both** — menambahkan *Collaborators* berdasarkan username dan *Experiences* berdasarkan Universe ID.
- **Start Username** — hanya memproses penambahan Collaborators.
- **Start Universe** — hanya memproses penambahan Experiences.
- **Navigasi dan pagination otomatis** — berpindah antarhalaman audio pada halaman `/store/{id}/permissions` atau `/store/{id}/configure`.
- **Pemulihan halaman 404** — memuat ulang halaman permission audio yang mengalami 404 dan mencoba kembali secara otomatis.

### 🎵 Pemindaian dan Moderasi Audio

- **Scan Only** — memindai audio dan mengelompokkan hasil moderasi tanpa menambahkan izin.
- **Archive Moderated** — mengarsip audio kategori **FATAL**.
- **FATAL vs LOW**
  - 🛑 **FATAL** — audio diblokir atau dihapus oleh sistem; ditandai untuk pengarsipan otomatis.
  - ⚠️ **LOW** — judul audio dimoderasi, misalnya berubah menjadi `#####`; dicatat untuk ditinjau atau diganti namanya, bukan otomatis diarsipkan.
- **Auto Archive dengan API + DOM Fallback** — mencoba endpoint Roblox `develop.roblox.com/v1/assets/{id}/archive`, lalu menggunakan interaksi DOM sebagai fallback jika jalur API tidak dapat digunakan.

### 🖼️ Unggah Thumbnail Otomatis

- Mengunggah thumbnail kustom ke banyak aset audio melalui halaman konfigurasi `/store/{id}/configure`.
- Mendukung berkas `.png`, `.jpg`, `.bmp`, dan `.webp`.
- Menyediakan pratinjau gambar langsung di popup sebelum proses dijalankan.

### 📦 Ekspor Data

- **Audio List JSON Exporter** — mengekspor hasil scan dalam format JSON.
- Data dapat mencakup `title`, `sound_id`, `soundThumbnail`, dan `moderationLevel`.
- Hasil dapat dilihat atau disalin melalui tombol **View JSON**.

---

## 🧭 Enam Mode Operasi

| Mode | Fungsi |
|---|---|
| 🚀 **Start Both** | Menambahkan Collaborators dan Experiences |
| 🖼️ **Auto Upload Thumbnail** | Mengunggah thumbnail ke aset audio secara massal |
| 👤 **Start Username** | Hanya menambahkan Collaborators |
| 🎮 **Start Universe** | Hanya menambahkan Experiences |
| 🔍 **Scan Only** | Memindai dan mengelompokkan status moderasi tanpa mengubah izin |
| 📦 **Archive Moderated** | Mengarsip audio kategori FATAL |

---

## 📁 Struktur File

```text
auto-permission-audio-roblox-extensions/
├── manifest.json       # Konfigurasi Manifest V3 (Edge & Chrome)
├── background.js       # Service Worker dan indikator badge
├── popup.html          # Antarmuka popup extension
├── popup.css           # Gaya popup dark glassmorphism
├── popup.js            # Interaksi popup dan sinkronisasi storage
├── content.js          # Skrip otomatisasi pada halaman Roblox
├── content.css         # Gaya Floating HUD di halaman Roblox
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # Dokumentasi proyek
```

---

## 🧰 Instalasi

1. Buka halaman pengelolaan extension:
   - **Microsoft Edge:** `edge://extensions`
   - **Google Chrome:** `chrome://extensions`
2. Aktifkan **Developer mode**.
3. Klik **Load unpacked** (*Muat tanpa kemasan*).
4. Pilih folder proyek `roblox-auto-permission-audio-extensions`.
5. Pastikan extension muncul di toolbar browser.

---

## 🚀 Cara Penggunaan

1. Login ke [Roblox Creator Dashboard](https://create.roblox.com/dashboard/creations?activeTab=Audio) terlebih dahulu.
2. Klik ikon extension di toolbar untuk membuka popup.
3. Masukkan **Username** (contoh: `GussJTM`) dan/atau **Universe ID** (contoh: `12345678`) sesuai mode operasi.
4. Pilih mode yang ingin dijalankan:
   - **🚀 Start Both** untuk Collaborators dan Experiences.
   - **👤 Start Username** untuk Collaborators saja.
   - **🎮 Start Universe** untuk Experiences saja.
   - **🔍 Scan Only** untuk pemindaian moderasi.
   - **📦 Archive Moderated** untuk pengarsipan audio kategori FATAL.
   - **🖼️ Auto Upload Thumbnail** untuk unggah thumbnail massal.
5. Ikuti aktivitas melalui **Floating HUD** di pojok kanan atas halaman Roblox.
6. Gunakan **Pause / Resume** pada popup atau Floating HUD untuk menjeda atau melanjutkan proses.
7. Setelah pemindaian selesai, pilih **View JSON** untuk melihat atau menyalin hasilnya.

---

## 🛡️ Keamanan, Penyimpanan, dan Batas Permintaan

- **Penyimpanan lokal** — konfigurasi dan hasil scan disimpan di `chrome.storage.local` pada browser.
- **Jeda antarproses** — ekstensi menggunakan jeda sekuensial sekitar 1–2 detik untuk membantu mengurangi permintaan beruntun.
- **Rate limit** — jeda tersebut tidak menjamin bebas dari `HTTP 429`; ikuti batas dan ketentuan Roblox, dan hentikan proses jika terjadi pembatasan berulang.
- **Periksa hasil** — tinjau hasil scan dan pastikan aset serta izin yang diproses sudah benar, khususnya sebelum pengarsipan massal.

---

<div align="center">

![Chrome](https://img.shields.io/badge/Chrome-Supported-2563EB?style=flat-square&logo=googlechrome&logoColor=white)
![Edge](https://img.shields.io/badge/Edge-Supported-0D9488?style=flat-square&logo=microsoftedge&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-7C3AED?style=flat-square)

<sub>Roblox Auto Permission · Dokumentasi extension</sub>

</div>
