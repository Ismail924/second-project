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
    private static final String PACKAGE = "app.rivaya.smart01";

    @Test
    public void appLaunchesProfileRendersAndAvatarPickerOpens() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            assertTrue(device.wait(Until.hasObject(By.pkg(PACKAGE).depth(0)), 15_000));

            CountDownLatch ready = new CountDownLatch(1);
            final boolean[] homeOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.body.innerText.includes('Сегодня') && document.body.innerText.includes('Привычки')",
                    value -> { homeOk[0] = "true".equals(value); ready.countDown(); }));
            assertTrue("Home UI did not become ready", ready.await(10, TimeUnit.SECONDS));
            assertTrue("Today screen did not render", homeOk[0]);

            CountDownLatch profile = new CountDownLatch(1);
            final boolean[] profileOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "currentView='profile';render();document.body.innerText.includes('Профиль') && document.body.innerText.includes('Фото профиля')",
                    value -> { profileOk[0] = "true".equals(value); profile.countDown(); }));
            assertTrue("Profile UI did not become ready", profile.await(10, TimeUnit.SECONDS));
            assertTrue("Profile screen did not render", profileOk[0]);

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
