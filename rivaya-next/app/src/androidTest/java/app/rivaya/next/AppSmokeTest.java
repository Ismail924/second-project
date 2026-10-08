package app.rivaya.next;

import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;

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
            Thread.sleep(1800);

            CountDownLatch ready = new CountDownLatch(1);
            final boolean[] homeOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.readyState === 'complete' && document.body.innerText.includes('Сегодня') && document.body.innerText.includes('Привычки')",
                    value -> { homeOk[0] = "true".equals(value); ready.countDown(); }));
            assertTrue("Today screen did not render", ready.await(10, TimeUnit.SECONDS) && homeOk[0]);

            CountDownLatch profile = new CountDownLatch(1);
            final boolean[] profileOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "currentView='profile';render();document.body.innerText.includes('Профиль') && document.body.innerText.includes('Фото профиля')",
                    value -> { profileOk[0] = "true".equals(value); profile.countDown(); }));
            assertTrue("Profile screen did not render", profile.await(10, TimeUnit.SECONDS) && profileOk[0]);

            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(window.rvOpenAvatarPicker || window.openAvatarPicker)()", null));

            long deadline = System.currentTimeMillis() + 10000;
            String pickerPackage = PACKAGE;
            while (System.currentTimeMillis() < deadline) {
                pickerPackage = device.getCurrentPackageName();
                if (pickerPackage != null && !PACKAGE.equals(pickerPackage)) break;
                Thread.sleep(250);
            }
            assertNotEquals("System image picker did not open", PACKAGE, pickerPackage);

            device.pressBack();
            Thread.sleep(800);

            CountDownLatch back = new CountDownLatch(1);
            final boolean[] backOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.body.innerText.includes('Профиль')",
                    value -> { backOk[0] = "true".equals(value); back.countDown(); }));
            assertTrue("App did not return after closing picker", back.await(8, TimeUnit.SECONDS) && backOk[0]);
        }
    }
}
