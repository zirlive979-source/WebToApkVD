#!/usr/bin/env node
/**
 * configure-template.js
 *
 * Mengisi Android WebView template dengan data 1 build:
 * - app_name, target_url, build_mode -> strings.xml
 * - package_name -> applicationId di app/build.gradle
 * - icon_url (opsional) -> di-download & di-resize ke semua density mipmap
 *
 * Dijalankan oleh GitHub Actions (.github/workflows/build-apk.yml) sebelum
 * proses `gradle assembleRelease`. Bisa juga dijalankan manual buat testing:
 *
 *   SITE_URL=https://contoh.com APP_NAME="App Aku" PACKAGE_NAME=com.contoh.app \
 *     BUILD_MODE=online node scripts/configure-template.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const TEMPLATE_DIR = path.join(__dirname, '..', 'android-template');

const SITE_URL = process.env.SITE_URL;
const APP_NAME = process.env.APP_NAME || 'WebToApkVD App';
const PACKAGE_NAME = process.env.PACKAGE_NAME || 'com.webtoapkvd.generated';
const ICON_URL = process.env.ICON_URL || '';
const BUILD_MODE = (process.env.BUILD_MODE || 'online').toLowerCase() === 'offline'
  ? 'offline'
  : 'online';

if (!SITE_URL) {
  console.error('[configure-template] SITE_URL wajib diisi.');
  process.exit(1);
}

if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i.test(PACKAGE_NAME)) {
  console.error(`[configure-template] PACKAGE_NAME "${PACKAGE_NAME}" tidak valid. Contoh yang benar: com.namamu.appku`);
  process.exit(1);
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function updateStrings() {
  const stringsPath = path.join(TEMPLATE_DIR, 'app/src/main/res/values/strings.xml');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${escapeXml(APP_NAME)}</string>
    <string name="target_url">${escapeXml(SITE_URL)}</string>
    <string name="build_mode">${BUILD_MODE}</string>
</resources>
`;
  fs.writeFileSync(stringsPath, xml, 'utf8');
  console.log('[configure-template] strings.xml diperbarui:', {APP_NAME, SITE_URL, BUILD_MODE});
}

function updateApplicationId() {
  const gradlePath = path.join(TEMPLATE_DIR, 'app/build.gradle');
  let content = fs.readFileSync(gradlePath, 'utf8');

  if (!/applicationId\s+"[^"]*"/.test(content)) {
    throw new Error('Tidak ketemu baris applicationId di app/build.gradle');
  }

  content = content.replace(
    /applicationId\s+"[^"]*"/,
    `applicationId "${PACKAGE_NAME}"`
  );
  fs.writeFileSync(gradlePath, content, 'utf8');
  console.log('[configure-template] applicationId diganti ke', PACKAGE_NAME);
}

function downloadBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        downloadBuffer(new URL(res.headers.location, url).toString(), redirectsLeft - 1)
          .then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Gagal download icon, status ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

const MIPMAP_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

async function updateIcon() {
  if (!ICON_URL) {
    console.log('[configure-template] ICON_URL kosong, pakai icon default template.');
    return;
  }

  console.log('[configure-template] Download icon dari', ICON_URL);
  const buffer = await downloadBuffer(ICON_URL);

  for (const [folder, size] of Object.entries(MIPMAP_SIZES)) {
    const dir = path.join(TEMPLATE_DIR, 'app/src/main/res', folder);
    fs.mkdirSync(dir, {recursive: true});
    const outPath = path.join(dir, 'ic_launcher.png');
    await sharp(buffer).resize(size, size, {fit: 'cover'}).png().toFile(outPath);
  }
  console.log('[configure-template] Icon berhasil di-generate ke semua density mipmap.');
}

(async () => {
  try {
    updateStrings();
    updateApplicationId();
    await updateIcon();
    console.log('[configure-template] Selesai. Mode:', BUILD_MODE);
  } catch (err) {
    console.error('[configure-template] Gagal:', err.message);
    process.exit(1);
  }
})();
