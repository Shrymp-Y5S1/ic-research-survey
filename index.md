---
layout: home

hero:
  name: 'FPGA Bitstream 调研'
  text: '位流几何统一编址'
  tagline: FPGA 位流外部知识调研平台
  actions:
    - theme: brand
      text: 开始阅读
      link: /surveys/summary
    - theme: alt
      text: 跨厂商调研
      link: /surveys/multi-vendor-feasibility

---

## 调研对象多维对比

| 项目 | 类型 | 目标器件 | 核心方法 | 对本项目贡献 | 成熟度 |
|------|------|----------|----------|-------------|--------|
| RapidWright | 开源工具 | US/US+/7-Series | DCP 双向读写 + 六层器件模型 | TileTypeEnum 权威分类与术语对齐 | ★★★★★ |
| Project X-Ray | 开源工具 | 7-Series | 黑盒差分 Fuzzing | 逐列帧宽独立验证, FAR 位布局文档化 | ★★★★★ |
| Bitfiltrator | 学术论文/工具 | US/US+ | 全自动探针 LUT 法 | $f_x$ 物理自洽性验证 | ★★★★★ |
| Project U-Ray | 开源工具 | US/US+ | 继承 X-Ray Fuzzing | $w_f$/帧几何物理常数交叉验证 | ★★★☆☆ |
| ECP5 SEU Paper | 学术论文 | Lattice ECP5 | 全开源 SEU 分析 | 跨厂商互连故障行为一致性验证 | ★★★★☆ |
| 跨厂商调研 | 辅助调研 | 8 家厂商 | 生态扫描 + 原型验证 | Gowin/Lattice 适配路径评估 | ★★★☆☆ |
