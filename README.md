# 🎲🧩 Pico Neo3 VR 游戏合集

适配 **Pico Neo3** VR 头盔的 WebXR 网页游戏，三种交付形态按需选择：

| 形态 | 产物 | 何时用 |
|------|------|--------|
| 📡 局域网 WebXR | `node server.mjs` → `https://<IP>:8443/`（拼图）、`https://<IP>:8443/rw/`（随机游走） | 开发迭代最快（改完刷新即生效），需要电脑开机 |
| 📄 单文件离线版 | `dist/随机游走VR-离线版.html`（0.69 MB）、`dist/3D拼图VR-离线版.html`（0.70 MB） | 拷进头盔存储，浏览器直接打开 `file://`，零服务器 |
| 📦 APK | `dist/随机游走VR.apk`（0.2 MB）、`dist/3D拼图VR.apk`（0.2 MB） | 装进头盔像 App 一样点开：内置本地服务（127.0.0.1:8899 / :8898）+ 自动拉起浏览器，完全离线 |

| 游戏 | 玩法 |
|------|------|
| 🎲 [随机游走 VR](public/rw/index.html) | 词节点星座间行走，步数内抵达 1024（1024 程序员节彩蛋的 3D VR 化） |
| 🧩 3D 拼图 VR | 抓取 3D 碎片拼回完整模型，自动吸附；8 个模型 × 2/3/4 块 |

## 📦 APK 与离线版说明

- **单文件离线版**：`node tools\make-offline.mjs` 生成。three.js r160 + VRButton +
  全部游戏模块内联为一个 HTML。桌面 Chrome `file://` 下已验证完整可玩、
  `navigator.xr` 存在（`file://` 属安全上下文）；**Pico 浏览器对 file:// 的
  WebXR 支持需真机确认**，若 ENTER VR 按钮不出现，改用 APK 版。
- **APK 壳**：`tools\build-apk.ps1` 一键构建（aapt2 → javac → d8 → zipalign →
  apksigner，无需 Gradle）。原理：应用启动时把内置 `assets/game/index.html`
  拷到私有目录，在 **127.0.0.1:8899** 起一个微型 HTTP 服务（loopback 是
  W3C「潜在可信来源」，Chromium 系必然暴露 WebXR），再自动拉起头显浏览器。
  首次安装会提示「未知来源应用」，在 Pico 设置 → 安全 中允许即可。
- **构建环境**（`android-sdk/`，本项目目录内自足）：cmdline-tools 12、
  platform-tools（adb）、platforms;android-33、build-tools;33.0.2，
  用 `sdkmanager` 装；另需 JDK 17（本机已有）。
- **安装**：头盔开启 USB 调试并连电脑后
  `android-sdk\platform-tools\adb.exe install -r "dist\随机游走VR.apk"`，
  或把 APK 拷进头盔用文件管理器点击安装。

## 🎲 随机游走 VR · 玩法

原版是 [网页小游戏「随机游走 · 标记独属于你的思想路径」](https://brave-ember-6c17.page.stepcloud.com/)
（1024 程序员节彩蛋），本作将其 3D 化：

- **场景**：词节点悬浮成星空星座，墨线连边，目标「1024」有金色光柱信标；
- **走子**：手柄射线瞄准带**脉冲光环**的相邻节点，扣扳机即**滑翔**过去；
- **规则**：从朱砂「出发」走到赤金「1024」，每步耗一步数；沿途词被收录进
  「思想路径」，终点/耗尽后生成路径诗 + 一言（哲思/极客/古风/清醒/科幻）+ 成就；
- **难度**：悠然 16 步 / 标准 12 步 / 紧绷 9 步（旁支词节点数量随难度增加）；
- **皮肤**：墨 / 朱砂 / 青瓷 三套配色（记录在浏览器里）；
- **音色**：木鱼 / 电子 / 风铃，五声音阶步进旋律（WebAudio 程序化合成）；
- **彩蛋**：连点标题七次 → 解除步数限制；键盘敲出 `1024` → 加分 + 闪光。

VR 内无 DOM：引导态扣扳机直接开局；结算面板悬浮在视线前方，射线点「再来一局」。

测试：`node test\rw-e2e.mjs`（21 项端到端）· `node test\rw-perf.mjs`（6x 限速性能）

---

# 🧩 Pico Neo3 3D 拼图 VR

一个适配 **Pico Neo3** VR 头盔的 3D 拼图游戏（WebXR 网页版）。把散落的 3D 模型
碎片抓起来，拼回斜坡上方的蓝色虚影——全部归位即胜利。

无需安装任何 App：**头盔打开浏览器、输入网址、进入 VR**，即开即玩。

## 🚀 快速开始

### 1. 启动服务器（电脑上）

```powershell
node server.mjs
```

首次启动前需一次性生成证书（本项目已生成好，位于 `cert/`；若要重新生成）：

```powershell
& 'C:\Program Files\Git\usr\bin\openssl.exe' req -x509 -newkey rsa:2048 `
  -keyout cert\key.pem -out cert\cert.pem -days 3650 -nodes `
  -subj '//CN=localhost' `
  -addext 'subjectAltName=DNS:localhost,IP:<你的局域网IP>'
```

### 2. 头盔访问

1. 确认头盔与电脑在**同一 Wi-Fi**；
2. **（推荐，一次即可）安装 CA 证书实现零警告**：
   - 头盔浏览器打开 `http://<电脑IP>:8081/ca.crt` 下载证书
     （电脑 IP 见服务器启动时打印的「CA 证书下载」行）；
   - Pico 设置 → 安全 → 从存储安装证书（不同系统版本入口名略有差异，
     关键词「证书」），选中下载的 `pico3d-ca.crt` 安装并命名（如 pico3d）；
   - 安装后访问 HTTPS 地址不再有任何警告。
   - PC 端调试（可选）：`certutil -user -addstore Root <项目路径>\cert\ca.crt`，
     弹窗点"是"。
3. 打开 Pico 浏览器，访问服务器启动时打印的地址，例如：
   `https://192.168.31.135:8443/`
4. 未安装 CA 时的警告页：点 **高级 → 仍要继续**（局域网自签 CA，正常现象）；
5. 页面上点 **ENTER VR** 按钮，戴上头盔开始游戏。

> 说明：WebXR 必须在 HTTPS（安全上下文）下才会暴露 `navigator.xr`，
> 所以本地服务器用本地 CA 签发的证书提供 HTTPS。`http://<IP>:8081/`
> 提供 CA 下载与 https 地址引导。证书由 `make-cert.mjs` 自动生成
> （SAN 自动覆盖全部本机 IP；换网络后重跑一次即可）。

### 3. 玩法

| 操作 | 方式 |
|------|------|
| 抓取碎片 | 手柄对准碎片，扣动扳机（双手可各抓一块） |
| 移动碎片 | 握着走动 / 手臂移动 |
| 旋转拼片 | 抓取时推动摇杆：左右 = 水平旋转，上下 = 俯仰（精细对齐用） |
| 放下碎片 | 松开扳机 |
| 自动吸附 | 碎片位置和朝向都接近虚影中它的目标位姿时，松手即平滑吸附 |
| 打开/关闭菜单 | 空手按握键（squeeze）；菜单跟随视线，扳机射线点击 |
| 找回碎片 | 拿着碎片按握键 → 送回散落点 |
| 提示 | 菜单里的「提示」按钮；或卡住 25 秒自动提示（光柱 + 虚影高亮） |
| 音乐 | 2D 右下角按钮，或 VR 菜单「音乐」；开关与音量记忆在本地 |
| 胜利 | 全部碎片归位，虚影点亮，弹出星级与最佳记录 |

**成长系统**：8 模型 × 2/3/4 块 = **24 关**，成绩（星级/最佳时间/游玩次数）
保存在头盔本地（localStorage，无需联网）；难度菜单显示每档已通关数 ⭐ x/8。

难度：**2 块（入门）/ 3 块（进阶）/ 4 块（挑战）**，8 个模型任选：
🚀 小火箭 · 🍄 蘑菇屋 · 💎 宝石星球 · 🏰 梦幻城堡 · 🐧 软萌企鹅 · 🎁 礼物盒子 · 🚗 迷你赛车 · 🎄 圣诞树。

## 🏗️ 技术实现

```
server.mjs            零依赖 Node HTTPS 静态服务器（内置模块实现）
tools/
  make-offline.mjs    单文件离线版打包（three/VRButton/游戏模块内联 HTML）
  make-icons.mjs      APK 启动图标生成（纯 Node PNG 编码）
  build-apk.ps1       APK 一键构建（aapt2+javac+d8+zipalign+apksigner，无 Gradle）
public/
  index.html          【拼图】引导页 / 难度选择 / HUD / 胜利面板
  rw/                 【随机游走 VR】独立子站（见上文玩法说明）
    index.html        引导页 / HUD / 结算海报 / 彩蛋
    rw.css            界面样式
    js/data.mjs       词库 / 一言 / 皮肤 / 音色 / 成就 / 难度
    js/graph.mjs      词图生成：主干保证可达 + 相对邻居图旁支（每局随机）
    js/audio.mjs      WebAudio 程序化音效（五声音阶步进旋律，零音频文件）
    js/main.mjs       Three.js r160 场景 / 射线走子 / 滑翔 / VR HUD 与结算面板
  js/                 【拼图】models.mjs / puzzle.mjs / main.js / sfx.mjs
  vendor/
    three.module.min.js, VRButton.js   本地化依赖（运行时零外网请求）
cert/                 自签名 HTTPS 证书（SAN 含局域网 IP，10 年有效）
test/
  rw-e2e.mjs          【随机游走】21 项端到端（流程/连通性/彩蛋/结算/渲染）
  rw-offline-e2e.mjs  【随机游走】离线单文件版 file:// 端到端 + WebXR 接口探测
  rw-perf.mjs         【随机游走】6x CPU 限速性能实测（开局/帧率/重开）
  run-tests.mjs       【拼图】切割引擎单元测试（水密性 + 体积守恒，48 项）
  fuzz-tests.mjs      【拼图】模糊测试（200 轮随机调用/噪声输入/双重水密校验）
  regression.mjs      【拼图】回归基线（9 组合结构指纹；--capture 重建）
  e2e-*.mjs           【拼图】无头浏览器端到端验证（CDP 协议）
  perf-browser.mjs    【拼图】浏览器性能实测（6x CPU 限速模拟移动芯片）
  debug-*.mjs         各类故障诊断脚本（开发期使用，保留作记录）
```

**3D 切割引擎**（`puzzle.mjs`）是本项目的核心：

- 模型网格沿轴对齐平面**真实切开**（不是假装分离）：跨面三角形按交线拆分，
  交点按边端点对去重保证两侧共享（无裂缝、无 T 型连接）；
- 每次切割后两侧立即补上平面封盖（边界闭环行走 + 耳切三角化），中间块的
  封盖会被后续切割干净地剖分；
- 运行时断言保证正确性：每块拼片输出前都做**有向边普查**
  （每条有向边恰出现一次且有反向配对 = watertight）；
- 单元测试同时验证**体积守恒**：拼片体积之和与原模型体积误差 < 0.001%。

## 🧪 运行测试

```powershell
node test\rw-e2e.mjs              # 随机游走 21 项端到端
node test\rw-perf.mjs             # 随机游走 6x 限速性能
node test\run-tests.mjs          # 拼图 48 项单元测试
node test\fuzz-tests.mjs         # 拼图模糊测试 + 性能基线
node test\regression.mjs         # 拼图回归基线检查（--capture 重建）
node test\e2e-comprehensive.mjs  # 需先启动服务器；拼图 15 项端到端
node test\perf-browser.mjs       # 拼图浏览器性能实测（6x 限速）
```

随机游走 VR 性能实测（6x CPU 限速 ≈ Snapdragon XR2）：开局 758ms，渲染 65fps，
重开一局 167ms —— 满足 Pico Neo3（72Hz 面板）流畅标准。

性能实测（6x CPU 限速 ≈ Snapdragon XR2）：首次切割 553ms，渲染 89.6fps，
重开一局 13.6ms —— 满足 Pico Neo3（72Hz 面板）流畅标准。

### 游戏功能

- **VR 内菜单**：游戏中扣扳机（未瞄准碎片时）打开 3D 菜单，手柄射线点选
  模型/块数/开始，无需摘下头盔；
- **物理下落**：松手未吸附的碎片自由下落、在斜坡上弹跳静止（音效伴随）；
- **找回碎片**：握住手柄侧键（squeeze）把面前的碎片送回散落点；
- **音效反馈**：抓取/放下/落地/吸附/胜利/界面点击，WebAudio 程序化合成，
  零音频文件。

## ❓ 常见问题

- **没有 ENTER VR 按钮**：确认地址是 `https://`（不是 http）；
  旧版 Pico 浏览器需在设置里允许 WebXR。
- **出现 ERR_CERT_INVALID 且没有"继续前往"按钮**：证书结构损坏（旧版 bug），
  重跑 `node make-cert.mjs` 重新生成即可。
- **出现 ERR_CERT_AUTHORITY_INVALID**：正常警告（CA 未安装），点
  「高级 → 仍要继续」可玩；按上文步骤安装 CA 后消失。
- **碎片抓不住**：手柄对准碎片 0.85m 以内再扣扳机；碎片离身体太远就走过去。
- **换了 Wi-Fi 访问不了**：服务器启动时会打印当前 IP；IP 变了就重跑
  `node make-cert.mjs` 并重启服务器（SAN 自动覆盖新 IP）。
- **端口被占用**：`server.mjs` 顶部可用环境变量 `PORT` / `HTTP_PORT` 改端口。

## 📝 已知限制

- 碎片抓取采用"贴合手柄"模式（拼片中心即抓点），不支持捏点微调；
- 切割方式为固定平面表（每种模型 × 块数一套切口），随机切口需要引入
  任意平面切割（工程量大，当前版本未做）；
- 桌面模式（无 VR）只能预览，抓取需进 VR 用手柄。

## 🧩 3D 拼图 VR · 三种形态

| 形态 | 产物 | 用法 |
|------|------|------|
| 📡 局域网 WebXR | `node server.mjs` → `https://<IP>:8443/` | 电脑同 Wi-Fi 下头盔浏览器访问；装过 CA 则零警告，否则点「高级→仍要继续」 |
| 📄 单文件离线版 | `dist/3D拼图VR-离线版.html`（720 KB） | 拷进头盔存储，用浏览器打开 `file://`；零服务器零网络 |
| 📦 APK | `dist/3D拼图VR.apk`（209 KB） | 装进头盔点开即玩；内置 127.0.0.1:8898 微型服务 + 自动拉起浏览器 |

### 构建与测试

```powershell
# 离线单文件（内联 three.js r160 + VRButton + models/puzzle/sfx/main）
node tools\make-offline-puzzle.mjs
node test\offline-e2e.mjs        # 9 项：零外部请求 / THREE 内联 / file:// 安全上下文 / 完整一局

# APK（复用 android-sdk\，无 Gradle 流水线，与随机游走 VR 完全隔离：
#      包名 com.pico3d.puzzle、端口 8898、独立 keystore 与图标）
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-apk-puzzle.ps1
node test\apk-serve-e2e.mjs      # 从 APK 提取资产 → 按 Java 同款路由伺服 → 真实 Chrome 验证
```

`test\apk-serve-e2e.mjs` 验证的是 APK 方案的核心前提：**loopback 明文 HTTP 属于
W3C「潜在可信来源」，Chromium 系必然暴露 `navigator.xr`**（实测 isSecureContext=true、
无任何证书豁免、完整一局可玩）。这也是为什么 APK 形态完全不需要 HTTPS 证书。

### 安装

```powershell
# 头盔开启「USB 调试」并授权后：
android-sdk\platform-tools\adb.exe install -r "dist\3D拼图VR.apk"
```
也可以把 APK 拷进头盔，用文件管理器点击安装（首次需在 设置→安全 允许「未知来源」）。

### 真机验证要点（本机无法替代的部分）

1. **file:// 离线版**：Pico 浏览器打开后是否有 ENTER VR 按钮（桌面 Chrome 实测有；
   若头显上没有，请直接用 APK 形态）；
2. **APK**：启动后浏览器是否自动打开（未自动打开则手动访问 `http://127.0.0.1:8898/`）；
3. **长时间游玩**：APK 已内置**前台服务保活**（`KeepAliveService`，常驻通知提升进程优先级），
   浏览器切前台后本地服务不会因后台回收而消失；若个别固件仍杀进程，重开 App 即可恢复
   （启动画面会提示"服务随本应用运行"）。

### 建模与视觉（8 模型 / 精修几何）

**模型清单**（`public/js/models.mjs`，全部程序化生成、零外部模型文件）：

| 模型 | 图元构成（封闭壳数量） |
|------|------------------------|
| 🚀 小火箭 | 锥体头/机身/双层尾焰/舷窗/铆钉/三尾翼（21 壳） |
| 🍄 蘑菇屋 | 菌盖+6 圈斑点/菌柄/门窗/烟囱+炊烟/草丛/小花（28 壳） |
| 💎 宝石星球 | 棱面核心/8 根尖刺+晶粒/双环/3 月亮/漂浮晶簇（44 壳） |
| 🏰 梦幻城堡 | 城墙+城垛/四角塔楼/主塔/旗帜/城门/窗（34 壳） |
| 🐧 软萌企鹅 | 身体/肚皮/头/眼睛+瞳孔/腮红/翅膀/脚/尾巴（16 壳） |
| 🎁 礼物盒子 | 盒身/盒盖/十字丝带/蝴蝶结/饰球（13 壳） |
| 🚗 迷你赛车 | 底盘/座舱/车窗/四轮+轮毂/车灯/保险杠（19 壳） |
| 🎄 圣诞树 | 三层树冠/树干/树顶星/14 彩球/雪堆（25 壳） |

**切割平面自动标定**：`node tools/calibrate-cuts.mjs` 会为每个模型 × 2/3/4 块
自动搜索安全平面（在顶点坐标间隙内取候选 → DFS 搜索 → 水密+体积守恒双重校验 →
写回 `puzzle.mjs` 标记区）。新增模型/调几何后重跑一次即可，无需人工试平面。

**视觉与音频特性**（全部零外部素材）：
- 程序化环境光照（等距柱状渐变 → PMREM IBL），金属质感更真实；
- 星空背景（900 点粒子）、轻微景深雾、背侧紫色轮廓光；
- 每块碎片的柔和投影贴地（随碎片移动）；
- 吸附成功时的青色扩散光环 + 音效；胜利彩带粒子爆发；
- 虚影呼吸浮动 + 缓慢摇摆；
- **画质自适应**：每 2 秒采样帧率，低于 58fps 连续两次自动降级（像素比 2→1.25→1、
  关星空），稳定高于 70fps 再逐级升回，保证 Pico Neo3 的 72Hz 稳定；
- **程序化背景音乐**：Am-F-C-G 缓慢和弦 Pad（WebAudio 实时合成，带呼吸 LFO），
  2D 按钮 / VR 菜单「音乐」开关，音量与开关存本地。

**测试覆盖**（全部模型自动纳入）：
- `node test/run-tests.mjs`：8 模型 × 3 块数 × 每片水密/体积为正/守恒/幂等 = **152 项**；
- `node test/plane-fuzz.mjs`：随机轴对齐平面压测（成功必须水密守恒，拒绝属预期保护）；
- `node test/regression.mjs`：24 组结构指纹基线；
- `node test/e2e-comprehensive.mjs`：24 种组合建局 + 提示/摇杆/菜单跟随/抓取偏移/
  画质分级/音乐开关/物理/吸附/胜利/进度 = **39 项**端到端。
