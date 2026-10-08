package app.rivaya.next;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;

final class ReminderScheduler {
    static final String CHANNEL_ID = "rivaya_reminders";
    private static final String PREFS = "rivaya_reminders";
    private static final String ITEMS_JSON = "items_json";
    private ReminderScheduler() {}

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID,"Напоминания RIVAYA",NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Персональные напоминания о целях и привычках"); manager.createNotificationChannel(channel);
            }
        }
    }

    static void configure(Context context, boolean enabled, int[][] times) {
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE); SharedPreferences.Editor e=prefs.edit().putBoolean("enabled",enabled);
        for(int i=0;i<3;i++){int h=times[i][0],m=times[i][1];e.putInt("h"+i,h).putInt("m"+i,m);cancelLegacy(context,i);if(enabled&&h>=0&&m>=0)scheduleLegacy(context,i,h,m);} e.apply();
    }

    static void configureItems(Context context,String json){
        try { new JSONArray(json==null?"[]":json); } catch(Exception invalid) { return; }
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);cancelItems(context,prefs.getString(ITEMS_JSON,"[]"));
        for(int i=0;i<3;i++)cancelLegacy(context,i);
        prefs.edit().putBoolean("enabled",false).putString(ITEMS_JSON,json==null?"[]":json).apply();
        try{JSONArray arr=new JSONArray(json==null?"[]":json);for(int i=0;i<arr.length();i++)scheduleItem(context,arr.getJSONObject(i));}catch(Exception ignored){}
    }

    static void restore(Context context){
        SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
        try{JSONArray arr=new JSONArray(prefs.getString(ITEMS_JSON,"[]"));if(arr.length()>0){for(int i=0;i<arr.length();i++)scheduleItem(context,arr.getJSONObject(i));return;}}catch(Exception ignored){}
        if(!prefs.getBoolean("enabled",false))return;for(int i=0;i<3;i++){int h=prefs.getInt("h"+i,-1),m=prefs.getInt("m"+i,-1);if(h>=0&&m>=0)scheduleLegacy(context,i,h,m);}
    }

    static void scheduleNext(Context context,int slot){SharedPreferences prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);if(!prefs.getBoolean("enabled",false))return;int h=prefs.getInt("h"+slot,-1),m=prefs.getInt("m"+slot,-1);if(h>=0&&m>=0)scheduleLegacy(context,slot,h,m);}
    static void scheduleNextItem(Context context,Intent received){
        JSONObject item = currentItem(context, received.getStringExtra("itemId"));
        if (item != null) scheduleItem(context, item);
    }
    static JSONObject currentItem(Context context, String id) {
        try {
            JSONArray items = new JSONArray(context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(ITEMS_JSON,"[]"));
            for(int n=0;n<items.length();n++) if(items.getJSONObject(n).optString("id").equals(id)) return items.getJSONObject(n);
        } catch(Exception ignored) {}
        return null;
    }
    static boolean withinTerm(JSONObject item, long timestamp) {
        String end = item.optString("endDate", "");
        return end.isEmpty() || new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(new java.util.Date(timestamp)).compareTo(end) <= 0;
    }

    private static void scheduleLegacy(Context c,int slot,int h,int m){AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);if(a!=null)setAlarm(a,nextTime(h,m,false).getTimeInMillis(),legacyPendingIntent(c,slot));}
    private static void scheduleItem(Context c,JSONObject item){try{String id=item.optString("id",""),time=item.optString("time","");if(id.isEmpty()||!time.matches("([01]\\d|2[0-3]):[0-5]\\d"))return;String[] p=time.split(":");boolean weekdays=item.optBoolean("weekdaysOnly",false);AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);if(a==null)return;Intent i=new Intent(c,ReminderReceiver.class);i.setAction("app.rivaya.smart01.ITEM_REMINDER");i.setData(android.net.Uri.parse("rivaya://reminder/"+android.net.Uri.encode(id)));i.putExtra("itemReminder",true);i.putExtra("itemId",id);i.putExtra("title",item.optString("title","RIVAYA"));i.putExtra("body",item.optString("body","Пора сделать следующий шаг."));i.putExtra("time",time);i.putExtra("weekdaysOnly",weekdays);PendingIntent pi=PendingIntent.getBroadcast(c,itemRequestCode(id),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);long when=nextTime(Integer.parseInt(p[0]),Integer.parseInt(p[1]),weekdays).getTimeInMillis();if(withinTerm(item,when))setAlarm(a,when,pi);}catch(Exception ignored){}}
    private static Calendar nextTime(int h,int m,boolean weekdays){Calendar cal=Calendar.getInstance();cal.set(Calendar.HOUR_OF_DAY,h);cal.set(Calendar.MINUTE,m);cal.set(Calendar.SECOND,0);cal.set(Calendar.MILLISECOND,0);if(cal.getTimeInMillis()<=System.currentTimeMillis())cal.add(Calendar.DAY_OF_YEAR,1);if(weekdays)while(cal.get(Calendar.DAY_OF_WEEK)==Calendar.SATURDAY||cal.get(Calendar.DAY_OF_WEEK)==Calendar.SUNDAY)cal.add(Calendar.DAY_OF_YEAR,1);return cal;}
    private static void setAlarm(AlarmManager a,long when,PendingIntent pi){if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.M){if(Build.VERSION.SDK_INT<Build.VERSION_CODES.S||a.canScheduleExactAlarms())a.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi);else a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi);}else a.setExact(AlarmManager.RTC_WAKEUP,when,pi);}
    private static void cancelItems(Context c,String json){try{JSONArray arr=new JSONArray(json==null?"[]":json);AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);if(a==null)return;for(int i=0;i<arr.length();i++){String id=arr.getJSONObject(i).optString("id","");if(!id.isEmpty()){
                    a.cancel(itemPendingIntent(c,id));
                    Intent old=new Intent(c,ReminderReceiver.class).setAction("app.rivaya.smart01.ITEM_REMINDER");
                    PendingIntent legacy=PendingIntent.getBroadcast(c,itemRequestCode(id),old,PendingIntent.FLAG_NO_CREATE|PendingIntent.FLAG_IMMUTABLE);
                    if(legacy!=null){a.cancel(legacy);legacy.cancel();}
                }}}catch(Exception ignored){}}
    static PendingIntent itemPendingIntent(Context c,String id){Intent i=new Intent(c,ReminderReceiver.class);i.setAction("app.rivaya.smart01.ITEM_REMINDER");i.setData(android.net.Uri.parse("rivaya://reminder/"+android.net.Uri.encode(id)));return PendingIntent.getBroadcast(c,itemRequestCode(id),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    private static int itemRequestCode(String id){return 20000+(id.hashCode()&0x3fffffff);}
    private static void cancelLegacy(Context c,int slot){AlarmManager a=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);if(a!=null)a.cancel(legacyPendingIntent(c,slot));}
    private static PendingIntent legacyPendingIntent(Context c,int slot){Intent i=new Intent(c,ReminderReceiver.class);i.setAction("app.rivaya.next.REMINDER");i.putExtra("slot",slot);return PendingIntent.getBroadcast(c,7000+slot,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}

    static void showNotification(Context c,String title,String body){
        ensureChannel(c);NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(nm==null)return;
        Intent open=new Intent(c,MainActivity.class);open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);PendingIntent content=PendingIntent.getActivity(c,9001,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder b=Build.VERSION.SDK_INT>=Build.VERSION_CODES.O?new android.app.Notification.Builder(c,CHANNEL_ID):new android.app.Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.ic_popup_reminder).setContentTitle(title).setContentText(body).setAutoCancel(true).setContentIntent(content).setPriority(android.app.Notification.PRIORITY_DEFAULT);
        try{nm.notify((int)(System.currentTimeMillis()%100000),b.build());}catch(SecurityException ignored){}
    }
}
