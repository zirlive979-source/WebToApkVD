/**
 * WebToApkVD - Cloud Functions
 *
 * triggerBuild   : dipanggil frontend (public/index.html) buat mulai build.
 *                  Bikin dokumen job di Firestore, lalu memicu GitHub Actions
 *                  workflow_dispatch lewat GitHub REST API. Token GitHub
 *                  disimpan sebagai secret, TIDAK PERNAH dikirim ke browser.
 *
 * buildCallback  : dipanggil GitHub Actions (.github/workflows/build-apk.yml)
 *                  di akhir proses build buat update status job di Firestore.
 *                  Dilindungi header X-Callback-Secret.
 *
 * GANTI dulu GITHUB_OWNER & GITHUB_REPO di bawah sesuai repo GitHub kamu
 * sebelum deploy.
 */

const {onRequest} = require('firebase-functions/v2/https');
const {defineSecret} = require('firebase-functions/params');
const admin = require('firebase-admin');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();

const GITHUB_TOKEN = defineSecret('GITHUB_TOKEN');
const CALLBACK_SECRET = defineSecret('CALLBACK_SECRET');

// GANTI sesuai repo GitHub kamu:
const GITHUB_OWNER = 'GANTI_USERNAME_GITHUB';
const GITHUB_REPO = 'WebToApkVD';
const WORKFLOW_FILE = 'build-apk.yml';
const GITHUB_BRANCH = 'main';

function githubRequest(token, apiPath, method, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'api.github.com',
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'WebToApkVD-CloudFunctions',
          'Content-Type': 'application/json',
          ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}),
        },
      },
      (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(out ? JSON.parse(out) : {});
          } else {
            reject(new Error(`GitHub API ${res.statusCode}: ${out}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
}

exports.triggerBuild = onRequest(
  {secrets: [GITHUB_TOKEN]},
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'POST') {
      return res.status(405).json({error: 'Method not allowed'});
    }

    const {siteUrl, appName, packageName, iconUrl, buildMode} = req.body || {};

    if (!siteUrl || !appName || !packageName) {
      return res.status(400).json({
        error: 'siteUrl, appName, dan packageName wajib diisi',
      });
    }

    const normalizedMode = buildMode === 'offline' ? 'offline' : 'online';

    // Nama koleksi sengaja di-namespace "webtoapkvd_jobs" (bukan cuma "jobs")
    // karena project Firebase ini dipakai bareng banyak app lain.
    const jobRef = db.collection('webtoapkvd_jobs').doc();
    await jobRef.set({
      siteUrl,
      appName,
      packageName,
      iconUrl: iconUrl || null,
      buildMode: normalizedMode,
      status: 'queued',
      downloadUrl: null,
      errorMessage: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    try {
      await githubRequest(
        GITHUB_TOKEN.value(),
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
        'POST',
        {
          ref: GITHUB_BRANCH,
          inputs: {
            site_url: siteUrl,
            app_name: appName,
            package_name: packageName,
            icon_url: iconUrl || '',
            build_mode: normalizedMode,
            job_id: jobRef.id,
          },
        }
      );

      await jobRef.update({status: 'processing'});
      return res.json({jobId: jobRef.id});
    } catch (err) {
      await jobRef.update({status: 'error', errorMessage: err.message});
      return res.status(502).json({
        error: 'Gagal memicu build di GitHub Actions',
        detail: err.message,
      });
    }
  }
);

exports.buildCallback = onRequest(
  {secrets: [CALLBACK_SECRET]},
  async (req, res) => {
    if (req.method !== 'POST') {
      return res.status(405).send('Method not allowed');
    }
    if (req.headers['x-callback-secret'] !== CALLBACK_SECRET.value()) {
      return res.status(401).send('Unauthorized');
    }

    const {jobId, status, downloadUrl, errorMessage} = req.body || {};
    if (!jobId) {
      return res.status(400).send('jobId wajib diisi');
    }

    await db
      .collection('webtoapkvd_jobs')
      .doc(jobId)
      .update({
        status: status || 'done',
        downloadUrl: downloadUrl || null,
        errorMessage: errorMessage || null,
        finishedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return res.json({ok: true});
  }
);
