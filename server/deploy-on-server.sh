#!/bin/bash
# 腾讯云轻量应用服务器 · 前后端一键部署脚本
# 用法（SSH 进服务器后执行一条）：
#   bash <(curl -sL https://raw.githubusercontent.com/Tiantian-B/snake-game/main/server/deploy-on-server.sh)
# 可选环境变量（部署前 export 或在命令前加）：
#   DOMAIN=pay.yourdomain.com        有域名则自动申请 HTTPS（certbot），notify 才能真收款
#   ALIPAY_APP_ID=xxx                支付宝 APPID
#   ALIPAY_PRIVATE_KEY="-----BEGIN..."  应用私钥全文
#   ALIPAY_PUBLIC_KEY="-----BEGIN..."   支付宝公钥全文
# 例：DOMAIN=pay.xxx.com ALIPAY_APP_ID=xxx ALIPAY_PRIVATE_KEY="$K" ALIPAY_PUBLIC_KEY="$P" bash <(curl -sL ...)
set -e
echo "== 贪吃蛇 · 前端 + 支付宝充值后端 一键部署 =="

export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -y
sudo apt-get install -y -q curl nginx certbot python3-certbot-nginx git ufw

# Node.js 20
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y -q nodejs
fi
node -v

# 取代码
sudo rm -rf /opt/snake-game
sudo git clone -q https://github.com/Tiantian-B/snake-game.git /opt/snake-game
sudo chown -R "$USER":"$USER" /opt/snake-game
cd /opt/snake-game/server
npm install --production --no-audit --no-fund

PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo 43.128.250.88)

# 写后端 .env（未给支付宝凭证则留空，服务以未配置态运行，仍可部署验证）
cat > /opt/snake-game/server/.env <<EOF
ALIPAY_APP_ID=${ALIPAY_APP_ID:-}
ALIPAY_PRIVATE_KEY=${ALIPAY_PRIVATE_KEY:-}
ALIPAY_PUBLIC_KEY=${ALIPAY_PUBLIC_KEY:-}
ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
TOPUP_PRICE=6.00
TOPUP_COINS=1000
FRONTEND_ORIGIN=*
FRONTEND_RETURN_URL=http://${PUBLIC_IP}/
EOF

# 前端：复制并把 API_BASE 指向本服务器
sudo mkdir -p /var/www/snake
sudo cp /opt/snake-game/index.html /var/www/snake/index.html
sudo sed -i "s#https://YOUR-PAY-BACKEND.example.com#http://${PUBLIC_IP}#g" /var/www/snake/index.html

# 后端启动（pm2 守护）
sudo npm install -g pm2 >/dev/null 2>&1
pm2 delete snake-pay 2>/dev/null || true
pm2 start /opt/snake-game/server/index.js --name snake-pay
pm2 save

# Nginx
if [ -n "$DOMAIN" ]; then
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || true
  sudo tee /etc/nginx/sites-available/snake >/dev/null <<NGINX
server {
    listen 80; server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl; server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    root /var/www/snake; index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /api/ { proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme; }
    location = /health { proxy_pass http://127.0.0.1:3000; }
}
NGINX
  sed -i "s#^PUBLIC_BASE=.*#PUBLIC_BASE=https://$DOMAIN#" /opt/snake-game/server/.env
else
  sudo tee /etc/nginx/sites-available/snake >/dev/null <<NGINX
server {
    listen 80; server_name _;
    root /var/www/snake; index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location /api/ { proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme; }
    location = /health { proxy_pass http://127.0.0.1:3000; }
}
NGINX
  sed -i "s#^PUBLIC_BASE=.*#PUBLIC_BASE=http://${PUBLIC_IP}#" /opt/snake-game/server/.env
fi
sudo ln -sf /etc/nginx/sites-available/snake /etc/nginx/sites-enabled/snake
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo ufw allow 22,80,443/tcp
sudo ufw --force enable || true

pm2 restart snake-pay

echo "========================================="
echo "部署完成 ✅"
echo "前端访问: http://${PUBLIC_IP}   $([ -n "$DOMAIN" ] && echo "(HTTPS: https://$DOMAIN)")"
echo "后端健康检查: curl http://127.0.0.1:3000/health"
echo "-----------------------------------------"
echo "未填支付宝凭证时 configured=false，不能真收款。"
echo "真收款需：1) 在 /opt/snake-game/server/.env 填 ALIPAY_APP_ID/私钥/公钥"
echo "          2) 若有域名：重跑本脚本并带 DOMAIN= 与支付宝凭证，自动 HTTPS"
echo "          3) pm2 restart snake-pay"
echo "========================================="
