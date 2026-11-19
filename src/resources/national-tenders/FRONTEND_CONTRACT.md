# Национальные тендеры: контракт для фронтенда

Версия от 2026-11-19. Детальная страница уже реализована на бэкенде. Первый источник: Польша, BZP (ezamowienia.gov.pl), id вида `pl-bzp-2026-00531057`.

Цель: страница `/[locale]/tenders/[id]` открывает польский тендер через тот же endpoint и тот же `TenderDto`, что и тендер TED. Изменений на фронте нужно немного: бейдж источника, ссылка на оригинал вместо TED и SEO-заголовок. Base analysis, deep analysis и избранное работают для национальных тендеров через те же endpoints, что и для TED.

## 1. Детальная страница

### Endpoint

Используется тот же `GET /tenders/:id?withGA=true`.

- Бэкенд узнаёт национальный тендер по префиксу id (`pl-bzp-`) и берёт его из своей коллекции. Для фронта endpoint один.
- Если тендера нет, ответ `404`, как сейчас.
- `generalAnalysis` генерируется лениво, как у TED. Пока анализ в процессе, `generalAnalysis.status` равен `PENDING`/`PROCESSING`, и фронт может поллить так же, как сейчас.

### Ответ: `TenderDto` + новые поля

Все существующие поля `TenderDto` заполняются в том же формате, что у TED. Ниже то, что отличается.

| Поле | TED | Национальный тендер | Что делать фронту |
|---|---|---|---|
| `id` | `123456-2026` | `pl-bzp-2026-00531057` | Ничего, роут `/tenders/[id]` тот же |
| `source` | отсутствует | `"PL_BZP"` | **Новое.** Если `source` отсутствует, это TED. Иначе показать бейдж источника, см. §3 |
| `sourceUrl` | отсутствует | URL процедуры на площадке или на ezamowienia.gov.pl | **Новое.** Ссылка «Открыть оригинал» вместо ссылки на TED |
| `sourceNoticeId` | — | номер BZP, например `2026/BZP 00531057/01` | Показать как номер объявления (поле уже есть в `TenderDto`) |
| `country` | отсутствует | `"POL"` (ISO alpha-3) | **Новое.** Страна источника |
| `isBelowEuThreshold` | отсутствует | почти всегда `true` | **Новое, опционально.** Можно показать «Ниже порога ЕС» |
| `noticeLanguage` | язык уведомления | `"POL"` | Ничего |
| `title` | оригинал | оригинал на польском | Ничего. Заголовок страницы берётся из `shortTitle[locale]`, он есть на en/de/fr/pl/ru |
| `leadBuyers` / `nonLeadBuyers` | `Buyer` (populated или id) | **то же самое**: тот же `Buyer` из общей коллекции, `nonLeadBuyers` пустой | Ничего: ссылка на `/buyers/:id` работает как у TED. Заказчики общие для TED и национальных источников (сопоставлены по NIP/REGON), один и тот же заказчик — одна запись. `identifiers` — цифры NIP/REGON, как у польских заказчиков TED |
| `estimatedValue` | | в PLN, есть примерно у 12% тендеров | Ничего, `estimatedValueEur` заполнен там, где есть сумма |
| `lots` | | есть всегда, минимум один `LOT-0001` | Ничего |
| `links` | ссылки TED | отсутствует | Ссылку на TED не рисовать, если `links` нет |
| `documentUrls`, `submissionUrls` | | ссылки на площадку | Ничего |
| `generalAnalysis`, `deepAnalysisStatus`, `isInWishlist` | | так же, как у TED | Ничего |
| `amendments` | отсутствует | история изменений объявления, см. ниже | **Новое, опционально.** Блок «Изменения» |
| `submissionDeadline` | | уже с учётом изменений (перенос дедлайна) | Ничего |
| `indexable` | | по тем же правилам, что у TED | Ничего |

```ts
// Добавить в TenderDto
source?: "PL_BZP";            // пусто = TED; список значений будет расти
sourceUrl?: string;
country?: string;             // ISO 3166-1 alpha-3
isBelowEuThreshold?: boolean;
amendments?: Array<{
  sourceId: string;           // номер объявления об изменении, "2026/BZP 00539328"
  publicationDate?: string;
  changes: Array<{
    field: string;            // номер поля в объявлении, "8.1"
    label?: string;           // "Termin składania ofert" (на языке источника)
    before?: string;          // как в источнике, текст
    after?: string;
  }>;
}>;
```

### Чего у национальных тендеров нет

- Итог процедуры на странице тендера пока не показывается (обратная ссылка есть: `tenderId` на странице итога, §7).

На странице заказчика (`GET /buyers/:id`) в списке открытых тендеров теперь есть и национальные тендеры (в форме `TenderListDto` с `source`), а `stats.tendersCount` и остальная статистика их учитывают. Около 2 тыс. польских заказчиков — новые записи, у которых есть только польские тендеры.
- Блок «Похожие тендеры» продолжает искать через `/ted/search-pure` и показывает TED-тендеры с теми же CPV. Это нормально, менять не нужно.

### Работает так же, как у TED

- **Base analysis:** `generalAnalysis` в `GET /tenders/:id?withGA=true`. Вместо TED XML анализ читает полный текст объявления из источника.
- **Deep analysis:** `POST /tenders/:id/deep-analysis`, список `GET /deep-analysis`. В списке у национального тендера поле `tender` приходит в той же форме `TenderDto`, что и на детальной странице (`source`, `leadBuyers` без `id` и т.д.).
- **Избранное:** `POST`/`DELETE /wishlist/:tenderId`, `GET /wishlist`. В списке национальные тендеры приходят в форме детального `TenderDto` с `generalAnalysis`.

## 2. JSON-LD и SEO

- `buildTenderJsonLd`: для национального тендера в качестве ссылки на оригинал использовать `sourceUrl`. Упоминаний TED быть не должно.
- `generateMetadata`: формат заголовка тот же. Там, где в тексте упоминается TED (суффикс `| TED ...`), для `source` ≠ TED нужен нейтральный вариант, например `| Tenderwize`.
- Canonical: `/tenders/<id>`, как у TED.

## 3. Бейдж источника

| `source` | Подпись | Страна |
|---|---|---|
| нет | TED | — |
| `PL_BZP` | e-Zamówienia (BZP) | Польша |

Список будет расти: следующие страны получат свои значения `source`. Неизвестное значение лучше показать как есть, а не ломать страницу.

## 4. Поиск

Национальные тендеры участвуют во всех поисках, где сейчас есть TED: `POST /ted/search` (дашборд), `GET /ted/search-page` (`/tender-search`), `POST /ted/search-pure` (SEO-страницы стран и отраслей, лендинг, «похожие тендеры»). Выдача общая и отсортирована так, как просили; `totalNoticeCount` считается по обоим источникам.

- **Новый фильтр `sources`**: массив, значения `TED` и `PL_BZP` (список будет расти). Если параметр пустой, ищем по всем источникам. В GET передаётся как остальные массивы: `?sources=TED&sources=PL_BZP`.
- **Остальные фильтры** (CPV, страна, тип контракта, даты, стоимость, текст) работают для национальных тендеров так же. Пример: `placeOfPerformance=POL` теперь возвращает и польские тендеры из BZP.
- **Как отличить запись:** у национального тендера есть `source` (а также `sourceUrl` и `country`); у TED поля `source` нет. По `source` фронт показывает бейдж из §3.
- **Форма записи:**
  - `/ted/search` и `/ted/search-page`: национальный тендер приходит в форме `TenderListDto`, как TED. Заказчик в `leadBuyers` без `id`. В `/ted/search` есть `generalAnalysis`, `isInWishlist` и `deepAnalysisStatus`.
  - `/ted/search-pure`: только поля из того же короткого набора, что у TED, плюс `source`, `sourceUrl` и `country`.
- **Чего ждать:** по Польше и в общих выдачах национальных тендеров заметно больше, чем TED. Например, CPV `45000000` (строительные работы): из 2 769 найденных первые по дате — польские.

## 5. Итоги процедур на страницах подрядчика и заказчика

Итоги польских процедур (BZP) собираются в общую с TED модель подрядчиков и заказчиков. Отдельных endpoints нет — меняются данные существующих:

- `GET /contractors/:id`, `GET /contractors/:id/award-tenders` — в `awardTenders` / `awardTendersWithWonLots` теперь и национальные итоги, общий порядок по дате, `totalCount` по обоим источникам. Форма записи та же (`AwardTenderListDto`); у национальной записи есть `source`, `sourceUrl`, `country` (в `/award-tenders` приходит полный документ, как и у TED).
- `GET /buyers/:id` (итоги заказчика, `GET /buyers/:id/award-tenders`) — то же самое.
- Статистика подрядчика (`stats.awardTendersCount`, `awardLotsCount`, `totalAwardAmountEur`, `lastAwardWinDate`) и заказчика (`stats.awardTendersCount`, `topSuppliers` и т.д.) учитывает национальные итоги.
- Подрядчики общие с TED: польская фирма, уже выигрывавшая в TED, — та же запись (`/contractors/:id`). Примерно 45% польских победителей — новые записи с только польскими итогами (локально за 90 дней: около 9,2 тыс. из 20,3 тыс.), остальные уже были в TED.
- У части лота национального итога есть дополнительные поля (в полном документе): `status` (`awarded` / `cancelled` / `unresolved`), `offersCount`, `lowestOfferValue`, `highestOfferValue`, `contractConclusionDate`, `cancellationReason`. Показывать их не обязательно.

## 6. Совпадения с профилем компании (кабинет)

Национальные тендеры матчатся с профилем компании по тем же правилам и тем же AI-fit, что TED. Отдельных endpoints нет:

- `GET /tender-matching/ai-fit` — в `items` теперь и совпадения с национальными тендерами, в одном списке с TED: общая сортировка (`aiFitScore` по убыванию), `total` по обоим источникам. Форма записи та же; у национального совпадения поле `tender` — `TenderListDto`, как в поиске (§4): есть `source`, `sourceUrl`, `country`, заказчик в `leadBuyers` без `id`. Фронт показывает бейдж источника из §3 по `tender.source`.
- Счётчик `aiFitMatchesCount` в профиле пользователя считает оба источника.
- Письмо с совпадениями — одно общее, с TED. У национального тендера вместо «TED ID» подпись источника (например, «BZP ID (Poland)») и номер объявления в источнике.

## 7. Итоги процедур: страница итога, списки и поиск

Итоги национальных процедур (сейчас Польша, BZP `TenderResultNotice`) отдаются через те же endpoints `/awards*`, что и итоги TED. Новых endpoints нет.

### Общие правила

- **id** национального итога: `pl-bzp-2026-00541360`. Это номер объявления **о результате**, а не тот же id, что у тендера: у тендера и его итога в BZP разные номера. Страница `/[locale]/awards/[id]` открывает его через тот же `GET /awards/:id`.
- **Как отличить запись:** у национального итога есть `source` (`PL_BZP`), `sourceUrl`, `sourceNoticeId` и `country`. У TED поля `source` нет. Бейдж источника тот же, что в §3.
- **Фильтр `sources`** работает во всех `/awards*` так же, как в поиске тендеров (§4): `TED`, `PL_BZP`, пусто = все. `?sources=TED` возвращает прежнюю выдачу без изменений.
- **Объём:** польских итогов заметно меньше, чем TED (локально ~35 тыс. против ~222 тыс.), но они свежие. В выдачах по дате и в выдачах по Польше они будут наверху.
- **Фильтр `procedureType`:** у польских итогов этого поля нет, поэтому с фильтром по типу процедуры они в выдачу не попадают.

### `GET /awards/:id` — страница итога

Форма та же, что у TED (`AwardTenderDetailDto`): `title`, `publicationDate`, `awardDate`, `awardValue`/`awardValueEur`, `estimatedValue`/`estimatedValueEur`, `contractNature`, `cpvCodes`, `placeOfPerformanceCountries`, `contractConclusionDates`, `leadBuyers` (как у TED), `winners` (полные записи подрядчиков), `lots[]` с `winner` (подрядчик: `name`, `identifiers`, `_id`).

У национального итога **нет** полей `titleProc`, `description`, `procedureType`, `noticeType`, `submissionDeadline`, `awardDecisionDates`, `selectionStatuses`, `placeOfPerformanceCities*`. Блоки, которые их показывают, нужно просто скрыть.

**Новые поля:**

```ts
// Добавить в AwardTenderDetailDto (все опциональны; у TED их нет)
source?: "PL_BZP";
sourceUrl?: string;        // объявление о результате на ezamowienia.gov.pl
sourceNoticeId?: string;   // номер объявления в источнике, напр. "2026/BZP 00541360"
country?: string;          // "POL"
tenderId?: string | null;  // наш тендер той же процедуры (/tenders/<tenderId>), если он у нас есть

// В lots[] (у национального итога)
status?: "awarded" | "cancelled" | "unresolved";
cancellationReason?: string;      // причина отмены, текст на польском
offersCount?: number;             // сколько предложений подано
smeOffersCount?: number;          // из них от МСП
lowestOfferValue?: { amount: number | null; currency: string | null };
highestOfferValue?: { amount: number | null; currency: string | null };
contractConclusionDate?: string;  // дата договора по части
isJointVenture?: boolean;         // победитель — консорциум; в winner его лидер
```

**Что показать в UI:**
- статус части: если `status = "cancelled"`, вместо победителя показать «Отменено» и `cancellationReason` (текст как есть, на польском);
- «Подано предложений: N» и диапазон цен `lowestOfferValue`–`highestOfferValue`, если поля есть;
- ссылку «Объявление о закупке» на `/tenders/<tenderId>`, если `tenderId` не null (у большинства итогов он пока null, см. ниже);
- ссылку на оригинал: `sourceUrl`. Ссылок на TED быть не должно.

У большинства польских итогов `tenderId = null`: мы храним только тендеры, которые были открыты на момент сбора, а итог публикуется после дедлайна. Со временем ежедневный сбор будет связывать всё больше пар.

**SEO:** canonical `/awards/<id>`, как у TED. В заголовке и JSON-LD не упоминать TED; суффикс заголовка тот же, что для национальных тендеров (открытый вопрос 1).

### `GET /awards` и `GET /awards/stats` — список и статистика

- В `results` идут итоги обоих источников, общая сортировка (`sortBy`/`sortOrder`; записи без даты или суммы в конце, как раньше). `total` считается по обоим источникам.
- Форма записи та же: `id`, `title`, `awardDate`, `awardValueEur`, `country`, `buyer`, `winners`. У национальной записи дополнительно `source`, `sourceUrl`, `sourceNoticeId`.
- `stats` (`awardsCount`, `totalAwardValueEur`, `winnersCount`, `buyersCount`, `countriesCount`) считаются по обоим источникам. Подрядчики и заказчики общие с TED, поэтому одна фирма считается один раз.

### `GET /awards/search-pure` — SEO-страницы итогов по стране и отрасли

- Выдача общая, форма записи та же, у национальной записи плюс `source`, `sourceUrl`, `sourceNoticeId`, `country`.
- `indexable` пока считается только по TED (как и раньше). Будут ли польские итоги влиять на индексацию этих страниц, решим вместе с sitemap.

### `GET /awards/search?tenderId=` — похожие итоги для страницы тендера

- `tenderId` может быть и национальным тендером (`pl-bzp-…`); раньше для него возвращалось 404.
- Похожие итоги (те же CPV и тип контракта) ищутся в обоих источниках, порядок по дате публикации. У национальной записи форма `AwardTenderListDto` плюс `source`, `sourceUrl`, `sourceNoticeId`, `country`.
- Если в каком-то блоке нужны только итоги TED, передайте `sources=TED`.

## 8. Вне этого контракта (позже, отдельно)

- Sitemap для национальных тендеров и итогов.
- Итог процедуры на странице тендера.

## Открытые вопросы к фронту

1. Какой суффикс заголовка ставить вместо `| TED ...` для национальных тендеров?
2. Нужна ли в карточке пометка «Ниже порога ЕС»?
3. Где в UI поиска показать фильтр `sources` (чекбоксы «TED» / «Польша · e-Zamówienia»)?
