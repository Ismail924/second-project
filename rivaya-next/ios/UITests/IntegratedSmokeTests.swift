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
        XCTAssertTrue(add.waitForExistence(timeout: 5)); add.tap()
        let name = app.textFields.firstMatch
        XCTAssertTrue(name.waitForExistence(timeout: 5)); name.tap(); name.typeText("Rivaya 314159"); XCTAssertTrue((name.value as? String)?.contains("314159") == true, app.debugDescription)
        dismissKeyboard(app)
        let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["Сохранить", "Save"])).firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "314159")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10), app.debugDescription); card.tap()
        let step = app.buttons.matching(NSPredicate(format: "label IN %@", ["＋ Добавить этап", "＋ Add step"])).firstMatch
        reveal(step, in: app); step.tap()
        let stepName = app.textFields.firstMatch
        XCTAssertTrue(stepName.waitForExistence(timeout: 5)); stepName.tap(); stepName.typeText("Chapter 271828")
        dismissKeyboard(app); save.tap()
        reveal(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "271828")).firstMatch, in: app)
        attach("Goal stages")
        app.terminate(); app.launch(); XCTAssertTrue(plan.waitForExistence(timeout: 10)); plan.tap()
        XCTAssertTrue(card.waitForExistence(timeout: 10), app.debugDescription); card.tap()
        reveal(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "271828")).firstMatch, in: app)
        attach("Persisted stages")
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
        }
    }
    private func attach(_ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot)
    }
}
