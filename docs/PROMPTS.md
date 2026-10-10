# AI 素材提示词

## 角色头像

**替换方法**：把生成的图片命名为 `<角色编号>.webp`（也支持 `.png` 和 `.jpg`），放进 `src/assets/portraits/`，重新构建后会自动替换程序绘制的徽章头像。建议先压缩到 256×256 以内，这样离线单文件不会太大。

| 编号 | 角色 |
|---|---|
| `qin` | 老总师 秦岳 |
| `lin` | 指令长 林照 |
| `amara` | 工程师 阿玛拉·奥孔科 |
| `andrei` | 医生 安德烈·沃尔科夫 |
| `rin` | 地质学家 早川凛 |
| `zhou` | 周岚（可选） |
| `capcom` | 通信调度 许航（可选） |

**统一画风后缀**（每条提示词末尾都加上）：

> 写实电影感肖像，半身，正面略侧，冷色调控制室或舱内环境光，柔和轮廓光，浅景深，宇航服内衬或飞控制服，不要文字和标志，1:1，高细节，克制的表情

1. **qin**：中国男性，63 岁，白发，戴老花镜，深色夹克，站在飞控大厅屏幕前，背光，神情复杂，像是有心事。
2. **lin**：中国男性，42 岁，短发、两鬓微白，沉稳坚毅，深蓝色舱内服，肩部有任务徽章轮廓（不含文字）。
3. **amara**：尼日利亚女性，34 岁，短卷发，笑容明亮，袖口挽起，脸颊有一点机油痕迹，橙色工装。
4. **andrei**：俄罗斯男性，45 岁，胡须修剪整齐，眼神疲惫但温和，白色医疗背心套在舱内服外。
5. **rin**：日本女性，31 岁，扎马尾，眼神专注而兴奋，手持岩石样本袋，脸上沾着红色尘土。
6. **zhou**（可选）：中国女性，50 岁，职业装，干练，带一点压迫感。
7. **capcom**（可选）：中国男性，28 岁，戴耳机，坐在通信席位前，专注。

### 像素风版本（2026-10-08 新增，与 550 风格界面搭配）

替换方法与上面相同。像素图请按**最近邻**放大到 256×256 再导出 PNG，不要用平滑缩放。游戏会按 `image-rendering: pixelated` 显示头像，保证边缘锐利。

**统一画风后缀**：

> 像素画头像，64×64 像素网格，半身胸像，3/4 侧脸朝向画面右侧，纯黑背景，有限调色板（不超过 24 色），硬边像素，不要抗锯齿、不要渐变模糊，冷白色主光从左上方打来，右侧一道细细的信号红（#ff3b30）轮廓光，科幻飞控终端风格，不要文字和标志，1:1

英文版（Midjourney、Stable Diffusion 等工具对英文更敏感）：

> pixel art portrait, 64x64 pixel grid, bust shot, three-quarter view facing right, pure black background, limited palette (max 24 colors), crisp hard-edged pixels, no anti-aliasing, no blur, cool white key light from upper left, thin signal-red (#ff3b30) rim light on the right, sci-fi mission control terminal aesthetic, no text, no logos, 1:1

| 编号 | 中文提示词（后面接统一画风后缀） | English (append the suffix) |
|---|---|---|
| `qin` | 中国老人，63 岁，满头白发，戴细框老花镜，深色旧夹克，眉头微锁，眼神复杂，背后有暗淡的飞控大屏轮廓 | Chinese man, 63, white hair, thin reading glasses, worn dark jacket, slightly furrowed brow, complicated gaze, faint mission-control screens behind |
| `lin` | 中国男性，42 岁，短寸头，两鬓微白，下颌线硬朗，深蓝色舱内服，领口有任务徽章轮廓（无文字），神情沉稳 | Chinese man, 42, short buzz cut, greying temples, strong jaw, dark navy flight suit, blank mission patch on collar, calm steady expression |
| `amara` | 尼日利亚女性，34 岁，深色皮肤，短卷发，明亮的笑容，橙色工装袖口挽起，脸颊有一抹机油，耳后夹着一支笔 | Nigerian woman, 34, dark skin, short curly hair, bright smile, orange coveralls with rolled sleeves, grease smudge on cheek, pen tucked behind ear |
| `andrei` | 俄罗斯男性，45 岁，修剪整齐的络腮胡，眼神疲惫但温和，白色医疗背心套在灰色舱内服外，胸前别着一支小手电 | Russian man, 45, neatly trimmed beard, tired but kind eyes, white medical vest over grey flight suit, small penlight clipped to chest |
| `rin` | 日本女性，31 岁，高马尾，眼睛发亮、专注兴奋，脸颊沾着红色火星尘土，举着一个装岩石的样本袋 | Japanese woman, 31, high ponytail, bright eager focused eyes, red Martian dust on cheek, holding up a rock sample bag |
| `zhou`（可选） | 中国女性，50 岁，短发利落，深灰西装，抱臂，表情严肃带压迫感 | Chinese woman, 50, sharp short hair, dark grey suit, arms crossed, stern and pressuring expression |
| `capcom`（可选） | 中国男性，28 岁，戴单耳通信耳机和麦克风，浅蓝色制服衬衫，专注地看着屏幕，屏幕光照亮脸 | Chinese man, 28, single-ear headset with boom mic, light blue uniform shirt, focused on a screen, face lit by monitor glow |
| `you`（可选，玩家） | 只画背影：飞控总师坐在控制台前，面前是一排屏幕，看不到脸 | back view only: flight director seated at a console facing a wall of screens, face not visible |

提示：
- 把同一组提示词一次性生成，或者用同一个种子、同一张风格参考图逐个生成，才能保证几个人的画风一致。
- 头像会显示在两处：对话框里约 84×84，遥测抽屉里约 34×34。生成后请在 34 像素的尺寸下看一眼，确认五官还能认出来。

### 已接入的头像（2026-10-08）

- 已使用 **Codex 内置图片生成工具**完成像素版的 `qin`、`lin`、`amara`、`andrei`、`rin`、`zhou`、`capcom`、`you`，均位于 `src/assets/portraits/<编号>.png`。
- 先生成秦岳，再将其原图仅用作其他角色的画风参考，统一黑底、左上冷白主光和右侧红色轮廓光；玩家只画背影。实际提交给生成工具的完整提示词记录在 [portrait-generation.json](portrait-generation.json)。
- 生成原图经 `scripts/prep-portraits.py` 整理为 64×64 像素、最多 24 色，关闭抖动，再以最近邻放大到 256×256 PNG。程序自动加载，无需修改剧本或头像加载逻辑。
- 以后整理新的一组原图，可运行 `python scripts/prep-portraits.py <原图目录> <新的输出目录>`（需 Pillow）。原图按角色编号命名；脚本拒绝覆盖已有文件，确认新稿后再自行替换。
- 执行 `npm run build` 后头像会内联进 `dist/index.html`，离线运行无需额外图片目录；执行 `npm run package` 可更新离线压缩包。

## 配音

台词清单见 [voice-lines.json](voice-lines.json)，共 19 句，由 `npx tsx scripts/voice-lines.ts` 从剧本自动导出。每条都有编号、说话人和台词。

把音频保存为 `public/voice/<语速>/<编号>.mp3`，语速目录为 `slow`、`mid`、`fast` 三套（设置页“配音语速”切换，默认 `mid`；配音默认关闭）。建议码率 48 kbps 单声道，这样 19 句总共不到 1 MB。

| 说话人 | 音色建议 |
|---|---|
| 秦岳 | 六十多岁男声，低沉、慢，带一点沙哑 |
| 林照 | 四十岁男声，平稳、克制 |
| 阿玛拉 | 三十多岁女声，明亮、有活力 |
| 早川凛 | 三十岁女声，好奇、轻快 |

只有带编号的台词会尝试播放配音，文件缺失时自动跳过。
