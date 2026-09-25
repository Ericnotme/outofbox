# 棋间 · Knight Room

### 一盘棋，两份心声。A game. Two minds. One reveal.

[![Knight Room：黑白马相遇，赛后揭晓心声](dist/og.png)](https://knight-room.weijiaxian.chatgpt.site/online.html)

**[找个人下棋 ↗](https://knight-room.weijiaxian.chatgpt.site/online.html)** · **[无损试走](https://knight-room.weijiaxian.chatgpt.site/?future=today)** · **[每日爵士](https://knight-room.weijiaxian.chatgpt.site/?jam=today)**

> 你以为对手胸有成竹。下完才发现：你们都在硬撑。

Knight Room is a free, no-signup chess playground: human matchmaking, invite links, sealed thoughts revealed after each game, parallel futures, and daily jazz. The interface is currently in Chinese.

## 30 秒看懂新玩法

[观看 28 秒玩法演示](docs/launch/knight-room-launch.mp4) · [完整产品故事](docs/launch/X-文章全文.md)

1. 匹配一位真人，或发链接邀请朋友。每人 5 分钟，每步加 3 秒。
2. 落子前，封存一句心声：**算过了 / 虚张声势 / 我也没底**。也可以猜对手上一手的心声，全部可跳过。
3. 对局结束，一起揭晓：具体哪一步、对面选了什么、你有没有猜对。
4. 保存心声卡片，留住这次只有你们懂的相遇。

心声是玩家的自选，赛后才互相可见。它不读心，也不评判真伪。

如果你也想要一间这样的棋室，欢迎留颗 **Star**，跟着它继续长大。

## 为什么做棋间

棋友你好，欢迎来到我的 GitHub。这里是我在做的 **棋间**：一个免费、免注册的中文国际象棋小站。

我想把下棋做成一种让人舒展开来的体验：像在现场听到一段好音乐，身体先于语言作出反应；你随手试一步，棋盘接住它，又给你一点没想到的东西。那个“啊，原来如此”的瞬间，是我最想做出来的快乐。

**[先玩「平行棋局」→](https://knight-room.weijiaxian.chatgpt.site/?future=today)** · **[进入棋间](https://knight-room.weijiaxian.chatgpt.site/)** · **[来一段爵士即兴](https://knight-room.weijiaxian.chatgpt.site/?jam=today)**

## 第一次来，先试这件事

打开 **平行棋局**，随手点一种走法。棋盘会把后面几步演给你看。换另一种走法，同一个起点的另一条路线就展开了。

你可以拖动时间、切换路线、反复比较，也可以把自己的当前棋局带进来。试走不会改动原局；在轮到你走的实际对局里，想清楚之后，再点 **「这一步，我真的走」**。

这里想给你的能力很简单：**先看见自己的选择会怎样，再决定要不要走。**

“今日灵光”轮换三个短局面，让新棋友从一个小发现开始。参考路线由浏览器里的 Stockfish 计算，最多展开五步；它们是双方可能采用的走法，真实对手可能选择别的路线。它不读心，也不保证预知棋局。

## 累了，让马跳一支舞

**每日即兴**里，黑白双方都是你的乐手。点「开启声音」，走一步，钢琴、贝斯和鼓就接一句。八步编成一段约二十秒的小曲，还能加一颗故意偏半音的“蓝音”。

每天的局面、调性和速度按日期轮换。完成的乐谱会保存，可以回听、下载，再重新打开。缺席也没关系，乐队不会追问你昨天去了哪里。

爵士玩法来自一次有趣的岔路，我很喜欢，所以把它留下了。整个网站继续围绕那种轻松、惊喜、愿意亲手参与的快乐慢慢生长。

## 想认真下棋，这里也有

| 你此刻想做什么 | 从哪里开始 |
| --- | --- |
| 找个真人下棋 | 联网匹配 / 好友链接约战 / 刷新重连 |
| 自己或与身边的人练习 | 人机对弈 / 同屏双人 |
| 看懂刚才哪里走偏了 | 导入 PGN / 复盘这局，查看中文解释与参考变化 |
| 把失误变成下一次的本事 | 个人错题本，按间隔重练自己的失误 |
| 让今天的对局有个边界 | [每日节奏](https://knight-room.weijiaxian.chatgpt.site/?tool=daily)，自己决定玩几盘、何时休息 |
| 带着准备去见棋友 | [赛前备战](https://knight-room.weijiaxian.chatgpt.site/?tool=prepare)与[附近下棋](https://knight-room.weijiaxian.chatgpt.site/?tool=nearby) |

联网模式是 5+3 友谊局，没有等级分和反作弊检测；请公平下棋。匹配池没人时会等待，不会用机器人冒充真人。断线时继续计时，刷新恢复当前浏览器席位。联网局不提供引擎提示。引擎难度与表现分不是官方等级分；复盘受搜索深度影响。棋间与 Chess.com 无关联。

## 你的棋，怎样保存

- 本机对局与平行棋局试走只在当前页面内，刷新前请导出需要保留的 PGN。
- 联网对局与心声保存到服务器，用 HttpOnly 匿名 Cookie 标识席位。对局中服务端不会向对手返回你的心声，结束后双方可查看、下载棋谱与保存心声卡。更换设备或清除 Cookie 无法恢复原席位；当前没有跨设备账号和历史对局列表。
- 错题、每日节奏与即兴乐谱保存到服务器，用当前浏览器里的匿名凭证区分访问者，无需注册。
- 更换设备、无痕浏览或清除 Cookie 前，请先导出相应备份。爵士唱片保留最近 30 段乐谱，回听时重新合成声音，不录制麦克风。
- 棋谱分析与声音合成都在浏览器中进行。导入备战用的本地 PGN 也在本页处理；主动读取公开对局或查找地点时，会请求相应外部服务。

## 一起把这个小站做得更有意思

欢迎在 [Issues](https://github.com/Ericnotme/outofbox/issues) 留下一段具体体验：哪一刻让你笑了、哪一步让你停住了、什么地方又让你觉得麻烦。棋谱或截图请先去掉不想公开的信息。

我希望它值得你明天再来一下。这个愿望需要靠真实使用验证，欢迎直说你的感受。

<details>
<summary>本地运行与实现说明</summary>

代码需要支持 `node:sqlite` 的 Node.js；当前在 Node.js v23.10.0 验证。

```sh
npm ci
npm test
npm start
```

打开终端打印的 `http://127.0.0.1:端口`。本地服务只监听本机，进度保存在被忽略的 `.knight-local/` 目录。修改代码后重新启动服务并刷新页面。

浏览器源码在 `dist/`，服务端接口在 `worker/`，数据库定义与迁移在 `db/` 和 `drizzle/`。`npm run build` 生成 `dist/client/` 和 `dist/server/index.js`。线上由 Sites 托管并提供 D1 的 `DB` 绑定。`.openai/hosting.json` 是此网站的项目标识，不是登录凭证；部署自己的副本时，应在自己的 Sites 项目中生成对应配置。

平行棋局用独立棋盘试走，取消过期搜索，只回放验证过的合法走法。原局的落子需要再次点击确认，并重新检查局面是否一致。没有调用语言模型，没有行为追踪，也没有后台通知。

当前自动检查覆盖棋规、路线合法性、取消旧搜索、每日曲谱、蓝音、匿名数据隔离、保存重试、复盘和错题训练。浏览器试玩另检查核心交互；这些检查不等于所有设备都已验证。

第三方组件：chess.js 1.4.0（BSD-2-Clause）、Stockfish.js 10.0.2（GPL-3.0），以及 GeoNames 地名数据。许可证与 Stockfish 对应源码归档保留在 `dist/vendor/`。原创部分未另行指定开源许可证。历史实现细节见 [实现记录](docs/IMPLEMENTATION_HISTORY.md)。

联网同步采用约 1.2 秒短轮询，后台页面约 3 秒；不是 WebSocket，未做大规模并发压测。匹配使用 D1 事务与唯一席位约束，走棋使用服务端棋规、时钟及版本检查。三次重复和五十回合按本房间规则自动判和，单局最多 600 手。`tests/live.test.mjs` 验证并发匹配、越权、重复提交、隐藏心声、计时与将死。本地双会话可用 `127.0.0.1` 与 `localhost`，或两种浏览器。

</details>
