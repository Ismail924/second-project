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

## Одноразовая настройка Apple Developer перед TestFlight
[Apple Developer — Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)

1. В **Identifiers** создайте App Group с идентификатором `group.app.rivaya.smart01`.
2. Для существующего App ID `app.rivaya.smart01` включите **App Groups** и привяжите созданную группу, сохранив уже включённые HealthKit и Sign in with Apple.
3. Создайте отдельный **explicit App ID** `app.rivaya.smart01.widgets`, включите App Groups и привяжите **ту же** группу.
4. В **Profiles** создайте **два новых App Store Connect distribution profiles** для двух App ID с существующим сертификатом Apple Distribution (Team `M2329MH9ZX`).
5. В GitHub Secrets окружения **app-store** добавьте:
   - `APPLE_APP_GROUP_PROFILE_BASE64` — полный Base64 первого .mobileprovision.
   - `APPLE_WIDGET_PROFILE_BASE64` — полный Base64 профиля виджета.
   Сертификат и API-ключ уже используются существующим CI и должны остаться действительными. **Не отправляйте сертификаты, пароли, ключи или профили в чат или открытый репозиторий.**
6. Запустите GitHub Actions → **RIVAYA 4.4 widgets internal TestFlight** на ветке `feature/rivaya-widgetkit-4.4`. Процесс собирает оба targets, подписывает, загружает только в TestFlight и проверяет внутреннюю группу. **Он не публикует в App Store.**

Внимание: после изменения capabilities для старого App ID прежний provisioning profile станет недействительным для новых сборок. Опубликованные бинарные версии не изменяются. Выпуск 4.3.1 в App Store не трогать.

## Проверка на устройстве
Установить RIVAYA 4.4 через TestFlight → открыть один раз → создать/отметить привычку → долго удерживать рабочий стол iPhone → Добавить виджет → RIVAYA → выбрать маленький и большой → проверить реальный процент, название, отметки, изменение после открытия приложения и обновление на следующий день.
