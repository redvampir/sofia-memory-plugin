#!/bin/bash
# Setup Git Hooks для Sofia Memory Plugin
# Запуск: bash scripts/setup_git_hooks.sh

set -e

HOOKS_DIR=".git/hooks"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🔧 Setting up Git hooks..."

# Check if .git directory exists
if [ ! -d ".git" ]; then
  echo "❌ Error: .git directory not found. Are you in the project root?"
  exit 1
fi

# Create pre-commit hook
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash
# Pre-commit hook для Sofia Memory Plugin

set -e

echo "🔍 Running pre-commit checks..."

# 1. Check for secrets in staged files
echo "  🔒 Checking for secrets..."
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|json)$' || true)

if [ -n "$STAGED_FILES" ]; then
  # Check for GitHub tokens
  if echo "$STAGED_FILES" | xargs grep -l "ghp_" 2>/dev/null | grep -v "test.js" | grep -v ".eslintrc.js"; then
    echo "❌ Error: Potential GitHub token found in staged files!"
    echo "   Please remove secrets before committing."
    exit 1
  fi

  # Check for API keys
  if echo "$STAGED_FILES" | xargs grep -l "sk_live_" 2>/dev/null | grep -v "test.js" | grep -v ".eslintrc.js"; then
    echo "❌ Error: Potential API key found in staged files!"
    echo "   Please remove secrets before committing."
    exit 1
  fi
fi

# 2. Run linter on staged files
echo "  🎨 Running ESLint..."
if [ -n "$STAGED_FILES" ]; then
  npx eslint $STAGED_FILES --fix --quiet || {
    echo "⚠️  Warning: Linting issues found. Continuing anyway..."
  }

  # Re-add auto-fixed files
  echo "$STAGED_FILES" | xargs git add
fi

# 3. Check for debugging statements
echo "  🐛 Checking for debug statements..."
if echo "$STAGED_FILES" | xargs grep -n "debugger" 2>/dev/null | grep -v "test.js"; then
  echo "⚠️  Warning: 'debugger' statement found in code"
fi

if echo "$STAGED_FILES" | xargs grep -n "console.log" 2>/dev/null | grep -v "test.js" | grep -v "// console.log" | head -5; then
  echo "⚠️  Warning: console.log statements found (showing first 5)"
  echo "   Consider using the logger module instead"
fi

echo "✅ Pre-commit checks passed!"
exit 0
EOF

chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ Pre-commit hook installed"

# Create pre-push hook
cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
# Pre-push hook для Sofia Memory Plugin

set -e

echo "🚀 Running pre-push checks..."

# Run tests
echo "  🧪 Running tests..."
npm test || {
  echo "❌ Tests failed! Push aborted."
  exit 1
}

# Check for npm vulnerabilities
echo "  🛡️  Checking for vulnerabilities..."
npm audit --audit-level=high || {
  echo "⚠️  Warning: High/Critical vulnerabilities found"
  read -p "Continue push anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
}

echo "✅ Pre-push checks passed!"
exit 0
EOF

chmod +x "$HOOKS_DIR/pre-push"
echo "✅ Pre-push hook installed"

# Create commit-msg hook for conventional commits
cat > "$HOOKS_DIR/commit-msg" << 'EOF'
#!/bin/bash
# Commit message hook для Sofia Memory Plugin
# Enforces conventional commit format (soft check)

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Conventional commit pattern
PATTERN="^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .{1,100}"

if ! echo "$COMMIT_MSG" | grep -qE "$PATTERN"; then
  echo "⚠️  Warning: Commit message doesn't follow conventional commits format"
  echo "   Expected: <type>[optional scope]: <description>"
  echo "   Examples:"
  echo "     feat: add user authentication"
  echo "     fix(api): handle null response from GitHub"
  echo "     docs: update API documentation"
  echo ""
  echo "   Your message: $COMMIT_MSG"
  echo ""
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

exit 0
EOF

chmod +x "$HOOKS_DIR/commit-msg"
echo "✅ Commit-msg hook installed"

echo ""
echo "🎉 Git hooks setup complete!"
echo ""
echo "Installed hooks:"
echo "  - pre-commit: Checks for secrets, runs linter, checks debug statements"
echo "  - pre-push: Runs tests and security audit"
echo "  - commit-msg: Suggests conventional commit format"
echo ""
echo "To bypass hooks (not recommended):"
echo "  git commit --no-verify"
echo "  git push --no-verify"
