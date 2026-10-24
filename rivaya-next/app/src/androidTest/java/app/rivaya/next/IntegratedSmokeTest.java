package app.rivaya.next;

import static org.junit.Assert.assertTrue;
import android.content.Context;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

@RunWith(AndroidJUnit4.class)
public class IntegratedSmokeTest {
    private boolean evaluate(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);boolean[] result={false};
        scenario.onActivity(a->a.getWebViewForTesting().evaluateJavascript(script,value->{result[0]="true".equals(value);latch.countDown();}));
        return latch.await(10,TimeUnit.SECONDS)&&result[0];
    }
    private void waitFor(ActivityScenario<MainActivity> scenario,String script) throws Exception {
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
        while(System.nanoTime()<until){if(evaluate(scenario,script))return;Thread.sleep(200);}
        assertTrue("WebView condition failed: "+script,false);
    }
    @Test public void integratedScreensDataRemindersAndVault() throws Exception {
        Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            waitFor(scenario,"document.readyState==='complete' && !!window.RivayaNextUI && !!window.RivayaVault");
            assertTrue(evaluate(scenario,"state.profile.onboardingDone=true;state.profile.language='ru';document.querySelectorAll('.modal').forEach(m=>m.classList.remove('open'));window.__base=backupText();render();true"));
            device.executeShellCommand("mkdir -p /sdcard/Download/rivaya-previews");
            for(String view:new String[]{"today","plan","progress","profile"}){
                assertTrue(evaluate(scenario,"currentView='"+view+"';render();window.scrollTo(0,0);document.documentElement.scrollWidth<=innerWidth"));
                Thread.sleep(300);device.executeShellCommand("screencap -p /sdcard/Download/rivaya-previews/"+view+".png");
            }
            assertTrue(evaluate(scenario,"(()=>{window.RivayaNextUI.openEditor('habit');Object.assign(window.RivayaNextUI.getDraft(),{name:'Smoke count',tracking:'count',target:100,unit:'reps',reminderEnabled:true,times:['10:00','15:00','20:00']});window.RivayaNextUI.commit();const h=state.habits.find(h=>h.name==='Smoke count');window.RivayaNextCore.changeCount(state,h.id,todayKey(),30);save();syncSmartReminders(false);return h.counts[todayKey()].value===30&&collectSmartReminderItems().filter(i=>i.title==='Smoke count').length===3})()"));
            Thread.sleep(400);
            String schedule=context.getSharedPreferences("rivaya_reminders",Context.MODE_PRIVATE).getString("items_json","");
            assertTrue(schedule.contains("Smoke count")&&schedule.contains("15:00"));
            assertTrue(evaluate(scenario,"(()=>{const h=state.habits.find(h=>h.name==='Smoke count');window.RivayaNextCore.changeCount(state,h.id,todayKey(),100);save();syncSmartReminders(false);return collectSmartReminderItems().filter(i=>i.title==='Smoke count').every(i=>i.skipDates.includes(todayKey()))})()"));
            assertTrue(evaluate(scenario,"window.__vaultOk=false;RivayaVault.write({access_token:'test-only',refresh_token:'test-only'}).then(()=>RivayaVault.read()).then(s=>{if(s.access_token!=='test-only')throw Error();return RivayaVault.clear()}).then(()=>RivayaVault.read()).then(s=>window.__vaultOk=s===null);true"));
            waitFor(scenario,"window.__vaultOk===true");
            assertTrue(evaluate(scenario,"(()=>{const before=JSON.stringify(state);try{restoreBackupText('{bad')}catch{}return before===JSON.stringify(state)})()"));
            assertTrue(evaluate(scenario,"restoreBackupText(window.__base);render();true"));
        }
    }
}
