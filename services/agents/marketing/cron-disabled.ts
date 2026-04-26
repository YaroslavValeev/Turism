/**
 * Отдельный marketing:cron отключён: единственная точка входа — orchestrator:cron.
 */
console.warn(
  "[agents] marketing:cron отключён. Используйте: pnpm --filter @mywave/analytics-agent orchestrator:cron"
);
process.exit(0);
