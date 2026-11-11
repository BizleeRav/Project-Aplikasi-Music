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
    android:versionCode="11"
    android:versionName="1.3.7">

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
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />

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
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="aurasound" android:host="suno-auth" />
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

    @JavascriptInterface
    public void openSunoLogin() {
        if (activity != null) {
            activity.openSunoLoginFlow();
        }
    }

    @JavascriptInterface
    public void openExternalBrowser(String url) {
        if (activity != null) {
            activity.openExternalBrowser(url);
        }
    }

    @JavascriptInterface
    public void saveSunoToken(String token) {
        if (activity != null) {
            activity.saveSunoToken(token);
        }
    }

    @JavascriptInterface
    public String getSunoToken() {
        if (activity != null) {
            return activity.getSunoToken();
        }
        return "";
    }

    @JavascriptInterface
    public void clearSunoCookies() {
        if (activity != null) {
            activity.clearSunoCookies();
        }
    }

    @JavascriptInterface
    public void downloadAndInstallUpdate(String apkUrl) {
        if (activity != null) {
            activity.downloadAndInstallUpdate(apkUrl);
        }
    }

    @JavascriptInterface
    public void generateSunoSong(String payloadJson) {
        if (activity != null) {
            activity.generateSunoSongFlow(payloadJson);
        }
    }

    @JavascriptInterface
    public int getAppVersionCode() {
        return 9;
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
import android.app.Dialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.net.http.SslError;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.view.Window;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;

public class MainActivity extends Activity {
    public static MainActivity instance;
    private BackgroundAudioWebView webView;
    private static final String APP_URL = "https://project-aplikasi-music.vercel.app";
    private Handler bridgeHandler = new Handler(Looper.getMainLooper());
    private Runnable bridgeRunnable;

    private Dialog sunoLoginDialog;
    private WebView loginWebView;
    private boolean isCapturingSunoToken = false;
    private WebView genWebView;
    private FrameLayout warmWebViewContainer;
    private LinearLayout warmWebViewCard;
    private volatile long lastAndroidGenStartedMs = 0L;
    private volatile boolean androidUserCancelled = false;
    private String pendingSunoPayloadJson = null;
    private boolean isGenWebViewReady = false;
    private boolean isGenWebViewLoading = false;
    private Runnable sunoTokenRefreshRunnable;

    private String getCleanWebViewUserAgent() {
        try {
            String defUa = WebSettings.getDefaultUserAgent(this);
            if (defUa != null && !defUa.isEmpty()) {
                return defUa
                    .replace("; wv)", ")")
                    .replace("; wv;", ";")
                    .replace("Version/4.0 ", "")
                    .trim();
            }
        } catch (Exception e) {}
        return "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    }

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

        handleDeepLink(getIntent());

        webView.loadUrl(APP_URL);

        startPeriodicBridgeSync();
        startSunoTokenAutoRefresh();
        bridgeHandler.postDelayed(() -> prewarmSunoIfLoggedIn(), 3500);
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

        // Genuine native Mobile Chrome User-Agent matching Android System WebView Sec-CH-UA
        settings.setUserAgentString(getCleanWebViewUserAgent());

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= 21) {
            cm.setAcceptThirdPartyCookies(webView, true);
        }

        // Expose Native Android Bridge to JavaScript
        webView.addJavascriptInterface(new AndroidMediaBridge(this), "AuraSoundAndroid");

        // Intercept downloads and external apk links cleanly
        webView.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            openExternalBrowser(url);
        });

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String u = request.getUrl().toString();
                    if (u.endsWith(".apk") || u.contains("/download/") || u.startsWith("market://")) {
                        openExternalBrowser(u);
                        return true;
                    }
                }
                return false;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url != null && (url.endsWith(".apk") || url.contains("/download/") || url.startsWith("market://"))) {
                    openExternalBrowser(url);
                    return true;
                }
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
                restoreSavedSunoToken();
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    String errorHtml = "<html><body style=\\"background:#070a12; color:#fff; font-family:sans-serif; text-align:center; padding:40px 20px;\\">"
                        + "<h2 style=\\"color:#10b981;\\">AuraSound Music Hub</h2>"
                        + "<p style=\\"color:#94a3b8; font-size:14px;\\">Sedang menyambungkan ke server...</p>"
                        + "<p style=\\"color:#cbd5e1; font-size:13px;\\">Pastikan koneksi internet (kuota data atau Wi-Fi) di HP Anda aktif.</p>"
                        + "<button onclick=\\"window.location.href=\'" + APP_URL + "\'\\" style=\\"background:#10b981; color:#fff; border:none; padding:12px 24px; border-radius:8px; font-weight:bold; margin-top:20px; font-size:15px;\\">Coba Sambung Lagi</button>"
                        + "<script>setTimeout(function(){ window.location.href=\'" + APP_URL + "\'; }, 3000);</script>"
                        + "</body></html>";
                    view.loadDataWithBaseURL(APP_URL, errorHtml, "text/html", "utf-8", null);
                }
            }
        });
    }

    private void restoreSavedSunoToken() {
        if (webView == null) return;
        String saved = getSunoToken();
        if (saved != null && saved.length() > 20) {
            String safeTok = saved.replace("'", "").replace("\\n", "").replace("\\r", "").trim();
            String js = "(function() {"
                + "  var curKey = localStorage.getItem('aurasound_suno_key') || '';"
                + "  var curProv = localStorage.getItem('aurasound_suno_provider') || '';"
                + "  if (!curKey || ((curProv === '' || curProv === 'suno_official') && curKey !== '" + safeTok + "')) {"
                + "    localStorage.setItem('aurasound_suno_key', '" + safeTok + "');"
                + "    localStorage.setItem('aurasound_suno_provider', 'suno_official');"
                + "    if (window.sunoStudio && typeof window.sunoStudio.checkApiStatus === 'function') {"
                + "      window.sunoStudio.checkApiStatus();"
                + "    }"
                + "  }"
                + "})();";
            webView.evaluateJavascript(js, null);
        }
    }

    public void openSunoLoginFlow() {
        runOnUiThread(() -> {
            try {
                if (sunoLoginDialog != null && sunoLoginDialog.isShowing()) {
                    sunoLoginDialog.dismiss();
                }
                isCapturingSunoToken = false;

                sunoLoginDialog = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);

                LinearLayout rootLayout = new LinearLayout(this);
                rootLayout.setOrientation(LinearLayout.VERTICAL);
                rootLayout.setBackgroundColor(Color.parseColor("#070a12"));
                rootLayout.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                // Header Bar
                LinearLayout header = new LinearLayout(this);
                header.setOrientation(LinearLayout.HORIZONTAL);
                header.setBackgroundColor(Color.parseColor("#0f172a"));
                header.setPadding(32, 40, 32, 28);
                header.setGravity(Gravity.CENTER_VERTICAL);
                header.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

                Button btnClose = new Button(this);
                btnClose.setText("✕ Tutup");
                btnClose.setTextColor(Color.parseColor("#94a3b8"));
                btnClose.setBackgroundColor(Color.TRANSPARENT);
                btnClose.setTextSize(14);
                btnClose.setOnClickListener(v -> {
                    if (sunoLoginDialog != null) sunoLoginDialog.dismiss();
                });
                header.addView(btnClose);

                TextView tvTitle = new TextView(this);
                tvTitle.setText("Login Resmi Suno AI");
                tvTitle.setTextColor(Color.WHITE);
                tvTitle.setTextSize(16);
                tvTitle.setTypeface(Typeface.DEFAULT_BOLD);
                tvTitle.setGravity(Gravity.CENTER);
                LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f);
                tvTitle.setLayoutParams(titleParams);
                header.addView(tvTitle);

                Button btnChrome = new Button(this);
                btnChrome.setText("Buka Chrome");
                btnChrome.setTextColor(Color.parseColor("#38bdf8"));
                btnChrome.setBackgroundColor(Color.TRANSPARENT);
                btnChrome.setTextSize(12);
                btnChrome.setOnClickListener(v -> openExternalBrowser("https://suno.com/login"));
                header.addView(btnChrome);

                rootLayout.addView(header);

                // Subtitle Info Bar
                TextView banner = new TextView(this);
                banner.setText("Klik 'Continue with Google' untuk login akun Suno Anda. Sesi akan otomatis terhubung!");
                banner.setTextColor(Color.parseColor("#34d399"));
                banner.setBackgroundColor(Color.parseColor("#06281e"));
                banner.setTextSize(12);
                banner.setPadding(32, 20, 32, 20);
                banner.setGravity(Gravity.CENTER);
                rootLayout.addView(banner);

                // WebView for Suno Login
                loginWebView = new WebView(this);
                loginWebView.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                WebSettings ws = loginWebView.getSettings();
                ws.setJavaScriptEnabled(true);
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setAllowFileAccess(true);
                ws.setAllowContentAccess(true);
                ws.setSupportMultipleWindows(true);
                ws.setJavaScriptCanOpenWindowsAutomatically(true);
                ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

                // Genuine native Chrome Mobile User-Agent matching Sec-CH-UA
                final String nativeMobileUa = getCleanWebViewUserAgent();
                ws.setUserAgentString(nativeMobileUa);

                CookieManager cm = CookieManager.getInstance();
                cm.setAcceptCookie(true);
                if (Build.VERSION.SDK_INT >= 21) {
                    cm.setAcceptThirdPartyCookies(loginWebView, true);
                }

                loginWebView.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                        WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                        transport.setWebView(view);
                        resultMsg.sendToTarget();
                        return true;
                    }
                });

                loginWebView.setWebViewClient(new WebViewClient() {
                    private void applyUa(WebView view, String url) {
                        if (url == null || view == null) return;
                        String u = url.toLowerCase();
                        if (u.contains("accounts.google.com") || u.contains("google.com/o/oauth2") || u.contains("googleusercontent.com")) {
                            view.getSettings().setUserAgentString("Mozilla/5.0 (Android 14; Mobile; rv:134.0) Gecko/134.0 Firefox/134.0");
                        } else {
                            view.getSettings().setUserAgentString(nativeMobileUa);
                        }
                    }

                    @Override
                    public boolean shouldOverrideUrlLoading(WebView view, String url) {
                        applyUa(view, url);
                        return false;
                    }

                    @Override
                    public void onPageStarted(WebView view, String url, Bitmap favicon) {
                        super.onPageStarted(view, url, favicon);
                        applyUa(view, url);
                    }

                    @Override
                    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                        handler.proceed();
                    }

                    @Override
                    public void onPageFinished(WebView view, String url) {
                        super.onPageFinished(view, url);
                        applyUa(view, url);
                        checkAndExtractSunoCookie(url);
                    }

                    @Override
                    public void onLoadResource(WebView view, String url) {
                        super.onLoadResource(view, url);
                        if (url != null && (url.contains("suno.com") || url.contains("clerk"))) {
                            checkAndExtractSunoCookie(url);
                        }
                    }
                });

                rootLayout.addView(loginWebView);

                sunoLoginDialog.setContentView(rootLayout);
                sunoLoginDialog.show();

                loginWebView.loadUrl("https://suno.com/login");
            } catch (Exception e) {
                e.printStackTrace();
                Toast.makeText(this, "Gagal membuka login: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private void checkAndExtractSunoCookie(String currentUrl) {
        if (isCapturingSunoToken) return;
        try {
            CookieManager cm = CookieManager.getInstance();
            String cookieStr = cm.getCookie("https://suno.com");
            if (cookieStr == null || !cookieStr.contains("__session=")) {
                cookieStr = cm.getCookie("https://auth.suno.com");
                if (cookieStr == null || !cookieStr.contains("__session=")) {
                    cookieStr = cm.getCookie("https://clerk.suno.com");
                }
            }

            if (cookieStr != null && cookieStr.contains("__session=")) {
                String token = "";
                String[] parts = cookieStr.split(";");
                for (String p : parts) {
                    String trimmed = p.trim();
                    if (trimmed.startsWith("__session=")) {
                        token = trimmed.substring("__session=".length()).trim();
                        break;
                    }
                }

                if (token.length() > 20) {
                    isCapturingSunoToken = true;
                    final String finalToken = token;
                    runOnUiThread(() -> onSunoTokenExtracted(finalToken));
                    return;
                }
            }

            if (loginWebView != null && !isCapturingSunoToken) {
                runOnUiThread(() -> {
                    if (loginWebView != null && !isCapturingSunoToken) {
                        String js = "(function() {"
                            + "  try {"
                            + "    if (window.Clerk && window.Clerk.session) {"
                            + "      return window.Clerk.session.getToken();"
                            + "    }"
                            + "    var m = document.cookie.match(/__session=([^;]+)/);"
                            + "    if (m && m[1]) return m[1];"
                            + "  } catch(e) {}"
                            + "  return null;"
                            + "})()";
                        loginWebView.evaluateJavascript(js, result -> {
                            if (result != null && result.length() > 25 && !result.equals("null") && !isCapturingSunoToken) {
                                String clean = result.replace(String.valueOf('"'), "").trim();
                                if (clean.startsWith("eyJ")) {
                                    isCapturingSunoToken = true;
                                    onSunoTokenExtracted(clean);
                                }
                            }
                        });
                    }
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void onSunoTokenExtracted(String token) {
        saveSunoToken(token);
        if (sunoLoginDialog != null && sunoLoginDialog.isShowing()) {
            sunoLoginDialog.dismiss();
        }
        Toast.makeText(this, "Akun Suno Resmi Berhasil Terhubung ke AuraSound!", Toast.LENGTH_LONG).show();
        if (webView != null) {
            String safeTok = token.replace("'", "").replace("\\n", "").replace("\\r", "").trim();
            String js = "(function() {"
                + "  localStorage.setItem('aurasound_suno_key', '" + safeTok + "');"
                + "  localStorage.setItem('aurasound_suno_provider', 'suno_official');"
                + "  if (window.sunoStudio) {"
                + "    if (typeof window.sunoStudio.saveOfficialTokenFromAuto === 'function') {"
                + "      window.sunoStudio.saveOfficialTokenFromAuto('" + safeTok + "');"
                + "    } else {"
                + "      window.sunoStudio.checkApiStatus();"
                + "    }"
                + "  }"
                + "})();";
            webView.evaluateJavascript(js, null);
        }
        isCapturingSunoToken = false;
        ensureWarmSunoWebView(true);
    }

    private String extractSessionCookieFromManager() {
        try {
            CookieManager cm = CookieManager.getInstance();
            String cookieStr = cm.getCookie("https://suno.com");
            if (cookieStr == null || !cookieStr.contains("__session=")) {
                cookieStr = cm.getCookie("https://auth.suno.com");
            }
            if (cookieStr != null && cookieStr.contains("__session=")) {
                String[] parts = cookieStr.split(";");
                for (String p : parts) {
                    String trimmed = p.trim();
                    if (trimmed.startsWith("__session=")) {
                        String tok = trimmed.substring("__session=".length()).trim();
                        if (tok.length() > 20 && tok.startsWith("eyJ")) {
                            return tok;
                        }
                    }
                }
            }
        } catch (Exception e) {}
        return "";
    }

    private void ensureWarmContainerMounted() {
        try {
            if (warmWebViewContainer == null) {
                warmWebViewContainer = new FrameLayout(this);
                warmWebViewContainer.setBackgroundColor(Color.parseColor("#D9070A12"));
                warmWebViewContainer.setPadding(32, 64, 32, 64);

                warmWebViewCard = new LinearLayout(this);
                warmWebViewCard.setOrientation(LinearLayout.VERTICAL);
                warmWebViewCard.setPadding(32, 28, 32, 28);
                GradientDrawable bg = new GradientDrawable();
                bg.setColor(Color.parseColor("#121826"));
                bg.setCornerRadius(36f);
                bg.setStroke(2, Color.parseColor("#2a354d"));
                warmWebViewCard.setBackground(bg);

                LinearLayout headerRow = new LinearLayout(this);
                headerRow.setOrientation(LinearLayout.HORIZONTAL);
                headerRow.setGravity(Gravity.CENTER_VERTICAL);
                headerRow.setPadding(0, 0, 0, 16);

                LinearLayout titleCol = new LinearLayout(this);
                titleCol.setOrientation(LinearLayout.VERTICAL);
                titleCol.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1.0f));

                TextView titleTv = new TextView(this);
                titleTv.setText("Verifikasi Suno AI");
                titleTv.setTextColor(Color.WHITE);
                titleTv.setTextSize(15f);
                titleTv.setTypeface(null, Typeface.BOLD);
                titleCol.addView(titleTv);

                TextView subTv = new TextView(this);
                subTv.setText("Centang 1x untuk melanjutkan pembuatan lagu:");
                subTv.setTextColor(Color.parseColor("#94a3b8"));
                subTv.setTextSize(12f);
                titleCol.addView(subTv);

                headerRow.addView(titleCol);

                Button btnCancel = new Button(this);
                btnCancel.setText("✕ Batal");
                btnCancel.setTextColor(Color.parseColor("#f87171"));
                btnCancel.setBackgroundColor(Color.TRANSPARENT);
                btnCancel.setTextSize(13f);
                btnCancel.setOnClickListener(v -> {
                    androidUserCancelled = true;
                    parkGenWebViewInBackground();
                    if (webView != null) {
                        webView.evaluateJavascript("if (window.sunoStudio && window.sunoStudio.onAndroidGenerationError) { window.sunoStudio.onAndroidGenerationError('Verifikasi dibatalkan.'); }", null);
                    }
                });
                headerRow.addView(btnCancel);

                warmWebViewCard.addView(headerRow, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

                warmWebViewContainer.addView(warmWebViewCard, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

                warmWebViewContainer.setTranslationX(10000f);
                warmWebViewContainer.setAlpha(0.01f);
                warmWebViewContainer.setClickable(false);

                addContentView(warmWebViewContainer, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }
            if (genWebView != null && warmWebViewCard != null && genWebView.getParent() == null) {
                genWebView.setVisibility(View.VISIBLE);
                warmWebViewCard.addView(genWebView, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, 0, 1.0f));
            }
        } catch (Exception e) {}
    }

    private void parkGenWebViewInBackground() {
        try {
            ensureWarmContainerMounted();
            if (warmWebViewContainer != null) {
                warmWebViewContainer.setTranslationX(10000f);
                warmWebViewContainer.setAlpha(0.01f);
                warmWebViewContainer.setClickable(false);
            }
            if (genWebView != null) {
                genWebView.setVisibility(View.VISIBLE);
            }
        } catch (Exception e) {}
    }

    public void showSunoChallenge() {
        runOnUiThread(() -> {
            try {
                ensureWarmContainerMounted();
                if (warmWebViewContainer != null) {
                    warmWebViewContainer.setTranslationX(0f);
                    warmWebViewContainer.setAlpha(1.0f);
                    warmWebViewContainer.setClickable(true);
                    warmWebViewContainer.bringToFront();
                }
            } catch (Exception e) {}
        });
    }

    public void hideSunoChallenge() {
        runOnUiThread(() -> {
            try {
                if (warmWebViewContainer != null) {
                    warmWebViewContainer.setTranslationX(10000f);
                    warmWebViewContainer.setAlpha(0.01f);
                    warmWebViewContainer.setClickable(false);
                }
            } catch (Exception e) {}
        });
    }

    private void destroyWarmSunoWebView() {
        try {
            hideSunoChallenge();
            if (genWebView != null) {
                if (genWebView.getParent() != null) {
                    ((ViewGroup) genWebView.getParent()).removeView(genWebView);
                }
                genWebView.stopLoading();
                genWebView.destroy();
                genWebView = null;
            }
            isGenWebViewReady = false;
            isGenWebViewLoading = false;
            pendingSunoPayloadJson = null;
        } catch (Exception e) {}
    }

    private void prewarmSunoIfLoggedIn() {
        try {
            String saved = getSunoToken();
            CookieManager cm = CookieManager.getInstance();
            String cookie = cm.getCookie("https://suno.com");
            boolean hasAuth = (saved != null && saved.length() > 20)
                || (cookie != null && (cookie.contains("__session=") || cookie.contains("__client")));
            if (hasAuth) {
                ensureWarmSunoWebView(false);
            }
        } catch (Exception e) {}
    }

    public void ensureWarmSunoWebView(final boolean forceReload) {
        runOnUiThread(() -> {
            try {
                if (genWebView == null) {
                    genWebView = new WebView(this);
                    WebSettings ws = genWebView.getSettings();
                    ws.setJavaScriptEnabled(true);
                    ws.setDomStorageEnabled(true);
                    ws.setDatabaseEnabled(true);
                    ws.setAllowFileAccess(true);
                    ws.setAllowContentAccess(true);
                    ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                    ws.setLoadWithOverviewMode(true);
                    ws.setUseWideViewPort(true);
                    // Native Android Chrome WebView UA matching Sec-CH-UA (never forge Windows Chrome/128!)
                    ws.setUserAgentString(getCleanWebViewUserAgent());

                    CookieManager cm = CookieManager.getInstance();
                    cm.setAcceptCookie(true);
                    if (Build.VERSION.SDK_INT >= 21) {
                        cm.setAcceptThirdPartyCookies(genWebView, true);
                    }

                    genWebView.addJavascriptInterface(new Object() {
                        @JavascriptInterface
                        public void onProgress(String text) {
                            // Silent in background
                        }

                        @JavascriptInterface
                        public void onChallengeRequired() {
                            // Silent in background
                        }

                        @JavascriptInterface
                        public void onChallengeDismissed() {
                            hideSunoChallenge();
                        }

                        @JavascriptInterface
                        public boolean hasGenerateStarted(long sinceMs) {
                            return lastAndroidGenStartedMs >= sinceMs;
                        }

                        @JavascriptInterface
                        public boolean isUserCancelled() {
                            return androidUserCancelled;
                        }

                        @JavascriptInterface
                        public String getFreshCookieToken() {
                            String cookieTok = extractSessionCookieFromManager();
                            if (cookieTok != null && cookieTok.length() > 20) {
                                return cookieTok;
                            }
                            return MainActivity.this.getSunoToken();
                        }

                        @JavascriptInterface
                        public void reloadAndRun(String b64Payload) {
                            runOnUiThread(() -> {
                                try {
                                    byte[] decoded = Base64.decode(b64Payload, Base64.DEFAULT);
                                    pendingSunoPayloadJson = new String(decoded, "UTF-8");
                                    ensureWarmSunoWebView(true);
                                } catch (Exception e) {}
                            });
                        }

                        @JavascriptInterface
                        public String getSunoToken() {
                            return MainActivity.this.getSunoToken();
                        }

                        @JavascriptInterface
                        public void onTokenRefreshed(String token) {
                            if (token != null && token.length() > 20 && token.startsWith("eyJ")) {
                                final String cleanTok = token.replace("'", "").replace("\\n", "").replace("\\r", "").trim();
                                String prev = MainActivity.this.getSunoToken();
                                if (!cleanTok.equals(prev)) {
                                    saveSunoToken(cleanTok);
                                    runOnUiThread(() -> restoreSavedSunoToken());
                                }
                            }
                        }

                        @JavascriptInterface
                        public void onComplete(String clipsJson, String token) {
                            runOnUiThread(() -> {
                                String finalTok = token;
                                if (finalTok == null || finalTok.length() < 20) {
                                    finalTok = extractSessionCookieFromManager();
                                }
                                if (finalTok != null && finalTok.length() > 20 && finalTok.startsWith("eyJ")) {
                                    saveSunoToken(finalTok.trim());
                                }
                                parkGenWebViewInBackground();
                                if (webView != null) {
                                    try {
                                        byte[] data = (clipsJson != null ? clipsJson : "[]").getBytes("UTF-8");
                                        String b64 = Base64.encodeToString(data, Base64.NO_WRAP);
                                        String tokVal = finalTok != null ? finalTok.replace("'", "").trim() : "";
                                        String js = "(function() {"
                                            + "  try {"
                                            + "    var raw = decodeURIComponent(escape(window.atob('" + b64 + "')));"
                                            + "    if (window.sunoStudio && window.sunoStudio.onAndroidGenerationComplete) {"
                                            + "      window.sunoStudio.onAndroidGenerationComplete(raw, '" + tokVal + "');"
                                            + "    }"
                                            + "  } catch(e) {}"
                                            + "})();";
                                        webView.evaluateJavascript(js, null);
                                    } catch(Exception ex) {}
                                }
                            });
                        }

                        @JavascriptInterface
                        public void onError(String errorMsg) {
                            runOnUiThread(() -> {
                                parkGenWebViewInBackground();
                                if (webView != null) {
                                    try {
                                        byte[] data = (errorMsg != null ? errorMsg : "Error").getBytes("UTF-8");
                                        String b64 = Base64.encodeToString(data, Base64.NO_WRAP);
                                        String js = "(function() {"
                                            + "  try {"
                                            + "    var msg = decodeURIComponent(escape(window.atob('" + b64 + "')));"
                                            + "    if (window.sunoStudio && window.sunoStudio.onAndroidGenerationError) {"
                                            + "      window.sunoStudio.onAndroidGenerationError(msg);"
                                            + "    }"
                                            + "  } catch(e) {}"
                                            + "})();";
                                        webView.evaluateJavascript(js, null);
                                    } catch(Exception ex) {}
                                }
                            });
                        }
                    }, "AndroidSunoHost");

                    genWebView.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                            handler.proceed();
                        }

                        @Override
                        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                            try {
                                if (request != null && request.getUrl() != null && "POST".equalsIgnoreCase(request.getMethod())) {
                                    String reqUrl = request.getUrl().toString();
                                    if (reqUrl.contains("/api/generate")) {
                                        lastAndroidGenStartedMs = System.currentTimeMillis();
                                        hideSunoChallenge();
                                    }
                                }
                            } catch (Exception e) {}
                            return super.shouldInterceptRequest(view, request);
                        }

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            super.onPageFinished(view, url);
                            if (url != null && url.contains("suno.com") && !url.contains("/login") && !url.contains("/sign-in")) {
                                isGenWebViewReady = true;
                                isGenWebViewLoading = false;
                                refreshSunoTokenSilently();
                                if (pendingSunoPayloadJson != null) {
                                    String payload = pendingSunoPayloadJson;
                                    pendingSunoPayloadJson = null;
                                    injectSunoAutomation(view, payload);
                                }
                            } else if (url != null && (url.contains("/login") || url.contains("/sign-in"))) {
                                isGenWebViewReady = false;
                                isGenWebViewLoading = false;
                                if (pendingSunoPayloadJson != null) {
                                    pendingSunoPayloadJson = null;
                                    if (webView != null) {
                                        webView.evaluateJavascript("if (window.sunoStudio && window.sunoStudio.onAndroidGenerationError) { window.sunoStudio.onAndroidGenerationError('Akun Suno belum login atau sesi telah berakhir. Silakan login kembali.'); }", null);
                                    }
                                }
                            }
                        }
                    });

                    parkGenWebViewInBackground();
                    isGenWebViewLoading = true;
                    isGenWebViewReady = false;
                    genWebView.loadUrl("https://suno.com/create");
                } else {
                    parkGenWebViewInBackground();
                    String curUrl = genWebView.getUrl();
                    if (forceReload || curUrl == null || !curUrl.contains("suno.com") || curUrl.contains("/login") || curUrl.contains("/sign-in")) {
                        isGenWebViewLoading = true;
                        isGenWebViewReady = false;
                        genWebView.loadUrl("https://suno.com/create");
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    public void generateSunoSongFlow(final String payloadJson) {
        runOnUiThread(() -> {
            try {
                androidUserCancelled = false;
                lastAndroidGenStartedMs = 0L;
                parkGenWebViewInBackground();
                String curUrl = (genWebView != null) ? genWebView.getUrl() : null;
                if (genWebView != null && isGenWebViewReady && curUrl != null && curUrl.contains("suno.com") && !curUrl.contains("/login") && !curUrl.contains("/sign-in")) {
                    pendingSunoPayloadJson = null;
                    injectSunoAutomation(genWebView, payloadJson);
                } else {
                    pendingSunoPayloadJson = payloadJson;
                    if (!isGenWebViewLoading || genWebView == null) {
                        ensureWarmSunoWebView(true);
                    }
                }
            } catch (Exception e) {
                e.printStackTrace();
                Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_LONG).show();
            }
        });
    }

    private void injectSunoAutomation(final WebView view, final String payloadJson) {
        if (view == null) return;
        String b64Payload = "";
        try {
            byte[] pData = (payloadJson != null && payloadJson.length() > 0 ? payloadJson : "{}").getBytes("UTF-8");
            b64Payload = Base64.encodeToString(pData, Base64.NO_WRAP);
        } catch(Exception e) {}
        String js = "(async function() {"
            + "  try {"
            + "    var b64In = '" + b64Payload + "';"
            + "    var NL = String.fromCharCode(10);"
            + "    var payload = {};"
            + "    try { payload = JSON.parse(decodeURIComponent(escape(window.atob(b64In)))); } catch(e) {}"
            + "    function getLiveTok() {"
            + "      if (window.AndroidSunoHost && typeof window.AndroidSunoHost.getFreshCookieToken === 'function') {"
            + "        var ht = window.AndroidSunoHost.getFreshCookieToken();"
            + "        if (ht && ht.length > 20) return ht;"
            + "      }"
            + "      var parts = (document.cookie || '').split(';');"
            + "      for (var k = 0; k < parts.length; k++) {"
            + "        var pt = parts[k].trim();"
            + "        if (pt.indexOf('__session=') === 0) return pt.substring(10).trim();"
            + "      }"
            + "      return '';"
            + "    }"
            + "    var freshToken = getLiveTok();"
            + "    if (freshToken && window.AndroidSunoHost && typeof window.AndroidSunoHost.onTokenRefreshed === 'function') {"
            + "      try { window.AndroidSunoHost.onTokenRefreshed(freshToken); } catch(e) {}"
            + "    }"
            + "    function hasCreateControls() {"
            + "      return Boolean(document.querySelector('textarea') || Array.from(document.querySelectorAll('button')).some(function(b) { return (b.getAttribute('aria-label') || '').toLowerCase().includes('create song'); }));"
            + "    }"
            + "    if (!hasCreateControls()) {"
            + "      var navItems = Array.from(document.querySelectorAll('a, button, [role=tab]'));"
            + "      var createNav = navItems.find(function(el) {"
            + "        var tx = (el.textContent || '').trim().toLowerCase();"
            + "        var hr = (el.getAttribute('href') || '').toLowerCase();"
            + "        return tx === 'create' || hr === '/create' || hr.indexOf('/create?') === 0;"
            + "      });"
            + "      if (createNav) { createNav.click(); }"
            + "    }"
            + "    for (var i = 0; i < 20; i++) {"
            + "      if (hasCreateControls()) break;"
            + "      await new Promise(function(r) { setTimeout(r, 300); });"
            + "    }"
            + "    if (!hasCreateControls()) {"
            + "      if (window.AndroidSunoHost && typeof window.AndroidSunoHost.reloadAndRun === 'function') {"
            + "        window.AndroidSunoHost.reloadAndRun(b64In);"
            + "        return;"
            + "      }"
            + "      throw new Error('Halaman Create Suno belum siap.');"
            + "    }"
            + "    var oldOverlay = Array.from(document.querySelectorAll('div.fixed.inset-0')).find(function(el) {"
            + "      return String(el.className || '').indexOf('z-[1000]') !== -1;"
            + "    });"
            + "    if (oldOverlay) { try { oldOverlay.click(); } catch(e) {} }"
            + "    var existingIds = new Set();"
            + "    var existingPromise = (async function() {"
            + "      try {"
            + "        var tok0 = getLiveTok();"
            + "        var h0 = { 'Content-Type': 'application/json' };"
            + "        if (tok0) h0['Authorization'] = 'Bearer ' + tok0;"
            + "        var r0 = await fetch('/a/api/feed/v3', {"
            + "          method: 'POST',"
            + "          credentials: 'include',"
            + "          headers: h0,"
            + "          body: JSON.stringify({ cursor: null, limit: 30 })"
            + "        });"
            + "        var fd0 = await r0.json();"
            + "        if (fd0 && Array.isArray(fd0.clips)) {"
            + "          fd0.clips.forEach(function(c) { if (c && c.id) existingIds.add(c.id); });"
            + "        }"
            + "      } catch(fe) {}"
            + "    })();"
            + "    function setNativeVal(el, val) {"
            + "      if (!el) return;"
            + "      el.focus();"
            + "      try {"
            + "        document.execCommand('selectAll', false, null);"
            + "        document.execCommand('delete', false, null);"
            + "      } catch(e) {}"
            + "      var proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;"
            + "      var setter = Object.getOwnPropertyDescriptor(proto, 'value');"
            + "      if (setter && setter.set) setter.set.call(el, val);"
            + "      else el.value = val;"
            + "      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));"
            + "      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));"
            + "    }"
            + "    try {"
            + "      localStorage.removeItem('create_draft');"
            + "      sessionStorage.removeItem('create_draft');"
            + "      Array.from(document.querySelectorAll('textarea')).forEach(function(ta) { setNativeVal(ta, ''); });"
            + "      Array.from(document.querySelectorAll('input[type=text]')).forEach(function(inp) { if (!(inp.placeholder||'').toLowerCase().includes('search')) setNativeVal(inp, ''); });"
            + "      Array.from(document.querySelectorAll('.lyrics-editor-content, div[contenteditable=true], div[role=textbox]')).forEach(function(ed) {"
            + "        try { ed.focus(); document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); } catch(e) {}"
            + "      });"
            + "    } catch(ce) {}"
            + "    function switchTab(targetName) {"
            + "      var tabs = Array.from(document.querySelectorAll('[role=tab], button, div[role=button]'));"
            + "      var tab = tabs.find(function(t) {"
            + "        var txt = (t.innerText || t.textContent || '').trim().toLowerCase();"
            + "        return txt === targetName.toLowerCase() || (targetName === 'advanced' && txt === 'custom');"
            + "      });"
            + "      if (!tab) return false;"
            + "      if (tab.getAttribute('aria-selected') === 'true') return false;"
            + "      try {"
            + "        tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));"
            + "        tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));"
            + "        tab.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));"
            + "        tab.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));"
            + "      } catch(e) {}"
            + "      tab.click();"
            + "      return true;"
            + "    }"
            + "    var promptText = (payload.prompt || '').trim();"
            + "    var lyricsText = (payload.lyrics || '').trim();"
            + "    var tagsText = (payload.tags || '').trim();"
            + "    var titleText = (payload.title || '').trim();"
            + "    var wantInstr = Boolean(payload.make_instrumental);"
            + "    var isCustomLyrics = Boolean(payload.isCustomLyrics && lyricsText.length > 0 && !wantInstr);"
            + "    if (!isCustomLyrics) {"
            + "      if (switchTab('simple')) await new Promise(function(r) { setTimeout(r, 320); });"
            + "      var tas = Array.from(document.querySelectorAll('textarea')).filter(function(t) {"
            + "        var al = (t.getAttribute('aria-label') || '').toLowerCase();"
            + "        return !al.includes('cowriter') && !al.includes('sound') && !al.includes('script') && !al.includes('tone') && al !== 'styles';"
            + "      });"
            + "      var pBox = tas[0] || document.querySelector('textarea');"
            + "      if (pBox) {"
            + "        var sParts = [];"
            + "        if (titleText) sParts.push('Title: ' + titleText);"
            + "        if (wantInstr) sParts.push('Instrumental only, no vocals.');"
            + "        if (promptText) sParts.push(promptText);"
            + "        if (tagsText) sParts.push('Style: ' + tagsText);"
            + "        else if (promptText.toLowerCase().includes('fantasy') || (promptText.toLowerCase().includes('adventure') && !promptText.toLowerCase().includes('folk'))) {"
            + "          sParts.push('Style: Epic Fantasy Orchestral, Cinematic Symphony, Piano & Strings, No Folk');"
            + "        }"
            + "        setNativeVal(pBox, sParts.join(NL).slice(0, 2950));"
            + "      }"
            + "    } else {"
            + "      if (switchTab('advanced')) await new Promise(function(r) { setTimeout(r, 320); });"
            + "      var styleBox = document.querySelector('textarea[aria-label=Styles]') || Array.from(document.querySelectorAll('textarea')).find(function(t) {"
            + "        var al = (t.getAttribute('aria-label') || '').toLowerCase();"
            + "        var ph = (t.placeholder || '').toLowerCase();"
            + "        return al === 'styles' || ph.includes('style') || ph.includes('genre');"
            + "      });"
            + "      var effectiveTags = tagsText || (function() {"
            + "        var p = (promptText + ' ' + lyricsText).toLowerCase();"
            + "        if (p.includes('epic') || p.includes('choir') || p.includes('fantasy')) return 'Epic Fantasy Orchestral Choir, Cinematic Symphony';"
            + "        if (p.includes('rock') || p.includes('metal')) return 'Emotional Symphonic Rock, Driving Guitars';"
            + "        if (p.includes('koplo') || p.includes('dangdut')) return 'Dangdut Koplo Modern, Kendang Asik';"
            + "        if (p.includes('ballad') || p.includes('piano')) return 'Acoustic Piano Ballad, Warm Melodic Vocal';"
            + "        if (p.includes('lofi') || p.includes('chill')) return 'Lo-Fi Chill Beats, Relaxing Ambient Melodies';"
            + "        return 'Indonesian Pop, Emotional Vocal, Studio Mix';"
            + "      })();"
            + "      if (styleBox) {"
            + "        setNativeVal(styleBox, effectiveTags.slice(0, 950));"
            + "      }"
            + "      var titleInput = Array.from(document.querySelectorAll('input')).find(function(i) { var ph = (i.placeholder || i.getAttribute('aria-label') || '').toLowerCase(); return ph.includes('title') || ph.includes('judul'); });"
            + "      if (titleInput) {"
            + "        setNativeVal(titleInput, titleText);"
            + "      }"
            + "      var lyricsBox = document.querySelector('.lyrics-editor-content') || Array.from(document.querySelectorAll('div')).find(function(d) { return (d.getAttribute('aria-label') || '').toLowerCase().includes('lyrics'); }) || document.querySelector('div[contenteditable=true]');"
            + "      if (lyricsBox) {"
            + "        lyricsBox.focus();"
            + "        document.execCommand('selectAll', false, null);"
            + "        document.execCommand('delete', false, null);"
            + "        document.execCommand('insertText', false, lyricsText);"
            + "      }"
            + "    }"
            + "    var instr = Array.from(document.querySelectorAll('[role=switch], input[type=checkbox]')).find(function(b) { return (b.textContent || b.getAttribute('aria-label') || b.name || '').toLowerCase().includes('instrumental'); });"
            + "    if (instr) {"
            + "      var isChecked = instr.getAttribute('aria-checked') === 'true' || instr.checked === true || instr.getAttribute('data-state') === 'checked';"
            + "      if (isChecked !== wantInstr) instr.click();"
            + "    }"
            + "    await Promise.all([existingPromise, new Promise(function(r) { setTimeout(r, 320); })]);"
            + "    var refreshedBtns = Array.from(document.querySelectorAll('button'));"
            + "    var createBtn = refreshedBtns.find(function(b) { var al = (b.getAttribute('aria-label') || '').toLowerCase(); var t = (b.textContent || '').trim().toLowerCase(); return al.includes('create song') || (!b.closest('nav') && !b.closest('aside') && (t === 'create' || t.startsWith('create ') || t.startsWith('create('))); });"
            + "    if (!createBtn) throw new Error('Tombol Create tidak ditemukan.');"
            + "    if (createBtn.disabled) {"
            + "      await new Promise(function(r) { setTimeout(r, 500); });"
            + "      if (createBtn.disabled) throw new Error('Tombol Create saat ini nonaktif (cek kuota kredit Suno Anda).');"
            + "    }"
            + "    var clickTimeMs = Date.now();"
            + "    try {"
            + "      createBtn.scrollIntoView({ behavior: 'instant', block: 'center' });"
            + "      createBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));"
            + "      createBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));"
            + "      createBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true }));"
            + "      createBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));"
            + "    } catch(e) {}"
            + "    createBtn.click();"
            + "    var captured = null;"
            + "    var lastPollMs = 0;"
            + "    while ((Date.now() - clickTimeMs) < 60000) {"
            + "      await new Promise(function(r) { setTimeout(r, 200); });"
            + "      if (window.AndroidSunoHost && window.AndroidSunoHost.isUserCancelled()) return;"
            + "      var elapsedMs = Date.now() - clickTimeMs;"
            + "      if ((Date.now() - lastPollMs) >= 1400) {"
            + "        lastPollMs = Date.now();"
            + "        try {"
            + "          var liveTok = getLiveTok();"
            + "          if (liveTok) freshToken = liveTok;"
            + "          var pollHeaders = { 'Content-Type': 'application/json' };"
            + "          if (freshToken) pollHeaders['Authorization'] = 'Bearer ' + freshToken;"
            + "          var fd2 = null;"
            + "          try {"
            + "            var r2 = await fetch('/a/api/feed/v2', { method: 'GET', credentials: 'include', headers: pollHeaders });"
            + "            if (r2.ok) fd2 = await r2.json();"
            + "          } catch(e2) {}"
            + "          if (!fd2 || !Array.isArray(fd2.clips) || fd2.clips.length === 0) {"
            + "            var feedRes = await fetch('/a/api/feed/v3', {"
            + "              method: 'POST',"
            + "              credentials: 'include',"
            + "              headers: pollHeaders,"
            + "              body: JSON.stringify({ cursor: null, limit: 12 })"
            + "            });"
            + "            fd2 = await feedRes.json();"
            + "          }"
            + "          if (fd2 && Array.isArray(fd2.clips)) {"
            + "            var newly = fd2.clips.filter(function(c) {"
            + "              if (!c || !c.id || existingIds.has(c.id)) return false;"
            + "              if (c.created_at) {"
            + "                var t = new Date(c.created_at).getTime();"
            + "                if (t < (clickTimeMs - 15 * 60 * 1000)) return false;"
            + "              }"
            + "              return true;"
            + "            });"
            + "            if (newly.length >= 2 || (newly.length >= 1 && genStartedAtMs > 0 && (Date.now() - genStartedAtMs) > 6000)) {"
            + "              captured = newly;"
            + "              break;"
            + "            }"
            + "          }"
            + "        } catch(pe) {}"
            + "      }"
            + "      if (captured && captured.length > 0) break;"
            + "    }"
            + "    if (window.AndroidSunoHost && window.AndroidSunoHost.isUserCancelled()) return;"
            + "    if (captured && captured.length > 0) {"
            + "      if (window.AndroidSunoHost) window.AndroidSunoHost.onComplete(JSON.stringify(captured), getLiveTok() || freshToken);"
            + "    } else {"
            + "      if (window.AndroidSunoHost) window.AndroidSunoHost.onError('Waktu tunggu habis atau kuota kredit Suno tidak mencukupi.');"
            + "    }"
            + "  } catch(err) {"
            + "    if (window.AndroidSunoHost && !window.AndroidSunoHost.isUserCancelled()) {"
            + "      window.AndroidSunoHost.onError(err.message || 'Gagal membuat lagu di Suno.');"
            + "    }"
            + "  }"
            + "})();";
        view.evaluateJavascript(js, null);
    }

    private void refreshSunoTokenSilently() {
        runOnUiThread(() -> {
            try {
                String tok = extractSessionCookieFromManager();
                if (tok != null && tok.length() > 20 && !tok.equals(getSunoToken())) {
                    saveSunoToken(tok);
                    restoreSavedSunoToken();
                }
            } catch (Exception e) {}
        });
    }

    private void startSunoTokenAutoRefresh() {
        sunoTokenRefreshRunnable = new Runnable() {
            @Override
            public void run() {
                refreshSunoTokenSilently();
                // Clerk __session JWT rolls over every ~60s while warm engine is active -> sync every 45s
                bridgeHandler.postDelayed(this, 45 * 1000L);
            }
        };
        bridgeHandler.postDelayed(sunoTokenRefreshRunnable, 6000L);
    }

    public void saveSunoToken(String token) {
        try {
            SharedPreferences prefs = getSharedPreferences("aurasound_prefs", Context.MODE_PRIVATE);
            prefs.edit().putString("suno_token", token).apply();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public String getSunoToken() {
        try {
            SharedPreferences prefs = getSharedPreferences("aurasound_prefs", Context.MODE_PRIVATE);
            return prefs.getString("suno_token", "");
        } catch (Exception e) {
            return "";
        }
    }

    public void clearSunoCookies() {
        runOnUiThread(() -> {
            try {
                destroyWarmSunoWebView();
                saveSunoToken("");
                CookieManager cm = CookieManager.getInstance();
                cm.removeAllCookies(null);
                cm.flush();
            } catch (Exception e) {}
        });
    }

    public void openExternalBrowser(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
            Toast.makeText(this, "Gagal membuka browser: " + e.getMessage(), Toast.LENGTH_SHORT).show();
        }
    }

    public void downloadAndInstallUpdate(String apkUrl) {
        runOnUiThread(() -> {
            try {
                Toast.makeText(this, "Mengunduh update AuraSound...", Toast.LENGTH_SHORT).show();
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) {
                    openExternalBrowser(apkUrl);
                    return;
                }
                Uri uri = Uri.parse(apkUrl);
                DownloadManager.Request request = new DownloadManager.Request(uri);
                request.setTitle("AuraSound Update");
                request.setDescription("Mengunduh versi terbaru AuraSound...");
                request.setMimeType("application/vnd.android.package-archive");
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, "AuraSound.apk");

                final long downloadId = dm.enqueue(request);

                BroadcastReceiver onComplete = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        try {
                            unregisterReceiver(this);
                            Uri fileUri = dm.getUriForDownloadedFile(downloadId);
                            if (fileUri != null) {
                                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                                installIntent.setDataAndType(fileUri, "application/vnd.android.package-archive");
                                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                startActivity(installIntent);
                            }
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                };

                registerReceiver(onComplete, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            } catch (Exception e) {
                e.printStackTrace();
                openExternalBrowser(apkUrl);
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleDeepLink(intent);
    }

    private void handleDeepLink(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri uri = intent.getData();
        if ("aurasound".equals(uri.getScheme())) {
            String token = uri.getQueryParameter("token");
            if (token != null && token.length() > 20) {
                onSunoTokenExtracted(token);
            }
        }
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
    protected void onResume() {
        super.onResume();
        refreshSunoTokenSilently();
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
        if (sunoTokenRefreshRunnable != null) {
            bridgeHandler.removeCallbacks(sunoTokenRefreshRunnable);
        }
        destroyWarmSunoWebView();
        instance = null;
        stopMediaService();
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && warmWebViewContainer != null && warmWebViewContainer.getTranslationX() == 0f) {
            androidUserCancelled = true;
            parkGenWebViewInBackground();
            if (webView != null) {
                webView.evaluateJavascript("if (window.sunoStudio && window.sunoStudio.onAndroidGenerationError) { window.sunoStudio.onAndroidGenerationError('Verifikasi dibatalkan.'); }", null);
            }
            return true;
        }
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

  execSync(`"${JAVAC}" -encoding UTF-8 -d "${path.join(BUILD_DIR, 'bin')}" -cp "${PLATFORM_JAR}" ${javaFiles}`, { stdio: 'inherit' });

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

  // Gunakan keystore permanen agar tanda tangan APK konsisten selamanya
  const keystoreDir = path.join(PROJECT_ROOT, 'android-keystore');
  if (!fs.existsSync(keystoreDir)) {
    fs.mkdirSync(keystoreDir, { recursive: true });
  }
  const keystorePath = path.join(keystoreDir, 'aurasound.keystore');
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

  const releaseDir = path.join(PROJECT_ROOT, 'release');
  if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });
  fs.copyFileSync(finalApk, path.join(releaseDir, 'AuraSound.apk'));

  console.log('========================================================');
  console.log('🎉 APK ANDROID BERHASIL DIBUAT!');
  console.log(`📍 Lokasi File: ${finalApk}`);
  console.log(`🌐 Lokasi Web: ${path.join(publicDownloadDir, 'AuraSound.apk')}`);
  console.log('========================================================');
} catch (err) {
  console.error('❌ Terjadi kesalahan saat membuat APK:', err.message);
  process.exit(1);
}
