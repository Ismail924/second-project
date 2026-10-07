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

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class MainActivity extends Activity implements SensorEventListener {
    private static final int FILE_CHOOSER_REQUEST = 4201;
    private static final int ACTIVITY_RECOGNITION_REQUEST = 4202;
    private static final int NOTIFICATION_REQUEST = 4203;

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private SensorManager sensorManager;
    private Sensor stepCounterSensor;
    private volatile int stepsToday = 0;
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

        initStepCounter();
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
        registerStepSensorIfAllowed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (sensorManager != null) sensorManager.unregisterListener(this);
    }

    private void initStepCounter() {
        sensorManager = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            stepCounterSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        }
        registerStepSensorIfAllowed();
    }

    private boolean hasActivityPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED;
    }

    private void registerStepSensorIfAllowed() {
        if (sensorManager == null || stepCounterSensor == null || !hasActivityPermission()) return;
        sensorManager.unregisterListener(this);
        sensorManager.registerListener(this, stepCounterSensor, SensorManager.SENSOR_DELAY_NORMAL);
    }

    private void requestActivityPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                && checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.ACTIVITY_RECOGNITION}, ACTIVITY_RECOGNITION_REQUEST);
        } else {
            registerStepSensorIfAllowed();
            pushStepsToWeb();
        }
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
        if (requestCode == ACTIVITY_RECOGNITION_REQUEST) {
            registerStepSensorIfAllowed();
            pushStepsToWeb();
        }
    }

    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_STEP_COUNTER) return;

        float raw = event.values[0];
        String today = dayFormat.format(new Date());
        SharedPreferences prefs = getSharedPreferences("rivaya_steps", MODE_PRIVATE);
        String savedDay = prefs.getString("day", "");
        float baseline = prefs.getFloat("baseline", -1f);

        if (!today.equals(savedDay) || baseline < 0f || raw < baseline) {
            baseline = raw;
            prefs.edit().putString("day", today).putFloat("baseline", baseline).apply();
        }

        stepsToday = Math.max(0, Math.round(raw - baseline));
        pushStepsToWeb();
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
    }

    private void pushStepsToWeb() {
        if (webView == null) return;
        String status;
        if (stepCounterSensor == null) status = "unsupported";
        else if (!hasActivityPermission()) status = "denied";
        else status = "granted";

        try {
            JSONObject payload = new JSONObject();
            payload.put("status", status);
            payload.put("steps", status.equals("granted") ? stepsToday : 0);
            payload.put("history", new int[]{0, 0, 0, 0, 0, 0, status.equals("granted") ? stepsToday : 0});
            String quoted = JSONObject.quote(payload.toString());
            runOnUiThread(() -> webView.evaluateJavascript("window.vektorOnNativeSteps && window.vektorOnNativeSteps(" + quoted + ")", null));
        } catch (Exception ignored) {
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
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
            pushStepsToWeb();
        }

        @JavascriptInterface
        public void requestStepAccess() {
            runOnUiThread(MainActivity.this::requestActivityPermission);
        }

        @JavascriptInterface
        public void openHealthSettings() {
            runOnUiThread(() -> {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            });
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
        public void testNotification() {
            runOnUiThread(() -> {
                requestNotificationPermission();
                ReminderScheduler.showNotification(MainActivity.this, "RIVAYA", "Пора сделать маленький шаг к своей цели ✦");
            });
        }

        @JavascriptInterface
        public String getPlatform() {
            return "android";
        }
    }
}
