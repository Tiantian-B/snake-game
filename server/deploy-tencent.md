# 部署到腾讯云函数 SCF（Web 函数）

本目录已准备好可直接部署到**腾讯云函数（Web 函数）+ API 网关**的包，部署后获得一个公网 HTTPS 地址，支付宝才能回调 `notify`。

> 前置：你需要一个**腾讯云账号**，并在「访问管理 → API 密钥」拿到 `SecretId` / `SecretKey`（部署用）。支付宝凭证另需从支付宝开放平台获取（见 README）。

## 方式 A：控制台上传（最稳，5 分钟，无需 CLI）

1. 用本目录打好的包 `dist/snake-pay.zip`（已含 `index.js` / `package.json` / `scf_bootstrap` / 生产依赖 `node_modules`，**不含** `.env` 和密钥文件）。
2. 腾讯云控制台 → **云函数 SCF** → 新建 → 选择「Web 函数」：
   - 函数名：`snake-pay`
   - 地域：就近（如 ap-guangzhou）
   - 运行环境：Node.js 18
   - 上传方式：本地上传 zip → 选 `dist/snake-pay.zip`
   - 入口：默认会识别 `scf_bootstrap`
3. 在函数「函数管理 → 函数配置 → 环境变量」里添加（密钥从支付宝开放平台来）：
   - `ALIPAY_APP_ID` = 你的 APPID
   - `ALIPAY_PRIVATE_KEY` = 应用私钥全文（含 -----BEGIN/END-----）
   - `ALIPAY_PUBLIC_KEY` = 支付宝公钥全文
   - `ALIPAY_GATEWAY` = `https://openapi.alipay.com/gateway.do`
   - `TOPUP_PRICE` = `6.00`
   - `TOPUP_COINS` = `1000`
   - `PUBLIC_BASE` = 先空着，等第 4 步拿到 API 网关地址再回来填（形如 `https://xxxx.apigw.tencentcs.com/release`）
   - `FRONTEND_ORIGIN` = `https://tiantian-b.github.io`
   - `FRONTEND_RETURN_URL` = `https://tiantian-b.github.io/snake-game/`
4. 触发器 → 创建「API 网关」触发（前端公网 / 发布环境 release）→ 记下给的**公网访问地址**（HTTPS）。
5. 回到第 3 步把 `PUBLIC_BASE` 改成这个地址，保存。
6. 验证：浏览器/ curl 打开 `<公网地址>/health` 应返回 `{"ok":true,...}`；`configured` 为 `true` 表示支付宝凭证已生效。
7. 回到游戏 `snake-game.html`，把 `API_BASE` 常量改成 `<公网地址>`，重新部署 Pages。

## 方式 B：Serverless CLI（需 SecretId/SecretKey）

```bash
npm i -g serverless
export TENCENT_SECRET_ID=你的SecretId
export TENCENT_SECRET_KEY=你的SecretKey
export ALIPAY_APP_ID=...
export ALIPAY_PRIVATE_KEY=...
export ALIPAY_PUBLIC_KEY=...
export PUBLIC_BASE=https://xxxx.apigw.tencentcs.com/release   # 部署后回填
cd server
serverless deploy
```
`serverless.yml` 已提供（Web 函数 + API 网关）。如报 Web 函数语法差异，以方式 A 为准。

## 重新打包（改了代码后）

```bash
cd server
npm install --production
rm -rf dist && mkdir dist
cp index.js package.json scf_bootstrap dist/
cp -r node_modules dist/
cd dist && zip -r ../snake-pay.zip . && cd ..
# dist/snake-pay.zip 即上传包（上传前不要放入 .env / keys/*.pem）
```

## 注意

- 云函数**内存订单表**重启即清空（函数实例回收会丢未支付订单）。生产环境请把订单落库（见 README 安全说明）。
- 支付宝 `notify` 回调必须 HTTPS，API 网关提供，无需自己申请证书。
- 改了游戏 `API_BASE` 后务必重新部署 Pages，否则充值仍提示「后端未配置」。
