/**
 * Load monorepo root `.env` once (side-effect import).
 * Import this before reading process.env in app.config / entry.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootEnv = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../.env",
);

dotenv.config({ path: rootEnv });
