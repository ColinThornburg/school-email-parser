#!/bin/bash
# Pre-deployment validation script for School Email Parser

echo "🚀 Starting pre-deployment checks..."

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working directory is not clean. Please commit or stash changes."
    echo "Uncommitted changes:"
    git status --porcelain
    exit 1
fi

# Check if we're on the main branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
    echo "⚠️  Warning: You're not on the main branch (currently on: $current_branch)"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled"
        exit 1
    fi
fi

# Run TypeScript check
echo "📝 Running TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript check failed"
    exit 1
fi
echo "✅ TypeScript check passed"

# Run ESLint
echo "🔍 Running ESLint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ ESLint check failed"
    exit 1
fi
echo "✅ ESLint check passed"

# Run build
echo "🏗️ Running build..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build successful"

# Check for console.log statements in production code
echo "🔍 Checking for console.log statements..."
console_logs=$(grep -r "console\.log" src/ --include="*.ts" --include="*.tsx" | grep -v "//" | wc -l)
if [ $console_logs -gt 0 ]; then
    echo "⚠️  Warning: Found $console_logs console.log statements in source code:"
    grep -r "console\.log" src/ --include="*.ts" --include="*.tsx" | grep -v "//"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled - please remove console.log statements"
        exit 1
    fi
fi

# Check for TODO comments
echo "🔍 Checking for TODO comments..."
todos=$(grep -r "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx" | wc -l)
if [ $todos -gt 0 ]; then
    echo "⚠️  Found $todos TODO/FIXME/HACK comments:"
    grep -r "TODO\|FIXME\|HACK" src/ --include="*.ts" --include="*.tsx"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Deployment cancelled - please address TODO comments"
        exit 1
    fi
fi

# Check package.json for security vulnerabilities
echo "🔒 Checking for security vulnerabilities..."
if command -v npm audit &> /dev/null; then
    npm audit --audit-level=moderate
    if [ $? -ne 0 ]; then
        echo "⚠️  Security vulnerabilities found. Run 'npm audit fix' to fix them."
        read -p "Do you want to continue? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "❌ Deployment cancelled - please fix security vulnerabilities"
            exit 1
        fi
    fi
else
    echo "⚠️  npm audit not available, skipping security check"
fi

echo ""
echo "✅ All pre-deployment checks passed!"
echo "🚀 Ready to deploy!"
echo ""
echo "Next steps:"
echo "1. git add ."
echo "2. git commit -m \"<type>(<scope>): <description>\""
echo "3. git push origin main"
echo ""
echo "Example commit message:"
echo "git commit -m \"feat(ui): add new feature description\""
