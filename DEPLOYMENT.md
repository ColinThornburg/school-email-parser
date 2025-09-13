# Deployment Guide

This guide outlines the standard process for deploying the School Email Parser application to ensure consistent, reliable deployments.

## Pre-Deployment Checklist

### 1. Code Quality Checks

Before committing, ensure all code quality checks pass:

```bash
# Run TypeScript compilation check
npm run build

# Run ESLint to check for code quality issues
npm run lint

# Check for unused variables and imports (TypeScript strict mode)
npx tsc --noEmit
```

### 2. Manual Code Review

- [ ] No console.log statements in production code
- [ ] No unused imports or variables
- [ ] All functions have proper TypeScript types
- [ ] Error handling is implemented where needed
- [ ] No hardcoded secrets or sensitive data
- [ ] All API endpoints are properly typed
- [ ] Database queries use proper error handling

### 3. Testing Checklist

- [ ] Application builds successfully (`npm run build`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] No ESLint warnings or errors (`npm run lint`)
- [ ] All components render without errors
- [ ] API endpoints respond correctly
- [ ] Database migrations are up to date (if applicable)

## Commit Message Standards

### Format
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: A code change that neither fixes a bug nor adds a feature
- `perf`: A code change that improves performance
- `test`: Adding missing tests or correcting existing tests
- `chore`: Changes to the build process or auxiliary tools
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes that affect the build system or external dependencies

### Scopes
- `ui`: User interface components
- `api`: API endpoints and server-side code
- `db`: Database related changes
- `auth`: Authentication and authorization
- `email`: Email processing functionality
- `config`: Configuration files
- `deps`: Dependencies and package management

### Examples
```
feat(ui): add dark mode toggle to settings
fix(api): resolve email sync timeout issue
docs(readme): update installation instructions
refactor(email): simplify email parsing logic
perf(ui): optimize calendar rendering performance
```

## Deployment Process

### 1. Pre-Deployment Script

Create and run the pre-deployment validation:

```bash
#!/bin/bash
# pre-deploy.sh

echo "🚀 Starting pre-deployment checks..."

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working directory is not clean. Please commit or stash changes."
    exit 1
fi

# Run TypeScript check
echo "📝 Running TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ TypeScript check failed"
    exit 1
fi

# Run ESLint
echo "🔍 Running ESLint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ ESLint check failed"
    exit 1
fi

# Run build
echo "🏗️ Running build..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ All pre-deployment checks passed!"
```

### 2. Standard Deployment Commands

```bash
# 1. Run pre-deployment checks
./pre-deploy.sh

# 2. Add all changes
git add .

# 3. Commit with proper message format
git commit -m "feat(ui): add new feature description"

# 4. Push to remote
git push origin main

# 5. Verify deployment (Vercel auto-deploys)
# Check Vercel dashboard or deployment URL
```

## Vercel Deployment Configuration

The project is configured for Vercel deployment with:

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node.js Version**: Auto-detected
- **API Functions**: Serverless functions in `/api` directory

### Environment Variables

Ensure these are set in Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GMAIL_CLIENT_ID`
- `GMAIL_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

## Post-Deployment Verification

### 1. Health Checks

After deployment, verify:

- [ ] Application loads without errors
- [ ] Authentication flow works
- [ ] Email sync functionality operates correctly
- [ ] Database connections are working
- [ ] API endpoints respond correctly
- [ ] All UI components render properly

### 2. Monitoring

- Check Vercel function logs for any errors
- Monitor application performance
- Verify email processing is working
- Check database for data integrity

## Rollback Procedure

If deployment issues occur:

1. **Immediate Rollback**:
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Previous Version Rollback**:
   ```bash
   git log --oneline
   git revert <commit-hash>
   git push origin main
   ```

## Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check TypeScript errors: `npx tsc --noEmit`
   - Verify all imports are correct
   - Ensure all dependencies are installed

2. **Runtime Errors**:
   - Check Vercel function logs
   - Verify environment variables
   - Test API endpoints individually

3. **Database Issues**:
   - Check Supabase connection
   - Verify RLS policies
   - Run database migrations if needed

### Debug Commands

```bash
# Check build locally
npm run build && npm run preview

# Test specific components
npm run dev

# Check for unused dependencies
npx depcheck

# Analyze bundle size
npx vite-bundle-analyzer
```

## Best Practices

1. **Always test locally** before deploying
2. **Use feature branches** for major changes
3. **Keep commits small and focused**
4. **Write descriptive commit messages**
5. **Review code before committing**
6. **Monitor deployments** after pushing
7. **Keep dependencies updated**
8. **Document breaking changes**

## Emergency Contacts

- **Primary Developer**: Colin Thornburg (colin.thornburg@gmail.com)
- **Repository**: https://github.com/ColinThornburg/school-email-parser
- **Vercel Dashboard**: Check project settings for team access

---

**Remember**: A successful deployment is not just about pushing code, but ensuring the application works correctly in production. Always verify functionality after deployment.
