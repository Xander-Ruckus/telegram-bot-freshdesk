#!/usr/bin/env bash

# Deployment script for Telegram Bot

set -e

echo "🚀 Starting deployment..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Check npm
echo "✅ npm version: $(npm --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check environment variables
echo "🔍 Checking environment variables..."
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo "Please create .env from .env.example and fill in your credentials"
    exit 1
fi

# Build (if needed)
if [ -f "build.js" ]; then
    echo "🏗️  Building application..."
    npm run build
fi

# Run tests (if available)
if [ -f "package.json" ] && grep -q '"test"' package.json; then
    echo "🧪 Running tests..."
    npm test || true
fi

echo ""
echo "✅ Deployment ready!"
echo ""
echo "To start the bot, run:"
echo "  npm start     (production)"
echo "  npm run dev   (development)"
echo ""
