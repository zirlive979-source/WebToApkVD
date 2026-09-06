# WebToApkVD V1

Ubah website jadi APK Android asli (native WebView), mode **online** atau
**offline**, build sungguhan lewat **GitHub Actions** (bukan simulasi/patch
biner manual).

## Cara Kerja Singkat

```
[public/index.html]  --POST-->  [Cloud Function: triggerBuild]  --workflow_dispatch-->  [GitHub Actions]
                                          |                                                     |
                                   Firestore: webtoapkvd_jobs                          configure-template.js
                                   (status: queued/processing/                          site-downloader.js (offline)
                                    done/error)                                         gradle assembleRelease
                                          ^                                             zipalign + apksigner
                                          |                                                     |
                                   [Cloud Function: buildCallback]  <--curl callback-- GitHub Release (APK)
```

Kenapa lewat GitHub Actions, bukan server Node/VPS sendiri? Karena runner
GitHub sudah punya JDK + Android SDK + Gradle bawaan, jadi kamu gak perlu
sewa/rawat VPS buat compile APK. Bagian Firebase (Cloud Functions) cuma jadi
"pemicu" ringan, bukan yang ngerjain build berat.

## Struktur Folder

- `public/index.html` — frontend (form generate, status build, riwayat)
- `functions/` — Cloud Functions `triggerBuild` & `buildCallback`
- `android-template/` — project Android WebView shell (di-patch tiap build)
- `scripts/` — `configure-template.js` (isi URL/nama/icon/package) &
  `site-downloader.js` (bundle situs buat mode offline)
- `.github/workflows/build-apk.yml` — pipeline build + sign + release
- `firebase.json`, `firestore.rules`, `storage.rules` — konfigurasi Firebase

## Setup

### 1. Buat keystore signing

```bash
keytool -genkeypair -v -keystore release-key.jks -alias webtoapkvd \
  -keyalg RSA -keysize 2048 -validity 10000
```

Simpan file `.jks` ini baik-baik — kalau hilang, APK update selanjutnya gak
bisa dianggap "app yang sama" oleh Android.

### 2. Push project ini ke GitHub, lalu isi repo Secrets

Settings → Secrets and variables → Actions:

| Secret | Isi |
|---|---|
| `KEYSTORE_BASE64` | `base64 -w0 release-key.jks` |
| `KEYSTORE_PASSWORD` | password keystore |
| `KEY_ALIAS` | `webtoapkvd` (atau alias yang kamu pakai) |
| `KEY_PASSWORD` | password key |
| `CALLBACK_URL` | URL Cloud Function `buildCallback` (isi setelah deploy step 4) |
| `CALLBACK_SECRET` | string rahasia bebas, harus sama dengan yang di-set di Cloud Functions |

### 3. Buat GitHub Personal Access Token (PAT)

Buat *fine-grained token* dengan akses **Actions: Read and write** ke repo
ini. Token ini yang dipakai Cloud Function buat memicu `workflow_dispatch`.

### 4. Deploy Firebase

```bash
firebase functions:secrets:set GITHUB_TOKEN
firebase functions:secrets:set CALLBACK_SECRET
```

Edit dulu `functions/index.js`: ganti `GITHUB_OWNER` dan `GITHUB_REPO` sesuai
repo kamu. Lalu:

```bash
firebase deploy --only functions,firestore:rules,storage:rules
```

Catat URL `triggerBuild` yang muncul, dan URL `buildCallback` (masukkan ke
secret `CALLBACK_URL` di GitHub, step 2).

### 5. Isi konfigurasi di `public/index.html`

Ganti `firebaseConfig` (ambil dari Firebase Console → Project settings →
Your apps) dan `TRIGGER_BUILD_URL` sesuai hasil deploy di atas. Lalu:

```bash
firebase deploy --only hosting
```

## Catatan Penting

- **Collection Firestore** sengaja dinamai `webtoapkvd_jobs` (bukan `jobs`)
  dan path Storage `webtoapkvd_icons/` — supaya gak tabrakan kalau kamu
  pakai project Firebase yang sama buat app lain.
- **Mode offline** cuma membundel HTML/CSS/JS/gambar *same-origin* dari 1
  halaman (lihat komentar di `scripts/site-downloader.js`). Kalau situsnya
  banyak halaman atau datanya dinamis (login, Firestore real-time, dst),
  bagian itu tetap butuh internet saat APK dipakai.
- Setelah build dipicu, halaman gak menampilkan link run GitHub Actions
  secara langsung (API `workflow_dispatch` gak mengembalikan run ID). Kalau
  mau lihat log build detail, buka tab **Actions** di repo GitHub kamu
  langsung.
- APK hasil build otomatis ke-upload sebagai **GitHub Release** (tag
  `build-<nomor-run>`) — publik kalau repo kamu publik, jadi link
  download-nya stabil tanpa perlu auth tambahan.
