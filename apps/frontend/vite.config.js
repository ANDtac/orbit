import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": resolve(__dirname, "src"),
        },
    },
    server: {
        host: "0.0.0.0",
        port: 3000,
    },
    preview: {
        host: "0.0.0.0",
        port: 3000,
    },
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/tests/setup.ts"],
        coverage: {
            provider: "v8",
        },
    },
});
