# 域外法学文献追踪（lawecon-hub）

一个部署在 GitHub Pages 上的静态网站：自动追踪约 20 本英文期刊（竞争法 / 法经济学 / 产业组织 / 综合法律评论）的新发文，中文界面，支持检索与筛选，点击跳转原文。数据由 GitHub Actions 每 6 小时从 Crossref 抓取一次，全程零成本。

## 一次性部署（约 15 分钟）

### 第 1 步：注册 GitHub 账号
打开 https://github.com/signup ，邮箱注册即可，免费。

### 第 2 步：创建仓库并上传文件

**方式 A：网页上传（推荐，不需要安装任何软件）**
1. 登录后点右上角 "+" → "New repository"
2. 仓库名填 `lawecon-hub`，选 **Private** 或 **Public** 均可（Public 也能用 Pages；2024 年起 Private 仓库同样免费开放 Pages）
3. 点 "Create repository" 后，选 "uploading an existing file"，把本目录下**所有文件和文件夹**拖进去（注意：`.github` 和 `data` 是文件夹，网页上传会自动保留结构；`.nojekyll` 这种以点开头的文件如果拖不进去，跳过它，用第 3 步之后的方法补）
4. 点 "Commit changes"

**方式 B：git 命令行**
```bash
git init
git add .
git commit -m "init"
git branch -M main
git remote add origin https://github.com/你的用户名/lawecon-hub.git
git push -u origin main
```

### 第 3 步：开启 Pages
1. 进入仓库页面，点 "Settings" → 左侧 "Pages"
2. "Build and deployment" 下 "Source" 选 **GitHub Actions**
3. 保存。此时网站还没有内容，等下一步跑完任务就上线

### 第 4 步：手动触发一次更新任务
1. 点顶部 "Actions" 标签页
2. 左侧选 "update" 这个 workflow
3. 右侧点 "Run workflow" → 绿色按钮确认
4. 等几分钟，出现绿色对勾后，回到 Settings → Pages，页面顶部会显示网址（形如 `https://你的用户名.github.io/lawecon-hub/`）

打开网址，网站上线。

## 日常使用

打开网址即可。搜索框支持多个关键词（空格分隔，全部命中才显示）；可按分类或单本期刊筛选；筛选状态会自动记住。

## 维护

### 增删期刊
编辑 `journals.json`：每本期刊一条记录，删掉一条或把 `"enabled"` 改为 `false` 即不再抓取。新增期刊需要查到它的 ISSN（在期刊官网页脚一般能找到，或到 https://www.crossref.org 搜索期刊名）。

如果不确定某个 ISSN 对不对，运行 `python3 verify_sources.py`（本地或 Actions 里都行），会逐个打印每个 ISSN 在 Crossref 解析出的期刊名，FAIL 的就是需要修正的。

### 修改抓取频率
编辑 `.github/workflows/update.yml` 里的 `cron: "17 */6 * * *"`（含义：每 6 小时的第 17 分钟）。改成 `0 6 * * 1` 就是每周一早 6 点。

### 修改保留天数
`update.yml` 里 `python3 crawler.py --days 365` 的 365 改成你想要的天数。

## 常见问题

**Q：数据好久没更新了？**
GitHub 规定：仓库 60 天内没有任何活动，定时任务会被自动暂停。解决办法：进 Actions 页面手动 "Run workflow" 一次即可恢复；或者在仓库里随便改一个文件（比如往 README 加一行字）也算活动。

**Q：某本期刊一直抓不到数据？**
大概率是 ISSN 不对。运行 `python3 verify_sources.py` 查出是哪个，去 Crossref 搜正确 ISSN 后更新 `journals.json`。也可能是该期刊未向 Crossref 注册元数据（少数法律评论如此），这种情况只能放弃该刊或改用其他数据源。

**Q：报错日志在哪里？**
`data/errors.log`，每次抓取出错的期刊和原因都记在里面，跟着仓库一起提交。

## 文件结构说明

```
index.html / app.js / styles.css   网站本体
journals.json                      期刊配置（增删改期刊就编辑它）
crawler.py                         抓取器（Actions 里跑）
verify_sources.py                  ISSN 校验工具
data/articles.json                 文章数据（自动生成/更新）
data/errors.log                    抓取错误日志
.github/workflows/update.yml       定时任务与部署配置
```
