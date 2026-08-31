import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // .worktrees 是 git worktree 挂载点（已在 .gitignore 里），里面是另一个分支的完整源码。
  // flat config 不读 .gitignore，不排掉的话 lint 会把别的分支一起扫进来，
  // 基线里凭空多出九条警告，且改本分支代码永远修不掉它们。
  // android/ 同理：Capacitor 生成的原生工程，里头的 JS 不受本项目规则管。
  { ignores: ["dist", "_reference", "src-tauri/target", "scripts", ".worktrees", "android"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
