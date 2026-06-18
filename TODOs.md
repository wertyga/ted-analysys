[//]: # (- FE to implement notification user's settings)

[//]: # (- FE - deep analysis isOutOfDate)

[//]: # (- FE - awardCriteria)

[//]: # (- FE - buyer fields - может отдельно показывать)

[//]: # (- FE - estimatedValue - если нет в тендере, вытягивать из generalAnalysis)

[//]: # (- FE - lots &#40;tender -> generalAnalysis&#41;)

[//]: # (- FE - generalAnalysis -> scopeOfWork)

[//]: # (- FE - generalAnalysis -> eligibilityCriteria)

[//]: # (- FE - generalAnalysis -> awardCriteria)

[//]: # (- FE - tender-match - Tender details are currently unavailable - show a tender info)

[//]: # (- FE - tender-match - показывать isOutDated есть дедлайн кончился)

- BE - total-value - для tender price

buyerProfile: https://ch-giorgi.sudest-marchespublics.com
пробовать доставать portalUrl для deep analysis

. Company Profile Completeness Score
Покажи пользователю:
Company profile completeness: 68%
Missing:
- certifications
- references
- operating countries
- typical contract size
Это мотивирует заполнить профиль и улучшает matching.

TenderRequirementsModule
Для checklist:
mandatory requirements
required documents
eligibility criteria
award criteria
submission instructions

BuyerIntelligenceModule
Позже, но очень ценно:
buyer profile
past tenders
past winners
average contract value
common CPVs

TenderWishlist → Opportunity Pipeline / Saved Opportunities
TenderDeepAnalysis → Company Fit Analysis / Bid-No-Bid Analysis
CompanyFilter → Company Capability Profile
CompanyProfileDocuments → Evidence Library / Company Documents
TenderMatching → Opportunity Matching
TenderMatchNotifications → Opportunity Alerts
TenderAnalysis → Tender Summary

Показывай бейджи:
Standard Tender
DPS
Framework
Qualification System
Award Notice
Market Consultation
Long-running Opportunity
Это решает проблему старых публикаций с дедлайнами до 2029 и похожих случаев.


### History
1. Similar contracts history
Когда пользователь смотрит тендер, ты показываешь:
“Похожие контракты за последние N лет”
Пользователь сразу видит:
“Окей, похожие тендеры обычно выигрывают компании X, Y, Z. Средний контракт — 300–600k EUR. Покупатель уже закупал это раньше.”
Это очень полезно для bid/no-bid решения.

2. Competitor profiles
Ты можешь автоматически строить карточку компании-конкурента из публичных award notices.
Это не должно выглядеть как LinkedIn/CRM. Это именно public procurement footprint:
“Эта компания часто выигрывает IT support contracts в Германии и Австрии, особенно у municipal buyers, средний размер контракта — около 450k EUR.”

3. Buyer intelligence
Иногда пользователю важнее не конкурент, а заказчик.
“Этот заказчик закупает такие услуги почти каждый год. Последний контракт был 11 месяцев назад. Есть вероятность повторной закупки.”
