import XCTest

final class ReleaseSmokeTests: XCTestCase {
    func testOnboardingPlanPersistenceAndProfile() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let start = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Начать")).firstMatch
        if start.waitForExistence(timeout: 8) { start.tap() }
        let plan = app.buttons["План"]
        XCTAssertTrue(plan.waitForExistence(timeout: 10))
        attach("Сегодня")
        plan.tap()
        let add = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Добавить цель")).firstMatch
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()
        let name = app.textFields["Например: Запустить сайт"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap(); name.typeText("Read a book")
        let create = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Создать цель")).firstMatch
        create.tap()
        XCTAssertTrue(app.staticTexts["Read a book"].firstMatch.waitForExistence(timeout: 5))
        attach("План")
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["План"].waitForExistence(timeout: 10))
        app.buttons["План"].tap()
        XCTAssertTrue(app.staticTexts["Read a book"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["Прогресс"].tap(); attach("Прогресс")
        app.buttons["Профиль"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Фото профиля"].firstMatch.waitForExistence(timeout: 5))
        attach("Профиль")
    }
    private func attach(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }
}
