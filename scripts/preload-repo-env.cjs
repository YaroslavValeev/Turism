/**
 * Preload для `node -r ./scripts/preload-repo-env.cjs …` (CommonJS-скрипты).
 * Загружает корневой и API `.env`, применяет те же алиасы, что и API runtime.
 */
const path = require("node:path");
const fs = require("node:fs");
const dotenv = require("dotenv");

const root = path.join(__dirname, "..");
const rootEnv = path.join(root, ".env");
const apiEnv = path.join(root, "services", "api", ".env");
if (fs.existsSync(rootEnv)) dotenv.config({ path: rootEnv, override: false });
if (fs.existsSync(apiEnv)) dotenv.config({ path: apiEnv, override: true });

const { applyApiRuntimeEnvAliases } = require(path.join(root, "packages", "config", "dist", "index.js"));
applyApiRuntimeEnvAliases();
