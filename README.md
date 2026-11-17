# NTQQ掉线邮件通知

LuckyLillia 的独立插件 `@luckylillia/plugin-ntqq-offline-email`，在 NTQQ 账号掉线、会话失效、被踢下线或持续断网超过 10 秒时，通过 SMTP 发送邮件。

需要安装 `@luckylillia/plugin-nt-protocol`，通过 LuckyLillia 插件页安装、信任并启用本插件，也可以使用 `--plugin @luckylillia/plugin-ntqq-offline-email`。插件不适用于 QQ 开放平台官方机器人。

设置页标题为“NTQQ掉线邮件通知”，地址通过插件卡片的“打开设置页”进入。配置 SMTP 主机、端口、加密方式、用户名、密码和收发邮箱。密码通过宿主插件配置接口打码，支持保留或显式清空；可以在插件停用时保存草稿。启用后才能发送测试邮件，测试不要求 NTQQ 已登录，使用表单当前值，无需先保存。

首次登录前不通知，主动退出或停用协议不通知。同一次掉线只发送一次，重新登录或重连后重新布防。停用或卸载本插件会移除监听、断网检测回调和测试邮件路由，不留后台 standby 代码。

Bot 启动迁移把旧 `builtin:email-notification` 条目改为本包名，保留条目 ID、SMTP 配置、密码、开关、生效范围、消息顺序和界面偏好，不会自动安装或授予第三方信任。旧 `email.json` 同样迁到本包条目。

## 开发

```sh
npm install
npm run check
npm test
npm run build
npm pack --dry-run
```

开发环境通过已发布 NTQQ npm 包的公开类型契约编译；运行时只访问注入的协议服务，不导入 NTQQ 的实现或原生模块。发布包只包含 `lib`、说明和许可证。浏览器共享 React 与 WebUI SDK，样式随插件打包。
