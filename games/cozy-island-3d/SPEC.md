# 《森友小島 3D：微風生活》— 開發規格與交接文件（Arcade Hub Edition）

> 本文件記錄《森友小島 3D》（`games/cozy-island-3d/`）的核心設計定案、模組架構、已完成里程碑（Week 1–7）與下一階段（Week 8）交接重點，方便任何帳號或開發者直接接手。

---

## 1. 核心定案與美術規範（Locked Decisions）

| 面向 | 定案方案 |
| :--- | :--- |
| **專案歸屬** | 收錄於 `arcade-hub`（`games/cozy-island-3d/`），於大廳 `index.html` 註冊為 **GAME #09**（`cozy_island_3d`），沿用 Cloudflare Workers Static Assets 零建置部署 |
| **技術架構** | **零建置純 ES Modules + 本機封裝 Three.js**（`vendor/three.module.min.js`），零外部 CDN 依賴 |
| **3D 美術風格** | **嚴格霧面繪本風（Storybook Matte）**：所有角色、建築、地形與家具皆使用高 roughness 霧面材質（透過 `proceduralAssets.js` 的 `makeCozyMaterial` 建立）與接地陰影，**禁止塑膠亮面反光** |
| **視角與地表** | 經典動森斜俯 3/4 視角（3 段遠近切換）＋ 招牌**圓筒弧面地表（Rolling-Log Shader）**，上帝視角佈置與室內模式自動平滑拉平 |
| **時間與季節** | 預設同步現實時間與季節，支援切換「加速日夜（24 分鐘一天）」、時段跳轉與春夏秋冬 4 季切換 |
| **大廳與存檔** | 完整整合 `../../shared/arcade-sso.js`（`ArcadeSSO` 依帳號隔離存檔、JSON 匯出匯入、大廳圖鑑與星等同步、幸運轉盤與全站獎盃室金幣連動） |
| **音效與音景** | 純 Web Audio API：24 小時 6 段變奏 BGM＋細雨爵士、海風／雨聲底噪、白天鳥鳴／夜晚蟲唧、Animalese 擬聲語音與全套互動／快門 SFX |
| **裝置與操控** | 桌機 WASD／滑鼠＋快捷鍵；手機左下虛擬搖桿＋右下情境按鈕 |

---

## 2. 模組目錄總覽

```text
games/cozy-island-3d/
├── index.html                  # 遊戲入口、響應式 HUD、背包/商店/DIY/住民/圖鑑/博物館/拍照模式 UI
├── SPEC.md                     # 本開發規格與交接文件
├── css/style.css               # 奶油粉彩療癒介面、響應式與拍照模式樣式
├── vendor/three.module.min.js  # 本機封裝 Three.js ESM
├── data/
│   ├── island-data.json        # 4 位住民性格、作息排程、語料、每日小委託模板
│   ├── items.json              # 家具、素材與里程兌換限定物品目錄
│   ├── creatures.json          # 32 種生物與化石目錄（12 魚／12 蟲／8 化石）
│   └── recipes.json            # 15 款 DIY 藍圖（含 4 款住民稀有藍圖）
└── js/
    ├── config.js               # 島嶼尺寸、四季色票、3 段攝影機參數、滾筒曲率設定
    ├── rollingShader.js        # Three.js onBeforeCompile 圓筒弧面世界著色器注入
    ├── timeWeather.js          # 日夜光影、天空漸層、星空、微風花瓣／雨滴與夜晚螢火蟲粒子
    ├── proceduralAssets.js     # 霧面 3D 主角、4 動物住民、樹花岩、3 階段小屋與博物館、全套家具模型
    ├── islandWorld.js          # 48×48 小島地形、海洋、河川、二層高地斜坡、碰撞與互動點查詢
    ├── inventorySystem.js      # 20 格可堆疊隨身背包
    ├── buildSystem.js          # 上帝視角 3D 網格佈置、光線投射預覽、90° 旋轉與小徑鋪設
    ├── gatheringSystem.js      # 5 大採集工具（釣魚狀態機、捕蟲、輕巧斧、鏟子挖化石敲石、澆花壺）
    ├── economySystem.js        # 雜貨店每日輪替商品、今日高價 ×1.5 收購、批量 DIY 與房屋擴建
    ├── indoorScene.js          # 獨立 3D 小屋室內場景與 3 階段空間擴建（6×6 → 8×8 → 10×10 壁爐大屋）
    ├── villagerSystem.js       # 4 住民好感度 Lv.1–Lv.5、送禮回饋、每日小委託與稀有藍圖解鎖
    ├── collectionSystem.js     # 32 種生物圖鑑、博物館捐贈＆3 階進化、每日 4 項里程目標與兌換商店
    ├── inputManager.js         # 鍵盤滑鼠與手機虛擬搖桿統一輸入層
    ├── audioEngine.js          # Web Audio 24H 6 段變奏 BGM、自然環境音、擬聲語音與 SFX
    ├── saveManager.js          # ArcadeSSO 整合、自動存檔與大廳數據同步
    └── main.js                 # 主迴圈、角色動畫與拍照姿勢、介面控制器與明信片 PNG 匯出
```

---

## 3. 8 週開發里程碑進度

| 週次 | 里程碑 | 狀態 | 核心交付 |
| :---: | :--- | :---: | :--- |
| **Week 1** | **3D 弧面小島漫步原型** | **✅ 已完成** | `48×48` 3D 霧面小島、滾筒弧面 Shader、3 段視角、日夜天氣、Web Audio BGM、桌機＋手機操控、`arcade-hub` SSO 整合 |
| **Week 2** | **3D 網格佈置與背包存檔** | **✅ 已完成** | 20 格背包、11 款戶外霧面家具、面朝擺放＋上帝視角 3D 網格編輯、3 種小徑、自動存檔與 JSON 匯出匯入 |
| **Week 3** | **三大採集核心手感** | **✅ 已完成** | 5 大採集工具（1~6 快捷鍵）、釣魚狀態機、3D 飛舞／草地捕蟲（12 魚／12 蟲／8 化石）、伐木採礦挖化石與 NEW 橫幅 |
| **Week 4** | **經濟、批量 DIY 與小屋室內** | **✅ 已完成** | 雜貨店每日輪替＋今日高價 ×1.5、批量 DIY 工作台、5 款室內家具、獨立 3D 小屋室內場景與 3 階段房屋擴建 |
| **Week 5** | **4 位動物住民深化系統** | **✅ 已完成** | 4 位不同性格與耳型動物住民（蜜桃／阿福／露比／巴魯）、5 時段作息、對話送禮好感度 Lv.1–5、每日委託與 4 款稀有藍圖 |
| **Week 6** | **圖鑑、博物館與每日里程** | **✅ 已完成** | 32 種生物圖鑑（M 鍵）、高地博物館一鍵捐贈與 3 階段 3D 進化（帳篷→磚瓦→圓頂）、每日 4 項里程目標、紅點提醒與兌換商店 |
| **Week 7** | **音景擴充與手感打磨** | **✅ 已完成** | 24 小時 6 段變奏 BGM＋鳥鳴蟲唧環境音、夜晚螢火蟲粒子、全功能明信片拍照模式（P 鍵、360° 環繞縮放、5 濾鏡、4 姿勢、PNG 下載） |
| **Week 8** | **行動端與效能最終調校** | **⏭️ 待展開** | `InstancedMesh` 批處理優化（地形磚／花叢／樹冠降 draw calls）、行動端觸控與小螢幕 HUD 排版微調、跨帳號 SSO 備份完整驗收 |

---

## 4. 新帳號接手快速檢查清單

1. **零建置原則**：不引入 Vite／Webpack／npm build，保持靜態檔案直接由瀏覽器載入 ES Modules。
2. **語法與端對端驗證**：修改 `js/*.js` 後可用 `node --check` 檢查語法，並以本機靜態伺服器搭配 Playwright 驗證無 console/page error。
3. **視覺規範**：新增 3D 物件務必維持霧面低光澤與接地陰影，並保持 `rollingShader.js` 弧面彎曲一致注入。
