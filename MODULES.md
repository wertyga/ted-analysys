# Project Modules

Краткое описание основных NestJS-модулей проекта и их роли.

## AppModule

Корневой модуль приложения. Подключает глобальную конфигурацию, scheduler, все доменные модули и middleware, который достает текущего пользователя из запроса.

## AuthModule

Отвечает за регистрацию, логин, OAuth/почтовые сценарии, восстановление пароля и подтверждение email. Использует `EmailModule` для отправки писем и `UsersModule` для работы с пользователями.

## UsersModule

Управляет профилем пользователя и админскими операциями над пользователями. Также обновляет company profile поля, notification settings и возвращает user metadata для frontend.

## EmailModule

Инкапсулирует отправку email через шаблоны из `emailTemplates`. Используется auth, notification и системными процессами для transactional emails.

## FreemiusModule

Интеграция с Freemius для SaaS billing. Создает checkout, синхронизирует entitlements, обрабатывает webhooks, customer portal actions, отмену и изменение подписки.

## TedSearchModule

Работает с TED Search API: строит поисковые запросы, нормализует результаты и возвращает tender search data для frontend. Дополняет результаты wishlist/deep-analysis статусами и валютными пересчетами.

## TendersModule

Хранит и отдает локальные tender документы. Умеет создавать tender из TED данных при необходимости, нормализовать notices, извлекать тексты документов и обслуживать admin endpoints.

## TendersCronModule

Плановые фоновые задачи для TED tenders. Загружает/обновляет открытые тендеры, запускает matching-процессы и отправляет уведомления о подходящих тендерах.

## TenderWishlistModule

Управляет wishlist пользователя по тендерам. Добавляет/удаляет tender items и считает сохраненные тендеры для user metadata.

## TenderGeneralAnalysisModule

Делает общий анализ тендера без учета конкретной компании. Генерирует structured analysis через LLM, сохраняет результат и переиспользуется deep analysis.

## TenderDeepAnalysisModule

Делает глубокий company-fit анализ конкретного тендера для конкретной компании. Использует general tender analysis, company analysis, документы тендера и сохраняет scoring/recommendation по пользователю.

## TenderMatchingModule

Оценивает соответствие тендеров компании для массового matching. Используется cron-задачами и endpoints для поиска подходящих возможностей.

## TenderMatchNotificationsModule

Отвечает за email-уведомления о найденных tender matches. Поддерживает instant/daily/weekly рассылки и логирует отправленные уведомления.

## CompanyFilterModule

Строит и хранит LLM-анализ профиля компании для фильтрации и matching. Используется deep analysis и matching pipeline как нормализованное описание возможностей компании.

## CompanyProfileDocumentsModule

Работает с документами профиля компании. Анализирует загруженные материалы, извлекает полезные данные и связывает их с CPV/тендерной логикой.

## CpvModule

Справочник и поиск CPV-категорий. Резолвит CPV коды в Mongo IDs и используется профилем компании, tender search и документным анализом.

## CodelistModule

Отдает справочники для frontend: страны, языки, валюты и другие TED/codelist значения. Служит легким API-слоем над локальными codelist файлами.

## CurrencyExchangeRatesModule

Хранит и предоставляет курсы валют. Используется для пересчета estimated tender values и нормализации денежных значений в search/list views.

## DeepSeekModule

LLM provider module для DeepSeek. Экспортирует сервис, который выполняет general, company filter, tender matching и deep analysis запросы к модели.

## OpenAiModule

Альтернативный LLM provider module для OpenAI. Содержит сервис с тем же базовым подходом к structured LLM analysis, но через OpenAI API.


## MarketingTaskModule

AI-агент маркетинговых задач. Раз в неделю (и вручную через `POST /marketing-tasks/adm/generate`) собирает данные Google Search Console и GA4 через service account, считает сигналы (низкий CTR, запросы на позициях 4–20, падение трафика, вовлечённость посадочных), передаёт их LLM и сохраняет конкретные задачи «что поправить» в `marketing_tasks`. Дубли открытых и недавно отклонённых задач отсекаются по fingerprint (категория + страница + запрос).

У каждой задачи есть `history` — журнал событий (создание, смена статуса, комментарии админа через `POST /marketing-tasks/adm/:id/comments`, AI-ревью, снимки метрик страницы/запроса за период; хранится до 100 последних) и `summary` — текущее состояние, которое переписывает LLM. При каждом запуске открытые задачи и задачи, закрытые за последние 60 дней, передаются LLM вместе с последними записями истории, базовыми и текущими метриками: LLM оставляет заметку о прогрессе/эффекте (`ai_review`) и обновляет `summary`, а для задач без заметки просто записываются метрики нового периода.

Проверка одной задачи — `POST /marketing-tasks/adm/:id/check` (кнопка «Run check» на странице задачи): скачивается живая страница (title, meta description, H1/H2, canonical, robots, JSON-LD, упоминания запроса), точечными запросами GSC/GA4 с фильтром по странице/запросу берутся метрики за последние N дней и N дней до этого, LLM выносит вердикт (`verdict`: сделано ли на сайте; `effect`: есть ли эффект) и заметку — всё пишется в историю записью `check`, статус задачи не меняется.

Крон `check-marketing-tasks` (четверг 9:00, Europe/Warsaw) делает ту же проверку автоматически для задач `in_progress` и задач `done`, закрытых 2–8 недель назад, у которых есть страница или запрос и которых не проверяли последние 7 дней; не больше 20 проверок за запуск, по одной за раз. Оба маркетинговых крона (`generate-marketing-tasks`, `check-marketing-tasks`) видны в админке в разделе Tech: их можно запустить вручную и включить/выключить. Настройка — переменные `GOOGLE_SERVICE_ACCOUNT_*`, `GSC_SITE_URL`, `GA4_PROPERTY_ID` в `.env`.
