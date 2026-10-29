const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = __dirname;
const BUILD_DIR = path.join(PROJECT_ROOT, 'android-build');
const SDK_DIR = 'C:\\Users\\Devod\\AppData\\Local\\Android\\Sdk';
const BUILD_TOOLS = path.join(SDK_DIR, 'build-tools', '36.1.0');
const PLATFORM_JAR = path.join(SDK_DIR, 'platforms', 'android-35', 'android.jar');
const JDK_BIN = 'C:\\Program Files\\Java\\jdk-11\\bin';
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');

const AAPT2 = path.join(BUILD_TOOLS, 'aapt2.exe');
const D8 = path.join(BUILD_TOOLS, 'd8.bat');
const ZIPALIGN = path.join(BUILD_TOOLS, 'zipalign.exe');
const APKSIGNER = path.join(BUILD_TOOLS, 'apksigner.bat');
const JAVAC = path.join(JDK_BIN, 'javac.exe');
const KEYTOOL = path.join(JDK_BIN, 'keytool.exe');

console.log('🚀 Memulai Pembuatan APK Android AuraSound...');

// 1. Bersihkan & buat direktori kerja
if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
}
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

fs.mkdirSync(path.join(BUILD_DIR, 'res', 'values'), { recursive: true });
fs.mkdirSync(path.join(BUILD_DIR, 'res', 'layout'), { recursive: true });
fs.mkdirSync(path.join(BUILD_DIR, 'res', 'mipmap-xxhdpi'), { recursive: true });
fs.mkdirSync(path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub'), { recursive: true });
fs.mkdirSync(path.join(BUILD_DIR, 'bin'), { recursive: true });
fs.mkdirSync(path.join(BUILD_DIR, 'gen'), { recursive: true });

// 2. Salin Icon App
const iconSrc = path.join(PROJECT_ROOT, 'public', 'icons', 'icon.png');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(BUILD_DIR, 'res', 'mipmap-xxhdpi', 'ic_launcher.png'));
}

// 3. Buat strings.xml
fs.writeFileSync(path.join(BUILD_DIR, 'res', 'values', 'strings.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">AuraSound</string>
</resources>
`);

// 4. Buat styles.xml
fs.writeFileSync(path.join(BUILD_DIR, 'res', 'values', 'styles.xml'), `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="android:Theme.Material.NoActionBar">
        <item name="android:statusBarColor">#070a12</item>
        <item name="android:navigationBarColor">#070a12</item>
        <item name="android:windowBackground">#070a12</item>
    </style>
</resources>
`);

// 5. Buat layout activity_main.xml
fs.writeFileSync(path.join(BUILD_DIR, 'res', 'layout', 'activity_main.xml'), `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#070a12">

    <WebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</FrameLayout>
`);

// 6. Buat AndroidManifest.xml
fs.writeFileSync(path.join(BUILD_DIR, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.aurasound.musichub"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-sdk
        android:minSdkVersion="24"
        android:targetSdkVersion="35" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`);

// 7. Buat MainActivity.java
fs.writeFileSync(path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub', 'MainActivity.java'), `package com.aurasound.musichub;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String APP_URL = "https://project-aplikasi-music.vercel.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        initWebView();
        webView.clearCache(true);
        webView.loadUrl(APP_URL);
    }

    private void initWebView() {
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setOffscreenPreRaster(true);
        settings.setEnableSmoothTransition(true);
        settings.setUserAgentString(settings.getUserAgentString() + " AuraSoundAndroid/1.0");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep all navigations, YouTube iframe audio, and media streams inside AuraSound WebView
                // Prevents Android OS from triggering external intent to native YouTube app
                return false;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    String errorHtml = "<html><body style='background:#070a12; color:#fff; font-family:sans-serif; text-align:center; padding:40px 20px;'>"
                        + "<h2 style='color:#10b981;'>AuraSound Music Hub</h2>"
                        + "<p style='color:#94a3b8; font-size:14px;'>Tidak dapat terhubung ke server online.</p>"
                        + "<p style='color:#cbd5e1; font-size:13px;'>Pastikan koneksi internet (kuota data atau Wi-Fi) di HP Anda aktif.</p>"
                        + "<button onclick='location.reload()' style='background:#10b981; color:#fff; border:none; padding:12px 24px; border-radius:8px; font-weight:bold; margin-top:20px; font-size:15px;'>Coba Sambung Lagi</button>"
                        + "</body></html>";
                    view.loadDataWithBaseURL(null, errorHtml, "text/html", "utf-8", null);
                }
            }
        });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
`);

// 8. Eksekusi Kompilasi dengan SDK
try {
  console.log('📦 [1/6] Mengompilasi resource dengan aapt2...');
  execSync(`"${AAPT2}" compile --dir "${path.join(BUILD_DIR, 'res')}" -o "${path.join(BUILD_DIR, 'compiled_res.zip')}"`, { stdio: 'inherit' });

  console.log('🔗 [2/6] Linking resource & menghasilkan R.java...');
  execSync(`"${AAPT2}" link "${path.join(BUILD_DIR, 'compiled_res.zip')}" -I "${PLATFORM_JAR}" --manifest "${path.join(BUILD_DIR, 'AndroidManifest.xml')}" --min-sdk-version 24 --target-sdk-version 35 --java "${path.join(BUILD_DIR, 'gen')}" -o "${path.join(BUILD_DIR, 'initial.apk')}"`, { stdio: 'inherit' });

  console.log('☕ [3/6] Mengompilasi kode Java...');
  const javaFiles = [
    `"${path.join(BUILD_DIR, 'gen', 'com', 'aurasound', 'musichub', 'R.java')}"`,
    `"${path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub', 'MainActivity.java')}"`
  ].join(' ');

  execSync(`"${JAVAC}" -d "${path.join(BUILD_DIR, 'bin')}" -cp "${PLATFORM_JAR}" ${javaFiles}`, { stdio: 'inherit' });

  console.log('⚡ [4/6] Menghasilkan classes.dex dengan d8...');
  const classFiles = fs.readdirSync(path.join(BUILD_DIR, 'bin', 'com', 'aurasound', 'musichub'))
    .filter(f => f.endsWith('.class'))
    .map(f => `"${path.join(BUILD_DIR, 'bin', 'com', 'aurasound', 'musichub', f)}"`)
    .join(' ');

  execSync(`"${D8}" --min-api 24 --output "${path.join(BUILD_DIR, 'bin')}" --lib "${PLATFORM_JAR}" ${classFiles}`, { stdio: 'inherit' });

  console.log('📁 [5/6] Memasukkan classes.dex ke dalam APK...');
  // Menggunakan jar/zip untuk memasukkan classes.dex
  const JAR = path.join(JDK_BIN, 'jar.exe');
  process.chdir(path.join(BUILD_DIR, 'bin'));
  execSync(`"${JAR}" -uf "${path.join(BUILD_DIR, 'initial.apk')}" classes.dex`, { stdio: 'inherit' });
  process.chdir(PROJECT_ROOT);

  console.log('🔐 [6/6] Zipalign & Menandatangani APK...');
  const alignedApk = path.join(BUILD_DIR, 'aligned.apk');
  const finalApk = path.join(DIST_DIR, 'AuraSound.apk');

  execSync(`"${ZIPALIGN}" -f 4 "${path.join(BUILD_DIR, 'initial.apk')}" "${alignedApk}"`, { stdio: 'inherit' });

  // Generate debug keystore jika belum ada
  const keystorePath = path.join(BUILD_DIR, 'debug.keystore');
  if (!fs.existsSync(keystorePath)) {
    execSync(`"${KEYTOOL}" -genkeypair -validity 10000 -dname "CN=AuraSound,O=AuraSound,C=ID" -keystore "${keystorePath}" -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048`, { stdio: 'inherit' });
  }

  execSync(`"${APKSIGNER}" sign --ks "${keystorePath}" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey --out "${finalApk}" "${alignedApk}"`, { stdio: 'inherit' });

  console.log('========================================================');
  console.log('🎉 APK ANDROID BERHASIL DIBUAT!');
  console.log(`📍 Lokasi File: ${finalApk}`);
  console.log('========================================================');
} catch (err) {
  console.error('❌ Terjadi kesalahan saat membuat APK:', err.message);
  process.exit(1);
}
