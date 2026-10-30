# RIVAYA 4.4 — виджеты iPhone / TestFlight

## Что реализовано
- Настоящее расширение WidgetKit со SwiftUI, встроено в основное iOS-приложение.
- Маленький виджет: RIVAYA, круг выполнения, серия 🔥, остаток привычек.
- Средний и большой: привычки на сегодня, прогресс количества, отметки выполнения.
- Виджеты читают минимальный снимок из App Groups, который исходное приложение обновляет при изменении привычек и после возвращения в приложение.
- Нажатие на виджет **открывает экран «Сегодня»**. Отметка прямо внутри виджета пока не реализована; кружки показывают фактический статус.
- При смене дня нельзя показывать вчерашние значения как сегодняшние: виджет просит открыть приложение для обновления.
- Данные других пользователей, шаги Apple Health, токены и резервные копии **не передаются** в виджет.

## Проверка
- Workflow: `.github/workflows/rivaya-widgetkit-44.yml` — компиляция iOS + WidgetKit для симулятора.
- Workflow: `.github/workflows/rivaya-widgetkit-44-testflight.yml` — подписанная сборка TestFlight (запускать только после настройки профилей).
- Тест: `node rivaya-next/tests/widget-snapshot-check.cjs`.

## Подготовка Apple Developer перед TestFlight (остался один ручной этап)

Уже автоматически выполнено через подключённый Apple API:
- Зарегистрирован новый Widget Extension App ID `app.rivaya.smart01.widgets`.
- Подготовлен процесс включения App Groups для основного и Widget Extension App ID (GitHub Actions: `rivaya-44-enable-appgroups.yml`).
- Подготовлен генератор новых **двух профилей App Store** через официальный Apple API. Секреты и `.mobileprovision` не нужно отправлять в чат.

**Apple не предоставляет публичный API для регистрации и привязки имени App Group к App ID.** Единственное обязательное действие в интерфейсе Apple Developer:

1. [Apple Developer → Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) → Identifiers → кнопка **+** → **App Groups** → **Continue**.
2. Создать и зарегистрировать App Group с идентификатором **`group.app.rivaya.smart01`** (если уже существует — повторно не создавать).
3. В **Identifiers** открыть **`app.rivaya.smart01`** и **`app.rivaya.smart01.widgets`** по очереди, включить App Groups, выбрать **`group.app.rivaya.smart01`**, сохранить.

После этого обновить ветку или запустить workflow **`RIVAYA 4.4 widgets internal TestFlight`** на ветке `feature/rivaya-widgetkit-4.4`. Сценарий самостоятельно выпустит два новых профиля, проверит в них entitlement группы, подпишет два target и загрузит IPA во **внутреннюю группу TestFlight**. **Сейчас TestFlight 4.4 ещё не опубликована.**

Никогда не публикуйте сертификаты, .p8, пароли или provisioning profiles в переписке, GitHub issues или открытом репозитории.

## Проверка на устройстве
Установить RIVAYA 4.4 через TestFlight → открыть один раз → создать/отметить привычку → долго удерживать рабочий стол iPhone → Добавить виджет → RIVAYA → выбрать маленький и большой → проверить реальный процент, название, отметки, изменение после открытия приложения и обновление на следующий день.
