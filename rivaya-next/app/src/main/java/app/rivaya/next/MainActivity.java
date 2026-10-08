package app.rivaya.next;

import android.Manifest;
import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.provider.Settings;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends androidx.activity.ComponentActivity {
    private static final int FILE_CHOOSER_REQUEST = 4201;
    private static final int ACTIVITY_RECOGNITION_REQUEST = 4202;
    private static final int NOTIFICATION_REQUEST = 4203;
    private static final int BACKUP_CREATE_REQUEST = 4301;
    private static final int BACKUP_OPEN_REQUEST = 4302;

    private boolean pendingTestNotification;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private HealthSteps healthSteps;
    private String pendingBackupJson = null;
    private final SimpleDateFormat dayFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.US);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(5, 7, 16));
        getWindow().setNavigationBarColor(Color.rgb(5, 7, 16));
        ReminderScheduler.ensureChannel(this);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 7, 16));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(true);
        webView.getSettings().setAllowContentAccess(true);
        webView.getSettings().setMediaPlaybackRequiresUserGesture(false);
        webView.getSettings().setTextZoom(100);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams fileChooserParams) {
                if (filePathCallback != null) {
                    filePathCallback.onReceiveValue(null);
                }
                filePathCallback = callback;

                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    if (filePathCallback != null) {
                        filePathCallback.onReceiveValue(null);
                        filePathCallback = null;
                    }
                    return false;
                }
            }
        });

        webView.addJavascriptInterface(new NativeBridge(), "VektorNative");
        setContentView(webView);
        webView.post(this::hideNavigationBar);
        webView.loadUrl("file:///android_asset/index.html");

        healthSteps = new HealthSteps(this, payload -> runOnUiThread(() ->
                webView.evaluateJavascript("window.vektorOnNativeSteps && window.vektorOnNativeSteps(" + JSONObject.quote(payload) + ")", null)));
    }

    public WebView getWebViewForTesting() {
        return webView;
    }

    private void hideNavigationBar() {
        View decor = getWindow().getDecorView();
        if (decor == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = decor.getWindowInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideNavigationBar();
    }

    @Override
    protected void onResume() {
        super.onResume();
        hideNavigationBar();
        if (healthSteps != null) healthSteps.refresh();
    }

    @Override
    protected void onDestroy() {
        if (healthSteps != null) healthSteps.close();
        if (filePathCallback != null) filePathCallback.onReceiveValue(null);
        super.onDestroy();
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_REQUEST && grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED && pendingTestNotification) {
            pendingTestNotification = false;
            ReminderScheduler.showNotification(this, "RIVAYA", "Пора сделать маленький шаг к своей цели ✦");
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == BACKUP_CREATE_REQUEST) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingBackupJson != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData(), "w")) {
                    if (out != null) { out.write(pendingBackupJson.getBytes(StandardCharsets.UTF_8)); out.flush(); ok = true; }
                } catch (Exception ignored) {}
            }
            pendingBackupJson = null;
            final boolean result = ok;
            if (webView != null) webView.post(() -> webView.evaluateJavascript("window.rivayaOnBackupExport && window.rivayaOnBackupExport(" + result + ")", null));
            return;
        }
        if (requestCode == BACKUP_OPEN_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                    if (in != null) {
                        ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int read,total=0;
                        while ((read = in.read(buffer)) != -1) { total += read; if (total > 8*1024*1024) throw new IllegalStateException("Backup too large"); out.write(buffer,0,read); }
                        String quoted = JSONObject.quote(out.toString(StandardCharsets.UTF_8.name()));
                        if (webView != null) webView.post(() -> webView.evaluateJavascript("window.rivayaOnBackupImport && window.rivayaOnBackupImport(" + quoted + ")", null));
                    }
                } catch (Exception ignored) { if (webView != null) webView.post(() -> webView.evaluateJavascript("window.rivayaOnBackupImport && window.rivayaOnBackupImport('')", null)); }
            }
            return;
        }
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                try {
                    getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (Exception ignored) {
                }
                results = new Uri[]{uri};
            }
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    public final class NativeBridge {
        @JavascriptInterface
        public void refreshSteps() {
            runOnUiThread(() -> { if (healthSteps != null) healthSteps.refresh(); });
        }

        @JavascriptInterface
        public void requestStepAccess() {
            runOnUiThread(() -> { if (healthSteps != null) healthSteps.requestAccess(); });
        }

        @JavascriptInterface
        public void openHealthSettings() {
            runOnUiThread(() -> { if (healthSteps != null) healthSteps.openSettings(); });
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::requestNotificationPermission);
        }

        @JavascriptInterface
        public void configureReminders(boolean enabled,
                                       int h1, int m1,
                                       int h2, int m2,
                                       int h3, int m3) {
            ReminderScheduler.configure(MainActivity.this, enabled,
                    new int[][]{{h1, m1}, {h2, m2}, {h3, m3}});
        }

        @JavascriptInterface
        public void configureItemReminders(String json) { ReminderScheduler.configureItems(MainActivity.this, json); }

        @JavascriptInterface
        public void exportBackupFile(String json) {
            pendingBackupJson = json == null ? "" : json;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("application/json");
                    intent.putExtra(Intent.EXTRA_TITLE, "RIVAYA-backup-" + new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()) + ".json");
                    startActivityForResult(intent, BACKUP_CREATE_REQUEST);
                } catch (Exception e) { pendingBackupJson = null; if (webView != null) webView.evaluateJavascript("window.rivayaOnBackupExport && window.rivayaOnBackupExport(false)", null); }
            });
        }

        @JavascriptInterface
        public void importBackupFile() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json","text/plain"});
                    startActivityForResult(intent, BACKUP_OPEN_REQUEST);
                } catch (Exception e) { if (webView != null) webView.evaluateJavascript("window.rivayaOnBackupImport && window.rivayaOnBackupImport('')", null); }
            });
        }

        @JavascriptInterface
        public void testNotification() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    pendingTestNotification = true;
                    requestNotificationPermission();
                    return;
                }
                ReminderScheduler.showNotification(MainActivity.this, "RIVAYA", "Пора сделать маленький шаг к своей цели ✦");
            });
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || url.trim().isEmpty()) return;
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    startActivity(intent);
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }
    }
}
