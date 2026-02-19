#!/usr/bin/env bash

# ============================================================
# Quick Commands Reference - Server Management
# ============================================================

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Telegram Bot - Quick Commands${NC}"
echo -e "${BLUE}========================================${NC}"

echo -e "${BLUE}\n📋 SERVICE MANAGEMENT:${NC}"
echo -e "${YELLOW}sudo systemctl start telegram-bot${NC}       # Start service"
echo -e "${YELLOW}sudo systemctl stop telegram-bot${NC}        # Stop service"
echo -e "${YELLOW}sudo systemctl restart telegram-bot${NC}     # Restart service"
echo -e "${YELLOW}sudo systemctl status telegram-bot${NC}      # Check status"
echo -e "${YELLOW}sudo systemctl enable telegram-bot${NC}      # Auto-start on reboot"
echo -e "${YELLOW}sudo systemctl disable telegram-bot${NC}     # Disable auto-start"

echo -e "${BLUE}\n📊 MONITORING:${NC}"
echo -e "${YELLOW}sudo systemctl status telegram-bot${NC}                    # Service status"
echo -e "${YELLOW}tail -f /var/log/telegram-bot-freshdesk/bot.log${NC}       # View logs"
echo -e "${YELLOW}tail -f /var/log/telegram-bot-freshdesk/error.log${NC}     # View errors"
echo -e "${YELLOW}journalctl -u telegram-bot -f${NC}                        # Journal logs"
echo -e "${YELLOW}ps aux | grep 'node.*bot.js'${NC}                         # Check process"

echo -e "${BLUE}\n🔧 CONFIGURATION:${NC}"
echo -e "${YELLOW}sudo nano /opt/telegram-bot-freshdesk/.env${NC}           # Edit environment"
echo -e "${YELLOW}cat /opt/telegram-bot-freshdesk/.env${NC}                 # View environment"
echo -e "${YELLOW}ls -la /opt/telegram-bot-freshdesk${NC}                   # List files"

echo -e "${BLUE}\n🧹 MAINTENANCE:${NC}"
echo -e "${YELLOW}sudo systemctl stop telegram-bot${NC}                         # Stop before updates"
echo -e "${YELLOW}cd /opt/telegram-bot-freshdesk && npm install${NC}         # Update packages"
echo -e "${YELLOW}sudo systemctl start telegram-bot${NC}                       # Restart"

echo -e "${BLUE}\n🧪 TESTING:${NC}"
echo -e "${YELLOW}curl http://169.1.17.113:3000/webhook/freshdesk${NC}      # Test webhook"
echo -e "${YELLOW}lsof -i :3000${NC}                                        # Check port"
echo -e "${YELLOW}telnet 169.1.17.113 3000${NC}                             # Test connectivity"

echo -e "${BLUE}\n📁 PATHS:${NC}"
echo -e "${YELLOW}Application: /opt/telegram-bot-freshdesk${NC}"
echo -e "${YELLOW}Logs: /var/log/telegram-bot-freshdesk${NC}"
echo -e "${YELLOW}Service: /etc/systemd/system/telegram-bot.service${NC}"

echo -e "${BLUE}\n❓ TROUBLESHOOTING:${NC}"
echo -e "${YELLOW}sudo systemctl restart telegram-bot${NC}                   # Restart if stuck"
echo -e "${YELLOW}sudo journalctl -u telegram-bot -n 100${NC}               # Last 100 log lines"
echo -e "${YELLOW}sudo systemctl daemon-reload${NC}                         # After service changes"
echo -e "${YELLOW}sudo chown -R telegram-bot:telegram-bot /opt/telegram-bot-freshdesk${NC}  # Fix permissions"

echo -e "${BLUE}\n========================================${NC}"
