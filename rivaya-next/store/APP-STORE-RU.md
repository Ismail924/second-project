# RIVAYA 4.0.2 — карточка первого iOS-релиза

Это материалы для отправки, не подтверждение готовности или публикации.
Bundle ID: app.rivaya.smart01. Apple app ID: 6823716293.
Версия в App Store Connect: 4.0.2 (изменить начальный черновик 1.0).

Название: RIVAYA: цели и привычки
Подзаголовок: Планируй. Действуй. Расти.
Основная категория: Производительность.
Цена: бесплатно. Покупок, подписок и рекламы в этой сборке нет.
Ключевые слова: цели,привычки,план,трекер,шаги,прогресс,мотивация,задачи,накопления

## Описание

Большие изменения начинаются с небольших действий. RIVAYA помогает превратить цели в понятный план и замечать свой прогресс каждый день.

• Сегодня: привычки дня, ближайшая цель и текущая активность.
• План: личные цели, этапы, привычки и накопления.
• Прогресс: статистика выполнения за неделю, месяц и год.
• Напоминания: отдельное время для привычек и целей, тихий режим.
• Реальные шаги: чтение активности из Apple Health с вашего разрешения.
• Профиль: имя, фотография и дневная цель по шагам.

Работает без регистрации. Данные сохраняются на устройстве. Для переноса доступен экспорт и восстановление файла в профиле. Облачной синхронизации в этой версии нет.

RIVAYA бесплатна, без рекламы и подписок. Начните с одной привычки и двигайтесь в своём темпе.

## Review notes (English)

No account or sign-in is required. This release works offline and does not connect to Supabase. Create a goal and a habit from the Plan tab, mark a habit on Today, and inspect Progress. Profile allows choosing a photo via PHPicker, changing the daily step target, exporting/importing a backup, and clearing local data.

HealthKit is read-only and requests only step count. Permission is optional. Devices without health samples display a no-data explanation; the app cannot determine whether HealthKit read access was denied. No health data is transmitted to our servers or used for advertising. Existing health samples are not deleted when clearing RIVAYA data.

Notifications are local. Set a time for a habit/goal or use Profile > Notifications > Test notification. Quiet hours suppress configured reminder times. Finite reminder schedules are renewed when the app becomes active; if system capacity is exceeded, the app reports that the nearest 60 requests were scheduled and recommends opening it daily.

## До нажатия Submit for Review

- Разместить store/site/index.html и privacy.html на HTTPS-хостинге. Проверить URL без авторизации; не указывать несуществующие страницы.
- Support URL: https://rivayaapp.com/ после размещения.
- Privacy Policy URL: https://rivayaapp.com/privacy.html после размещения.
- App Privacy: проверить финальную сборку; данные приложения обрабатываются локально, нет аналитики/рекламы/облачного клиента. Ответы о сборе данных должны соответствовать финальной сборке и работе поддержки.
- Заполнить актуальную возрастную анкету по реальным функциям. Не добавлять Health & Fitness/медицинские утверждения, которых нет в приложении.
- Заполнить контакт Apple Review (имя, телефон, email владельца), права на контент, доступность по странам и сведения о продавце/DSA, если требуется. Эти сведения нельзя выдумывать за владельца.
- Загрузить подписанную сборку и пройти тест на реальном iPhone: первый запуск, цель/привычка, перезапуск с сохранением данных, уведомление при закрытом приложении, фото, шаги, импорт/экспорт и очистка данных.
- Добавить настоящие скриншоты iPhone из этой сборки; не заменять их макетами веб-браузера.
- Выбрать сборку, проверить сообщения валидации, затем отправить на проверку Apple. Одобрение и срок не гарантированы.
