#!/bin/bash
# 轻量应用服务器 · 用 pm2 守护启动（比 systemd 更简单，宝塔用户也常用）
set -e
cd "$(dirname "$0")"

# 1) 安装生产依赖（首次）
npm install --production --no-audit --no-fund

# 2) 启动（需先全局安装 pm2：npm i -g pm2）
pm2 delete snake-pay 2>/dev/null || true
pm2 start index.js --name snake-pay --cwd "$(dirname "$0")"
pm2 save

echo "✅ 已启动。查看状态: pm2 status"
echo "   日志: pm2 logs snake-pay"
echo "   健康检查: curl http://127.0.0.1:3000/health"
