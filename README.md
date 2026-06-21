# FPGA Bitstream 调研总览

FPGA 位流几何统一编址 — 三大家族 (7-Series / UltraScale / UltraScale+) 外部知识调研平台。

## 内容概览

- **FPGA 位流逆向工程** — Project X-Ray、Bitfiltrator、Project U-Ray、RapidWright 的调研与评估
- **学术论文** — Bitfiltrator (FPL 2022) 全自动位流逆向及 ECP5 SEU 鲁棒性分析 (IOLTS 2025)
- **跨厂商调研** — 覆盖 Intel、Gowin、Lattice、紫光同创等 8 家厂商的适配可行性评估

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run docs:dev

# 构建生产版本
npm run docs:build

# 预览构建结果
npm run docs:preview
```

## 部署

通过 GitHub Actions 自动部署至 [GitHub Pages](https://shrymp-y5s1.github.io/ic-research-survey/)，`main` 分支推送后自动触发构建。

## 技术栈

- [VitePress](https://vitepress.dev/) — 静态站点生成器
- [markdown-it-katex](https://github.com/waylonflinn/markdown-it-katex) — 数学公式渲染
