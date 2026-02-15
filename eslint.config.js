import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["mobile/secure_apk/uploader/**/*.{js,mjs}"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    ignores: [
      "mobile/field-ready/android/**",
      "mobile/field-ready/ios/**",
      "mobile/field-ready/dist/**",
      "mobile/pm-tech/android/**",
      "mobile/pm-tech/ios/**",
      "mobile/pm-tech/dist/**",
      "backend/dist/**",
      "dist/**",
    ],
  },
];
