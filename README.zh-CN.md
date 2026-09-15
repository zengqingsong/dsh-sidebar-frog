# 弹出式侧边栏 · dsh-sidebar-frog

[English](./README.md) · **简体中文**

[![ci](https://github.com/zengqingsong/dsh-sidebar-frog/actions/workflows/ci.yml/badge.svg)](https://github.com/zengqingsong/dsh-sidebar-frog/actions/workflows/ci.yml)
[![已收录于 dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/zh/plugins/zengqingsong/dsh-sidebar-frog)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo/logo-dark.svg" />
    <img src="docs/logo/logo.svg" alt="dsh-sidebar-frog" width="448" height="128" />
  </picture>
</p>

这是给 **DeepSeek Harness** 用的一个侧边栏插件，主要管两件事：把智能体新建或修改过的文件随时摆在你眼前，以及让你随时看到当前的工作区。点开一个文件，它就用面板全宽打开并离线预览；嫌侧边栏太窄，一键就能弹出成独立的浏览器标签页，拖到第二块屏幕上慢慢看。两个窗口共用同一个会话、同一个工作区和同一份设置，改动实时同步。

本项目 fork 自 [e2mcc/dsh-popout-sidebar](https://github.com/e2mcc/dsh-popout-sidebar)（MIT，Copyright (c) 2026 Qinyun Cai）。上游的许可声明在 [LICENSE](./LICENSE) 里原样保留；这个 fork 在此基础上加了什么，写在[致谢](#致谢)一节。

- **非官方社区插件**：个人项目，与 DeepSeek 没有隶属关系，也未获其背书。
- **MIT 许可**，零运行时依赖，不联网，也不上报任何数据。
- 读写只发生在当前会话的工作区内。所有数据接口都套了和 DSH 自身 `/api` 一样的浏览器 Cookie 校验，没有凭据一律返回 `401`。
- 预览用到的库全部内置，所以断网、内网、没有 CDN 的环境一样能用。
- 面向 `web` profile 的 DSH `0.1.5-rc.2` 开发。安装过程不执行任何构建脚本。

## 亮点

| | 功能 | 说明 |
|---|---|---|
| 🖥️ | 弹出到第二块屏幕 | 点一下，整个侧边栏就搬进独立的浏览器标签页。会话、工作区、设置和分隔条位置都是共享的，两个窗口始终一致。 |
| 📦 | 预览完全离线 | 代码、带公式和图表的 Markdown、PDF、HTML、图片、可排序的 CSV 表格、Word / Excel / PowerPoint，以及支持 HTTP Range 的音视频。渲染器全部内置，不连 CDN，也不发网络请求。 |
| 🌳 | 产物台账 | 智能体 `write` / `edit` 过的文件会自动出现在这里，连 shell 命令间接生成的文件也能识别出来。改动过的文件保留前后对照，撤销入口也在这。 |
| ↔️ | 工作区文件树 | 直接接管系统侧边栏的「文件」标签页，`@引用`、右键菜单、按目录刷新都在你本来就会看的位置。 |
| ✏️ | 原地编辑并保存 | Markdown、纯文本和 CSV 可以用 CodeMirror 编辑，`Ctrl+S` 保存。保存范围限制在工作区内，会和你打开时的版本做比对，还会把文件自己的换行符和 BOM 原样写回。 |
| 🌿 | 只读的 Git 面板 | 显示当前分支、领先/落后情况，以及已修改 / 已暂存 / 未跟踪 / 有冲突四个列表；点任意一行就能看该文件相对 HEAD 的行级差异。只读是硬性约束：不暂存、不提交、不检出、不丢弃。 |

## 安装

```sh
# 1) 先把 DSH 本体更新到最新版
npm install -g @deepseek-ai/dsh

# 2) 安装本插件
dsh plugin --profile web add github:zengqingsong/dsh-sidebar-frog
```

装完重启 DSH 服务，再强制刷新浏览器（`Ctrl/Cmd+Shift+R`）。右侧边栏会多出五个标签页：**文件**、**产物**、**任务**、**用量**、**Git**；左栏底部还会多一个常驻的**文件树**按钮，新建的会话也从这里进侧边栏。

升级就是再执行一次同样的 `add` 命令；卸载用 `dsh plugin --profile web remove dsh-sidebar-frog`。

## 本地源码安装

想把源码读一遍、边改边在真实界面里看效果，而不用每次都发一轮版本，那就装这份 checkout 本身，而不是装仓库：

```sh
git clone https://github.com/zengqingsong/dsh-sidebar-frog
cd dsh-sidebar-frog
dsh plugin --profile web add .
```

装完同样重启 DSH 服务，再强制刷新浏览器。

`dsh plugin` 只是转发给 `pnpm`，而 pnpm 是在 profile 目录里执行的；所以像 `.` 这样的相对路径会被换算成**你执行命令时所在的目录**——在 checkout 根目录下 `add .` 就是想要的结果，写绝对路径（`add D:\src\dsh-sidebar-frog`）也一样。pnpm 最终在 profile 的 `package.json` 里把它记成 `link:…`，也就是 profile 通过软链直接加载**你的工作区**，而不是拷一份进去：改完源码不需要重新安装。

`src/host.js` 和 `src/client.js` 都是生成物，所以改动 `src/` 下任何文件之后，循环是这样的：

```sh
npm run build       # 重新生成 src/host.js 和 src/client.js
npm run check:fast  # 只跑断言，不启动浏览器
npm run check       # 断言加上真实浏览器测试
```

然后重启 DSH 服务并强制刷新浏览器。宿主端启动时会打印构建 id，弹出页把它放在 `meta` 标签里，靠它就能确认重启到底有没有生效。改宿主端要重启进程，改客户端还要额外刷新页面。

这条路上安装时不执行任何构建脚本，所以 pnpm 不会停下来要求你批准脚本——那是从 git 仓库安装时才会遇到的事。

想切回发布版本：

```sh
dsh plugin --profile web remove dsh-sidebar-frog
dsh plugin --profile web add github:zengqingsong/dsh-sidebar-frog
```

## 功能

- **弹出页。** `/dsh-sidebar-frog` 是一个独立的两栏页面：左边预览，右边是台账或文件树，中间的分隔条可以拖动。它就是个普通标签页，能拖到另一块屏幕上，并通过 `storage` 事件和侧边栏保持同步。弹出页上的 `@` 按钮会把引用直接写进主窗口的输入框；主窗口不在了才退回剪贴板。
- **产物台账。** 成功的 `write` 和 `edit` 调用会被实时记录，包含文件类型、改动标记和前后文本。shell 命令也覆盖到了：`bash` / `pwsh` 执行前后会对工作区取指纹做比对，所以脚本画出来的图、生成的报告同样能被认出来。删除记录和撤销改动走的是同一份有界历史。
- **文件树。** 支持展开、折叠、过滤、键盘操作和按目录刷新（工具栏上的刷新会保留你的展开状态，`Shift` + 点击才是整体重载）。右键菜单提供复制路径、复制相对路径、`@引用`、仅刷新此目录、展开/折叠全部。展开状态在刷新后依然保留。
- **预览。** 带语法高亮的代码、支持 MathJax / Mermaid / JSXGraph 的 Markdown、PDF、HTML、图片、可排序的 CSV/TSV 表格、完全离线渲染的 Word / Excel / PowerPoint，以及按字节区间流式传输的音视频——进度条是真的能拖。渲染不了的文件会给一张说明卡，而不是一堆乱码。
- **把渲染器借给系统侧边栏。** 同一套 Markdown、表格和 Office 渲染器也会注册进产品自带的文档预览注册表：于是系统自己的 Markdown 预览也有了公式和图表，表格文件不再是一长行文本，Word / Excel / PowerPoint 在系统侧边栏里同样能看。三者各有独立开关，设置页会写明哪几个真正生效了。
- **编辑与保存。** Markdown、纯文本和 CSV 在面板或弹出页里都能编辑。如果保存前文件已被别人改动，会明确拒绝并给出选择，而不是悄悄覆盖；保存还会并入智能体改动的那份撤销历史，所以撤销也能撤掉你自己的修改。
- **Git 面板。** 分支、领先/落后和四个文件列表，点开任意一行就是该文件相对 HEAD 的差异。每次 git 调用都走 harness 自己的子进程服务，参数是字面量数组，代码里不存在任何写操作。
- **用量。** 上下文占用、占用构成和累计 token 用量，取自输入框上方那个占用环所用的同一份会话投影，所以两者不可能对不上。
- **设置与主题。** 七个开关和三项宽度偏好，都能在标准设置页里找到，并跟随 harness 的明暗主题。

早先版本里的**内置浏览器视图已经移除**。它只能通过一条免鉴权路由显示本地页面，而产品自带的文档预览已经能渲染工作区里的 HTML，为此保留一条不带 Cookie 就能应答的路由并不划算。

## 设置

| 设置项 | 默认值 | 说明 |
|---|---|---|
| 加载时展开 | 开 | 页面加载完就打开面板。在原生侧边栏形态下，它还会为新建会话打开「文件」页，一次完成展开并落到文件树上。你已经用过的会话不会被碰。 |
| 自动刷新 | 开 | 面板打开时每两秒拉取一次新产物。弹出页同样遵守这个开关，切回该标签页时也会刷新一次。 |
| 文件树 | 开 | 在浮动面板的标签条上显示文件树。原生侧边栏形态不提供这个开关：系统的「文件」标签页**就是**本插件的文件树，必须一直显示。 |
| 用系统右侧边栏承载面板 | 开 | 把每个视图都注册成系统右侧边栏的标签页，其中文件树接管系统自己的「文件」kind。关掉之后五个 kind 全部还给系统，面板退回浮动形态。刷新页面后生效。 |
| 用本插件渲染系统 Markdown | 开 | 把 Markdown 渲染器借给系统的文档预览，系统侧边栏因此也有了公式、Mermaid 和 JSXGraph。关掉就交回内置渲染器。立即生效。 |
| 用本插件渲染系统表格 | 开 | 把 `csv` / `tsv` 的表格渲染器借出去。产品本身没有表格渲染器，所以这里没有取舍。立即生效。 |
| 用本插件渲染系统 Office 文档 | 开 | 把 `docx`、`xlsx`、`pptx` 的阅读器借出去——系统本来显示不了它们。只影响系统侧边栏；本插件自己的面板两种情况都照常渲染 Office。 |
| 面板默认宽度 | 26% | 浮动面板展开时的宽度，占窗口的 20–85%。原生侧边栏的宽度由系统决定，所以不显示这一项。 |
| 面板最小宽度 | 20% | 浮动面板的下限，占窗口的 20–60%。文件名在任何窗口尺寸下都保持可读，不会被省略号截断。 |
| 弹出页预览宽度 | 80% | 弹出页里预览区占分割区的比例，20–80%。拖动分隔条可以临时调整。 |

## 工作原理

插件由两个半部分组成，都已随仓库提交，安装时不需要构建。

**宿主端**（`src/host.js`）负责向 Web 服务器注册路由：弹出页、数据接口、内置的渲染器资源和编辑器。它通过**动态注入**获取 `webServer`，而不是把它写成硬依赖——这样在没有 Web 服务器的 profile 上插件照样能加载、照样跟踪产物，只是没有路由可注册。每个数据接口入口都会先向 connection 服务要一个判定，也就是产品给 `/api` 用的那套 Host/Origin 与 Cookie 校验。宿主端同时监听工具的生命周期：用 `tools/result` 记录直接的 `write` / `edit` 调用，用 `tools/execute` 取到文件改动前的原文（撤销的依据），并在 shell 命令前后比对工作区指纹。

**客户端**（`src/client.js`）把五个系统标签页及其内容注册进侧边栏提供的键控座位，把渲染器借给文档预览注册表，并补上系统没有提供的两个入口：左栏底部那颗按钮，以及每个标签页右键菜单里的「在新标签页打开」。注册点不存在或拒绝注册时，它会整体回滚，退回自己的浮动面板。

**跨窗口桥**（`src/shared/bridge.js`）就是侧边栏和弹出页通过 `storage` 事件互相通信。会话、设置和分隔条位置都是共享的；`@引用` 请求带一个 nonce 和十秒有效期，过期的消息不会被误当成新指令。

## 兼容性与风险

- 针对 `web` profile 的 **DSH `0.1.5-rc.2`** 开发和测试，这是唯一带浏览器界面的 profile。DSH 的 `latest` 标签目前指向 `0.1.5-rc.1`；两个版本发布的内容完全相同（文件一致、只差版本号），装哪个都可以。
- 如果某个 DSH 版本没有右侧边栏标签注册表，或者契约变了，插件会退回浮动面板，而不是加载失败。
- 只在会话工作区内的路径上读写。写操作仅限「编辑并保存」和「移除一条产物记录」，两者落盘前都会先校验工作区根目录。
- 不发起任何对外网络请求，也不向任何地方上报数据。
- 安装时不执行构建脚本，所以包管理器不会要求你批准脚本。
- 这是非官方插件，未经 DeepSeek 审核或背书。安装任何插件前，都建议先看一眼源码。

## 运行时验证

宿主半边通过了 [`dsh-plugin-verify`](https://github.com/qing3a/dsh-plugin-verify)——它用 mock LLM 跑一整轮 agent 循环，全程监听 harness 的 waterfall 链：

```sh
npx dsh-plugin-verify . --repo <dsh-checkout>
# ✅ 通过 | 捕获事件: 13 | waterfall: 7/7 | tools/result: 是
```

七个 waterfall 事件全部触发，`tools/result` 正常收尾，静态规则也没扫出裸 `child_process` spawn 或 `single` 槽注册。对侧边栏插件来说，真正有意义的是它在**你没跑的那个 profile** 上的表现：宿主端**没有声明任何静态 `inject`**，所以在 headless 装配下插件照样加载、照样追踪产物，缺的只是 HTTP 路由。如果写成静态的 `inject: ['webServer']`，整个插件在那里会被**悄悄关掉**——连 waterfall 一起。

## 开发

```sh
npm run build       # 由 src/**/*.js 重新生成 src/host.js 和 src/client.js
npm run check       # 先跑断言套件，再跑真实浏览器测试
npm run check:fast  # 同上，但不启动浏览器
```

`src/host.js` 和 `src/client.js` 都由 `src/` 下的模块生成，并且都已提交，所以安装时无需构建。断言在 `scripts/check.js`，浏览器测试在 `scripts/browser-tests.js`。

运行中的构建由一个短 id 标识：宿主端启动时会打印它，弹出页把它放在 `meta` 标签里。想确认重启和强制刷新到底有没有生效，看这个最快：

```sh
# 进程启动时的日志
#   [artifacts] dsh-sidebar-frog build 00000000
```

## 致谢

作者：[曾青松](https://github.com/zengqingsong)。

本插件最初 fork 自 Qinyun Cai 的 [e2mcc/dsh-popout-sidebar](https://github.com/e2mcc/dsh-popout-sidebar)，其上游许可声明在 [LICENSE](./LICENSE) 中未作改动地保留。此后它陆续长出了产物台账、接管系统侧边栏的文件树、离线预览和 Office 阅读器、编辑与保存、只读 Git 面板，以及借回给系统的那些渲染器。

内置的渲染器都是第三方成果，按各自的许可使用，许可原文保留在 `src/vendor/` 下：pdf.js、MathJax、Mermaid、JSXGraph、CodeMirror、docx-preview、JSZip、SheetJS 和 PowerPoint 渲染器。

## 许可证

[MIT](./LICENSE)，包含上游原始的版权声明。

<p align="left">
  <img src="docs/logo/gzpu.jpg" alt="广州职业技术大学" width="128" height="128" />
</p>

由 [曾青松](https://github.com/zengqingsong) 在**广州职业技术大学**（[gzpyp.edu.cn](https://www.gzpyp.edu.cn/)）开发与维护。
