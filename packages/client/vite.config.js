import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: rootDir,
    server: {
        port: 5173,
        strictPort: true,
        // Phase 1: proxy Colyseus when server runs on 2567
        proxy: {
            "/colyseus": {
                target: "http://localhost:2567",
                changeOrigin: true,
                ws: true,
                rewrite: (p) => p.replace(/^\/colyseus/, ""),
            },
        },
    },
    build: {
        target: "esnext",
        sourcemap: true,
        outDir: "dist",
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            "@snowflow/shared": path.resolve(rootDir, "../shared/src/index.js"),
        },
    },
    // .wgsl imported via ?raw
    assetsInclude: ["**/*.hdr", "**/*.env"],
});
