# 🎮 Dell 設計的遊戲綜合區 · Arcade Hub

單一 Google 帳號登入（SSO）即可暢玩全站 4 款 3D 網頁遊戲的模組化遊戲綜合平台（零外部框架依賴、純原生 WebGL / 3D Canvas + 即時合成音效與 BGM、完整支援電腦鍵盤與手機觸控）。

## 🕹️ 收錄遊戲（全 4 款皆可即時遊玩）

1. **🏔️《無盡峽谷 3D：極限跑酷》** (`games/canyon-parkour-3d/index.html`)
   - 純 WebGL 3D 引擎 + 5 大動態日夜光影峽谷 + 5 首場景原創合成 BGM
   - 8 位可解鎖 3D 角色（含 **竈門炭治郎**、**宵崎奏** 與各自專屬 3D 主動大招）
   - 強力道具、彈跳墊、連擊 Combo、極限閃避、空中魔王戰、任務成就、光影分身競速與無盡極速模式
2. **🚀《星際彈幕射擊 3D》** (`games/star-blaster-3d/index.html`)
   - 3D 星雲曲速星空與 3D 傾斜戰機、Roguelike 過關三選一模組（多向電漿、追蹤飛彈、超新星清屏）
   - 4 架可解鎖 3D 戰機與巨型星系母艦 BOSS 戰
3. **🧩《霓虹立體方塊》** (`games/neon-blocks-3d/index.html`)
   - 3D 立體斜角霓虹方塊、Hold 暫存、落點幽靈預覽、雷射瞬落、連消 Combo 粒子特效與合成節奏 BGM
   - 支援無盡馬拉松與 2 分鐘極速衝分雙模式 + 4 款可解鎖霓虹主題
4. **🏎️《峽谷極速漂移 3D》** (`games/canyon-drift-3d/index.html`)
   - 峽谷宇宙 5 大主題彎道 3D 透視公路賽車、飄移噴火花集氣、氮氣爆發、擦身超車連擊與檢查點延時挑戰
   - 4 台可解鎖 3D 超跑與 Eurobeat 合成漂移 BGM

## 🔐 全站單一登入（SSO）

- 全站共用 `shared/arcade-sso.js`（`localStorage` + `postMessage` 即時雙向同步），**登入一次即可暢玩全部 4 款遊戲**。
- 支援 **Google Identity Services (GIS) OAuth 2.0** 與免設定快速 Google 帳號，並提供跨遊戲 JSON 一鍵匯出 / 還原備份。

## ☁️ 部署（Cloudflare Workers Static Assets）

已內建 `wrangler.toml`（`[assets] directory = "."` + `workers_dev = true`）、`.assetsignore` 與 `_headers`（含 `Cross-Origin-Opener-Policy: same-origin-allow-popups` 支援 Google OAuth 彈窗），每次推送至 `main` 分支即自動上線！
