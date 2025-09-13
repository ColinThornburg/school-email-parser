# Deployment Quick Reference

## Quick Commands

```bash
# Run all pre-deployment checks
npm run pre-deploy

# Full deployment workflow
npm run deploy

# Individual checks
npm run type-check    # TypeScript check
npm run lint         # ESLint check
npm run build        # Build project
```

## Standard Deployment Process

```bash
# 1. Run pre-deployment checks
npm run pre-deploy

# 2. Add changes
git add .

# 3. Commit with proper format
git commit -m "feat(ui): add new feature"

# 4. Push to deploy
git push origin main
```

## Commit Message Examples

```bash
# New features
git commit -m "feat(ui): add dark mode toggle"
git commit -m "feat(api): implement email sync endpoint"

# Bug fixes
git commit -m "fix(auth): resolve login redirect issue"
git commit -m "fix(email): handle empty subject lines"

# Documentation
git commit -m "docs(readme): update installation steps"
git commit -m "docs(api): add endpoint documentation"

# Refactoring
git commit -m "refactor(ui): simplify component structure"
git commit -m "refactor(api): extract common validation logic"

# Performance
git commit -m "perf(ui): optimize calendar rendering"
git commit -m "perf(api): reduce database query time"

# Dependencies
git commit -m "chore(deps): update React to v18.2.1"
git commit -m "chore(config): update Vercel deployment settings"
```

## Emergency Commands

```bash
# Rollback last commit
git revert HEAD
git push origin main

# Rollback to specific commit
git log --oneline
git revert <commit-hash>
git push origin main

# Check deployment status
# Visit Vercel dashboard or check deployment URL
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| TypeScript errors | `npm run type-check` |
| ESLint warnings | `npm run lint` |
| Build failures | `npm run build` |
| Console.log in code | Remove or comment out |
| Security vulnerabilities | `npm audit fix` |
| Deployment failed | Check Vercel logs |

## Pre-Deployment Checklist

- [ ] Code compiles without errors
- [ ] No ESLint warnings
- [ ] No console.log statements
- [ ] All tests pass (if any)
- [ ] Working directory is clean
- [ ] Proper commit message format
- [ ] Environment variables set in Vercel
