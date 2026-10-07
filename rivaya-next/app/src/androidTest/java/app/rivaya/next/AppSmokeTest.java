package app.rivaya.next;

import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.Until;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class AppSmokeTest {
    private static final String PACKAGE = "app.rivaya.next";

    @Test
    public void appLaunchesAndAvatarPickerOpens() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), 15_000));

            CountDownLatch latch = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.readyState + '|' + (!!window.rvOpenAvatarPicker || !!window.openAvatarPicker)",
                    value -> latch.countDown()));
            assertTrue("Web UI did not become ready", latch.await(10, TimeUnit.SECONDS));

            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(window.rvOpenAvatarPicker || window.openAvatarPicker)()", null));

            assertTrue("System image picker did not open",
                    device.wait(Until.gone(By.pkg(PACKAGE).depth(0)), 10_000)
                            || !PACKAGE.equals(device.getCurrentPackageName()));
            assertNotEquals("Picker stayed inside app package", PACKAGE, device.getCurrentPackageName());

            device.pressBack();
            assertTrue(device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), 10_000));
        }
    }
}
