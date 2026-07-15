# 贪吃蛇游戏 · 支付宝充值后端

真实自动到账的充值服务。前端「充值中心」点「立即充值」→ 本服务创建支付宝订单 → 跳转支付宝付款 → 支付宝异步通知(notify)验签 → 订单标记已付 → 前端轮询到已付 → 本地钱包 +1000 蛇币。

> ⚠️ 这个后端**必须部署在公网 HTTPS 地址**，支付宝才能回调 `notify`。纯 GitHub Pages（静态）托管不了，需要另外一台能跑 Node 的服务器（云函数 / VPS / Railway / Render / 腾讯云函数 等）。

## 1. 准备支付宝凭证
在 [支付宝开放平台](https://open.alipay.com) 创建「网页&移动应用」，开通「电脑网站支付」能力，拿到：
- **APPID**（16 位数字）
- **应用私钥**（PKCS8，自己生成，配在开放平台）
- **支付宝公钥**（在开放平台「加签方式」里获取，注意是「支付宝公钥」不是应用公钥）

把三个密钥文件放到 `server/keys/`：
- `keys/private.pem` —— 你的应用私钥
- `keys/alipay_public.pem` —— 支付宝公钥

（也可在 `.env` 里用 `ALIPAY_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY` 内联，把换行写成 `\\n`。）

## 2. 配置
```bash
cd server
cp .env.example .env
# 编辑 .env：填 ALIPAY_APP_ID、PUBLIC_BASE、FRONTEND_ORIGIN、TOPUP_PRICE/COINS
```
- `PUBLIC_BASE`：本服务部署后的公网地址，例如 `https://pay.yourdomain.com`
- `FRONTEND_ORIGIN`：前端来源，填你的 GitHub Pages，例如 `https://tiantian-b.github.io`（CORS 放行用）
- `FRONTEND_RETURN_URL`：支付后回跳前端的**完整**地址，例如 `https://tiantian-b.github.io/snake-game/`（支付宝付款后 302 跳回并带 `?paid=&uid=`）
- `TOPUP_PRICE` / `TOPUP_COINS`：充值金额与蛇币数，默认 ¥6.00 = 1000

## 3. 安装 & 启动
```bash
npm install
npm start
```
本地先跑通：打开 `http://localhost:3000/health` 应返回 `{ok:true,...}`。

## 4. 部署（公网 HTTPS）
任选其一，把 `server/` 整个目录传上去 `npm install && npm start`：
- 云函数：腾讯云 SCF / 阿里云 FC（用 Web 函数，监听端口读 `PORT`）
- PaaS：Railway / Render / Fly.io
- VPS：pm2 或 systemd 起 Node，前面套 Nginx + HTTPS

部署后：
1. 把 `PUBLIC_BASE` 改成真实公网地址，重启。
2. 在支付宝开放平台「电脑网站支付」里，把 **授权回调地址 / 应用网关** 配成 `https://你的域名`（notify 路径是 `/api/alipay/notify`，由代码自动拼接，无需单独填）。
3. 回到游戏 `snake-game.html`，把 `API_BASE` 常量改成 `https://你的域名`，重新部署 Pages。

## 5. 接口
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/create-order` | body `{uid}` → 返回 `{payUrl, outTradeNo}` |
| POST | `/api/alipay/notify` | 支付宝异步通知，验签后标记已付，返回 `success` |
| GET  | `/api/order/:id/status?uid=` | 前端轮询，返回 `{paid, coins}`（按 uid 绑定防冒领） |
| GET  | `/api/return` | 支付宝付款后回跳展示页，引导回游戏 |
| GET  | `/health` | 健康检查 |

## 安全说明
- 发币以**服务端订单 `paid` 状态为准**：前端轮询到 `paid:true` 才加币，且订单绑定 `uid`，别人无法用你的订单号冒领。
- 若想要「服务端权威账本」（不依赖前端 localStorage），在 `/api/alipay/notify` 验签成功后调用你的用户服务增加 coins 即可，当前为内存订单表，重启即清空——生产请换数据库并持久化。
- `keys/`、`.env` 含密钥，**不要提交到 git**（已在 .gitignore 建议）。
