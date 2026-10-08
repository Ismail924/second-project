package app.rivaya.next;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.Calendar;
public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        if(intent!=null&&intent.getBooleanExtra("itemReminder",false)){
            boolean weekdays=intent.getBooleanExtra("weekdaysOnly",false);int day=Calendar.getInstance().get(Calendar.DAY_OF_WEEK);boolean weekend=day==Calendar.SATURDAY||day==Calendar.SUNDAY;
            if(!weekdays||!weekend)ReminderScheduler.showNotification(context,intent.getStringExtra("title")==null?"RIVAYA":intent.getStringExtra("title"),intent.getStringExtra("body")==null?"Пора сделать следующий шаг.":intent.getStringExtra("body"));
            ReminderScheduler.scheduleNextItem(context,intent);return;
        }
        int slot=intent!=null?intent.getIntExtra("slot",0):0;ReminderScheduler.showNotification(context,"RIVAYA","Пора сделать маленький шаг к своей цели ✦");ReminderScheduler.scheduleNext(context,slot);
    }
}
