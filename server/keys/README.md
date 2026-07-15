# 密钥文件放这里（已被 .gitignore 忽略，不会提交）

本目录放两个 PEM 文件，内容来自**支付宝开放平台**：

## 1. `private.pem` —— 你的「应用私钥」
- 用支付宝开放平台开发助手（GUI）或 `openssl` 生成 **RSA2 / 2048 位** 密钥对。
- 把生成的**私钥**原样粘贴进 `private.pem`，格式示例：

```
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
（中间一长串，别漏行）
-----END PRIVATE KEY-----
```

- 对应的**应用公钥**要上传到开放平台「加签方式」里。

## 2. `alipay_public.pem` —— 支付宝公钥
- 在开放平台「加签方式」页面，上传应用公钥后会得到「**支付宝公钥**」。
- 把这段「支付宝公钥」粘贴进 `alipay_public.pem`（同样 BEGIN/END 包裹）。
- ⚠️ 这是支付宝的密钥，不是你自己的应用公钥，两者不是一回事。

## 验证
配好后，在 `server/` 目录：
```bash
npm install
npm start
```
打开 `http://localhost:3000/health` 应返回 `{"ok":true,...}`；
点游戏「充值」→ 若仍提示「后端未配置」，说明 `ALIPAY_APP_ID` / 密钥文件还没填对。

## 生成密钥的命令（可选）
```bash
openssl genrsa -out app_private_key.pem 2048
openssl rsa -in app_private_key.pem -pubout -out app_public_key.pem
# 把 app_private_key.pem 内容作为 private.pem 内容；app_public_key.pem 上传到开放平台换支付宝公钥
```
