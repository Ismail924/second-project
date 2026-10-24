import XCTest

final class IntegratedSmokeTests: XCTestCase {
    func testGoalStagesSurviveRelaunch() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(ru)", "-AppleLocale", "ru_RU"]
        app.launch()
        let start = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Начать")).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 20)); start.tap()
        let plan = app.buttons.matching(NSPredicate(format: "label IN %@", ["План", "Plan"])).firstMatch
        XCTAssertTrue(plan.waitForExistence(timeout: 10)); plan.tap()
        let add = app.buttons.matching(NSPredicate(format: "label IN %@", ["＋ Цель", "＋ Goal"])).firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: 10), app.debugDescription); add.tap()
        let name = app.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("314159"); XCTAssertTrue((name.value as? String)?.contains("314159") == true, app.debugDescription)
        dismissKeyboard(app)
        let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["Сохранить", "Save"])).firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "314159")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10), app.debugDescription); card.tap()
        let step = app.buttons.matching(NSPredicate(format: "label IN %@", ["＋ Добавить этап", "＋ Add step"])).firstMatch
        reveal(step, in: app); step.tap()
        let stepName = app.textFields.firstMatch
        XCTAssertTrue(stepName.waitForExistence(timeout: 5)); stepName.tap(); stepName.typeText("271828")
        dismissKeyboard(app)
        let stepSave = app.buttons.matching(NSPredicate(format: "label IN %@", ["Сохранить", "Save"])).firstMatch
        XCTAssertTrue(stepSave.waitForExistence(timeout: 5)); reveal(stepSave, in: app); stepSave.tap()
        XCTAssertTrue(step.waitForExistence(timeout: 10), app.debugDescription)
        reveal(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "271828")).firstMatch, in: app)
        attach("Goal stages")
        app.terminate(); app.launch(); XCTAssertTrue(plan.waitForExistence(timeout: 10)); plan.tap()
        XCTAssertTrue(card.waitForExistence(timeout: 10), app.debugDescription); card.tap()
        reveal(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "271828")).firstMatch, in: app)
        attach("Persisted stages")
        #if RIVAYA_CLOUD_PREVIEW
        // Exercise the real Keychain-enabled app while staying in guest mode.
        let profiles = app.buttons.matching(NSPredicate(format: "label IN %@", ["Профиль", "Profile"]))
        guard let profile = profiles.allElementsBoundByIndex.last else { XCTFail(app.debugDescription); return }
        profile.tap()
        let login = app.buttons.matching(NSPredicate(format: "label IN %@", ["Войти и синхронизировать", "Sign in and sync"])).firstMatch
        reveal(login, in: app); login.tap()
        let apple = app.buttons.matching(NSPredicate(format: "label CONTAINS %@ OR label CONTAINS %@", "Продолжить с Apple", "Continue with Apple")).firstMatch
        XCTAssertTrue(apple.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertEqual(app.secureTextFields.count, 0)
        attach("Optional Apple sign in")
        let guest = app.buttons.matching(NSPredicate(format: "label IN %@", ["Продолжить без входа", "Continue without signing in"])).firstMatch
        XCTAssertTrue(guest.waitForExistence(timeout: 5)); guest.tap(); plan.tap()
        XCTAssertTrue(card.waitForExistence(timeout: 10), app.debugDescription); card.tap()
        reveal(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "271828")).firstMatch, in: app)
        #endif
    }
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<5 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.exists, app.debugDescription)
        XCTAssertTrue(element.isHittable)
    }
    private func dismissKeyboard(_ app: XCUIApplication) {
        if app.keyboards.firstMatch.exists {
            let done = app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Готово"])).firstMatch
            if done.waitForExistence(timeout: 3) { done.tap() }
            let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
            XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 5), .completed)
            // WKWebView's viewport finishes moving after the keyboard leaves accessibility.
            // Wait for two stable layouts rather than tapping its previous button coordinates.
            let submit = app.buttons.matching(NSPredicate(format: "label IN %@", ["Сохранить", "Save"])).firstMatch
            var previous = CGRect.null
            let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                let current = submit.frame
                defer { previous = current }
                return current != .zero && current == previous && submit.isHittable
            }, object: submit)
            XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 5), .completed)
        }
    }
    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
}
