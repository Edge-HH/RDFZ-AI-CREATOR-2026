# 资产来源与使用说明

- `models/rover.glb`：NASA/JPL-Caltech 的 Mars 2020 Perseverance Rover，来自 NASA 官方 NASA-3D-Resources 仓库。源模型约 4.99 MB；本地版本约 2 MB，经过几何去重、简化、Meshopt 压缩和 WebP 纹理处理。仅作为无人设备的态势模型，不宣称它可运送五人或适用于本作的虚构环境。
- 源地址： https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Mars%202020%20Perseverance%20Rover
- 官方资源库声明： https://github.com/nasa/NASA-3D-Resources/blob/master/README.md
- 使用指南： https://www.nasa.gov/nasa-brand-center/images-and-media/
- NASA 资料一般允许教育、信息展示、计算机模拟和网页使用，需注明来源，不暗示 NASA 背书。本项目未使用 NASA 标志作品牌。
- `models/engine.glb`、`models/drone.glb`：本项目原创，生成源位于 `scripts/generate-models.mjs`。发动机不是现实可建造的行星发动机。
- 界面图标与 favicon：项目原创 SVG；字体采用系统回退，没有下载第三方字体。
- 音效：`src/adapters/Sound.ts` 用 Web Audio 即时合成，原创，不含电影音乐/对白。
- Three.js 及其 GLTFLoader、OrbitControls、Meshopt 解码器由锁定的 npm 依赖本地构建，遵循对应 MIT 许可；发行文件包含源码许可证标注。
- 本作不使用电影角色、台词、原画、配乐或模型资产。

模型是本地文件，运行时不向 NASA、CDN 或其他模型站点请求资源。模型失败时保留程序化表示，规则不受影响。
