# Q-Chat (講義用質問チャットアプリ)

講義中の開発者体験（DX）ならぬ「学生体験（SX）」を向上させるための、質問およびコミュニケーションプラットフォームのプロトタイプです。
「重い質問（公開掲示板）」と「軽い質問（プライベートAIチャット）」を使い分けることで、心理的な質問コストを下げ、講義への参加を促進します。

## 主な機能

-   **公開フォーラム (Everyone)**: 他の学生や講師と共有される掲示板機能。コードを含む技術的な質問や、全体への共有事項に利用します。
-   **マイAIバディ (Private)**: 学生専用のプライベートチャット。AI (Gemini) がTAのように即座に回答します。他の学生や講師には見えません。
-   **AIインサイト (Lecturer Only)**: 講師専用機能。学生とAIのチャットログ（匿名）を全体分析し、「今どこでつまずいているか」などの傾向を把握できます。

## 技術スタック

-   **Frontend**: React, Vite, TailwindCSS (Vanilla CSS imports), TypeScript
-   **Backend**: Python, FastAPI
-   **AI**: Google Gemini API (`gemini-2.5-flash`)

## セットアップ手順

### 前提条件
-   Node.js (v20.19+ または v22.12+)
-   Python (3.12+)
-   Google Gemini API Key

## Docker (Compose) で起動する方法

前提: Docker / Docker Compose が利用できること

1) 環境変数を用意（未作成の場合）
```bash
cp backend/.env_sample backend/.env
```
`backend/.env` の `GEMINI_API_KEY` を設定してください。

2) 起動
```bash
docker compose up --build
```

- フロント→バックエンド通信は、開発時は Vite のプロキシで `/api/*` をバックエンドへ転送しています。

- もし過去に `frontend_node_modules` ボリュームを作成済みで、フロントが起動しない場合は一度ボリュームを消して再作成してください:
```bash
docker compose down -v
docker compose up --build
```

- フロントエンド: `http://localhost:5173`
- バックエンド: `http://localhost:8000`

停止:
```bash
docker compose down
```

### 1. リポジトリのクローン
```bash
git clone https://github.com/uiux-group3/chatapp.git
cd chatapp
```

### 2. バックエンドのセットアップ
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### 環境変数の設定
`backend` ディレクトリに `.env` ファイルを作成し、APIキーを設定してください。（テンプレート: `.env_sample`）
```env
GEMINI_API_KEY=your_api_key_here
```

起動:
```bash
fastapi dev main.py --port 8000
```
これにて `http://localhost:8000` でバックエンドが起動します。

### 3. フロントエンドのセットアップ
新しいターミナルを開いて実行してください:
```bash
cd frontend
npm install
npm run dev
```
これにて `http://localhost:5173` でアプリが起動します。

## ライセンス
All rights reserved.
