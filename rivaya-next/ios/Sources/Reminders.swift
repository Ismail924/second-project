import Foundation
import UserNotifications

struct ReminderItem: Decodable {
    let id: String
    let title: String
    let body: String
    let time: String
    let weekdaysOnly: Bool
    let endDate: String?
}

@MainActor
final class ReminderService {
    private let center = UNUserNotificationCenter.current()
    private var generation = UUID().uuidString
    private var items: [ReminderItem] = []
    var report: ((String) -> Void)?

    func configure(_ text: String) {
        guard let data = text.data(using: .utf8), data.count <= 1_000_000,
              let decoded = try? JSONDecoder().decode([ReminderItem].self, from: data), decoded.count <= 500 else {
            report?("Не удалось прочитать расписание уведомлений"); return
        }
        items = decoded
        rebuild()
    }

    func requestPermission() {
        Task {
            do {
                let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
                if granted { rebuild() }
                else { report?("Уведомления выключены. Разрешите их в настройках iPhone → RIVAYA.") }
            } catch { report?("Не удалось запросить разрешение на уведомления") }
        }
    }

    func test() {
        Task {
            do {
                guard try await center.requestAuthorization(options: [.alert, .sound]) else {
                    report?("Разрешите уведомления в настройках iPhone → RIVAYA."); return
                }
                let content = UNMutableNotificationContent()
                content.title = "RIVAYA"
                content.body = "Напоминания работают. Сделай небольшой шаг к своей цели."
                content.sound = .default
                try await center.add(UNNotificationRequest(identifier: "rivaya-test", content: content,
                    trigger: UNTimeIntervalNotificationTrigger(timeInterval: 3, repeats: false)))
                report?("Тестовое уведомление появится через 3 секунды")
            } catch { report?("Не удалось создать тестовое уведомление") }
        }
    }

    func rebuild() {
        generation = UUID().uuidString
        let token = generation
        let snapshot = items
        Task {
            let settings = await center.notificationSettings()
            guard token == generation else { return }
            center.removeAllPendingNotificationRequests()
            guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
                if !snapshot.isEmpty { report?("Разрешите уведомления в настройках iPhone → RIVAYA.") }
                return
            }
            let calendar = Calendar.current
            let now = Date()
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.calendar = calendar
            formatter.timeZone = calendar.timeZone
            formatter.dateFormat = "yyyy-MM-dd"
            var requests: [(Date, UNNotificationRequest)] = []
            for item in snapshot {
                let parts = item.time.split(separator: ":").compactMap { Int($0) }
                guard parts.count == 2, (0...23).contains(parts[0]), (0...59).contains(parts[1]) else { continue }
                let content = UNMutableNotificationContent()
                content.title = String(item.title.prefix(150)); content.body = String(item.body.prefix(500)); content.sound = .default
                if let end = item.endDate, !end.isEmpty {
                    guard let lastDay = formatter.date(from: end) else { continue }
                    // Finite habits use dated requests, never repeat after their end date.
                    for offset in 0..<366 {
                        guard let day = calendar.date(byAdding: .day, value: offset, to: calendar.startOfDay(for: now)), day <= lastDay else { break }
                        let weekday = calendar.component(.weekday, from: day)
                        if item.weekdaysOnly && (weekday == 1 || weekday == 7) { continue }
                        guard let fire = calendar.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: day), fire > now else { continue }
                        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: fire)
                        let request = UNNotificationRequest(identifier: "rv-\(token)-\(item.id)-\(offset)", content: content,
                            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: false))
                        requests.append((fire, request))
                    }
                } else {
                    let weekdays: [Int?] = item.weekdaysOnly ? [2,3,4,5,6].map { Optional($0) } : [nil]
                    for weekday in weekdays {
                        var components = DateComponents(); components.hour = parts[0]; components.minute = parts[1]; components.weekday = weekday
                        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
                        let request = UNNotificationRequest(identifier: "rv-\(token)-\(item.id)-\(weekday ?? 0)", content: content, trigger: trigger)
                        requests.append((trigger.nextTriggerDate() ?? .distantFuture, request))
                    }
                }
            }
            // Leave room for a test notification. Renew finite schedules on each app activation.
            requests.sort { $0.0 < $1.0 }
            var failed = false
            for (_, request) in requests.prefix(60) {
                guard token == generation else { return }
                do { try await center.add(request) } catch { failed = true }
                if token != generation { center.removePendingNotificationRequests(withIdentifiers: [request.identifier]); return }
            }
            guard token == generation else { return }
            if failed { report?("Часть уведомлений не запланирована. Откройте настройки напоминаний и повторите.") }
            else if requests.count > 60 {
                report?("Запланированы ближайшие 60 уведомлений. Открывайте RIVAYA ежедневно, чтобы продлевать расписание.")
            } else { report?(snapshot.isEmpty ? "Нет активных напоминаний" : "Расписание уведомлений обновлено") }
        }
    }
}
