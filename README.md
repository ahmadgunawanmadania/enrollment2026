# Sistem Pendaftaran Madania — Deployment Vercel

Migrasi dari **Google Apps Script (GAS)** ke **Vercel** tanpa mengubah tampilan dan
alur aplikasi. Frontend tetap satu halaman (`Index.html`), dan pemanggilan
`google.script.run.*` di dalamnya **otomatis** diteruskan ke serverless functions
Vercel melalui shim kecil — sehingga `Index.html` yang sama juga masih bisa
dipakai di GAS (shim tidak aktif jika runtime GAS sudah menyediakan
`google.script.run`).

## Arsitektur

```
├── Index.html              # Frontend (statis, di-serve dari root)
├── api/                    # Serverless functions Vercel (pengganti Code.gs)
│   ├── getKelasOptions.js
│   ├── handleNewRegistration.js
│   ├── handleUpdateRegistration.js
│   ├── simpanStatusLanjutan.js
│   ├── getUpdateLogs.js
│   ├── getNotificationSettings.js
│   ├── saveNotificationSettings.js
│   ├── bulkUploadSiswaLanjutan.js
│   ├── migrateDataToFirebase.js
│   ├── updatePendaftaranSearchField.js
│   └── updateSiswaLanjutanSearchField.js
├── lib/                    # Logika bersama (port dari Code.gs)
│   ├── google-auth.js      # JWT service account -> access token (di-cache)
│   ├── sheets.js           # Google Sheets REST (pengganti SpreadsheetApp)
│   ├── firestore.js        # Firestore REST (pengganti UrlFetchApp + JWT GAS)
│   ├── settings.js         # Pengaturan notifikasi (Firestore + fallback env)
│   ├── notifications.js    # Email (nodemailer) + WhatsApp (Fonnte)
│   ├── tarif.js            # getTarifSSP, getKelasOptions, formatRupiah
│   ├── registration.js     # Logika bisnis pendaftaran/lanjutan/log/migrasi
│   └── handler.js          # Wrapper Vercel function (parse argumen + error)
├── Code.gs                 # Kode GAS asli (tidak dipakai di Vercel; disimpan sbg referensi)
├── vercel.json             # preset "Other" agar file statis root ikut ter-deploy
├── package.json
└── .env.example
```

> **Catatan penting:** Data utama aplikasi (koleksi `pendaftaran`, `siswaLanjutan`,
> `masterSiswa`) dibaca/ditulis langsung dari browser lewat Firebase Web SDK —
> bagian ini TIDAK berubah dan tetap memakai konfigurasi Firebase yang sudah ada
> di `Index.html`. API baru hanya menggantikan fungsi-fungsi backend GAS:
> backup ke Google Sheets, notifikasi email/WhatsApp, pengaturan, log, dan
> utilitas admin (migrasi/bulk upload/backfill pencarian).

## Prasyarat

1. **Firebase project** `madania-enrollment-system` (sudah ada) dengan Firestore.
2. **Service Account**: Firebase Console → Project Settings → Service Accounts →
   *Generate new private key* → unduh file JSON. Dari file itu ambil `project_id`,
   `client_email`, dan `private_key`.
3. **Spreadsheet** yang sama dengan GAS. Ambil ID dari URL
   (`docs.google.com/spreadsheets/d/<ID>/edit`), lalu **share spreadsheet ke
   `client_email` service account sebagai Editor** (penting!).
4. (Opsional) **SMTP** untuk email notifikasi — mis. Gmail App Password
   (SMTP `smtp.gmail.com`, port 465, secure), Zoho, atau layanan SMTP lain.
   Jika tidak diisi, email dilewati dan aplikasi tetap berjalan.
5. (Opsional) **API key Fonnte** untuk WhatsApp.

## Environment Variables (Vercel)

Isi di Vercel → Project → Settings → Environment Variables. Contoh nilai ada di
`.env.example`.

| Variabel | Wajib | Keterangan |
|---|---|---|
| `GOOGLE_PROJECT_ID` | ✅ | `project_id` dari JSON service account |
| `GOOGLE_CLIENT_EMAIL` | ✅ | `client_email` dari JSON service account |
| `GOOGLE_PRIVATE_KEY` | ✅ | `private_key` (boleh berisi literal `\n` seperti di Code.gs, baris baru asli, atau base64) |
| `SPREADSHEET_ID` | ✅ | ID spreadsheet (lihat prasyarat no. 3) |
| `SMTP_HOST` | ⬜ | Host SMTP untuk email (kosongkan untuk menonaktifkan email) |
| `SMTP_PORT` | ⬜ | Default `465` |
| `SMTP_SECURE` | ⬜ | Default `true` |
| `SMTP_USER` / `SMTP_PASS` | ⬜ | Kredensial SMTP |
| `EMAIL_FROM` | ⬜ | Alamat pengirim; fallback ke `SMTP_USER` |
| `EMAIL_NAME` | ⬜ | Nama pengirim, default "Sistem Pendaftaran Madania" |
| `GAS_NOTIFY_URL` | ⬜ | URL web app Apps Script (fungsi `doPost` di Code.gs) untuk relay email via `MailApp` — menggantikan SMTP, tanpa app password |
| `GAS_NOTIFY_TOKEN` | ⬜ | Token pengaman relay; harus sama dengan Script Property `notifyToken` di GAS (opsional) |
| `ADMIN_EMAIL` | ⬜ | Email yang dicatat di Log_Update (pengganti `Session.getActiveUser()`) |
| `NOTIFICATION_EMAILS` | ⬜ | Nilai awal email penerima notifikasi |
| `NOTIFICATION_WHATSAPPS` | ⬜ | Nilai awal nomor WhatsApp penerima |
| `FONNTE_API_KEY` | ⬜ | Nilai awal API key Fonnte |
| `FONNTE_INSTANCE_ID` | ⬜ | Nilai awal instance ID Fonnte |

> Email/nomor/API key juga bisa diedit dari aplikasi (tab **Pengaturan**). Nilai
> yang disimpan lewat UI tersimpan di Firestore (koleksi `settings`, dokumen
> `notifications`) dan menimpa nilai awal dari env vars.

## Langkah Deploy

### Opsi A — Import dari Git (disarankan)

1. Push repository ini ke GitHub/GitLab.
2. Vercel → *Add New Project* → pilih repository.
3. Vercel akan mendeteksi preset **Other** otomatis (file `vercel.json` sudah
   menyetel `"framework": null`). Tidak perlu build command.
4. Isi **Environment Variables** sesuai tabel di atas.
5. *Deploy*. Selesai — aplikasi bisa dibuka di URL `*.vercel.app`.

### Opsi B — Vercel CLI

```bash
npm i -g vercel        # jika belum
vercel login
# di root project:
vercel                 # isi env vars saat diminta, atau gunakan `vercel env add`
vercel --prod
```

Untuk menjalankan lokal:

```bash
npm install
vercel dev             # http://localhost:3000 (butuh env vars: vercel env pull)
```

> **Catatan batas waktu (paket Hobby/gratis):** fungsi serverless dibatasi **10 detik**
> (menyetel `maxDuration` lebih dari 10 akan gagal di-deploy di paket gratis).
> **Migrasi Data** dibuat bertahap (per-batch ±10 baris per panggilan, UI
> otomatis melanjutkan sampai selesai) sehingga aman di paket Hobby — migrasi
> juga idempoten (memakai merge) sehingga aman dijalankan ulang. **Bulk Upload**
> dan **Update Field Pencarian** juga berjalan bertahap lewat UI. Jika tetap
> timeout, naikkan ke paket Pro.

## Setelah Deploy (sekali saja, lewat UI)

1. Buka aplikasi → tab **Pengaturan** → isi email penerima / nomor WA / API
   Fonnte → **Simpan**.
2. (Jika data lama masih di Sheet) tab **Utilitas/Admin** → **Migrasi Data** untuk
   memindahkan `Master_Data`, `Siswa_Lanjutan`, dan `Status_Lanjutan` ke Firestore
   (`pendaftaran`, `masterSiswa`, `siswaLanjutan`). Fungsi migrasi ini dibuat baru
   (tidak ada di Code.gs) agar tombol di UI berfungsi, dan berjalan **bertahap**
   agar muat dalam batas waktu paket Hobby — biarkan halaman terbuka sampai
   muncul notifikasi selesai.
3. (Jika ada data lama tanpa field pencarian) jalankan **Update Field Pencarian**
   untuk menambah `nama_lowercase` / `Nama_Siswa_lowercase` ke dokumen lama.
4. **Bulk Upload Siswa Lanjutan** untuk sinkronisasi `Siswa_Lanjutan` →
   `masterSiswa`.

## Diagnostik cepat

Buka `https://<app>.vercel.app/api/health` di browser untuk melihat laporan
status satu halaman: dependensi npm, modul `lib/`, status env vars (tanpa nilai
rahasia), uji access token Google, uji Firestore, dan uji Google Sheets. Berguna
saat salah satu fitur gagal tanpa pesan yang jelas.

## Perbedaan perilaku vs GAS (perlu diketahui)

- **Email**: GAS memakai MailApp (Gmail pemilik script). Vercel memakai SMTP dari
  env vars. Jika `SMTP_HOST` kosong, email tidak terkirim (hanya dicatat di log).
- **Admin pada Log_Update**: GAS memakai email user yang login
  (`Session.getActiveUser()`); Vercel memakai `ADMIN_EMAIL`.
- **handleUpdateRegistration** tidak ada di Code.gs (UI memanggilnya tapi GAS
  tidak punya). Versi Vercel mengimplementasikannya: memperbarui baris di
  `Master_Data` berdasarkan ID, mencatat perubahan ke `Log_Update`, dan
  mengirim notifikasi pengunduran diri.
- **Timestamp backup Sheet**: karena nilai `Timestamp` di browser berupa
  server-timestamp Firestore, backup memakai waktu server saat pemanggilan API.
- **Fungsi `updatePendaftaranSearchField`/`updateSiswaLanjutanSearchField`**
  sebelumnya tidak pernah benar-benar berjalan di GAS (bug pemanggilan dinamis);
  di versi ini diperbaiki.

## Keamanan

- `GOOGLE_PRIVATE_KEY` hanya disimpan sebagai environment variable, tidak
  di-commit (lihat `.env.example` — jangan diisi nilai asli).
- Endpoint `/api/*` tidak memiliki otentikasi (sama seperti GAS web app yang
  publik). Jika dibutuhkan, tambahkan proteksi (mis. Vercel Authentication /
  token header) di `lib/handler.js`.
