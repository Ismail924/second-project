import Foundation
import WidgetKit

// Widget data is deliberately separate from the WebView's full localStorage state.
enum RivayaWidgetBridge {
    static let group = "group.app.rivaya.smart01"
    static let key = "rivaya.widget.snapshot.v1"

    static func publish(_ json: String) {
        guard let bytes = json.data(using: .utf8),
              bytes.count <= 40_000,
              let root = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              (root["schema"] as? Int) == 1,
              let date = root["date"] as? String,
              date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil,
              let habits = root["habits"] as? [[String: Any]], habits.count <= 30,
              let defaults = UserDefaults(suiteName: group) else { return }
        defaults.set(bytes, forKey: key)
        WidgetCenter.shared.reloadTimelines(ofKind: "RivayaProgressWidget")
        WidgetCenter.shared.reloadTimelines(ofKind: "RivayaTodayWidget")
    }
}
