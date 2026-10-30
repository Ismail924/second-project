import SwiftUI
import WidgetKit

// RIVAYA 4.4.1 — a compact, readable WidgetKit redesign.
// All numbers are read from the existing App Group snapshot: no sample values.
private enum WidgetStyle {
    static let cyan = Color(red: 0.22, green: 0.80, blue: 1.00)
    static let violet = Color(red: 0.60, green: 0.43, blue: 1.00)
    static let muted = Color(red: 0.77, green: 0.75, blue: 0.87)
    static let soft = Color(red: 0.48, green: 0.45, blue: 0.68)
    static let green = Color(red: 0.22, green: 0.89, blue: 0.59)
    static let base = LinearGradient(
        colors: [Color(red: 0.20, green: 0.15, blue: 0.46),
                 Color(red: 0.11, green: 0.09, blue: 0.30),
                 Color(red: 0.07, green: 0.12, blue: 0.28)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let progress = LinearGradient(
        colors: [cyan, Color(red: 0.30, green: 0.52, blue: 1.00), violet],
        startPoint: .leading, endPoint: .trailing
    )
}

private struct Habit: Codable, Identifiable {
    let id: String
    let name: String
    let emoji: String
    let done: Bool
    let numeric: Bool
    let value: Double
    let target: Double
    let unit: String
}
private struct Snapshot: Codable {
    let schema: Int
    let date: String
    let total: Int
    let completed: Int
    let percent: Int
    let streak: Int
    let habits: [Habit]
    let updatedAt: String

    static func read() -> Snapshot? {
        guard let data = UserDefaults(suiteName: "group.app.rivaya.smart01")?
            .data(forKey: "rivaya.widget.snapshot.v1"),
              data.count < 40_000 else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }
    var current: Bool {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date()) == date
    }
    var safePercent: Int { min(100, max(0, percent)) }
    var remaining: Int { max(0, total - completed) }
    // Unfinished entries are prioritised, so a compact widget stays useful.
    var orderedHabits: [Habit] {
        habits.filter { !$0.done } + habits.filter { $0.done }
    }
}

private struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}
private struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: .now, snapshot: nil)
    }
    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: .now, snapshot: Snapshot.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let now = Date()
        let tomorrow = Calendar.current.date(byAdding: .day, value: 1,
                           to: Calendar.current.startOfDay(for: now))
                           ?? now.addingTimeInterval(86400)
        completion(Timeline(entries: [TodayEntry(date: now, snapshot: Snapshot.read())],
                            policy: .after(tomorrow.addingTimeInterval(30))))
    }
}

private func tr(_ russian: String, _ english: String) -> String {
    Locale.preferredLanguages.first?.hasPrefix("ru") == true ? russian : english
}
private func remainingText(_ count: Int) -> String {
    if count == 0 { return tr("Всё выполнено", "All done today") }
    if Locale.preferredLanguages.first?.hasPrefix("ru") != true {
        return "\(count) " + (count == 1 ? "habit left" : "habits left")
    }
    let word: String
    if count % 10 == 1 && count % 100 != 11 { word = "привычка" }
    else if (2...4).contains(count % 10) && !(12...14).contains(count % 100) { word = "привычки" }
    else { word = "привычек" }
    return "\(count) \(word) " + (count == 1 ? "осталась" : "осталось")
}

private struct AmbientBackground: View {
    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Circle()
                    .fill(WidgetStyle.violet.opacity(0.27))
                    .frame(width: proxy.size.width * 0.9)
                    .blur(radius: 38)
                    .offset(x: -proxy.size.width * 0.3, y: -proxy.size.height * 0.5)
                Circle()
                    .fill(WidgetStyle.cyan.opacity(0.12))
                    .frame(width: proxy.size.width * 0.75)
                    .blur(radius: 42)
                    .offset(x: proxy.size.width * 0.55, y: proxy.size.height * 0.55)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

@ViewBuilder
private func widgetSurface<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
        ZStack { AmbientBackground(); content() }
            .containerBackground(for: .widget) { WidgetStyle.base }
    } else {
        ZStack { WidgetStyle.base; AmbientBackground(); content() }
    }
}

private struct StreakBadge: View {
    let count: Int
    var body: some View {
        Text("🔥 \(max(0, count))")
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
            .lineLimit(1)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Color.white.opacity(0.09), in: Capsule())
            .overlay(Capsule().strokeBorder(WidgetStyle.violet.opacity(0.24), lineWidth: 1))
            .accessibilityLabel(tr("Серия \(count) дней", "Streak \(count) days"))
    }
}

private struct Ring: View {
    let percent: Int
    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.white.opacity(0.13), lineWidth: 10)
            Circle()
                .trim(from: 0, to: CGFloat(min(100, max(0, percent))) / 100)
                .stroke(AngularGradient(colors: [WidgetStyle.cyan, WidgetStyle.violet, WidgetStyle.cyan],
                                        center: .center),
                        style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: WidgetStyle.cyan.opacity(0.25), radius: 5)
            Text("\(percent)%")
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(.white)
                .minimumScaleFactor(0.7)
                .lineLimit(1)
        }
        .frame(width: 91, height: 91)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(tr("Прогресс \(percent) процентов", "Progress \(percent) percent"))
    }
}

private struct CompactProgressWidget: View {
    let entry: TodayEntry
    var body: some View {
        widgetSurface {
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .center, spacing: 3) {
                    Text("RIVAYA")
                        .font(.system(size: 15, weight: .heavy, design: .rounded))
                        .tracking(0.4)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                        .foregroundStyle(.white)
                    Spacer(minLength: 2)
                    if let data = entry.snapshot, data.current {
                        StreakBadge(count: data.streak)
                    }
                }
                Spacer(minLength: 0)
                if let data = entry.snapshot, data.current {
                    HStack(spacing: 0) {
                        Spacer(minLength: 0)
                        Ring(percent: data.safePercent)
                        Spacer(minLength: 0)
                    }
                    Spacer(minLength: 0)
                    Text(data.total == 0
                         ? tr("Добавь привычку", "Add a habit")
                         : remainingText(data.remaining))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(WidgetStyle.muted)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .frame(maxWidth: .infinity, alignment: .center)
                } else {
                    Spacer(minLength: 0)
                    Image(systemName: "arrow.clockwise.circle")
                        .font(.system(size: 25, weight: .medium))
                        .foregroundStyle(WidgetStyle.cyan)
                        .frame(maxWidth: .infinity)
                    Text(tr("Открой RIVAYA", "Open RIVAYA"))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(WidgetStyle.muted)
                        .frame(maxWidth: .infinity)
                    Spacer(minLength: 0)
                }
            }
            .padding(1)
            .widgetURL(URL(string: "rivaya://today"))
        }
    }
}

private struct StatusCircle: View {
    let done: Bool
    let compact: Bool
    var body: some View {
        ZStack {
            if done {
                Circle().fill(WidgetStyle.green)
                Image(systemName: "checkmark")
                    .font(.system(size: compact ? 10 : 12, weight: .heavy))
                    .foregroundStyle(Color(red: 0.02, green: 0.18, blue: 0.13))
            } else {
                Circle().strokeBorder(Color(red: 0.73, green: 0.68, blue: 1.00),
                                      lineWidth: 1.7)
            }
        }
        .frame(width: compact ? 19 : 24, height: compact ? 19 : 24)
        .accessibilityLabel(done ? tr("Выполнено", "Completed")
                                 : tr("Не выполнено", "Not complete"))
    }
}

private struct HabitRow: View {
    let habit: Habit
    let compact: Bool
    var body: some View {
        HStack(spacing: compact ? 8 : 10) {
            ZStack {
                RoundedRectangle(cornerRadius: compact ? 7 : 10)
                    .fill(WidgetStyle.violet.opacity(compact ? 0.12 : 0.20))
                Text(habit.emoji.isEmpty ? "✦" : habit.emoji)
                    .font(.system(size: compact ? 14 : 18))
            }
            .frame(width: compact ? 23 : 35, height: compact ? 23 : 35)
            Text(habit.name)
                .font(.system(size: compact ? 12 : 14, weight: habit.done ? .regular : .semibold))
                .foregroundStyle(habit.done ? WidgetStyle.muted : .white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .strikethrough(habit.done, color: WidgetStyle.muted)
            Spacer(minLength: 2)
            if habit.numeric && !habit.done {
                Text("\(habit.value.formatted(.number.precision(.fractionLength(0...1))))/\(habit.target.formatted(.number.precision(.fractionLength(0...1))))")
                    .font(.system(size: compact ? 10 : 11, weight: .medium, design: .rounded))
                    .foregroundStyle(WidgetStyle.muted)
                    .lineLimit(1)
            }
            StatusCircle(done: habit.done, compact: compact)
        }
        .frame(height: compact ? 27 : 45)
        .accessibilityElement(children: .combine)
    }
}

private struct ProgressBar: View {
    let percent: Int
    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Color.white.opacity(0.13))
                .overlay(alignment: .leading) {
                    if percent > 0 {
                        Capsule()
                            .fill(WidgetStyle.progress)
                            .frame(width: geo.size.width * CGFloat(min(100, max(0, percent))) / 100)
                    }
                }
        }
        .frame(height: 5)
        .accessibilityHidden(true)
    }
}

private struct TodayListWidget: View {
    let entry: TodayEntry
    @Environment(\.widgetFamily) private var family
    private var compact: Bool { family == .systemMedium }
    var body: some View {
        widgetSurface {
            VStack(alignment: .leading, spacing: compact ? 5 : 11) {
                HStack(alignment: .center, spacing: 4) {
                    Text(tr("Сегодня", "Today"))
                        .font(.system(size: compact ? 20 : 26, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Spacer(minLength: 2)
                    if let data = entry.snapshot, data.current {
                        Text("\(data.completed)/\(data.total)")
                            .font(.system(size: compact ? 12 : 14, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(WidgetStyle.muted)
                        StreakBadge(count: data.streak)
                    }
                }
                if let data = entry.snapshot, data.current {
                    if data.habits.isEmpty {
                        Spacer(minLength: 0)
                        Text(tr("Добавь первую привычку в RIVAYA",
                                "Add your first habit in RIVAYA"))
                            .font(.system(size: 13))
                            .foregroundStyle(WidgetStyle.muted)
                        Spacer(minLength: 0)
                    } else {
                        let displayLimit = compact ? 3 : 6
                        let display = Array(data.orderedHabits.prefix(displayLimit))
                        VStack(spacing: 0) {
                            ForEach(Array(display.enumerated()), id: \.element.id) { index, item in
                                HabitRow(habit: item, compact: compact)
                                if index != display.count - 1 {
                                    Rectangle().fill(Color.white.opacity(0.08))
                                        .frame(height: 0.5)
                                }
                            }
                        }
                        Spacer(minLength: 0)
                        HStack(spacing: 9) {
                            Text(compact ? "\(data.safePercent)%" :
                                 tr("Выполнено", "Completed"))
                                .font(.system(size: compact ? 10 : 12, weight: .medium))
                                .foregroundStyle(WidgetStyle.muted)
                                .fixedSize()
                            ProgressBar(percent: data.safePercent)
                            if !compact {
                                Text("\(data.safePercent)%")
                                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(.white)
                            }
                        }
                        .frame(height: compact ? 9 : 15)
                    }
                } else {
                    Spacer(minLength: 0)
                    Text(tr("Открой RIVAYA, чтобы обновить привычки",
                            "Open RIVAYA to update your habits"))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(WidgetStyle.muted)
                    Spacer(minLength: 0)
                }
            }
            .padding(.horizontal, compact ? 1 : 2)
            .padding(.vertical, 1)
            .widgetURL(URL(string: "rivaya://today"))
        }
    }
}

struct RivayaProgressWidget: Widget {
    let kind = "RivayaProgressWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) {
            CompactProgressWidget(entry: $0)
        }
        .configurationDisplayName("RIVAYA · Прогресс")
        .description("Круг прогресса, сколько осталось и серия")
        .supportedFamilies([.systemSmall])
    }
}

struct RivayaTodayWidget: Widget {
    let kind = "RivayaTodayWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: TodayProvider()) {
            TodayListWidget(entry: $0)
        }
        .configurationDisplayName("RIVAYA · Сегодня")
        .description("Привычки на сегодня в компактном или большом виджете")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

@main struct RivayaWidgetsBundle: WidgetBundle {
    var body: some Widget {
        RivayaProgressWidget()
        RivayaTodayWidget()
    }
}
