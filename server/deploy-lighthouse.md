# 部署到腾讯云轻量应用服务器（常驻 Linux）

适合想常驻运行、把订单落库、或用自有域名的场景。需要你有一台**轻量应用服务器**（系统选 Ubuntu / TencentOS / CentOS 均可），并有一个**解析到该服务器公网 IP 的域名**（支付宝 `notify` 回调必须 HTTPS，且通常用域名）。

## 1. SSH 登录服务器
```bash
ssh root@你的服务器公网IP
```

## 2. 安装 Node.js（若镜像没带）
```bash
# Ubuntu 示例
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v   # 应 >= 18
```

## 3. 取代码 + 装依赖
```bash
cd /opt
git clone https://github.com/Tiantian-B/snake-game.git
cd snake-game/server
npm install --production --no-audit --no-fund
```

## 4. 放支付宝凭证（秘密，不要提交）
在 `/opt/snake-pay` 之外，我们把代码放在 `/opt/snake-game/server`，于是：
```bash
cd /opt/snake-game/server
cp .env.example .env
nano .env     # 填 ALIPAY_APP_ID / 密钥路径或内联；PUBLIC_BASE 先空，第 6 步填
```
也把 `keys/private.pem`、`keys/alipay_public.pem` 放好（见 keys/README.md）。

## 5. 启动（二选一）

**A. pm2（推荐，简单）**
```bash
npm i -g pm2
bash start.sh
pm2 status        # 应看到 snake-pay online
curl http://127.0.0.1:3000/health
```

**B. systemd（开机自启）**
```bash
cp snake-pay.service /etc/systemd/system/
# 编辑里把 User/WorkingDirectory/ExecStart 的 node 路径改成你服务器的实际值
systemctl daemon-reload
systemctl enable --now snake-pay
systemctl status snake-pay
```

## 6. Nginx + HTTPS（支付宝回调必需）
```bash
apt-get install -y nginx
cp nginx-snake-pay.conf /etc/nginx/conf.d/snake-pay.conf
# 改 server_name 为你的域名；证书放到 /etc/ssl/pay/
# 申请免费证书（certbot 示例）：
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d pay.yourdomain.com
nginx -t && systemctl reload nginx
```
拿到域名后，回到第 4 步把 `.env` 的 `PUBLIC_BASE` 改成 `https://pay.yourdomain.com`，重启服务：
```bash
pm2 restart snake-pay      # 或 systemctl restart snake-pay
```

## 7. 验证
```bash
curl https://pay.yourdomain.com/health
# 应返回 {"ok":true,"configured":true,...}（configured=true 表示支付宝凭证已生效）
```

## 8. 接回游戏
把 `snake-game.html` 里的 `API_BASE` 常量改成 `https://pay.yourdomain.com`，重新部署 Pages。

## 注意
- 轻量服务器是常驻进程，`orders` 内存表在进程存活期间有效；要做持久账本请接数据库（见 README）。
- 防火墙：轻量控制台「防火墙」放行 80/443（Nginx 用），**不要**直接暴露 3000 到公网。
- 域名 DNS：A 记录指向服务器公网 IP。
