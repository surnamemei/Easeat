<p align="center"><img src="docs/assets/logo.png" width="96" alt="易位 logo"></p>

<h1 align="center">易位 eaSEAT</h1>

<p align="center">帮老师自动排座位的微信 / QQ 小程序<br>
<a href="https://surnamemei.github.io/Easeat/">项目主页与在线体验</a></p>

> **English:** Easeat is a WeChat / QQ mini program that arranges classroom seats for teachers — by height, at random, or by rotating the seat groups every week — while keeping chosen pairs of students apart. Students and parents join a class to see the latest seating chart. Built by a student team at Wuhan Yingzhong High School.

## 功能

| | |
| --- | --- |
| **三种排座方式** | 按身高（矮的在前，身高相近的同学随机换位）、完全随机、大组轮换（每组整体右移一组，同桌不变） |
| **不相邻名单** | 指定两位同学，排座时他们既不做同桌，也不坐前后桌 |
| **每周自动重排** | 每周一早上 6:00 按班级设置的方式自动换座位 |
| **手动调整** | 点一个座位再点另一个即可交换；可以直接修改座位上的姓名；可切换为讲台视角 |
| **学生名单** | 逐个添加、粘贴整段名单，或导入 Excel（自动识别表头和序号列） |
| **导出与分享** | 生成座位表图片；复制到 Excel / WPS 后每个名字自动占一格；分享班级卡片，学生和家长点开即可加入查看 |

<p align="center">
<img src="docs/assets/screens/home.png" width="240" alt="首页">
<img src="docs/assets/screens/class.png" width="240" alt="座位表">
<img src="docs/assets/screens/rules.png" width="240" alt="排座规则与教室布局">
</p>

## 项目结构

```
Easeat-wx/                 微信小程序（以它为准）
  app.js / app.json / app.wxss
  pages/
    index/                 首页：创建、加入班级，班级列表
    inclass/               班级页：座位表、学生名单、排座规则、教室布局、分享
    personal/ tutorial/ notice/ about/ feedback/
  components/input-dialog/ 带输入框的对话框
  utils/
    api.js                 调用云函数
    seat-chart.js          座位表显示、导出 Excel、生成图片（网页演示也在用）
    platform.js            平台相关设置（云环境 ID、分享菜单）
  cloudfunctions/
    easeat/                所有后台操作 + 每周自动重排的定时触发器
      arrange.js           排座算法（纯函数，网页演示也在用）
      roster.js            学生名单解析
    parseRoster/           读取上传的 Excel 名单
Easeat-qq/                 QQ 小程序，由 scripts/sync.js 生成（platform.js 和 project.config.json 除外）
docs/                      GitHub Pages 项目主页和在线体验
scripts/sync.js            从微信版生成 QQ 版，并把共用代码复制到 docs/js
tests/                     自动化测试
```

## 部署（微信版）

1. 用微信开发者工具打开 `Easeat-wx`。云开发环境 ID 写在 `Easeat-wx/utils/platform.js` 的 `cloudEnv` 里。
2. **数据库**：需要 `class`、`classStudent`、`classUser`、`classSeat`、`classArrangement` 五个集合（旧版本已经建好，原有数据可以直接使用）。小程序端不直接读写数据库，建议把这五个集合的权限都设为「所有用户不可读写」，云函数不受影响。
3. **云函数**：分别右键 `cloudfunctions/easeat` 和 `cloudfunctions/parseRoster`，选择「上传并部署：云端安装依赖」。
4. 在云开发控制台把 `easeat` 和 `parseRoster` 云函数的**超时时间改为 20 秒**：每周自动重排时需要处理所有开启了该功能的班级，读取较大的 Excel 文件也需要一些时间。
5. **定时触发器**：右键 `cloudfunctions/easeat/config.json`，选择「上传触发器」（每周一 06:00，北京时间）。
6. **隐私保护指引**：在小程序管理后台的「用户隐私保护指引」中声明「剪切板」（复制班级 ID、复制座位表）和「选中的文件」（导入 Excel 名单），否则这两个功能会被微信拦截。
7. **新版本发布后尽快删除旧版本的云函数**：`addStudent`、`addStudentByFile`、`changeData`、`createClass`、`deleteClass`、`deleteStudent`、`getArrangement`、`getClassList`、`getSeat`、`getStudents`、`joinClass`、`notice`（连同它的定时触发器）、`quitClass`、`rearrangeSeat`、`setSeat`。旧云函数没有权限检查，任何加入班级的人都能用它们修改名单和座位；删除后，还没更新的旧版小程序会提示出错，重新打开即可更新。`meta` 集合也不再使用。

## 部署（QQ 版）

1. 修改代码时只改 `Easeat-wx`，然后运行 `npm run sync` 生成 QQ 版。QQ 版专用的设置在 `Easeat-qq/utils/platform.js`（云环境 ID、QQ 群号）。
2. 用 QQ 小程序开发者工具打开 `Easeat-qq`，按上面的第 2～5 步部署（QQ 版云函数使用 `qq-server-sdk`，同步脚本会自动替换）。

## 开发

需要 Node.js 18 或更高版本，不需要安装任何依赖。

```bash
npm test
```

```bash
npm run sync
```

`npm test` 会运行：

- 排座算法和名单解析的测试；
- 云函数每个操作的测试，使用内存版数据库，包括权限检查和旧版本数据的兼容；
- 页面测试：在 Node 里模拟小程序运行环境，像用户一样点击页面，从页面一直调用到云函数和数据库；
- 检查 QQ 版和网页演示是否已经和微信版同步。

微信版和 QQ 版的云函数、页面测试都会各跑一遍。

## 数据结构

每个班级在五个集合里各有一条记录，`_id` 都是班级 ID（新班级为 6 位小写字母数字）。

| 集合 | 字段 |
| --- | --- |
| `class` | `owner`（创建者 openid）、`name`、`createdAt`、`settings: { mode, autoWeekly, separate }` |
| `classStudent` | `students: [{ id, name, height }]`、`studentIdTop` |
| `classUser` | `members`：加入班级的 openid 列表 |
| `classSeat` | `seats`：二维布尔数组，`true` 表示有课桌，第 0 排离讲台最近 |
| `classArrangement` | `arrangement`：与 `seats` 同形状，`null` 为没有课桌，`''` 为空课桌；`arrangedAt`、`arrangedBy`（`manual` / `auto`） |

## 云函数接口

小程序调用 `easeat` 云函数，用 `action` 区分操作，返回 `{ ok: true, data }` 或 `{ ok: false, msg }`。

| action | 说明 | 权限 |
| --- | --- | --- |
| `listClasses` | 我创建的和我加入的班级 | 登录用户 |
| `createClass` `{ name }` | 创建班级 | 登录用户 |
| `joinClass` / `quitClass` `{ classId }` | 加入 / 退出班级 | 登录用户 |
| `getClass` `{ classId }` | 班级详情；名单和设置只返回给创建者 | 创建者、成员 |
| `updateClass` `{ classId, name?, settings? }` | 改名、排座方式、每周自动重排、不相邻名单 | 创建者 |
| `addStudents` `{ classId, students \| text \| rows }` | 添加学生 | 创建者 |
| `deleteStudent` `{ classId, studentId }` | 删除学生 | 创建者 |
| `saveLayout` `{ classId, seats }` | 保存教室布局（尽量保留原座位） | 创建者 |
| `arrange` `{ classId, mode }` | 排座 | 创建者 |
| `swapSeats` `{ classId, a, b }` / `setSeatName` `{ classId, row, col, name }` | 手动调整座位 | 创建者 |
| `deleteClass` `{ classId }` | 删除班级和所有相关数据 | 创建者 |

## 隐私

仓库里不包含任何数据库导出：其中有用户的 openid 和学生姓名，请不要提交到公开仓库（`.gitignore` 已经排除了 `database/` 目录）。

## 团队

易位由武汉英中高级中学的学生团队开发。问题和建议请提交到 [GitHub Issues](https://github.com/surnamemei/Easeat/issues)。
