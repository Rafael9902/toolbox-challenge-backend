/**
 * Commit message rules: Conventional Commits.
 *
 * The file is .cjs because the package is `"type": "module"` and commitlint
 * loads its config as CommonJS.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // The default forbids upper-case anywhere in the subject, which rejects
    // acronyms this project needs constantly: API, CSV, JSON, HTTP, ESM.
    // Only all-caps and PascalCase subjects are rejected.
    'subject-case': [2, 'never', ['pascal-case', 'upper-case']],
    'type-enum': [2, 'always', [
      'build', 'chore', 'ci', 'docs', 'feat', 'fix',
      'perf', 'refactor', 'revert', 'style', 'test'
    ]]
  }
}
