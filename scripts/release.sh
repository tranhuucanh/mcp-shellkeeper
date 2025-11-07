#!/bin/bash
# Release script for MCP ShellKeeper

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <version> [--force]"
    echo "Example: $0 1.0.1"
    echo ""
    echo "Options:"
    echo "  --force    Force re-tag if tag already exists (use with caution!)"
    exit 1
fi

VERSION="$1"
FORCE_FLAG=""

if [ "$2" = "--force" ]; then
    FORCE_FLAG="--force"
    echo "⚠️  Force mode enabled - will overwrite existing tag if present"
fi

echo "🚀 Releasing MCP ShellKeeper v$VERSION..."
echo ""

# Check if we're on a clean working tree
if [ -n "$(git status --porcelain)" ]; then
    echo "❌ Working directory not clean. Please commit or stash changes first."
    git status --short
    exit 1
fi

# Update version in package.json
echo "📝 Updating package.json version to $VERSION..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
else
    # Linux
    sed -i "s/\"version\": \".*\"/\"version\": \"$VERSION\"/" package.json
fi

# Verify version was updated
NEW_VERSION=$(node -p "require('./package.json').version")
if [ "$NEW_VERSION" != "$VERSION" ]; then
    echo "❌ Failed to update version in package.json"
    exit 1
fi

echo "✅ Version updated to $VERSION"
echo ""

# Show what changed
echo "📋 Changed files:"
git diff --name-only
echo ""

# Commit version changes
echo "💾 Committing version update..."
git add package.json
git commit -m "chore: bump version to $VERSION" || echo "Nothing to commit"

# Create tag
echo "🏷️  Creating tag v$VERSION..."
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    if [ -z "$FORCE_FLAG" ]; then
        echo "❌ Tag v$VERSION already exists!"
        echo "   Use --force to overwrite (not recommended for published versions)"
        exit 1
    else
        echo "⚠️  Deleting existing tag v$VERSION..."
        git tag -d "v$VERSION"
    fi
fi

git tag -a "v$VERSION" -m "Release v$VERSION"

# Push
echo "📤 Pushing to GitHub..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
git push origin "$CURRENT_BRANCH" $FORCE_FLAG
git push origin "v$VERSION" $FORCE_FLAG

echo ""
echo "✅ Release v$VERSION created successfully!"
echo ""
echo "📊 Next steps:"
echo "1. Monitor GitHub Actions: https://github.com/tranhuucanh/mcp-shellkeeper/actions"
echo "2. Check release: https://github.com/tranhuucanh/mcp-shellkeeper/releases/tag/v$VERSION"
echo "3. Check npm: https://www.npmjs.com/package/mcp-shellkeeper"
echo ""
echo "🎉 Done! The GitHub Action will automatically publish to npm."

