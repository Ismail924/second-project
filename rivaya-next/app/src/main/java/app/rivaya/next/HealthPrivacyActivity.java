package app.rivaya.next;
import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.widget.TextView;
public class HealthPrivacyActivity extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        TextView text = new TextView(this);
        text.setPadding(32, 64, 32, 32);
        text.setTextColor(Color.WHITE);
        text.setBackgroundColor(Color.rgb(5, 7, 16));
        text.setTextSize(18);
        text.setText("RIVAYA — доступ к шагам\n\nПриложение читает количество шагов за сегодня и последние 7 дней из Health Connect, чтобы показать активность и статистику.\n\nДанные сохраняются на вашем устройстве. RIVAYA не отправляет их на сервер. При создании резервной копии они включаются в выбранный вами файл.\n\nРазрешение можно отозвать в настройках Health Connect в любое время. Шаги не вводятся вручную и не подменяются тестовыми значениями.");
        setContentView(text);
    }
}
