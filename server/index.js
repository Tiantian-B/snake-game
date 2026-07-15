// 贪吃蛇游戏 · 支付宝充值后端
// 职责：1) 创建电脑网站支付订单并返回跳转 URL
//       2) 接收支付宝异步通知(notify)，验签后标记订单已支付
//       3) 供前端轮询订单支付状态
// 重要：本服务需部署在「公网 HTTPS」地址，支付宝才能回调 notify。纯静态托管(GitHub Pages)不行。

const fs = require("fs");
const path = require("path");
const express = require("express");
const AlipaySdk = require("alipay-sdk").default;

// ---------- 极简 .env 加载（避免额外依赖） ----------
function loadEnv() {
  const f = path.join(__dirname, ".env");
  if (!fs.existsSync(f)) return;
  const txt = fs.readFileSync(f, "utf8");
  for (const line of txt.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"'))) val = val.slice(1, -1);
    if ((val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    // 内联密钥里的字面 \n 还原成真实换行
    val = val.replace(/\\n/g, "\n");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnv();

// ---------- 配置 ----------
const APP_ID = process.env.ALIPAY_APP_ID;
const GATEWAY = process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do";
const PRICE = process.env.TOPUP_PRICE || "6.00";
const COINS = parseInt(process.env.TOPUP_COINS || "1000", 10);
const PUBLIC_BASE = (process.env.PUBLIC_BASE || "http://localhost:3000").replace(/\/$/, "");
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const PORT = parseInt(process.env.PORT || "3000", 10);

function readKey(envPath, envInline) {
  if (envPath) {
    const p = path.isAbsolute(envPath) ? envPath : path.join(__dirname, envPath);
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  return envInline || "";
}
const PRIVATE_KEY = readKey(process.env.ALIPAY_PRIVATE_KEY_PATH, process.env.ALIPAY_PRIVATE_KEY);
const ALIPAY_PUBLIC_KEY = readKey(process.env.ALIPAY_PUBLIC_KEY_PATH, process.env.ALIPAY_PUBLIC_KEY);

if (!APP_ID || !PRIVATE_KEY || !ALIPAY_PUBLIC_KEY) {
  console.error("[启动检查] 缺少支付宝凭证：请配置 ALIPAY_APP_ID / 应用私钥 / 支付宝公钥 后启动。");
  console.error("[启动检查] 参考 .env.example。当前以「未配置」状态启动，仅 /health 可用。");
}

// ---------- 支付宝 SDK ----------
let alipaySdk = null;
if (APP_ID && PRIVATE_KEY && ALIPAY_PUBLIC_KEY) {
  alipaySdk = new AlipaySdk({
    appId: APP_ID,
    gateway: GATEWAY,
    privateKey: PRIVATE_KEY,
    alipayPublicKey: ALIPAY_PUBLIC_KEY,
    signType: "RSA2",
    charset: "utf-8",
    timeout: 10000,
  });
}

// ---------- 内存订单表（生产环境请换数据库） ----------
// outTradeNo -> { uid, amount, coins, paid, createdAt }
const orders = new Map();
function genOutTradeNo() {
  return "SNK" + Date.now() + Math.floor(Math.random() * 9000 + 1000);
}

// ---------- Express ----------
const app = express();
app.use(express.urlencoded({ extended: false, limit: "1mb" })); // 支付宝 notify 是 form-urlencoded
app.use(express.json());

// 简单 CORS（放行前端来源）
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allow = FRONTEND_ORIGIN === "*" ? "*" : (origin && origin === FRONTEND_ORIGIN ? origin : FRONTEND_ORIGIN);
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

app.get("/health", (req, res) => res.json({ ok: true, configured: !!alipaySdk, price: PRICE, coins: COINS }));

// 创建订单：前端传入 uid（localStorage 里的随机用户标识），返回支付宝跳转 URL
app.post("/api/create-order", async (req, res) => {
  if (!alipaySdk) return res.status(503).json({ error: "后端未配置支付宝凭证" });
  const uid = (req.body && req.body.uid) || "";
  if (!uid) return res.status(400).json({ error: "缺少 uid" });

  const outTradeNo = genOutTradeNo();
  orders.set(outTradeNo, { uid, amount: PRICE, coins: COINS, paid: false, createdAt: Date.now() });

  const returnUrl = PUBLIC_BASE + "/api/return?out_trade_no=" + outTradeNo + "&uid=" + encodeURIComponent(uid);
  const notifyUrl = PUBLIC_BASE + "/api/alipay/notify";

  try {
    const payUrl = await alipaySdk.pageExecute(
      "alipay.trade.page.pay",
      {
        bizContent: {
          out_trade_no: outTradeNo,
          product_code: "FAST_INSTANT_TRADE_PAY",
          total_amount: PRICE,
          subject: COINS + " 蛇币充值",
          body: "贪吃蛇游戏充值 " + COINS + " 蛇币",
          charset: "utf-8",
        },
        returnUrl,
        notifyUrl,
      },
      { method: "GET" }
    );
    res.json({ payUrl, outTradeNo });
  } catch (e) {
    console.error("创建订单失败:", e);
    res.status(500).json({ error: "创建订单失败", detail: String(e && e.message || e) });
  }
});

// 支付宝异步通知：验签 -> 标记已支付
app.post("/api/alipay/notify", (req, res) => {
  const params = req.body || {};
  if (!alipaySdk) { res.send("fail"); return; }

  let verified = false;
  try {
    verified = alipaySdk.checkNotifySign(params);
  } catch (e) {
    console.error("验签异常:", e);
  }
  if (!verified) {
    console.warn("通知验签失败，忽略。params=", JSON.stringify(params));
    res.send("fail");
    return;
  }

  const tradeStatus = params.trade_status;
  const outTradeNo = params.out_trade_no;
  if ((tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED") && orders.has(outTradeNo)) {
    orders.get(outTradeNo).paid = true;
    console.log("订单已支付:", outTradeNo, "金额:", params.total_amount);
    // 真实发币在服务端做最稳妥；此处订单已标记 paid，前端轮询到后给本地钱包加币。
    // 若要做「服务端权威账本」，在这里调用你的用户服务增加 coins 即可。
  }
  res.send("success"); // 必须原样返回 success，支付宝才认为通知成功
});

// 支付宝回跳地址：直接 302 跳回前端页面并带上支付结果参数（跨域下 sessionStorage 不可用，故用服务端重定向）
app.get("/api/return", (req, res) => {
  const { out_trade_no, uid } = req.query;
  const base = (process.env.FRONTEND_RETURN_URL || FRONTEND_ORIGIN || "https://tiantian-b.github.io/snake-game/").replace(/\/$/, "");
  const target = base + "/?paid=" + encodeURIComponent(out_trade_no || "") + "&uid=" + encodeURIComponent(uid || "");
  res.redirect(302, target);
});

// 前端轮询：订单是否支付（按 uid 绑定，防冒领）
app.get("/api/order/:id/status", (req, res) => {
  const order = orders.get(req.params.id);
  const uid = req.query.uid;
  if (!order) return res.json({ paid: false, exists: false });
  if (order.uid !== uid) return res.status(403).json({ error: "uid 不匹配" });
  res.json({ paid: order.paid, exists: true, coins: order.coins });
});

app.listen(PORT, () => {
  console.log("支付宝充值后端已启动: http://localhost:" + PORT);
  console.log("套餐: ¥" + PRICE + " = " + COINS + " 蛇币 | 支付宝已配置: " + (!!alipaySdk));
});
