package app.rivaya.next;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int slot = intent != null ? intent.getIntExtra("slot", 0) : 0;
        ReminderScheduler.showNotification(context, "RIVAYA", "Пора сделать маленький шаг к своей цели ✦");
        ReminderScheduler.scheduleNext(context, slot);
    }
}
