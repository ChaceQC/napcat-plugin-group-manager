# 🛡️ NapCat 群管插件 (napcat-plugin-group-manager)

**napcat-plugin-group-manager** 是一款专为 NapCat (OneBot 11) 设计的轻量级、功能全面的群组管理插件。它集成了**入群欢迎**、**违禁词过滤**以及便捷的**管理员命令**，支持通过 WebUI 进行可视化配置。

## ✨ 主要功能

* **👋 入群欢迎**：新成员进群时自动发送自定义欢迎语，支持 `@` 成员。
* **🚫 违禁词过滤**：实时监控群消息，检测到敏感词自动撤回，并可配置自动禁言或踢出。
* **⚡ 管理员命令**：通过简单的指令快速执行踢人、禁言、全员禁言等操作。
* **⚙️ WebUI 配置**：完全可视化的配置界面，无需修改代码即可实时调整设置。

---

## 📁 项目结构

确保您的项目文件结构如下（注意 `package.json` 的位置）：

```text
napcat-plugin-group-manager/
├── package.json              # 必须位于插件根目录
├── tsconfig.json
├── vite.config.ts
├── README.md                 # 本文件
└── src/
    ├── index.ts              # 插件入口
    ├── config.ts             # 配置管理
    ├── handlers.ts           # 业务逻辑
    └── types.ts              # 类型定义
```

---

## 📥 安装与部署

### 1. 构建插件
在插件项目根目录下打开终端，执行以下命令安装依赖并构建：

```bash
# 安装依赖
npm install

# 构建 (生成 dist 目录)
npm run build
```

构建成功后，根目录下会生成 `dist` 文件夹，其中包含 `index.mjs`。

### 2. 安装到 NapCat
将整个 `napcat-plugin-group-manager` 文件夹（包含 `package.json` 和 `dist` 目录）复制到 NapCat 的 `plugins` 目录下。

**正确的目录路径示例：**
`NapCat/plugins/napcat-plugin-group-manager/package.json`

### 3. 启动
重启 NapCat。如果在日志中看到以下信息，说明加载成功：
```text
[INFO] Group Manager Plugin Loading...
[INFO] 配置已加载
[INFO] Group Manager Plugin Loaded!
```

---

## ⚙️ 配置说明 (WebUI)

启动 NapCat 后，访问 WebUI 界面，进入 **插件管理** -> **NapCat 群管插件** 即可看到配置面板。

### 👋 入群欢迎设置
| 配置项 | 说明 | 默认值 |
| :--- | :--- | :--- |
| **启用入群欢迎** | 开关，开启后新成员进群将触发欢迎消息。 | 开启 |
| **欢迎语模板** | 设置欢迎内容。支持变量：<br>`{nickname}`: 成员昵称<br>`{user_id}`: 成员QQ号 | `欢迎 {nickname}({user_id}) 加入本群！` |

### 🚫 违禁词过滤设置
| 配置项 | 说明 | 默认值 |
| :--- | :--- | :--- |
| **启用关键词过滤** | 开关，开启后将监控所有群消息。 | 关闭 |
| **违禁词列表** | 设置需要过滤的关键词，使用竖线 `|` 分隔多个词。<br>例如：`兼职|博彩|加群` | `加群|兼职|博彩` |
| **触发惩罚** | 检测到违禁词后的额外操作：<br>1. **仅撤回**：只撤回消息，不惩罚。<br>2. **撤回并禁言1分钟**：小惩大诫。<br>3. **撤回并踢出**：直接移除群聊。 | 仅撤回 |

> **提示**：配置修改后点击保存即可生效，无需重启。

---

## 💻 管理员指令列表

**注意**：只有群主 (`Owner`) 和管理员 (`Admin`) 可以在群内触发以下指令。

| 指令格式 | 说明 | 示例 |
| :--- | :--- | :--- |
| **/kick @成员** | 将指定成员踢出群聊。 | `/kick @某人` |
| **/ban @成员 [秒数]** | 禁言指定成员。秒数可选，默认为 600秒 (10分钟)。 | `/ban @某人 300` (禁言5分钟) |
| **/unban @成员** | 解除指定成员的禁言状态。 | `/unban @某人` |
| **/muteall** | 开启**全员禁言**。 | `/muteall` |
| **/unmuteall** | 关闭**全员禁言**。 | `/unmuteall` |

---

## ❓ 常见问题 (FAQ)

### Q1: 插件无法启动，提示 "Directory does not contain a valid plugin"？
**A:** 请检查文件夹结构。NapCat 要求 `package.json` 必须直接位于插件文件夹的一级目录下，且 `package.json` 中的 `main` 字段必须指向存在的 `dist/index.mjs` 文件。

### Q2: 使用命令时后台报错 "No data returned"？
**A:** 这是正常现象。部分 OneBot API（如禁言、撤回）在执行成功后不会返回数据，导致 NapCat 误报错误。插件内部已对该情况做了兼容处理，只要命令实际生效，请忽略该警告。

### Q3: 保存配置时报错 "ENOENT: no such file or directory"？
**A:** 请确保使用的是最新版本的插件代码（v1.0.1+）。旧版本未自动创建配置目录，新版本已修复此问题，会自动创建 `data/` 目录。

---

## 📝 开发信息

* **版本**: 1.0.3
* **适配器**: OneBot 11 (NapCat)
* **语言**: TypeScript
* **构建工具**: Vite
