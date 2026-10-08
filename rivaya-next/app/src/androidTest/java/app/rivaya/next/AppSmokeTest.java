package app.rivaya.next;

import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.graphics.drawable.AdaptiveIconDrawable;
import android.graphics.drawable.Drawable;

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
    public void allFourScreensFitAndProgressPeriodsWork() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(1800);
            androidx.test.uiautomator.UiObject2 tutorial = device.findObject(androidx.test.uiautomator.By.text("Got it"));
            if (tutorial != null) tutorial.click();
            device.waitForIdle();
            for (String view : new String[]{"today","profile","plan","progress"}) {
                CountDownLatch done = new CountDownLatch(1);
                boolean[] fits = {false};
                scenario.onActivity(a -> a.getWebViewForTesting().evaluateJavascript(
                    "document.querySelectorAll('.modal').forEach(m=>m.classList.remove('open'));document.body.style.minHeight='';currentView='"+view+"';render();window.scrollTo(0,0);document.documentElement.scrollWidth<=innerWidth",
                    value -> {fits[0]="true".equals(value);done.countDown();}));
                assertTrue(view+" overflows viewport",done.await(10,TimeUnit.SECONDS)&&fits[0]);
                Thread.sleep(1000);
                device.waitForIdle();
                device.executeShellCommand("mkdir -p /sdcard/Download/rivaya-previews");
                device.executeShellCommand("screencap -p /sdcard/Download/rivaya-previews/"+view+".png");
            }
            CountDownLatch periods = new CountDownLatch(1);
            boolean[] ok = {false};
            scenario.onActivity(a -> a.getWebViewForTesting().evaluateJavascript(
                "(()=>{for(const period of ['week','month','year']){currentStatsPeriod=period;render();if(document.querySelectorAll('.rv-progress-bar-col').length!==({week:7,month:15,year:12})[period]||document.documentElement.scrollWidth>innerWidth)return false}return true})()",
                value -> {ok[0]="true".equals(value);periods.countDown();}));
            assertTrue("Progress periods do not render",periods.await(10,TimeUnit.SECONDS)&&ok[0]);
        }
    }

    @Test
    public void invalidBackupDoesNotEraseLiveState() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(1800);
            CountDownLatch done = new CountDownLatch(1);
            boolean[] ok = {false};
            scenario.onActivity(a -> a.getWebViewForTesting().evaluateJavascript(
                "(()=>{const before=localStorage.getItem(STORAGE_KEY);let rejected=false;try{restoreBackupText(JSON.stringify({habits:[{name:'broken'}],goals:[],checks:{}}))}catch(e){rejected=true}return rejected&&before===localStorage.getItem(STORAGE_KEY)})()",
                value -> {ok[0]="true".equals(value);done.countDown();}));
            assertTrue("Invalid backup changed live data", done.await(10,TimeUnit.SECONDS)&&ok[0]);
        }
    }

    @Test
    public void expiredReminderDoesNotResurrectAndIdsDoNotCollide() throws Exception {
        Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
        org.json.JSONObject expired = new org.json.JSONObject().put("endDate","2000-01-01");
        assertTrue("Expired reminder still eligible", !ReminderScheduler.withinTerm(expired,System.currentTimeMillis()));
        assertTrue("Open-ended reminder rejected", ReminderScheduler.withinTerm(new org.json.JSONObject(),System.currentTimeMillis()));
        // Java String hash collision; alarms must additionally identify items by URI.
        ReminderScheduler.configureItems(c,"[{\"id\":\"Aa\",\"title\":\"One\",\"time\":\"12:00\"},{\"id\":\"BB\",\"title\":\"Two\",\"time\":\"12:00\"}]");
        assertNotEquals(ReminderScheduler.itemPendingIntent(c,"Aa"),ReminderScheduler.itemPendingIntent(c,"BB"));
        ReminderScheduler.configureItems(c,"[]");
    }

    @Test
    public void appLaunchesProfileRendersAndAvatarPickerOpens() throws Exception {
        UiDevice device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());

        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(1800);

            CountDownLatch ready = new CountDownLatch(1);
            final boolean[] homeOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "document.readyState === 'complete' && document.body.innerText.includes('Сегодня') && document.body.innerText.includes('Привычки') && !!document.querySelector('.rv-target-add-habit') && !!document.querySelector('.rv-target-focus-card')",
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

            Context targetContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
            Drawable launcherIcon = targetContext.getPackageManager().getApplicationIcon(targetContext.getApplicationInfo());
            assertTrue("Launcher icon is not adaptive", launcherIcon instanceof AdaptiveIconDrawable);

            CountDownLatch crud = new CountDownLatch(1);
            final boolean[] crudOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{try{window.__rvBaseBackup=backupText();document.getElementById('habitName').value='Smoke Habit';document.getElementById('habitFrequency').value='daily';document.getElementById('habitReminderEnabled').checked=true;document.getElementById('habitReminderTime').value='10:15';document.getElementById('saveHabitBtn').click();document.getElementById('goalName').value='Smoke Goal';document.getElementById('goalType').value='regular';document.getElementById('goalFirstStep').value='First step';document.getElementById('goalReminderEnabled').checked=true;document.getElementById('goalReminderTime').value='11:20';document.getElementById('saveGoalBtn').click();return state.habits.some(h=>h.name==='Smoke Habit')&&state.goals.some(g=>g.name==='Smoke Goal')&&collectSmartReminderItems().some(x=>x.title.includes('Smoke Habit'))&&collectSmartReminderItems().some(x=>x.title.includes('Smoke Goal'));}catch(e){return false}})()",
                    value -> { crudOk[0] = "true".equals(value); crud.countDown(); }));
            assertTrue("Habit/goal creation or personal reminders failed", crud.await(10, TimeUnit.SECONDS) && crudOk[0]);

            Thread.sleep(500);
            String itemJson = targetContext.getSharedPreferences("rivaya_reminders", Context.MODE_PRIVATE).getString("items_json", "[]");
            assertTrue("Personal reminders were not persisted natively", itemJson.contains("Smoke Habit") && itemJson.contains("Smoke Goal"));

            CountDownLatch restoreCreated = new CountDownLatch(1);
            final boolean[] restoreCreatedOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{try{restoreBackupText(window.__rvBaseBackup);return !state.habits.some(h=>h.name==='Smoke Habit')&&!state.goals.some(g=>g.name==='Smoke Goal')}catch(e){return false}})()",
                    value -> { restoreCreatedOk[0] = "true".equals(value); restoreCreated.countDown(); }));
            assertTrue("Backup restore did not roll back created data", restoreCreated.await(10, TimeUnit.SECONDS) && restoreCreatedOk[0]);

            CountDownLatch releaseUi = new CountDownLatch(1);
            final boolean[] releaseUiOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "currentView='plan';render();const p=!!document.querySelector('.rv-plan-target')&&!!document.querySelector('.rv-plan-overview');currentView='progress';render();const g=!!document.querySelector('.rv-progress-target')&&document.querySelectorAll('[data-stats-period]').length===3;const bridge=typeof VektorNative.configureItemReminders==='function'&&typeof VektorNative.exportBackupFile==='function'&&typeof VektorNative.importBackupFile==='function';p&&g&&bridge",
                    value -> { releaseUiOk[0] = "true".equals(value); releaseUi.countDown(); }));
            assertTrue("Plan/Progress or native release features are missing", releaseUi.await(8, TimeUnit.SECONDS) && releaseUiOk[0]);

            CountDownLatch backupRoundtrip = new CountDownLatch(1);
            final boolean[] backupOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{try{const t=backupText();const before=state.habits.length+'|'+state.goals.length;restoreBackupText(t);return before===(state.habits.length+'|'+state.goals.length)}catch(e){return false}})()",
                    value -> { backupOk[0] = "true".equals(value); backupRoundtrip.countDown(); }));
            assertTrue("Backup roundtrip failed", backupRoundtrip.await(8, TimeUnit.SECONDS) && backupOk[0]);

            CountDownLatch profileReturn = new CountDownLatch(1);
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "currentView='profile';render();!!document.querySelector('.rv-target-profile-stats')",
                    value -> profileReturn.countDown()));
            assertTrue("Could not return to Profile before geometry checks", profileReturn.await(8, TimeUnit.SECONDS));

            CountDownLatch statIcons = new CountDownLatch(1);
            final boolean[] statIconsOk = {false};
            scenario.onActivity(activity -> activity.getWebViewForTesting().evaluateJavascript(
                    "(()=>{const icons=[...document.querySelectorAll('.rv-target-profile-stats .rv-target-stat-icon')];return icons.length===3&&icons.every(i=>{const r=i.getBoundingClientRect();return r.width>=30&&r.width<=36&&r.height>=30&&r.height<=36})})()",
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
                    "window.scrollTo(0,document.body.scrollHeight);setTimeout(()=>{const f=document.querySelector('.rv-target-profile-footer');const n=document.querySelector('.rv-bottom-nav');window.__footerOk=!!f&&f.getBoundingClientRect().bottom<=n.getBoundingClientRect().top-6;},150);true",
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
                    "currentView='profile';render();window.scrollTo(0,document.body.scrollHeight);setTimeout(()=>{const f=document.querySelector('.rv-target-profile-footer')?.getBoundingClientRect();const n=document.querySelector('.rv-bottom-nav')?.getBoundingClientRect();window.__rvFooterSafe=!!f&&!!n&&f.bottom<=n.top;},250);true",
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
