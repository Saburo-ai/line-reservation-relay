# LINE予約メッセージ中継Worker

LINE公式アカウントのWebhook署名を検証し、正当なイベントだけを
「LINE予約メッセージ自動受付台帳」のGoogle Apps Scriptへ中継します。

このリポジトリは、BOOTH商品「LINE予約メッセージ自動受付台帳」の
購入者向け設置テンプレートです。スプレッドシート本体と設定ガイドは
商品に含まれる案内から取得してください。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Saburo-ai/line-reservation-relay)

## 設定する値

Deploy to Cloudflareの画面で次の3項目を入力します。

| 項目 | 入力する値 |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE DevelopersのChannel secret |
| `GAS_WEBHOOK_URL` | `/exec`で終わるGoogle受付URL |
| `RELAY_SHARED_SECRET` | 商品スプレッドシートが発行した中継用の合言葉 |

これらは秘密情報です。ソースコード、スクリーンショット、問い合わせ文へ
貼り付けないでください。

## 動作

- LINEの`x-line-signature`をHMAC-SHA256で検証
- 不正な署名、過大な本文、JSON以外の本文を拒否
- UTF-8本文をBase64化し、別の共有鍵で署名してGASへ中継
- GASの処理結果が正常な場合だけLINEへ成功を返却

## 開発時の確認

```sh
npm install
npm run check
```

このリポジトリへ実際のトークン、URL、共有鍵をコミットしないでください。

利用範囲は[LICENSE.md](./LICENSE.md)を確認してください。
