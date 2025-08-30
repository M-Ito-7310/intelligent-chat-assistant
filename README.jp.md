# AIチャットボットサービス

アップロードされたドキュメントを理解し、質問に答えることができるRAG（Retrieval-Augmented Generation）機能を備えたインテリジェントなチャットボットサービス。

## 機能

### コア機能
- 💬 **リアルタイムチャット**: AI搭載の即座の応答メッセージング
- 📄 **ドキュメント理解**: ドキュメント（PDF、TXT）をアップロードしてチャット
- 🧠 **RAG統合**: ベクトル検索を使用したコンテキスト認識応答
- 💾 **会話履歴**: 検索機能付き永続的なチャット履歴
- 🚀 **ストリーミング応答**: リアルタイムの応答生成

### 高度な機能
- 🔐 **ユーザー認証**: 安全なユーザーアカウントとデータ
- 📊 **使用量分析**: 会話メトリクスの追跡とクォータ管理
- 🎨 **カスタマイズ可能なUI**: ダークモード付きモダンでレスポンシブなデザイン
- 🌐 **多言語対応**: 複数言語のサポート（計画中）
- 📱 **モバイルフレンドリー**: すべてのデバイス用のレスポンシブデザイン
- 📤 **会話エクスポート**: チャット履歴をPDFまたはJSONとしてエクスポート
- 👨‍💼 **管理ダッシュボード**: システム使用状況の監視とユーザー管理
- ⚡ **レスポンスキャッシング**: パフォーマンス向上のためのRedisベースのキャッシング
- 🎮 **デモモード**: APIキーなしでチャットボットを試用

## 技術スタック

### フロントエンド
- **フレームワーク**: TypeScript付きVue.js 3
- **スタイリング**: Tailwind CSS
- **状態管理**: Pinia
- **ビルドツール**: Vite

### バックエンド
- **ランタイム**: TypeScript付きNode.js
- **フレームワーク**: Express.js
- **データベース**: PostgreSQL
- **ベクトルデータベース**: Pinecone/Supabase Vector
- **リアルタイム**: Socket.io

### AI/ML
- **LLMプロバイダー**: OpenAI API / Hugging Face
- **エンベディング**: OpenAI text-embedding-ada-002
- **ドキュメント処理**: PDF.js、Langchain

## プロジェクト構造

```
ai-chatbot/
├── backend/                 # バックエンドAPIサーバー
│   ├── src/
│   │   ├── config/         # データベースと環境設定
│   │   ├── controllers/    # ルートコントローラー
│   │   ├── middleware/     # Expressミドルウェア
│   │   ├── models/         # データベースモデル
│   │   ├── routes/         # APIルート
│   │   ├── services/       # ビジネスロジック
│   │   │   └── ai/         # AI関連サービス
│   │   └── utils/          # ユーティリティ関数
│   └── tests/              # バックエンドテスト
├── frontend/               # Vue.jsフロントエンドアプリ
├── docs/                   # プロジェクトドキュメント
├── scripts/                # 開発スクリプト
└── ROADMAP.jp.md          # 開発ロードマップ
```

## はじめに

### 前提条件
- Node.js (v18以上)
- npmまたはyarn
- PostgreSQLデータベース
- OpenAI APIキーまたはHugging Faceトークン

### インストール

1. **リポジトリのクローン**
   ```bash
   git clone <repository-url>
   cd ai-chatbot
   ```

2. **バックエンドセットアップ**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # 環境変数を設定
   npm run dev
   ```

3. **フロントエンドセットアップ**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### 環境変数

バックエンドディレクトリに`.env`ファイルを作成:

```env
# データベース
DATABASE_URL=postgresql://username:password@localhost:5432/ai_chatbot

# AIサービス
OPENAI_API_KEY=your_openai_key
HUGGINGFACE_TOKEN=your_hf_token

# ベクトルデータベース
PINECONE_API_KEY=your_pinecone_key
PINECONE_ENVIRONMENT=your_environment

# アプリケーション
PORT=3000
JWT_SECRET=your_jwt_secret
NODE_ENV=development
```

## APIエンドポイント

### 認証
- `POST /api/auth/login` - ユーザーログイン
- `POST /api/auth/register` - ユーザー登録
- `POST /api/auth/refresh` - JWTトークンのリフレッシュ

### チャット
- `POST /api/chat/message` - ストリーミングサポート付きメッセージ送信
- `GET /api/chat/conversations` - ユーザーの会話を取得
- `GET /api/chat/conversations/:id` - 会話履歴を取得
- `DELETE /api/chat/conversations/:id` - 会話を削除
- `POST /api/chat/export/:id` - 会話をエクスポート（PDF/JSON）
- `GET /api/chat/stream` - リアルタイム応答用のServer-sent events

### ドキュメント
- `POST /api/documents/upload` - チャンク分割付きドキュメントアップロード
- `GET /api/documents` - メタデータ付きユーザードキュメントを取得
- `DELETE /api/documents/:id` - ドキュメントとベクトルを削除
- `GET /api/documents/:id/chunks` - ドキュメントチャンクを取得
- `POST /api/documents/search` - ドキュメント全体のセマンティック検索

## 開発ロードマップ

詳細な開発フェーズとマイルストーンについては[ROADMAP.jp.md](./ROADMAP.jp.md)を参照してください。

## コントリビューション

1. リポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを開く

## ライセンス

このプロジェクトはMITライセンスの下でライセンスされています - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## サポート

質問や助けが必要な場合は、GitHubでissueを開いてください。

---

**ステータス**: 🚀 フェーズ4 - 高度な機能（70%完了）

### 開発進捗
- ✅ **フェーズ1-3**: コア機能完了（チャット、AI、RAG）
- 🔄 **フェーズ4**: 高度な機能進行中（70%完了）
- ⏳ **フェーズ5**: テストとデプロイメント（未着手）

このプロジェクトは積極的に開発中です。詳細な進捗は[ROADMAP.jp.md](./ROADMAP.jp.md)、最近の更新は[CHANGELOG.md](./CHANGELOG.md)を確認してください。