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

## TenderAnalysisModule

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

