package app.rivaya.next

import android.content.Intent
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.ZoneId

/** Reads the system's aggregate, including days when RIVAYA was closed. */
class HealthSteps(private val activity: ComponentActivity, private val publish: java.util.function.Consumer<String>) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val permissions = setOf(HealthPermission.getReadPermission(StepsRecord::class))
    private val prefs = activity.getSharedPreferences("rivaya_health_access", 0)
    private var reading = false
    private val launcher = activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { granted ->
        prefs.edit().putBoolean("denied", !granted.containsAll(permissions)).apply()
        refresh()
    }

    private fun status() = HealthConnectClient.getSdkStatus(activity)
    private fun send(status: String, message: String = "") {
        publish.accept(JSONObject().put("status", status).put("message", message).toString())
    }
    fun requestAccess() {
        if (status() != HealthConnectClient.SDK_AVAILABLE) { openSettings(); return }
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(activity)
                if (client.permissionController.getGrantedPermissions().containsAll(permissions)) refresh()
                else if (prefs.getBoolean("denied", false)) openSettings()
                else launcher.launch(permissions)
            } catch (_: Exception) { send("error", "Не удалось открыть разрешения Health Connect") }
        }
    }
    fun openSettings() {
        try {
            val intent = if (status() == HealthConnectClient.SDK_AVAILABLE)
                Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
            else Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=com.google.android.apps.healthdata"))
            activity.startActivity(intent)
        } catch (_: Exception) { send("unavailable", "Health Connect не установлен или недоступен") }
    }
    fun refresh() {
        if (reading) return
        if (status() != HealthConnectClient.SDK_AVAILABLE) { send("unavailable"); return }
        reading = true
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(activity)
                if (!client.permissionController.getGrantedPermissions().containsAll(permissions)) { send("denied"); return@launch }
                val zone = ZoneId.systemDefault()
                val today = LocalDate.now(zone)
                val daily = JSONObject()
                val history = JSONArray()
                for (offset in 6 downTo 0) {
                    val day = today.minusDays(offset.toLong())
                    val start = day.atStartOfDay(zone).toInstant()
                    val end = if (offset == 0) java.time.Instant.now() else day.plusDays(1).atStartOfDay(zone).toInstant()
                    val result = client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(start, end)))
                    val count = result[StepsRecord.COUNT_TOTAL] ?: 0L
                    history.put(count)
                    daily.put(day.toString(), count)
                }
                prefs.edit().putBoolean("denied", false).apply()
                publish.accept(JSONObject().put("status", "granted").put("steps", daily.getLong(today.toString()))
                    .put("day", today.toString()).put("history", history).put("dailySteps", daily).toString())
            } catch (_: SecurityException) { send("denied") }
            catch (_: Exception) { send("error", "Не удалось обновить шаги. Попробуйте ещё раз.") }
            finally { reading = false }
        }
    }
    fun close() { scope.cancel() }
}
