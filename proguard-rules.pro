# minifyEnabled false secara default, jadi file ini nyaris tidak dipakai.
# Disiapkan kalau nanti mau aktifkan minify/R8 di masa depan.
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
