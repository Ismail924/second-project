import UIKit
import WebKit
import HealthKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = RivayaController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class RivayaController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    private var web: WKWebView!
    private let health = HKHealthStore()
    private var refreshing = false
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.08, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "rivaya")
        // Expose only implemented operations. Never pretend unavailable features succeeded.
        let bridge = """
        window.VektorNative = {
          refreshSteps: () => window.webkit.messageHandlers.rivaya.postMessage({action:'refreshSteps'}),
          requestStepAccess: () => window.webkit.messageHandlers.rivaya.postMessage({action:'requestStepAccess'}),
          openHealthSettings: () => window.webkit.messageHandlers.rivaya.postMessage({action:'openHealthSettings'}),
          openExternal: url => window.webkit.messageHandlers.rivaya.postMessage({action:'openExternal',url})
        };
        """
        configuration.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.isOpaque = false
        web.backgroundColor = view.backgroundColor
        web.scrollView.backgroundColor = view.backgroundColor
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        guard let page = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "assets") else { return }
        web.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        NotificationCenter.default.addObserver(self, selector: #selector(refreshSteps), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { refreshSteps() }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "refreshSteps": refreshSteps()
        case "requestStepAccess":
            guard HKHealthStore.isHealthDataAvailable(), let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }
            health.requestAuthorization(toShare: [], read: [steps]) { [weak self] completed, _ in
                DispatchQueue.main.async {
                    if completed { UserDefaults.standard.set(true, forKey: "rivaya.health.requested") }
                    self?.refreshSteps()
                }
            }
        case "openHealthSettings":
            let alert = UIAlertController(title: "Доступ к шагам", message: "Откройте «Здоровье» → профиль → Приложения → RIVAYA и разрешите чтение шагов. Apple не сообщает приложению, был ли доступ отклонён.", preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Понятно", style: .default))
            present(alert, animated: true)
        case "openExternal": if let text = body["url"] as? String { openExternal(text) }
        default: break
        }
    }
    private func openExternal(_ text: String) {
        guard let url = URL(string: text), ["https", "mailto"].contains(url.scheme?.lowercased() ?? "") else { return }
        UIApplication.shared.open(url)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.isFileURL, let root = Bundle.main.resourceURL,
           url.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path + "/") {
            decisionHandler(.allow)
        } else {
            if navigationAction.navigationType == .linkActivated { openExternal(url.absoluteString) }
            decisionHandler(.cancel)
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: "RIVAYA", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Отмена", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Подтвердить", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    private func sendSteps(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.vektorOnNativeSteps(\(json))", completionHandler: nil)
    }
    @objc private func refreshSteps() {
        guard web != nil, !refreshing else { return }
        guard HKHealthStore.isHealthDataAvailable(), let type = HKObjectType.quantityType(forIdentifier: .stepCount) else {
            sendSteps(["status": "unsupported"]); return
        }
        guard UserDefaults.standard.bool(forKey: "rivaya.health.requested") else {
            sendSteps(["status": "denied"]); return
        }
        refreshing = true
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .day, value: -6, to: calendar.startOfDay(for: Date()))!
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date())
        let query = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum, anchorDate: start, intervalComponents: DateComponents(day: 1))
        query.initialResultsHandler = { [weak self] _, result, error in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.refreshing = false
                guard error == nil, let result = result else {
                    self.sendSteps(["status": "error", "message": "Не удалось прочитать шаги Apple Health"]); return
                }
                let formatter = DateFormatter()
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.calendar = calendar
                formatter.timeZone = calendar.timeZone
                formatter.dateFormat = "yyyy-MM-dd"
                var days: [String: Int] = [:]
                var history: [Int] = []
                var hasSamples = false
                result.enumerateStatistics(from: start, to: Date()) { statistics, _ in
                    let quantity = statistics.sumQuantity()
                    if quantity != nil { hasSamples = true }
                    let steps = max(0, Int(quantity?.doubleValue(for: .count()) ?? 0))
                    days[formatter.string(from: statistics.startDate)] = steps
                    history.append(steps)
                }
                // Empty read can mean no data OR denied access; do not claim permission granted.
                let today = formatter.string(from: Date())
                self.sendSteps(["status": hasSamples ? "granted" : "unknown", "day": today,
                    "steps": days[today] ?? 0, "dailySteps": days, "history": history])
            }
        }
        health.execute(query)
    }
}
