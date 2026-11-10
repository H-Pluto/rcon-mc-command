import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
  },
  ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**'],
})
