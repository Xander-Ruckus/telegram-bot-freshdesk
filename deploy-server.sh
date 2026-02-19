#!/usr/bin/env bash

# ============================================================
# Telegram Bot - Physical Server Deployment Script
# Target: 169.1.17.113
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="telegram-bot-freshdesk"
APP_USER="telegram-bot"
APP_DIR="/opt/$APP_NAME"
LOG_DIR="/var/log/$APP_NAME"
SERVICE_NAME="telegram-bot"
SERVER_IP="169.1.17.113"
WEBHOOK_PORT="${WEBHOOK_PORT:-3000}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Telegram Bot - Server Deployment${NC}"
echo -e "${BLUE}========================================${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root${NC}"
   echo "Run: sudo ./deploy-server.sh"
   exit 1
fi

# ============================================================
# 1. System Dependencies
# ============================================================

echo -e "${BLUE}\n[1/7] Installing system dependencies...${NC}"

# Update package manager
apt-get update -qq

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Installing Node.js 18.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}✅ Node.js already installed: $(node --version)${NC}"
fi

# Install npm if not present
if ! command -v npm &> /dev/null; then
    apt-get install -y npm
else
    echo -e "${GREEN}✅ npm already installed: $(npm --version)${NC}"
fi

# Install git
if ! command -v git &> /dev/null; then
    apt-get install -y git
else
    echo -e "${GREEN}✅ git already installed${NC}"
fi

# ============================================================
# 2. Create Application User
# ============================================================

echo -e "${BLUE}\n[2/7] Setting up application user...${NC}"

if id "$APP_USER" &>/dev/null; then
    echo -e "${GREEN}✅ User $APP_USER already exists${NC}"
else
    echo -e "${YELLOW}Creating user $APP_USER...${NC}"
    useradd -r -s /bin/bash -d $APP_DIR $APP_USER
    echo -e "${GREEN}✅ User $APP_USER created${NC}"
fi

# ============================================================
# 3. Setup Application Directory
# ============================================================

echo -e "${BLUE}\n[3/7] Setting up application directory...${NC}"

if [ -d "$APP_DIR" ]; then
    echo -e "${YELLOW}⚠️  $APP_DIR already exists${NC}"
    read -p "Do you want to update the existing installation? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}Skipping directory setup${NC}"
    fi
else
    mkdir -p $APP_DIR
    echo -e "${GREEN}✅ Created $APP_DIR${NC}"
fi

# Setup log directory
mkdir -p $LOG_DIR
chown $APP_USER:$APP_USER $LOG_DIR
chmod 755 $LOG_DIR
echo -e "${GREEN}✅ Log directory configured: $LOG_DIR${NC}"

# ============================================================
# 4. Copy Application Files
# ============================================================

echo -e "${BLUE}\n[4/7] Copying application files...${NC}"

# Check if we're in the project directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found in current directory${NC}"
    echo "Please run this script from the telegram-bot-freshdesk directory"
    exit 1
fi

# Copy files (excluding node_modules, .git, etc.)
rsync -av --exclude='node_modules' --exclude='.git' --exclude='.env' \
    . $APP_DIR/

# Set permissions
chown -R $APP_USER:$APP_USER $APP_DIR
chmod 755 $APP_DIR
echo -e "${GREEN}✅ Application files copied${NC}"

# ============================================================
# 5. Install Dependencies
# ============================================================

echo -e "${BLUE}\n[5/7] Installing npm dependencies...${NC}"

cd $APP_DIR

# Install as the app user
sudo -u $APP_USER npm install --production

echo -e "${GREEN}✅ Dependencies installed${NC}"

# ============================================================
# 6. Environment Configuration
# ============================================================

echo -e "${BLUE}\n[6/7] Configuring environment...${NC}"

if [ ! -f "$APP_DIR/.env" ]; then
    echo -e "${YELLOW}Creating .env file template...${NC}"
    cat > $APP_DIR/.env.template << 'EOF'
# Telegram Configuration
TELEGRAM_BOT_TOKEN=8498347303:AAF0ApLxQQYvypzel_sCLRHVWNVe309BKKY
TELEGRAM_BOT_USERNAME=Fresh_Note_Bot

# Freshdesk Configuration
FRESHDESK_API_KEY=your_api_key_here
FRESHDESK_DOMAIN=yourcompany.freshdesk.com

# Server Configuration
WEBHOOK_PORT=3000
WEBHOOK_URL=http://169.1.17.113:3000/webhook
NODE_ENV=production
EOF

    cp $APP_DIR/.env.template $APP_DIR/.env
    chown $APP_USER:$APP_USER $APP_DIR/.env
    chmod 600 $APP_DIR/.env
    
    echo -e "${YELLOW}⚠️  .env file created. Please configure it:${NC}"
    echo "   sudo nano $APP_DIR/.env"
    echo ""
else
    echo -e "${GREEN}✅ .env file already exists${NC}"
fi

# ============================================================
# 7. Create Systemd Service
# ============================================================

echo -e "${BLUE}\n[7/7] Creating systemd service...${NC}"

cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Telegram Freshdesk Bot Service
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node src/bot.js
Restart=always
RestartSec=10
StandardOutput=append:$LOG_DIR/bot.log
StandardError=append:$LOG_DIR/error.log
Environment="NODE_ENV=production"
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
EnvironmentFile=$APP_DIR/.env

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}

echo -e "${GREEN}✅ Systemd service created and enabled${NC}"

# ============================================================
# Summary
# ============================================================

echo -e "${GREEN}"
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo -e "${NC}"

echo -e "${BLUE}Next Steps:${NC}"
echo "1. Configure environment variables:"
echo "   ${YELLOW}sudo nano $APP_DIR/.env${NC}"
echo ""
echo "2. Start the bot service:"
echo "   ${YELLOW}sudo systemctl start ${SERVICE_NAME}${NC}"
echo ""
echo "3. Check status:"
echo "   ${YELLOW}sudo systemctl status ${SERVICE_NAME}${NC}"
echo ""
echo "4. View logs:"
echo "   ${YELLOW}tail -f $LOG_DIR/bot.log${NC}"
echo ""
echo "5. Update Freshdesk Webhook URL to:"
echo "   ${YELLOW}http://169.1.17.113:3000/webhook/freshdesk${NC}"
echo ""
echo -e "${BLUE}Service Management:${NC}"
echo "  Start:   ${YELLOW}sudo systemctl start ${SERVICE_NAME}${NC}"
echo "  Stop:    ${YELLOW}sudo systemctl stop ${SERVICE_NAME}${NC}"
echo "  Restart: ${YELLOW}sudo systemctl restart ${SERVICE_NAME}${NC}"
echo "  Status:  ${YELLOW}sudo systemctl status ${SERVICE_NAME}${NC}"
echo ""
echo -e "${BLUE}Application Directory: ${YELLOW}$APP_DIR${NC}"
echo -e "${BLUE}Log Directory: ${YELLOW}$LOG_DIR${NC}"
echo "=========================================="
