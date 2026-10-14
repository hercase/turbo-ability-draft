// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
    // Generated output (compiled Lua and Panorama JS) and third-party code (see THIRD_PARTY_NOTICES.md).
    globalIgnores(["game/**", "content/**", "node_modules/**", "src/vscripts/lib/**"]),
    {
        files: ["**/*.{ts,js,mjs}"],
        extends: [js.configs.recommended, tseslint.configs.recommended],
    },
    {
        // Node tooling is plain CommonJS.
        files: ["scripts/**/*.js"],
        languageOptions: {
            sourceType: "commonjs",
            globals: globals.node,
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
    {
        // Panorama handlers are called from XML (e.g. onactivate="OnCloseButtonClicked()"), so ESLint
        // cannot see their uses. Convention: name them On<Something>.
        files: ["src/panorama/**/*.ts"],
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^On[A-Z]" }],
        },
    },
    // Keep last: turns off rules that conflict with Prettier's formatting.
    prettier,
);
