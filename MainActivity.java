package com.webtoapkvd.template;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Shell WebView untuk aplikasi hasil generate WebToApkVD.
 *
 * Mode ONLINE  -> load langsung dari target_url (butuh internet tiap dibuka)
 * Mode OFFLINE -> load dari assets/www/index.html yang sudah di-bundle
 *                 (hasil scripts/site-downloader.js), jalan tanpa internet
 *                 untuk bagian statisnya. Bagian yang tetap butuh backend
 *                 (login, data real-time, dsb) tetap butuh koneksi saat dipakai.
 *
 * Nilai app_name / target_url / build_mode di strings.xml ini di-patch
 * otomatis oleh scripts/configure-template.js sebelum proses build.
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private SwipeRefreshLayout swipeRefresh;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        swipeRefresh = findViewById(R.id.swipe_refresh);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                swipeRefresh.setRefreshing(false);
            }
        });

        swipeRefresh.setOnRefreshListener(() -> webView.reload());
        // Offline bundle bersifat statis: nonaktifkan pull-to-refresh di mode itu
        // supaya tidak terkesan bisa "refresh" data yang sebenarnya tidak live.
        swipeRefresh.setEnabled("online".equals(getString(R.string.build_mode)));

        loadTarget();
    }

    private void loadTarget() {
        String buildMode = getString(R.string.build_mode); // "online" atau "offline"
        if ("offline".equals(buildMode)) {
            webView.loadUrl("file:///android_asset/www/index.html");
        } else {
            webView.loadUrl(getString(R.string.target_url));
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
