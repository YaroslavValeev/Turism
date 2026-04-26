# Content Pipeline E2E Checklist (E+ / F)

## E+ owner-review

- [ ] создать `content_draft(status=ready)`
- [ ] отправить owner preview в Telegram
- [ ] approve -> `workflowStatus=approved`
- [ ] reject -> `workflowStatus=rejected`
- [ ] rewrite (text) -> `workflowStatus=rewrite_requested`, затем новая версия draft
- [ ] rewrite (voice) -> транскрипт/фолбэк, новая версия draft
- [ ] duplicate callback -> второй раз не меняет статус (duplicate=true)

## F publisher core

- [ ] approved draft -> publish в `telegram_channel`
- [ ] approved draft -> publish в `site_blog`
- [ ] `content_publications` содержит `published`, `externalPostId`, `externalUrl`
- [ ] повторный publish того же `draftId+channel` не создает дубль
- [ ] симулировать ошибку канала -> `state=failed`, `errorCode`, `errorDetail`
- [ ] manual retry из админки -> успешный переход в `published`

## Наблюдаемость

- [ ] `audit_logs` содержит owner decision и publication actions
- [ ] `content_metrics` содержит channel, utmSource, utmCampaign, publishedAt

