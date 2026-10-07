package app.rivaya.next;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.util.Calendar;

final class ReminderScheduler {
    static final String CHANNEL_ID = "rivaya_reminders";
    private static final String PREFS = "rivaya_reminders";

    private ReminderScheduler() {}

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Напоминания RIVAYA",
                        NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Напоминания о целях и привычках");
                manager.createNotificationChannel(channel);
            }
        }
    }

    static void configure(Context context, boolean enabled, int[][] times) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor e = prefs.edit().putBoolean("enabled", enabled);
        for (int i = 0; i < 3; i++) {
            int h = times[i][0];
            int m = times[i][1];
            e.putInt("h" + i, h).putInt("m" + i, m);
            cancel(context, i);
            if (enabled && h >= 0 && m >= 0) schedule(context, i, h, m);
        }
        e.apply();
    }

    static void restore(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        for (int i = 0; i < 3; i++) {
            int h = prefs.getInt("h" + i, -1);
            int m = prefs.getInt("m" + i, -1);
            if (h >= 0 && m >= 0) schedule(context, i, h, m);
        }
    }

    static void scheduleNext(Context context, int slot) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        int h = prefs.getInt("h" + slot, -1);
        int m = prefs.getInt("m" + slot, -1);
        if (h >= 0 && m >= 0) schedule(context, slot, h, m);
    }

    private static void schedule(Context context, int slot, int hour, int minute) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm == null) return;

        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, minute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1);

        PendingIntent pi = pendingIntent(context, slot);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarm.canScheduleExactAlarms()) {
                alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
            } else {
                alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
            }
        } else {
            alarm.setExact(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
        }
    }

    private static void cancel(Context context, int slot) {
        AlarmManager alarm = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarm != null) alarm.cancel(pendingIntent(context, slot));
    }

    private static PendingIntent pendingIntent(Context context, int slot) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction("app.rivaya.next.REMINDER");
        intent.putExtra("slot", slot);
        return PendingIntent.getBroadcast(context, 7000 + slot, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void showNotification(Context context, String title, String body) {
        ensureChannel(context);
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 9001, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new android.app.Notification.Builder(context, CHANNEL_ID)
                : new android.app.Notification.Builder(context);

        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(content)
                .setPriority(android.app.Notification.PRIORITY_DEFAULT);

        try {
            nm.notify((int) (System.currentTimeMillis() % 100000), b.build());
        } catch (SecurityException ignored) {
        }
    }
}
