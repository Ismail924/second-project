import UIKit
import WebKit
import HealthKit
import PhotosUI
import UniformTypeIdentifiers
import UserNotifications

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = RivayaController()
        window.makeKeyAndVisible()
        self.window = window
        window.overrideUserInterfaceStyle = .dark
        return true
    }
}

final class RivayaController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate, PHPickerViewControllerDelegate, UIDocumentPickerDelegate, UNUserNotificationCenterDelegate {
    private var web: WKWebView!
    private let health = HKHealthStore()
    private var refreshing = false
    private let reminders = ReminderService()
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.03, green: 0.04, blue: 0.08, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController.add(self, name: "rivaya")
        UNUserNotificationCenter.current().delegate = self
        reminders.report = { [weak self] text in self?.callback("rivayaOnNotificationStatus", text) }
        // Expose only implemented operations. Never pretend unavailable features succeeded.
        let bridge = """
        window.RIVAYA_IOS = true;
        window.VektorNative = {
          shareText: text => window.webkit.messageHandlers.rivaya.postMessage({action:'shareText',text}),
          backendRequest: text => window.webkit.messageHandlers.rivaya.postMessage({action:'backendRequest',text}),
          secureSession: text => window.webkit.messageHandlers.rivaya.postMessage({action:'secureSession',text}),
          clearNativeData: () => window.webkit.messageHandlers.rivaya.postMessage({action:'clearNativeData'}),
          pickAvatar: () => window.webkit.messageHandlers.rivaya.postMessage({action:'pickAvatar'}),
          exportBackupFile: text => window.webkit.messageHandlers.rivaya.postMessage({action:'exportBackupFile',text}),
          importBackupFile: () => window.webkit.messageHandlers.rivaya.postMessage({action:'importBackupFile'}),
          requestNotificationPermission: () => window.webkit.messageHandlers.rivaya.postMessage({action:'requestNotificationPermission'}),
          configureItemReminders: text => window.webkit.messageHandlers.rivaya.postMessage({action:'configureItemReminders',text}),
          testNotification: () => window.webkit.messageHandlers.rivaya.postMessage({action:'testNotification'}),
          showPrivacy: () => window.webkit.messageHandlers.rivaya.postMessage({action:'showPrivacy'}),
          refreshSteps: () => window.webkit.messageHandlers.rivaya.postMessage({action:'refreshSteps'}),
          requestStepAccess: () => window.webkit.messageHandlers.rivaya.postMessage({action:'requestStepAccess'}),
          openHealthSettings: () => window.webkit.messageHandlers.rivaya.postMessage({action:'openHealthSettings'}),
          openExternal: url => window.webkit.messageHandlers.rivaya.postMessage({action:'openExternal',url})
        };
        """
        configuration.userContentController.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #if DEBUG
        let diagnostics = """
        window.addEventListener('error', e => window.webkit.messageHandlers.rivaya.postMessage({action:'debug',text:'JS error: '+e.message+' at '+e.lineno}));
        document.addEventListener('click', e => {
          const b=e.target.closest('button');
          if(b?.id==='finishOnboardingBtn') {
            window.webkit.messageHandlers.rivaya.postMessage({action:'debug',text:'Onboarding click received'});
            setTimeout(()=>window.webkit.messageHandlers.rivaya.postMessage({action:'debug',text:'Onboarding open after click: '+document.getElementById('onboardingModal').classList.contains('open')}),0);
          }
        },true);
        """
        configuration.userContentController.addUserScript(WKUserScript(source: diagnostics, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        #endif
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
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { refreshSteps() }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.isFileURL == true,
              let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        switch action {
        case "shareText":
            if let text=body["text"] as? String, text.count<=4000, presentedViewController == nil {
                let controller=UIActivityViewController(activityItems:[text],applicationActivities:nil)
                controller.popoverPresentationController?.sourceView=view
                controller.popoverPresentationController?.sourceRect=CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1)
                present(controller,animated:true)
            }
        case "backendRequest":
            if let text = body["text"] as? String { BackendTransport.request(text) { [weak self] result in self?.callback("rivayaOnBackendResponse",result) } }
        case "secureSession":
            if let text = body["text"] as? String { callback("rivayaOnSecureSession", SessionVault.request(text)) }
        case "debug":
            #if DEBUG
            if let text = body["text"] as? String { NSLog("RIVAYA diagnostic: %@", text) }
            #endif
        case "clearNativeData":
            try? FileManager.default.removeItem(at: FileManager.default.temporaryDirectory.appendingPathComponent("rivaya-backup.json"))
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            reminders.configure("[]")
        case "pickAvatar":
            guard presentedViewController == nil else { return }
            var config = PHPickerConfiguration(); config.filter = .images; config.selectionLimit = 1
            let picker = PHPickerViewController(configuration: config); picker.delegate = self
            present(picker, animated: true)
        case "exportBackupFile": if let text = body["text"] as? String { exportBackup(text) }
        case "importBackupFile":
            guard presentedViewController == nil else { return }
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .plainText], asCopy: true)
            picker.delegate = self; present(picker, animated: true)
        case "requestNotificationPermission": reminders.requestPermission()
        case "configureItemReminders": if let text = body["text"] as? String { reminders.configure(text) }
        case "testNotification": reminders.test()
        case "showPrivacy": showPrivacy()
        case "refreshSteps": refreshSteps()
        case "requestStepAccess":
            if UserDefaults.standard.bool(forKey: "rivaya.health.requested") { showHealthHelp(); return }
            guard HKHealthStore.isHealthDataAvailable(), let steps = HKObjectType.quantityType(forIdentifier: .stepCount) else { return }
            health.requestAuthorization(toShare: [], read: [steps]) { [weak self] completed, _ in
                DispatchQueue.main.async {
                    if completed { UserDefaults.standard.set(true, forKey: "rivaya.health.requested") }
                    self?.refreshSteps()
                }
            }
        case "openHealthSettings":
            showHealthHelp()
        case "openExternal": if let text = body["url"] as? String { openExternal(text) }
        default: break
        }
    }
    @objc private func becameActive() {
        refreshSteps()
        web?.evaluateJavaScript("rvLastReminderFingerprint='';syncSmartReminders(false)", completionHandler: nil)
    }
    private func showHealthHelp() {
        let alert = UIAlertController(title: "Доступ к шагам", message: "Откройте «Здоровье» → профиль → Приложения → RIVAYA и разрешите чтение шагов. Если доступ уже разрешён, пройдите несколько шагов и вернитесь в RIVAYA. Apple не сообщает приложению, был ли доступ отклонён.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Понятно", style: .default))
        if presentedViewController == nil { present(alert, animated: true) }
    }
    private func callback(_ name: String, _ value: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: [value]), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.\(name)?.(...\(json))", completionHandler: nil)
    }
    private func showPrivacy() {
        guard let url = Bundle.main.url(forResource: "privacy", withExtension: "html", subdirectory: "assets"), presentedViewController == nil else { return }
        let controller = UIViewController(); controller.title = "Конфиденциальность"
        let page = WKWebView(); page.navigationDelegate = self
        controller.view = page; page.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        let nav = UINavigationController(rootViewController: controller)
        controller.navigationItem.rightBarButtonItem = UIBarButtonItem(title: "Готово", style: .done, target: self, action: #selector(closePresented))
        present(nav, animated: true)
    }
    @objc private func closePresented() { dismiss(animated: true) }
    private func exportBackup(_ text: String) {
        guard text.utf8.count <= 8_388_608, presentedViewController == nil else { return }
        do {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("rivaya-backup.json")
            try text.write(to: url, atomically: true, encoding: .utf8)
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            present(picker, animated: true)
        } catch { callback("rivayaOnNativeMessage", "Не удалось сохранить файл") }
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let access = url.startAccessingSecurityScopedResource()
        defer { if access { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            guard data.count <= 8_388_608, let text = String(data: data, encoding: .utf8) else { throw CocoaError(.fileReadCorruptFile) }
            callback("rivayaOnBackupImport", text)
        } catch { callback("rivayaOnNativeMessage", "Не удалось прочитать резервную копию") }
    }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider, provider.canLoadObject(ofClass: UIImage.self) else { return }
        provider.loadObject(ofClass: UIImage.self) { [weak self] object, _ in
            guard let image = object as? UIImage, image.size.width > 0, image.size.height > 0 else { return }
            let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
            let thumb = UIGraphicsImageRenderer(size: CGSize(width: 360, height: 360), format: format).image { context in
                UIColor.black.setFill(); context.fill(CGRect(x: 0, y: 0, width: 360, height: 360))
                let scale = max(360 / image.size.width, 360 / image.size.height)
                let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                image.draw(in: CGRect(x: (360-size.width)/2, y: (360-size.height)/2, width: size.width, height: size.height))
            }
            guard let data = thumb.jpegData(compressionQuality: 0.82) else { return }
            DispatchQueue.main.async { self?.callback("rivayaOnAvatar", "data:image/jpeg;base64," + data.base64EncodedString()) }
        }
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound])
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
