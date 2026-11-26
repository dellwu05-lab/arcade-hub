# 🎮 遊戲綜合區 · Arcade Hub

單一 Google 帳號登入（SSO）即可暢玩全站 3D 網頁遊戲的模組化遊戲綜合平台（零外部框架依賴、支援電腦鍵盤與手機觸控）。

## 🕹️ 目前收錄遊戲

1. **《無盡峽谷 3D：極限跑酷》** (`games/canyon-parkour-3d/index.html`)
   - 純 WebGL 3D 引擎 + 即時程式合成音效與 5 大場景原創 BGM
   - 5 大動態日夜光影 3D 峽谷（黃金正午 → 落日餘暉 → 星夜 → 晨曦）
   - 8 位可解鎖 3D 角色（含 **竈門炭治郎**、**宵崎奏** 與各自專屬 3D 主動大招）
   - 磁鐵 / 無敵衝刺 / 雙倍積分 / 3D 彈跳墊 / 連擊 Combo / 極限閃避 / 空中魔王戰 / 任務成就 / 光影分身競速 / 無盡極速模式
2. **後續遊戲擴充槽**（`GAME #02 ~ #04`）：只需新增遊戲目錄並於 `index.html` 的 `GAMES_REGISTRY` 註冊即可自動共用同一個 Google 帳號。

## 🔐 帳號單一登入（SSO）

- 全站共用 `shared/arcade-sso.js`（`localStorage` + `postMessage` 雙向即時同步）。
- 支援 **Google Identity Services (GIS) OAuth 2.0**（於正式 HTTPS 網域輸入 Google Cloud OAuth Client ID 即可啟用）以及免設定的本機快速登入。
- 各遊戲存檔依帳號 UID 自動隔離，並支援全站 JSON 一鍵匯出 / 還原。

## ☁️ 部署至 Cloudflare Pages

本專案為純靜態網頁（無需任何建置步驟 `Build command` 留空即可），支援以下兩種部署方式：

### 方式一：Cloudflare Dashboard 直接連接 GitHub（推薦，最簡單）
1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左側點選 **Workers & Pages** → **Create** → 切換至 **Pages** 分頁 → **Connect to Git**。
2. 授權並選擇本倉庫（`arcade-hub`）。
3. 建置設定保持極簡：
   - **Production branch**：`main`
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`.`（或留空）
4. 點擊 **Save and Deploy**，約 30 秒即可獲得 `https://arcade-hub.pages.dev` 正式網址，未來每次 Push 都會自動重新部署！

### 方式二：GitHub Actions 自動部署
本倉庫已內建 `.github/workflows/deploy-cloudflare-pages.yml`。若偏好由 GitHub Actions 推送：
1. 至 GitHub 倉庫 **Settings → Secrets and variables → Actions** 新增兩組 Secret：
   - `CLOUDFLARE_API_TOKEN`（需具 `Cloudflare Pages: Edit` 權限）
   - `CLOUDFLARE_ACCOUNT_ID`（Cloudflare Dashboard 右側欄可複製）
2. 手動觸發 workflow 或推送至 `main` 分支即可自動部署。

### 🔑 啟用真實 Google OAuth 2.0 登入
部署完成取得 `https://<your-site>.pages.dev` 後：
1. 前往 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 建立「OAuth 2.0 用戶端 ID（網頁應用程式）」。
2. 將 `https://<your-site>.pages.dev` 加入「已授權的 JavaScript 來源」。
3. 打開遊戲綜合區 → 點擊「Google 登入」→ 展開「⚙️ 設定真實 Google OAuth Client ID」貼上儲存即可！
