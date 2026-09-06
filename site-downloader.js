#!/usr/bin/env node
/**
 * site-downloader.js
 *
 * Download halaman utama + asset same-origin (css/js/gambar) dari SITE_URL,
 * lalu tulis ke android-template/app/src/main/assets/www/ untuk mode OFFLINE.
 *
 * CATATAN: ini bundler 1 halaman (landing page / situs statis sederhana),
 * BUKAN crawler multi-halaman penuh. Kalau situs targetnya berbasis
 * Firebase/API dinamis (login, chat real-time, dsb), bagian itu tetap butuh
 * koneksi internet saat APK dipakai -- yang di-bundle offline cuma tampilan
 * statisnya.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const {URL} = require('url');
const cheerio = require('cheerio');

const SITE_URL = process.env.SITE_URL;
const OUT_DIR = path.join(__dirname, '..', 'android-template/app/src/main/assets/www');

if (!SITE_URL) {
  console.error('[site-downloader] SITE_URL wajib diisi untuk mode offline.');
  process.exit(1);
}

function fetchText(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        fetchText(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Gagal fetch ${url}: status ${res.statusCode}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        res.resume();
        fetchBuffer(new URL(res.headers.location, url).toString(), redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Gagal fetch ${url}: status ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function isSameOrigin(assetUrl, baseUrl) {
  try {
    const a = new URL(assetUrl, baseUrl);
    const b = new URL(baseUrl);
    return a.origin === b.origin;
  } catch {
    return false;
  }
}

function localPathFor(assetUrl, baseUrl) {
  const u = new URL(assetUrl, baseUrl);
  let p = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
  if (!p || p.endsWith('/')) p += 'asset';
  return p;
}

async function saveAsset(assetUrl, baseUrl) {
  if (!assetUrl || assetUrl.startsWith('data:')) return null;
  if (!isSameOrigin(assetUrl, baseUrl)) return null; // lewati asset lintas domain (CDN dsb tetap butuh internet saat online)

  try {
    const absoluteUrl = new URL(assetUrl, baseUrl).toString();
    const buffer = await fetchBuffer(absoluteUrl);
    const relPath = localPathFor(assetUrl, baseUrl);
    const fullPath = path.join(OUT_DIR, relPath);
    fs.mkdirSync(path.dirname(fullPath), {recursive: true});
    fs.writeFileSync(fullPath, buffer);
    return relPath;
  } catch (err) {
    console.warn('[site-downloader] Lewati asset (gagal download):', assetUrl, '-', err.message);
    return null;
  }
}

(async () => {
  console.log('[site-downloader] Download halaman utama:', SITE_URL);
  fs.mkdirSync(OUT_DIR, {recursive: true});

  const html = await fetchText(SITE_URL);
  const $ = cheerio.load(html);

  const targets = [
    {sel: 'link[rel="stylesheet"]', attr: 'href'},
    {sel: 'script[src]', attr: 'src'},
    {sel: 'img[src]', attr: 'src'},
    {sel: 'link[rel="icon"]', attr: 'href'},
  ];

  let savedCount = 0;
  for (const {sel, attr} of targets) {
    const elements = $(sel).toArray();
    for (const el of elements) {
      const src = $(el).attr(attr);
      const relPath = await saveAsset(src, SITE_URL);
      if (relPath) {
        $(el).attr(attr, relPath);
        savedCount++;
      }
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), $.html(), 'utf8');
  console.log(`[site-downloader] Selesai. ${savedCount} asset same-origin disimpan ke assets/www/.`);
})().catch((err) => {
  console.error('[site-downloader] Gagal:', err.message);
  process.exit(1);
});
