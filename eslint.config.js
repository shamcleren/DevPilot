import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-electron/**",
      "**/out/**",
      "scripts/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
