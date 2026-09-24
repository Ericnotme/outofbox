# 棋间的每日入口：假设与证据

核查日期：2026-09-22。用户要求免费、区别于 Lichess / Aimchess、具有每天使用的理由。

## 不能当作新缺口的能力

- Lichess 官方功能页已有个人/其他棋手的开局浏览器、Chess Insights、从错误学习、研究与战术题：https://lichess.org/features
- Aimchess 官方页已有个人错题、开局改进、每日练习与热身、每周计划。Premium 公开标价 $7.99/月，包含跨平台多账号跟踪。这只能证明训练产品有收费供给，不能证明新功能已有付费意愿：https://aimchess.com/
- ChessBase 提供付费对手准备、棋风报告。赛前备战不是未被满足的新类别：https://shop.chessbase.com/en/products/chessbase_18_program
- 开局资料与引擎本身不构成棋间的壁垒。俱乐部查找对部分人有用，但不会天然产生每日需求。

## 优先验证：下棋节奏教练

待验证问题：玩家原本只想下一小轮，却在输棋后连续开新局；知道“休息”这个建议，但难以执行。价值假设是帮助实现自己的时间/局数安排，不是诱导更多在线时长或保证涨分。

证据：
- 棋手自述循环开局、追分和难以离开：https://www.reddit.com/r/chess/comments/18t6oxm/an_analysis_of_tilt/
- 有用户使用网站屏蔽工具帮助停下：https://www.reddit.com/r/chess/comments/1oucu0y/how_to_stop_tilting/
- GM Noël Studer 建议在开始前确定局数并分轮复盘：https://nextlevelchess.com/no-more-tilt/
- 其他网站已有 tilt tracker / reset adviser，故不能声称全市场唯一：https://www.chessworld.net/chessclubs/openingguide/tilt-control.asp

在所检查的 Lichess / Aimchess 公开功能页中，未见作为核心流程的“事前自定边界 → 每盘后核对 → 收工 → 下次带回提醒”。未见不等于证实不存在；本次没有登录体验付费后台。论坛是定性证据，不能推导市场规模。

实现的 MVP：自选局数/时间/连败提醒阈值与主观状态；手动登记已结束对局；在页面内按规则提醒；收工反思；最近七天使用记录；服务器匿名持久化最近60轮，导出/删除。不读取正在进行的外部棋局，不做心理诊断，没有跨站阻断、后台监测或已验证的提升模型。

该入口的第一风险：每盘手动切回网站可能比继续开局更麻烦。真正有效的跨站干预可能需要浏览器扩展，不能在当前网站里假装已经实现。

## 验证设计（建议，尚未执行）

先找20–30位每周至少下3天、愿意记录且有追分困扰的棋手试7–14天；招募由用户完成，本轮没有向他人发送消息。

优先观察：无提醒时是否自发返回；每盘登记流失；一周使用至少3天的比例；是否帮助遵守本人事前承诺；用户不使用时最想念哪部分。设定一个内部试验门槛（例如30名尝试者至少10名一周自发使用3天），只作为继续投入的决策线，不能称行业基准。

需要单独访谈和真实付费测试才能判断付费意愿。当前所有功能保持免费。不能用训练产品价格或零散论坛帖子宣称巨大新市场，更不能承诺保住等级分。

## 辅助功能

1. 赛前备战：输入 Lichess/Chess.com 公开账号或本地多局PGN，按颜色/用时/日期筛选；每个开局路线给样本量、得分率、证据棋谱；至少20局同类用时和同色有日期样本才显示前后10局对比。低得分不等于开局缺陷。
2. 影子对手：按前12回合真实观察的局面频率选应手，允许选择另一已见分支，样本耗尽明确停止；不是复制真人棋力。
3. 附近下棋：GeoNames本地城市目录或用户主动定位；Overpass只读 sport=chess 的地图记录，分类和开放信息均保留不确定性。没有现场确认、活动预约或“这里没人下棋”的推断。

数据说明：https://www.chess.com/news/view/published-data-api · https://lichess.org/api · https://wiki.openstreetmap.org/wiki/Overpass_API · https://download.geonames.org/export/dump/
