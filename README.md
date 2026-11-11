# 声迹 · 音视频嗅探

Chrome / Edge Manifest V3 插件，识别当前页面实际加载的音视频地址，支持复制链接和使用浏览器保存文件。无需安装依赖或构建。

## 安装与使用

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 开启「开发者模式」，点击「加载已解压的扩展程序」。
3. 选择项目内包含 `manifest.json` 的 `extension` 文件夹。
4. 刷新目标网页，点击页面上的音频或视频播放按钮。
5. 打开插件，查看当前标签页的媒体，必要时点击「重新扫描」。
6. 点击「复制链接」或「保存文件」。

「发现地址」表示从页面、播放器或接口数据提取到链接；「响应已确认」表示观察到 HTTP 200/206 的媒体响应。发现地址不代表下载成功，保存结果以浏览器下载状态为准。

## 实现与功能

- `background.js`：被动监听网络响应，按 URL 和 Content-Type 识别媒体，保存标签页记录和下载状态。
- `content.js`：扫描 audio、video、source、页面元数据、内联数据和资源加载记录。
- `page-hook.js`：在页面主世界监听 fetch / XHR 的 JSON 响应，提取媒体地址。
- `core.js`：地址校验、格式识别、转义数据解析、文件名处理和占位音频过滤。
- `popup.html`、`popup.css`、`popup.js`：中文操作界面、筛选、复制链接和下载。

支持识别 MP3、MP4、M4A、AAC、WAV、OGG、Opus、WebM、FLAC。M3U8 / MPD 仅展示清单地址，不合并分段。保留媒体链接中的查询参数和签名，按标签页去重，关闭标签页后清除对应记录。

Suno 适配解析页面中的 `media_urls`，过滤静音占位和禁止访问接口，按歌曲 UUID 排除其他歌曲。媒体格式以实际地址或响应类型为准；若页面只提供 M4A，不会将其伪装成 MP3。

## 本地转码为 MP3

`tools/convert-to-mp3.ps1` 将已经下载到本地的媒体文件转成真正的 MP3，需要 FFmpeg 在 PATH 中。脚本不会自动下载歌曲，也不会覆盖已有输出文件。

```powershell
.	oolsconvert-to-mp3.ps1 -InputPath 'C:UsersAdministratorDownloads歌曲.m4a'
# 或指定输出路径：
.	oolsconvert-to-mp3.ps1 -InputPath '.歌曲.m4a' -OutputPath '.歌曲.mp3'
```

使用 `libmp3lame -q:a 2` 编码。M4A / Opus 转 MP3 是有损转码，不会提升原音质。

## 权限与限制

- `webRequest`：读取媒体请求及响应头。
- `storage`：在本地浏览器会话中保存媒体地址和下载状态。
- `downloads`：用户点击保存时交给浏览器下载。
- `scripting` / `activeTab`：补扫已经打开的页面。
- HTTP / HTTPS 站点权限：识别网页及跨域 CDN 上的媒体。

数据在本机处理，不上传服务器。网页媒体可能需要登录或包含临时签名；插件不会绕过 DRM、付费限制或服务器访问控制。`blob:` 缓冲区导出和分段合并暂不支持。复制出的地址可能包含临时授权参数，请遵循作品授权并谨慎分享。
