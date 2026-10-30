import SwiftUI
import WidgetKit

private enum WColors {
    static let accent = Color(red: 0.23, green: 0.78, blue: 1)
    static let violet = Color(red: 0.49, green: 0.38, blue: 1)
    static let gray = Color(red: 0.75, green: 0.74, blue: 0.86)
    static let dark = Color(red: 0.09, green: 0.07, blue: 0.24)
    static let gradient = LinearGradient(colors: [
        Color(red: 0.22, green: 0.16, blue: 0.49), dark,
        Color(red: 0.07, green: 0.12, blue: 0.26)
    ], startPoint: .topLeading, endPoint: .bottomTrailing)
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
        guard let data = UserDefaults(suiteName: "group.app.rivaya.smart01")?.data(forKey: "rivaya.widget.snapshot.v1"),
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
}

private struct DayEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
}
private struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry { DayEntry(date: .now, snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        completion(DayEntry(date: .now, snapshot: Snapshot.read()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let now = Date()
        let midnight = Calendar.current.startOfDay(for: now)
        let nextDay = Calendar.current.date(byAdding: .day, value: 1, to: midnight) ?? now.addingTimeInterval(86400)
        completion(Timeline(entries: [DayEntry(date: now, snapshot: Snapshot.read())], policy: .after(nextDay.addingTimeInterval(30))))
    }
}

private func localized(_ ru: String, _ en: String) -> String {
    Locale.preferredLanguages.first?.hasPrefix("ru") == true ? ru : en
}
private func count(_ value: Int) -> String { String(max(0, value)) }
private func progressRing(_ value: Int, diameter: CGFloat, thickness: CGFloat) -> some View {
    ZStack {
        Circle().stroke(Color.white.opacity(0.14), lineWidth: thickness)
        Circle().trim(from: 0, to: CGFloat(max(0, min(100,value))) / 100)
            .stroke(AngularGradient(colors: [WColors.violet,WColors.accent], center: .center),
                    style: StrokeStyle(lineWidth: thickness, lineCap: .round))
            .rotationEffect(.degrees(-90))
        Text("\(value)%").font(.system(size: diameter > 75 ? 27 : 19, weight: .bold, design: .rounded)).foregroundStyle(.white)
    }.frame(width: diameter, height: diameter)
}
@ViewBuilder private func surface<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
        content().containerBackground(for: .widget) { WColors.gradient }
    } else {
        content().background(WColors.gradient)
    }
}
private struct ProgressView: View {
    let entry: DayEntry
    var body: some View {
        surface {
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text("RIVAYA").font(.system(size: 15, weight: .heavy, design: .rounded)).tracking(0.7)
                    Spacer()
                    if let snapshot = entry.snapshot, snapshot.current {
                        Text("🔥\(snapshot.streak)").font(.system(size: 13, weight: .semibold))
                    }
                }
                Spacer(minLength: 0)
                if let snapshot = entry.snapshot, snapshot.current {
                    HStack { Spacer(); progressRing(snapshot.percent, diameter: 88, thickness: 11); Spacer() }
                    Spacer(minLength: 0)
                    Text(snapshot.total == 0 ? localized("Добавь привычку","Add a habit") :
                        localized("Осталось \(count(snapshot.total - snapshot.completed))","\(count(snapshot.total - snapshot.completed)) remaining"))
                        .font(.system(size: 12, weight: .medium)).lineLimit(2)
                        .foregroundStyle(WColors.gray)
                } else {
                    Spacer()
                    Image(systemName: "arrow.clockwise.circle").font(.title).foregroundStyle(WColors.accent)
                    Text(localized("Открой RIVAYA для обновления","Open RIVAYA to refresh"))
                        .font(.system(size: 12)).foregroundStyle(WColors.gray)
                    Spacer()
                }
            }.foregroundStyle(.white).padding(12).widgetURL(URL(string:"rivaya://today"))
        }
    }
}
private struct HabitLine: View {
    let habit: Habit
    var body: some View {
        HStack(spacing: 9) {
            Text(habit.emoji.isEmpty ? "✦" : habit.emoji).font(.system(size: 16))
                .frame(width: 23)
            Text(habit.name).font(.system(size: 13, weight: habit.done ? .regular : .semibold))
                .lineLimit(1).strikethrough(habit.done).foregroundStyle(habit.done ? WColors.gray : .white)
            Spacer(minLength: 4)
            if habit.numeric && !habit.done {
                Text("\(habit.value.formatted(.number.precision(.fractionLength(0...1))))/\(habit.target.formatted(.number.precision(.fractionLength(0...1))))")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(WColors.gray)
            }
            Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 19)).foregroundStyle(habit.done ? Color.green : WColors.gray)
        }.frame(height: 29).accessibilityElement(children:.combine)
    }
}
private struct TodayView: View {
    let entry: DayEntry
    @Environment(\.widgetFamily) private var family
    var body: some View {
        surface {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Text(localized("Сегодня","Today")).font(.system(size: 22, weight: .bold))
                    Spacer()
                    if let snap = entry.snapshot, snap.current {
                        Text("\(snap.completed) / \(snap.total)  ·  🔥\(snap.streak)")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(WColors.gray)
                    }
                }
                if let snap = entry.snapshot, snap.current {
                    if snap.habits.isEmpty {
                        Spacer()
                        Text(localized("Добавь первую привычку в RIVAYA","Add a habit in RIVAYA"))
                            .font(.system(size: 15)).foregroundStyle(WColors.gray)
                        Spacer()
                    } else {
                        let limit = family == .systemLarge ? 9 : 4
                        ForEach(Array(snap.habits.prefix(limit))) { h in
                            HabitLine(habit:h)
                        }
                        Spacer(minLength: 0)
                        HStack {
                            Text(localized("Выполнено","Completed"))
                                .font(.system(size: 11)).foregroundStyle(WColors.gray)
                            Spacer()
                            GeometryReader { geometry in
                                Capsule().fill(.white.opacity(0.12))
                                    .overlay(alignment: .leading) {
                                        Capsule().fill(WColors.accent).frame(width: geometry.size.width * CGFloat(snap.percent)/100)
                                    }
                            }.frame(width: 96, height: 5)
                        }
                    }
                } else {
                    Spacer()
                    Text(localized("Открой RIVAYA, чтобы обновить привычки","Open RIVAYA to refresh your habits"))
                        .font(.system(size: 14)).foregroundStyle(WColors.gray)
                    Spacer()
                }
            }.padding(15).foregroundStyle(.white).widgetURL(URL(string:"rivaya://today"))
        }
    }
}

struct RivayaProgressWidget: Widget {
    let kind = "RivayaProgressWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:kind, provider:DayProvider()) { ProgressView(entry:$0) }
            .configurationDisplayName("RIVAYA · Прогресс")
            .description("Круг выполнения и серия привычек")
            .supportedFamilies([.systemSmall])
    }
}
struct RivayaTodayWidget: Widget {
    let kind = "RivayaTodayWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind:kind, provider:DayProvider()) { TodayView(entry:$0) }
            .configurationDisplayName("RIVAYA · Сегодня")
            .description("Привычки на день на экране iPhone")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}
@main struct RivayaWidgetsBundle: WidgetBundle {
    var body: some Widget { RivayaProgressWidget(); RivayaTodayWidget() }
}
