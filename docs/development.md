# 本地开发

返回 [根 README](../README.md)。

需要 Node 22+；改线上数据或跑 `wrangler` 远程命令时需要 `npx wrangler login`（或给 API token）。

```bash
npm ci                   # 装依赖
npm run db               # 重建本地曲库（首次必须，或从别人那里拿一份 data/jubeat.db）
npm run dev              # astro dev，默认 4321
```

## 常用命令

| 命令                              | 作用                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                     | 本地开发服务器                                                       |
| `npm run build`                   | 难度统计 → 拆分谱面 → 构建戳 → SEO → `astro build`                    |
| `npm run preview`                 | `build` 后用 `wrangler dev` 跑本地 Worker                          |
| `npm run db`                      | xlsx 解析 → `data/jubeat.db` → 站点 JSON（重建本地曲库）             |
| `npm run data`                    | 只重生成 `src/data/` 的聚合数据与曲绘                                |
| `npm run patch` / `apply:patch`   | 生成 / 应用线上增量补丁                                              |
| `npm run check`                   | 9 段自检，任何一段红都不能放行                                       |
| `npm run opt`                     | 压缩 `public/assets/images` 下的图片（原地覆盖）                     |
| `npm run data:pull`               | 从 R2 拉回移出版本库的数据（`prebuild` 会自动跑）                     |
| `npm run data:push -- --changed`  | 把本地改过的数据推到 R2（按 md5 比远端 ETag，没变的跳过）             |
| `npm run deploy`                  | `build` + `wrangler deploy` 本地直传；正常发版走 push，不用它         |

脚本清单与分组见 [scripts/README.md](../scripts/README.md)。

## 本地 D1 必须先灌

`npm run dev` 用的是本地持久化 D1，**空库会让 `/songs`、`/recent` 直接 500**（`D1_ERROR: no such table`）。第一次起站前跑：

```bash
npx wrangler d1 execute beyond-jubeat --local --file=db/schema.sql
npx wrangler d1 execute beyond-jubeat --local --file=db/seed.sql
```

⚠️ 别跟着 `astro.config.mjs` 的 `persistState` 路径加 `--persist-to E:/tmp/...`：那是 miniflare 的缓存与 DO 存储，dev server 的 D1 实际落在 `.wrangler/state/v3/d1/`，灌到别处等于没灌。不加 `--persist-to` 才是同一个位置。

`db/schema.sql` 开头有 `DROP TABLE songs`，重灌无副作用。它已含用户系统、热度计数与鉴权限流的全部表，不需要再单独跑迁移文件。

查本地库用 `node:sqlite`，比 `wrangler d1 execute` 快得多（后者每次启动 workerd，动辄十几秒）：

```bash
node -e "const D=require('node:sqlite');const db=new D.DatabaseSync('<库文件>',{readOnly:true});console.log(db.prepare('SELECT count(*) FROM songs').get())"
```

## 本机 workerd 的两个坑

适配器自带的 miniflare/workerd 在这台 Windows 上会在启动阶段崩：

```
Fatal uncaught kj::Exception: kj/filesystem-disk-win32.c++:773: failed: CreateDirectory: #5 拒绝访问。; path = miniflare-email-store
```

1. **构建期预渲染**：默认用 workerd 跑预渲染，上面这条直接让 `npm run build` 挂掉。解法是 `astro.config.mjs` 的 `prerenderEnvironment: 'node'`，改用 Node 跑，产物完全一致，云端（Linux）不受影响。
2. **dev server 启动**：未配 `persistState` 时同一崩溃落在 `npm run dev` / `npm run preview` / `npx wrangler dev` 的启动阶段——miniflare 在 `os.tmpdir()` 建临时目录，workerd 要在里面建 DO 存储目录被权限拒绝（设 `TEMP`/`TMPDIR`、手动建空目录都无效）。现在配置里写了 `persistState.path`，把存储挪到自带完全控制权的盘就绕过去了。

## 验本地站的三个约定

- **`curl` 必须带 `--noproxy '*'`**：本机环境变量里有代理，不加会把 `localhost:4321` 甩去代理回 `000`，看着像服务没起（其实在 `netstat` 里正常 LISTENING）。dev 只监听 `::1`，要用 `localhost` 而不是 `127.0.0.1`。
- **首页、`/songs/`、`/jubility/`、`/recent/` 走中间件边缘缓存**，看响应头 `x-jb-cache`：`HIT` 是缓存命中、`STALE` 是陈旧兜底、`MISS` 是这次真渲染并写入了缓存、`PASS` 是真渲染但**不入库**（非 200，比如不存在的曲）。改完模板看不见效果时，带一个 `Cookie: jb_session=x` 绕过缓存，别急着改代码。
- **`CF-Connecting-IP` 在本机会被拦成 403**（`error code: 1000`）。要冒充来源 IP 验限流，改用 `X-Forwarded-For`——取 IP 的代码本来就是 `cf-connecting-ip ?? x-forwarded-for`。

## dev server 在带代理的环境里

带 `HTTP_PROXY`/`ALL_PROXY` 启动会 `read ECONNRESET`：`fetchWorkerExportTypes` 要 fetch `http://localhost/__vite_plugin_cloudflare_get_export_types__`，被 undici 的 EnvHttpProxyAgent 塞进了代理。用 `env -u ALL_PROXY -u HTTP_PROXY -u HTTPS_PROXY` 启动才稳。

## 环境变量与密钥

| 名称                                                | 用途                                              | 配在哪                                  | 缺了会怎样                                        |
| --------------------------------------------------- | ------------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                              | R2 读写（`data:pull` / `data:push`）与 D1 Edit     | 本机环境变量；Actions 用仓库 secret      | 拉推数据直接跳过并打印提示                        |
| `CLOUDFLARE_ACCOUNT_ID`                             | R2 / D1 API 的账号上下文                          | 同上                                    | 同上                                              |
| `WECHAT_SITE_VERIFY`                                | 微信网站管理员校验文件的 40 位内容                | Actions secret；另在 R2 存同路径副本     | 构建跳过生成，保留仓库外已有文件；线上校验失败    |
| `TURNSTILE_SECRET`                                  | Cloudflare Turnstile 服务端校验                   | `wrangler secret put`                   | 生产 fail-closed（登录/注册不可用）               |
| `TENCENTCLOUD_SECRET_ID` / `_SECRET_KEY`            | EdgeOne 缓存刷新（国内加速站）                    | Actions secret                          | 该步骤失败但 job 不红；加速站可能吐旧页           |
| `IMG_TOKEN`                                         | 图床上传（`scripts/cdn-jackets.cjs`）             | 本机环境变量或 `--token`                | 曲绘上传失败，只能手动补                          |
| `EDGEONE_ZONE_ID`                                   | 手动清 EdgeOne 缓存时指定站点                     | 本机临时变量                            | 手动清缓存不可用                                  |
| `GITHUB_TOKEN`                                      | 打 tag / 建 Release                               | Actions 内置                            | 发版流水线失败                                    |

密钥一律不进仓库：本机凭据放 `.devhome/`（已被 `.gitignore` 忽略），CI 走仓库 secret，Worker 走 `wrangler secret`。`src/data/site.json` 里只有版本号，没有任何凭据。
