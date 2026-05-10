#!/usr/bin/env node
/**
 * Не дать поднять второй `next dev` на том же порту: иначе EADDRINUSE / «зомби»-процессы
 * и риск рассинхрона при параллельном `next build` + `next dev` в apps/web.
 *
 * Использование: `node scripts/ensure-web-dev-port.mjs` из корня репозитория.
 * Порт: переменная WEB_DEV_PORT или 3000 (как в apps/web: `next dev -p 3000`).
 */
import net from "node:net";

const port = Number(process.env.WEB_DEV_PORT) || 3000;

function portFree() {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const done = (free) => {
      try {
        socket.destroy();
      } catch {
        /* ignore */
      }
      resolve(free);
    };
    socket.setTimeout(2000, () => done(true));
    socket.on("connect", () => done(false));
    socket.on("error", (err) => {
      if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT") done(true);
      else done(true);
    });
  });
}

const free = await portFree();
if (!free) {
  console.error(
    `[ensure-web-dev-port] порт ${port} уже занят (вероятен другой \`next dev\` или Node).\n` +
      `  Варианты:\n` +
      `  • Остановите процесс: Windows: netstat -ano | findstr :${port}  →  taskkill /F /PID <pid>\n` +
      `  • Или другой порт для витрины: PowerShell: $env:WEB_DEV_PORT=3002; pnpm dev:web\n` +
      `    (откройте http://localhost:3002; API по умолчанию на 3001 — не используйте 3001 для web.)`,
  );
  process.exit(1);
}
console.log(`[ensure-web-dev-port] порт ${port} свободен`);
