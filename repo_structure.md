# Repo Structure

Ниже — рекомендуемая структура единого репозитория для MVP.

## Top-level
- /apps
- /services
- /packages
- /infra
- /docs
- /scripts
- /.github

## /apps
### /apps/web
Публичный фронтенд:
- landing / marketing pages
- catalog
- program page
- booking flow
- auth
- user profile

### /apps/admin
Внутренняя админка / ops interface:
- bookings queue
- organizers queue
- program moderation
- incidents
- commission reconciliation
- dashboards

## /services
### /services/api
Основной backend API:
- auth
- organizers
- programs
- bookings
- reviews
- incidents
- commissions
- notifications
- analytics events

### /services/jobs
Фоновые задачи:
- reminders
- review requests
- stale lead nudges
- commission reminders
- cleanup / sync jobs

## /packages
### /packages/shared-types
Канонические типы / enums / DTO

### /packages/ui
Общие UI-компоненты

### /packages/config
Общие конфиги, env parsing, constants

## /infra
- docker
- staging/prod manifests
- monitoring
- backups
- CI/CD templates

## /docs
- PRD
- architecture
- legal
- kits v2-v6
- API docs
- release notes

## Принцип
- публичный web и admin разделены
- API отделён от фоновых jobs
- shared types живут отдельно
- infra и docs first-class citizens
