import XCTest

final class ReleaseSmokeTests: XCTestCase {
    func testOnboardingPlanPersistenceAndProfile() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        let start = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Начать")).firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 20), "First launch must show onboarding")
        start.tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: start)
        let result = XCTWaiter.wait(for: [dismissed], timeout: 8)
        if result != .completed { attach("Onboarding did not close") }
        XCTAssertEqual(result, .completed, "Start must dismiss onboarding before navigation")
        let plan = app.buttons["План"]
        XCTAssertTrue(plan.waitForExistence(timeout: 10))
        attach("Сегодня")
        plan.tap()
        let add = app.buttons["+ Цель"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        add.tap()
        let name = app.textFields["Например: Запустить сайт"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.tap(); name.typeText("Read a book")
        XCTAssertEqual(name.value as? String, "Read a book")
        let done = app.buttons.matching(NSPredicate(format: "label IN %@", ["Done", "Готово"])).firstMatch
        if app.keyboards.firstMatch.exists {
            XCTAssertTrue(done.waitForExistence(timeout: 5), "Keyboard must offer Done")
            done.tap()
            let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
            XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 5), .completed)
        }
        let create = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Создать цель")).firstMatch
        for _ in 0..<4 {
            if create.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(create.isHittable, "Goal form must scroll to its save button")
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
