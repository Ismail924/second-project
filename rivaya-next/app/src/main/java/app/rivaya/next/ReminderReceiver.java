package app.rivaya.next;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.Calendar;
public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        if(intent!=null&&intent.getBooleanExtra("itemReminder",false)){
            org.json.JSONObject current=ReminderScheduler.currentItem(context,intent.getStringExtra("itemId"));
            if(current==null || !ReminderScheduler.withinTerm(current,System.currentTimeMillis()))return;
            boolean weekdays=intent.getBooleanExtra("weekdaysOnly",false);int day=Calendar.getInstance().get(Calendar.DAY_OF_WEEK);boolean weekend=day==Calendar.SATURDAY||day==Calendar.SUNDAY;
            if((!weekdays||!weekend)&&ReminderScheduler.allowedDate(current,System.currentTimeMillis()))ReminderScheduler.showNotification(context,current.optString("title","RIVAYA"),current.optString("body","Пора сделать следующий шаг."));
            ReminderScheduler.scheduleNextItem(context,intent);return;
        }
        int slot=intent!=null?intent.getIntExtra("slot",0):0;ReminderScheduler.showNotification(context,"RIVAYA","Пора сделать маленький шаг к своей цели ✦");ReminderScheduler.scheduleNext(context,slot);
    }
}
