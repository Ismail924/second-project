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
                    "document.readyState === 'complete' && document.body.innerText.includes('Сегодня') && document.body.innerText.includes('Привычки') && !!document.querySelector('.rv-premium-cta')",
                    value -> { homeOk[0] = "true".equals(value); ready.countDown(); }));
            assertTrue("Today screen did not render", ready.await(10, TimeUnit.SECONDS) && homeOk[0]);

            CountDownLatch scrollReset = new CountDownLatch(1);
            final boolean[] scrollResetOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.body.style.minHeight='2200px';window.scrollTo(0,600);setTimeout(()=>{document.querySelector('[data-nav=profile]').click();setTimeout(()=>{window.__rvScrollY=window.scrollY;},100)},50);true",
                    value -> scrollReset.countDown()));
            assertTrue("Navigation command was not executed", scrollReset.await(5, TimeUnit.SECONDS));
            Thread.sleep(500);
            CountDownLatch scrollCheck = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "window.scrollY===0",
                    value -> { scrollResetOk[0] = "true".equals(value); scrollCheck.countDown(); }));
            assertTrue("Tab navigation did not reset scroll to top", scrollCheck.await(5, TimeUnit.SECONDS) && scrollResetOk[0]);

            CountDownLatch profile = new CountDownLatch(1);
            final boolean[] profileOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "currentView='profile';render();document.body.innerText.includes('Фото профиля') && document.body.innerText.includes('@_isma_guder_') && !!document.querySelector('[data-external]')",
                    value -> { profileOk[0] = "true".equals(value); profile.countDown(); }));
            assertTrue("Profile screen did not render", profile.await(10, TimeUnit.SECONDS) && profileOk[0]);

            CountDownLatch targetUi = new CountDownLatch(1);
            final boolean[] targetUiOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.querySelectorAll('.rv-target-profile-stats > div').length===3 && document.querySelectorAll('.rv-target-setting').length>=6 && !!document.querySelector('.rv-target-instagram')",
                    value -> { targetUiOk[0] = "true".equals(value); targetUi.countDown(); }));
            assertTrue("Reference-matched Profile UI did not render", targetUi.await(8, TimeUnit.SECONDS) && targetUiOk[0]);

            CountDownLatch statIcons = new CountDownLatch(1);
            final boolean[] statIconsOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{const icons=[...document.querySelectorAll('.rv-profile-stats-neon .rv-stat-icon')];const old=document.querySelector('.rv-profile-stats-neon i.check');return icons.length===3&&!old&&icons.every(i=>{const r=i.getBoundingClientRect();return r.width>=22&&r.width<=26&&r.height>=22&&r.height<=26})})()",
                    value -> { statIconsOk[0] = "true".equals(value); statIcons.countDown(); }));
            assertTrue("Profile stat icons are inconsistent or colliding with global styles", statIcons.await(8, TimeUnit.SECONDS) && statIconsOk[0]);

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

            CountDownLatch navLayout = new CountDownLatch(1);
            final boolean[] navLayoutOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{const n=document.querySelector('.rv-bottom-nav');const r=n.getBoundingClientRect();const items=[...n.querySelectorAll('.nav-item')];return r.left>=8&&r.right<=innerWidth-8&&r.width>=innerWidth*0.88&&items.length===4&&items.every(x=>{const q=x.getBoundingClientRect();return q.left>=r.left&&q.right<=r.right})})()",
                    value -> { navLayoutOk[0] = "true".equals(value); navLayout.countDown(); }));
            assertTrue("Bottom navigation is shifted or clipped", navLayout.await(8, TimeUnit.SECONDS) && navLayoutOk[0]);

            CountDownLatch footerLayout = new CountDownLatch(1);
            final boolean[] footerLayoutOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "window.scrollTo(0,document.body.scrollHeight);setTimeout(()=>{const f=document.querySelector('.rv-profile-footer-neon');const n=document.querySelector('.rv-bottom-nav');window.__footerOk=!!f&&f.getBoundingClientRect().bottom<=n.getBoundingClientRect().top-6;},150);true",
                    value -> footerLayout.countDown()));
            assertTrue("Footer layout command failed", footerLayout.await(5, TimeUnit.SECONDS));
            Thread.sleep(500);
            CountDownLatch footerCheck = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "window.__footerOk===true",
                    value -> { footerLayoutOk[0] = "true".equals(value); footerCheck.countDown(); }));
            assertTrue("Profile footer is hidden behind bottom navigation", footerCheck.await(5, TimeUnit.SECONDS) && footerLayoutOk[0]);

            CountDownLatch navGeometry = new CountDownLatch(1);
            final boolean[] navGeometryOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{const n=document.querySelector('.rv-bottom-nav');const r=n.getBoundingClientRect();const b=[...n.querySelectorAll('.nav-item')].map(x=>x.getBoundingClientRect());return r.left>=0&&r.right<=innerWidth&&r.width>innerWidth*.85&&b.length===4&&b.every(x=>x.width>55)&&b.every((x,i)=>i===0||x.left>b[i-1].left);})()",
                    value -> { navGeometryOk[0] = "true".equals(value); navGeometry.countDown(); }));
            assertTrue("Bottom navigation is shifted or clipped", navGeometry.await(8, TimeUnit.SECONDS) && navGeometryOk[0]);

            CountDownLatch footerSafe = new CountDownLatch(1);
            final boolean[] footerSafeOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "currentView='profile';render();window.scrollTo(0,document.body.scrollHeight);setTimeout(()=>{const f=document.querySelector('.rv-profile-footer-neon')?.getBoundingClientRect();const n=document.querySelector('.rv-bottom-nav')?.getBoundingClientRect();window.__rvFooterSafe=!!f&&!!n&&f.bottom<=n.top;},250);true",
                    value -> footerSafe.countDown()));
            assertTrue("Footer setup did not run", footerSafe.await(5, TimeUnit.SECONDS));
            Thread.sleep(500);
            CountDownLatch footerSafeCheck = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "window.__rvFooterSafe===true",
                    value -> { footerSafeOk[0] = "true".equals(value); footerSafeCheck.countDown(); }));
            assertTrue("Profile footer remains hidden under bottom navigation", footerSafeCheck.await(8, TimeUnit.SECONDS) && footerSafeOk[0]);
        }
    }
}
