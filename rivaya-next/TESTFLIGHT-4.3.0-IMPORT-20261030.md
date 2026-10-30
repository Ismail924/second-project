# RIVAYA 4.3.0 — TestFlight verification

Исходник для этого релиза: пользовательский архив `rivaya-4.3.0.zip`, проверенный 30.10.2026.

Файлы интерфейса, версии и конфигурация iOS в архиве совпадают с текущей веткой `testflight/rivaya-4.1` (SHA 8955d4bce1805baed20c05d589db276d12c39194). Переиспользуем исходники без пересоздания, Bundle ID: `app.rivaya.smart01`.

Проверки локально: state-check, next-state-check, sync-check, sync-transport-check, accounts-check, backend-fetch-check, apple-signin-check, apple-revoke-check, shared-client-check — PASS. Проверка JS-синтаксиса — PASS. Browser checks локально требуют jsdom; запуск в CI предусмотрен.

Повторная iOS загрузка запрошена отдельным push; прошлый workflow загрузил IPA, но Apple не завершила обработку за 15 минут и подтверждение назначения внутренней группе не получено. Не публиковать в App Store без проверки пользователем в TestFlight.
