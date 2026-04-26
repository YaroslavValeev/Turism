/**
 * Отдельный analytics:cron отключён: единственная точка входа — orchestrator:cron.
 */
console.warn(
  "[agents] analytics:cron отключён. Используйте: pnpm --filter @mywave/analytics-agent orchestrator:cron"
);
process.exit(0);
