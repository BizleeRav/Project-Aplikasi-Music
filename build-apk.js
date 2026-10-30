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

    <com.aurasound.musichub.BackgroundAudioWebView
        android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />
</FrameLayout>
`);

// 5b. Buat BackgroundAudioWebView.java
fs.writeFileSync(path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub', 'BackgroundAudioWebView.java'), `package com.aurasound.musichub;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import android.webkit.WebView;

public class BackgroundAudioWebView extends WebView {
    public BackgroundAudioWebView(Context context) {
        super(context);
    }

    public BackgroundAudioWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public BackgroundAudioWebView(Context context, AttributeSet attrs, int defStyleAttr) {
        super(context, attrs, defStyleAttr);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        // Chromium pauses HTML5 media and JavaScript timers when window is not VISIBLE.
        // Forcing View.VISIBLE tells Chromium's C++ core that the window is always visible,
        // so playback and audio streams continue uninterrupted when the screen is locked or app is minimized!
        super.onWindowVisibilityChanged(View.VISIBLE);
    }

    @Override
    public void dispatchWindowVisibilityChanged(int visibility) {
        super.dispatchWindowVisibilityChanged(View.VISIBLE);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, View.VISIBLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasWindowFocus) {
        super.onWindowFocusChanged(true);
    }
}
`);

// 6. Buat AndroidManifest.xml
fs.writeFileSync(path.join(BUILD_DIR, 'AndroidManifest.xml'), `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.aurasound.musichub"
    android:versionCode="2"
    android:versionName="1.1.0">

    <uses-sdk
        android:minSdkVersion="24"
        android:targetSdkVersion="35" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="true"
        android:hardwareAccelerated="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".MediaPlaybackService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
    </application>
</manifest>
`);

// 7. Buat AndroidMediaBridge.java
fs.writeFileSync(path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub', 'AndroidMediaBridge.java'), `package com.aurasound.musichub;

import android.webkit.JavascriptInterface;

public class AndroidMediaBridge {
    private MainActivity activity;

    public AndroidMediaBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void updatePlaybackState(String title, String artist, String coverUrl, boolean isPlaying) {
        if (activity != null) {
            activity.updateMediaNotification(title, artist, coverUrl, isPlaying, 0, 0);
        }
    }

    @JavascriptInterface
    public void updatePlaybackStateWithProgress(String title, String artist, String coverUrl, boolean isPlaying, long positionMs, long durationMs) {
        if (activity != null) {
            activity.updateMediaNotification(title, artist, coverUrl, isPlaying, positionMs, durationMs);
        }
    }

    @JavascriptInterface
    public void updatePlaybackProgress(long positionMs, long durationMs, boolean isPlaying) {
        if (activity != null) {
            activity.updateMediaProgress(positionMs, durationMs, isPlaying);
        }
    }

    @JavascriptInterface
    public void stopPlayback() {
        if (activity != null) {
            activity.stopMediaService();
        }
    }

    @JavascriptInterface
    public boolean isAndroidApp() {
        return true;
    }
}
`);

// 8. Buat MediaPlaybackService.java
fs.writeFileSync(path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub', 'MediaPlaybackService.java'), `package com.aurasound.musichub;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MediaPlaybackService extends Service {
    public static final String CHANNEL_ID = "aurasound_playback_channel";
    public static final int NOTIFICATION_ID = 1001;

    public static final String ACTION_UPDATE = "ACTION_UPDATE";
    public static final String ACTION_PROGRESS = "ACTION_PROGRESS";
    public static final String ACTION_PLAY_PAUSE = "ACTION_PLAY_PAUSE";
    public static final String ACTION_PLAY = "ACTION_PLAY";
    public static final String ACTION_PAUSE = "ACTION_PAUSE";
    public static final String ACTION_NEXT = "ACTION_NEXT";
    public static final String ACTION_PREV = "ACTION_PREV";
    public static final String ACTION_CLOSE = "ACTION_CLOSE";

    private MediaSession mediaSession;
    private PowerManager.WakeLock wakeLock;
    private Handler mainHandler;

    private String currentTitle = "AuraSound Music";
    private String currentArtist = "AuraSound";
    private String currentCoverUrl = "";
    private Bitmap currentCoverBitmap = null;
    private boolean isPlaying = false;
    private long currentPositionMs = 0;
    private long currentDurationMs = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
        initMediaSession();

        Notification initialNotification = buildNotification(currentTitle, currentArtist, null, false);
        startServiceForeground(initialNotification);
    }

    private void startServiceForeground(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void initMediaSession() {
        try {
            mediaSession = new MediaSession(this, "AuraSoundSession");
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override
                public void onPlay() {
                    super.onPlay();
                    MainActivity.sendMediaAction("play");
                }

                @Override
                public void onPause() {
                    super.onPause();
                    MainActivity.sendMediaAction("pause");
                }

                @Override
                public void onSkipToNext() {
                    super.onSkipToNext();
                    MainActivity.sendMediaAction("next");
                }

                @Override
                public void onSkipToPrevious() {
                    super.onSkipToPrevious();
                    MainActivity.sendMediaAction("prev");
                }

                @Override
                public void onSeekTo(long pos) {
                    super.onSeekTo(pos);
                    currentPositionMs = pos;
                    updateMediaSessionState();
                    MainActivity.sendSeekAction(pos);
                }

                @Override
                public void onStop() {
                    super.onStop();
                    MainActivity.sendMediaAction("pause");
                    stopSelf();
                }
            });
            mediaSession.setActive(true);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "AuraSound Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notifikasi kontrol pemutar musik AuraSound");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_UPDATE.equals(action)) {
                String title = intent.getStringExtra("title");
                String artist = intent.getStringExtra("artist");
                String coverUrl = intent.getStringExtra("coverUrl");
                boolean playing = intent.getBooleanExtra("isPlaying", false);
                long pos = intent.getLongExtra("positionMs", 0);
                long dur = intent.getLongExtra("durationMs", 0);
                updatePlayback(title, artist, coverUrl, playing, pos, dur);
            } else if (ACTION_PROGRESS.equals(action)) {
                long pos = intent.getLongExtra("positionMs", 0);
                long dur = intent.getLongExtra("durationMs", 0);
                boolean playing = intent.getBooleanExtra("isPlaying", false);
                updateProgressOnly(pos, dur, playing);
            } else if (ACTION_PLAY_PAUSE.equals(action)) {
                MainActivity.sendMediaAction("play_pause");
            } else if (ACTION_PLAY.equals(action)) {
                MainActivity.sendMediaAction("play");
            } else if (ACTION_PAUSE.equals(action)) {
                MainActivity.sendMediaAction("pause");
            } else if (ACTION_NEXT.equals(action)) {
                MainActivity.sendMediaAction("next");
            } else if (ACTION_PREV.equals(action)) {
                MainActivity.sendMediaAction("prev");
            } else if (ACTION_CLOSE.equals(action)) {
                MainActivity.sendMediaAction("pause");
                releaseWakeLock();
                stopForeground(true);
                stopSelf();
            }
        }
        return START_NOT_STICKY;
    }

    private void updateProgressOnly(long pos, long dur, boolean playing) {
        if (pos > 0) this.currentPositionMs = pos;
        if (dur > 0) this.currentDurationMs = dur;
        this.isPlaying = playing;
        updateMediaSessionState();
    }

    private void updatePlayback(String title, String artist, String coverUrl, boolean playing, long pos, long dur) {
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "AuraSound Music";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "AuraSound";
        this.isPlaying = playing;
        if (pos > 0) this.currentPositionMs = pos;
        if (dur > 0) this.currentDurationMs = dur;

        if (playing) {
            acquireWakeLock();
        } else {
            releaseWakeLock();
        }

        updateMediaSessionState();

        if (coverUrl != null && !coverUrl.equals(currentCoverUrl) && !coverUrl.isEmpty()) {
            this.currentCoverUrl = coverUrl;
            Notification notif = buildNotification(currentTitle, currentArtist, currentCoverBitmap, isPlaying);
            startServiceForeground(notif);
            loadCoverBitmapAsync(coverUrl);
        } else {
            Notification notif = buildNotification(currentTitle, currentArtist, currentCoverBitmap, isPlaying);
            startServiceForeground(notif);
        }
    }

    private void updateMediaSessionState() {
        if (mediaSession == null) return;
        try {
            long actions = PlaybackState.ACTION_PLAY
                    | PlaybackState.ACTION_PAUSE
                    | PlaybackState.ACTION_PLAY_PAUSE
                    | PlaybackState.ACTION_SKIP_TO_NEXT
                    | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                    | PlaybackState.ACTION_SEEK_TO
                    | PlaybackState.ACTION_STOP;

            int state = isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
            float speed = isPlaying ? 1.0f : 0.0f;

            PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(state, currentPositionMs, speed);
            mediaSession.setPlaybackState(stateBuilder.build());

            MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM, "AuraSound Music Hub");

            if (currentDurationMs > 0) {
                metaBuilder.putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs);
            }

            if (currentCoverBitmap != null) {
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentCoverBitmap);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, currentCoverBitmap);
            }
            mediaSession.setMetadata(metaBuilder.build());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void loadCoverBitmapAsync(final String urlStr) {
        new Thread(() -> {
            Bitmap bitmap = null;
            try {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.setDoInput(true);
                conn.connect();
                InputStream is = conn.getInputStream();
                Bitmap raw = BitmapFactory.decodeStream(is);
                if (raw != null) {
                    int maxDim = 384;
                    int w = raw.getWidth();
                    int h = raw.getHeight();
                    if (w > maxDim || h > maxDim) {
                        float ratio = Math.min((float) maxDim / w, (float) maxDim / h);
                        int targetW = Math.max(1, Math.round(w * ratio));
                        int targetH = Math.max(1, Math.round(h * ratio));
                        bitmap = Bitmap.createScaledBitmap(raw, targetW, targetH, true);
                    } else {
                        bitmap = raw;
                    }
                }
            } catch (Exception e) {
                bitmap = null;
            }

            final Bitmap finalBitmap = bitmap;
            mainHandler.post(() -> {
                if (urlStr.equals(currentCoverUrl)) {
                    currentCoverBitmap = finalBitmap;
                    updateMediaSessionState();
                    Notification notif = buildNotification(currentTitle, currentArtist, currentCoverBitmap, isPlaying);
                    startServiceForeground(notif);
                }
            });
        }).start();
    }

    private Notification buildNotification(String title, String artist, Bitmap cover, boolean playing) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(this, 0, contentIntent, flags);

        Intent prevIntent = new Intent(this, MediaPlaybackService.class).setAction(ACTION_PREV);
        PendingIntent prevPending = PendingIntent.getService(this, 1, prevIntent, flags);

        Intent playPauseIntent = new Intent(this, MediaPlaybackService.class).setAction(ACTION_PLAY_PAUSE);
        PendingIntent playPausePending = PendingIntent.getService(this, 2, playPauseIntent, flags);

        Intent nextIntent = new Intent(this, MediaPlaybackService.class).setAction(ACTION_NEXT);
        PendingIntent nextPending = PendingIntent.getService(this, 3, nextIntent, flags);

        Intent closeIntent = new Intent(this, MediaPlaybackService.class).setAction(ACTION_CLOSE);
        PendingIntent closePending = PendingIntent.getService(this, 4, closeIntent, flags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(artist)
                .setSubText("AuraSound")
                .setContentIntent(contentPendingIntent)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(playing);

        if (cover != null) {
            builder.setLargeIcon(cover);
        }

        if (currentDurationMs > 0) {
            builder.setProgress((int) (currentDurationMs / 1000), (int) (currentPositionMs / 1000), false);
        }

        if (mediaSession != null) {
            Notification.MediaStyle mediaStyle = new Notification.MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2);
            builder.setStyle(mediaStyle);
        }

        // Action 0: Prev
        builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_previous),
                "Prev",
                prevPending
        ).build());

        // Action 1: Play / Pause
        int playIconRes = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playTitle = playing ? "Pause" : "Play";
        builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, playIconRes),
                playTitle,
                playPausePending
        ).build());

        // Action 2: Next
        builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_media_next),
                "Next",
                nextPending
        ).build());

        // Action 3: Close
        builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
                "Close",
                closePending
        ).build());

        return builder.build();
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AuraSound:PlaybackWakeLock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(12 * 60 * 60 * 1000L);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
`);

// 9. Buat MainActivity.java
fs.writeFileSync(path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub', 'MainActivity.java'), `package com.aurasound.musichub;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    public static MainActivity instance;
    private BackgroundAudioWebView webView;
    private static final String APP_URL = "https://project-aplikasi-music.vercel.app";
    private Handler bridgeHandler = new Handler(Looper.getMainLooper());
    private Runnable bridgeRunnable;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;

        getWindow().setFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED, WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        initWebView();
        requestAudioFocus();
        requestNotificationPermission();

        webView.clearCache(true);
        webView.loadUrl(APP_URL);

        startPeriodicBridgeSync();
    }

    private void requestAudioFocus() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 1001);
            }
        }
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
        settings.setUserAgentString(settings.getUserAgentString() + " AuraSoundAndroid/1.2");

        // Expose Native Android Bridge to JavaScript
        webView.addJavascriptInterface(new AndroidMediaBridge(this), "AuraSoundAndroid");

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }

            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                injectUniversalBridge();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectUniversalBridge();
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

    private void startPeriodicBridgeSync() {
        bridgeRunnable = new Runnable() {
            @Override
            public void run() {
                injectUniversalBridge();
                bridgeHandler.postDelayed(this, 2000);
            }
        };
        bridgeHandler.postDelayed(bridgeRunnable, 1500);
    }

    private void injectUniversalBridge() {
        if (webView == null) return;
        String js = "(function() {"
            + "try {"
            + "  Object.defineProperty(document, 'hidden', { get: function() { return false; }, configurable: true });"
            + "  Object.defineProperty(document, 'visibilityState', { get: function() { return 'visible'; }, configurable: true });"
            + "  document.hasFocus = function() { return true; };"
            + "  document.addEventListener('visibilitychange', function(e) { e.stopImmediatePropagation(); }, true);"
            + "  window.addEventListener('blur', function(e) { e.stopImmediatePropagation(); }, true);"
            + "  window.addEventListener('pagehide', function(e) { e.stopImmediatePropagation(); }, true);"
            + "} catch(e) {}"
            + "if (!window.__aurasound_watchdog_active) {"
            + "  window.__aurasound_watchdog_active = true;"
            + "  function getPlaybackInfo() {"
            + "    var isPlaying = false;"
            + "    var title = '';"
            + "    var artist = '';"
            + "    var cover = '';"
            + "    var curSec = 0;"
            + "    var durSec = 0;"
            + "    if (window.app && window.app.currentTrack) {"
            + "      title = window.app.currentTrack.title || '';"
            + "      artist = window.app.currentTrack.artist || '';"
            + "      cover = window.app.currentTrack.thumbnail || '';"
            + "      if (window.app.isPlaying) isPlaying = true;"
            + "    } else if (window.ytPlayer && window.ytPlayer.currentTrack) {"
            + "      title = window.ytPlayer.currentTrack.title || '';"
            + "      artist = window.ytPlayer.currentTrack.artist || '';"
            + "      cover = window.ytPlayer.currentTrack.thumbnail || '';"
            + "      if (window.ytPlayer.isPlaying) isPlaying = true;"
            + "    }"
            + "    if (window.ytPlayer) {"
            + "      if (typeof window.ytPlayer.getCurrentTime === 'function') {"
            + "        curSec = window.ytPlayer.getCurrentTime() || 0;"
            + "      }"
            + "      if (window.ytPlayer.player && typeof window.ytPlayer.player.getDuration === 'function') {"
            + "        durSec = window.ytPlayer.player.getDuration() || 0;"
            + "      }"
            + "      if (window.ytPlayer.player && typeof window.ytPlayer.player.getPlayerState === 'function') {"
            + "        var ytState = window.ytPlayer.player.getPlayerState();"
            + "        if (ytState === 1) isPlaying = true;"
            + "      }"
            + "    }"
            + "    if ((!durSec || window.app?.currentAudioMode === 'native') && window.app && window.app.nativeAudio) {"
            + "      if (window.app.nativeAudio.duration) {"
            + "        durSec = window.app.nativeAudio.duration;"
            + "        curSec = window.app.nativeAudio.currentTime || 0;"
            + "      }"
            + "    }"
            + "    if (!durSec && window.app && window.app.currentTrack && window.app.currentTrack.duration) {"
            + "      var d = window.app.currentTrack.duration;"
            + "      if (typeof d === 'number') durSec = d;"
            + "      else if (typeof d === 'string' && d.includes(':')) {"
            + "        var p = d.split(':').map(Number);"
            + "        if (p.length === 2) durSec = p[0] * 60 + p[1];"
            + "        else if (p.length === 3) durSec = p[0] * 3600 + p[1] * 60 + p[2];"
            + "      }"
            + "    }"
            + "    return {"
            + "      title: title,"
            + "      artist: artist,"
            + "      cover: cover,"
            + "      isPlaying: isPlaying,"
            + "      posMs: Math.round(curSec * 1000),"
            + "      durMs: Math.round(durSec * 1000)"
            + "    };"
            + "  }"
            + "  setInterval(function() {"
            + "    try {"
            + "      var info = getPlaybackInfo();"
            + "      if (window.ytPlayer && window.ytPlayer.player && typeof window.ytPlayer.player.getPlayerState === 'function') {"
            + "        var state = window.ytPlayer.player.getPlayerState();"
            + "        if (state === 2 && info.isPlaying && !window.__userRequestedPause) {"
            + "          window.ytPlayer.player.playVideo();"
            + "        }"
            + "      }"
            + "      if (window.AuraSoundAndroid && info.title) {"
            + "        var titleChanged = (window.__lastSyncedTitle !== info.title);"
            + "        var stateChanged = (window.__lastSyncedState !== info.isPlaying);"
            + "        var durChanged = (window.__lastSyncedDuration !== info.durMs && info.durMs > 0);"
            + "        if (titleChanged || stateChanged || durChanged) {"
            + "          window.__lastSyncedTitle = info.title;"
            + "          window.__lastSyncedState = info.isPlaying;"
            + "          window.__lastSyncedDuration = info.durMs;"
            + "          window.AuraSoundAndroid.updatePlaybackStateWithProgress(info.title, info.artist, info.cover, info.isPlaying, info.posMs, info.durMs);"
            + "        } else if (info.isPlaying) {"
            + "          if (!window.__lastPosTick || Date.now() - window.__lastPosTick > 3000) {"
            + "            window.__lastPosTick = Date.now();"
            + "            window.AuraSoundAndroid.updatePlaybackProgress(info.posMs, info.durMs, true);"
            + "          }"
            + "        }"
            + "      }"
            + "    } catch(err) {}"
            + "  }, 1000);"
            + "}"
            + "})();";
        webView.evaluateJavascript(js, null);
    }

    public void updateMediaNotification(String title, String artist, String coverUrl, boolean isPlaying, long positionMs, long durationMs) {
        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(this, MediaPlaybackService.class);
                intent.setAction(MediaPlaybackService.ACTION_UPDATE);
                intent.putExtra("title", title);
                intent.putExtra("artist", artist);
                intent.putExtra("coverUrl", coverUrl);
                intent.putExtra("isPlaying", isPlaying);
                intent.putExtra("positionMs", positionMs);
                intent.putExtra("durationMs", durationMs);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    startForegroundService(intent);
                } else {
                    startService(intent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public void updateMediaProgress(long positionMs, long durationMs, boolean isPlaying) {
        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(this, MediaPlaybackService.class);
                intent.setAction(MediaPlaybackService.ACTION_PROGRESS);
                intent.putExtra("positionMs", positionMs);
                intent.putExtra("durationMs", durationMs);
                intent.putExtra("isPlaying", isPlaying);
                startService(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public void stopMediaService() {
        runOnUiThread(() -> {
            try {
                Intent intent = new Intent(this, MediaPlaybackService.class);
                stopService(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public static void sendMediaAction(String action) {
        if (instance != null) {
            instance.runOnUiThread(() -> instance.handleMediaAction(action));
        }
    }

    public static void sendSeekAction(long positionMs) {
        if (instance != null) {
            instance.runOnUiThread(() -> instance.handleSeekAction(positionMs));
        }
    }

    public void handleSeekAction(long positionMs) {
        if (webView == null) return;
        double sec = positionMs / 1000.0;
        String js = "(function() {"
            + "var s = " + sec + ";"
            + "if (window.ytPlayer && window.ytPlayer.seekTo) { window.ytPlayer.seekTo(s); }"
            + "if (window.app && window.app.nativeAudio) { window.app.nativeAudio.currentTime = s; }"
            + "})();";
        webView.evaluateJavascript(js, null);
    }

    public void handleMediaAction(String action) {
        if (webView == null) return;
        if ("play_pause".equals(action)) {
            webView.evaluateJavascript("if (window.app && window.app.togglePlay) { window.app.togglePlay(); } else if (window.ytPlayer) { window.ytPlayer.togglePlay(); }", null);
        } else if ("play".equals(action)) {
            webView.evaluateJavascript("window.__userRequestedPause = false; if (window.app && window.app.isPlaying === false) { window.app.togglePlay(); } else if (window.ytPlayer) { window.ytPlayer.play(); }", null);
        } else if ("pause".equals(action)) {
            webView.evaluateJavascript("window.__userRequestedPause = true; if (window.app && window.app.isPlaying === true) { window.app.togglePlay(); } else if (window.ytPlayer) { window.ytPlayer.pause(); }", null);
        } else if ("next".equals(action)) {
            webView.evaluateJavascript("if (window.app && window.app.playNext) { window.app.playNext(); }", null);
        } else if ("prev".equals(action)) {
            webView.evaluateJavascript("if (window.app && window.app.playPrev) { window.app.playPrev(); }", null);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Do NOT call webView.onPause() or pauseTimers() - allows uninterrupted background audio playback!
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Foreground Service keeps the process active while app is minimized
    }

    @Override
    protected void onDestroy() {
        if (bridgeRunnable != null) {
            bridgeHandler.removeCallbacks(bridgeRunnable);
        }
        instance = null;
        stopMediaService();
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
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

// 10. Eksekusi Kompilasi dengan SDK
try {
  console.log('📦 [1/6] Mengompilasi resource dengan aapt2...');
  execSync(`"${AAPT2}" compile --dir "${path.join(BUILD_DIR, 'res')}" -o "${path.join(BUILD_DIR, 'compiled_res.zip')}"`, { stdio: 'inherit' });

  console.log('🔗 [2/6] Linking resource & menghasilkan R.java...');
  execSync(`"${AAPT2}" link "${path.join(BUILD_DIR, 'compiled_res.zip')}" -I "${PLATFORM_JAR}" --manifest "${path.join(BUILD_DIR, 'AndroidManifest.xml')}" --min-sdk-version 24 --target-sdk-version 35 --java "${path.join(BUILD_DIR, 'gen')}" -o "${path.join(BUILD_DIR, 'initial.apk')}"`, { stdio: 'inherit' });

  console.log('☕ [3/6] Mengompilasi kode Java...');
  const javaSrcDir = path.join(BUILD_DIR, 'src', 'com', 'aurasound', 'musichub');
  const genDir = path.join(BUILD_DIR, 'gen', 'com', 'aurasound', 'musichub');
  const javaFiles = [
    `"${path.join(genDir, 'R.java')}"`,
    ...fs.readdirSync(javaSrcDir).filter(f => f.endsWith('.java')).map(f => `"${path.join(javaSrcDir, f)}"`)
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

  // Salin ke public/download untuk kemudahan akses download langsung dari website
  const publicDownloadDir = path.join(PROJECT_ROOT, 'public', 'download');
  if (!fs.existsSync(publicDownloadDir)) {
    fs.mkdirSync(publicDownloadDir, { recursive: true });
  }
  fs.copyFileSync(finalApk, path.join(publicDownloadDir, 'AuraSound.apk'));

  console.log('========================================================');
  console.log('🎉 APK ANDROID BERHASIL DIBUAT!');
  console.log(`📍 Lokasi File: ${finalApk}`);
  console.log(`🌐 Lokasi Web: ${path.join(publicDownloadDir, 'AuraSound.apk')}`);
  console.log('========================================================');
} catch (err) {
  console.error('❌ Terjadi kesalahan saat membuat APK:', err.message);
  process.exit(1);
}
