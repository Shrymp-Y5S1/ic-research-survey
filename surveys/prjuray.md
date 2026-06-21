# Project U-Ray (prjuray) 详细调研报告

> UltraScale/US+ bitstream 黑盒差分 Fuzzing 逆向工程 — Project X-Ray 继任项目 | [github.com/f4pga/prjuray](https://github.com/f4pga/prjuray)
>
## 快速概览

| 维度 | 内容 |
|------|------|
| 定位 | UltraScale/US+ bitstream 格式逆向文档化——Project X-Ray 的继任项目 |
| 目标器件 | Kintex US (XCKU025–XCKU040), Kintex US+ (XCKU3P/5P), Virtex US+, Zynq US+ MPSoC (ZU2–ZU7) |
| 核心方法 | 继承 prjxray 黑盒差分 Fuzzing 方法论，适配 US/US+ 架构差异 |
| 对精确故障注入的贡献 | US/US+ 物理常数确认 ($w_f$, CLB/BRAM/DSP 帧数)；为 Bitfiltrator 独立测量提供交叉验证基线 |
| 成熟度 | ★★★☆☆ (远未达到 prjxray 7-Series 成熟度；大部分器件处于 TBD 阶段) |

## 1. 技术方法与关键发现

### 1.1 与 prjxray 的方法论继承

prjuray 继承 prjxray 的 Fuzzing → 差分对比 → 数据库组装流程，但针对 US/US+ 架构差异做了适配。核心差异在于物理常数：

| 参数 | 7-Series (prjxray) | UltraScale (prjuray) | UltraScale+ (prjuray) |
|------|-------------------|---------------------|----------------------|
| Words per Frame | 101 | 123 | 93 |
| CLB Frames/Column | 36 | 12 | 16 |
| BRAM Frames/Column | 128 | 128 | 256 |
| DSP Frames/Column | 28 | 4–6 | 8 |
| CLB Words/Column | 3,636 | 1,476 | 1,488 |
| BRAM Words/Column | 12,928 | 15,744 | 23,808 |

US+ 每 frame 更少 word（93 vs 123）但每列更多 frame（16 vs 12），总配置数据量相近；BRAM 配置容量翻倍是 US+ 的主要差异。

### 1.2 各组件完成度

| 组件 | 完成度 | 说明 |
|------|--------|------|
| 基础 bitstream 解析 | ★★★★ | bit2fasm.py 可解析基本结构 |
| CLB/CLE tile | ★★★ | LUT/FF 部分 feature 已映射 |
| BRAM tile | ★★ | 基本映射，内容总线部分完成 |
| DSP tile | ★★ | 部分 feature 已映射 |
| I/O tile | ★ | HDIO 配置 bit 存在问题 (Issue #15) |
| 互连/INT tile | ★★ | 基本 PIP 映射 |
| 完整 tilegrid | ★★ | 部分器件有 tilegrid，完整度不一 |

总体判断：prjuray 远未达到 prjxray 的成熟度，对 US/US+ 更多是概念验证 + 基础框架，而非完整可用的 bitstream 数据库。

## 2. 与本项目的关联

### 2.1 已验证项

| 资源 | 对本项目的价值 |
|------|---------------|
| US/US+ 物理常数 ($w_f$, CLB/BRAM/DSP 帧数) | 与 ARCH_REGISTRY 交叉验证——CLB=12/16, BRAM=128/256, DSP=4-6/8 均确认 |
| LUT/BRAM/FF INIT 映射 | 经 Bitfiltrator 在 40 器件上独立验证，与 prjuray 数据库一致 |
| FAR 位布局 (US vs US+) | Block Type/Row/Column/Minor 位段差异精确文档化 |

### 2.2 Bitfiltrator 独立实测结果

使用 Bitfiltrator 对 xcku040-ffva1156-2-i 和 xcku5p-ffvb676-2-i 进行 per-frame-CRC 帧地址枚举，提取每个 FAR COL_ADDR 的 CLB_IO_CLK 独立 MINOR_ADDR 数（= 物理帧数/列）：

**xcku040 (UltraScale)**

| CLB_IO_CLK 帧数/FAR 列 | (row,col) 组数 | 百分比 | 推测列类型 |
|------------------------|---------------|--------|-----------|
| 12 | 510 | 51.0% | CLB 列 (与 prjuray CLB=12 一致) |
| 58 | 330 | 33.0% | CMT/CLK 资源列 |
| 4 | 115 | 11.5% | IO/边界列 |
| 2/6/10/16 | 45 | 4.5% | 特殊资源 |
| **平均** | **26.11 帧/列** | — | — |

关键发现：平均 26.11 帧/FAR 列与 oracle 测试的 $\text{slope} \cdot f_x = 26.1$ (xcku040 验证值) 精确吻合，确认注入模型物理自洽。

**xcku5p (UltraScale+)**

| CLB_IO_CLK 帧数/FAR 列 | (row,col) 组数 | 百分比 | 推测列类型 |
|------------------------|---------------|--------|-----------|
| 16 | 452 | 49.1% | CLB 列 (与 prjuray CLB=16 一致) |
| 76 | 300 | 32.6% | CMT/CLK 资源列 |
| 8 | 84 | 9.1% | IO/边界列 |
| 4/6/9/10/12 | 84 | 9.1% | 特殊资源 |
| **平均** | **33.93 帧/列** | — | — |

### 2.3 口径差异说明

prjuray/Bitfiltrator 测量的 "CLB = 12/16 帧" 与 ARCH_REGISTRY 中的 $f_x$ 系数是**不同口径**，不可直接比较：

| 指标 | 测量工具 | 含义 | US 值 | US+ 值 |
|------|----------|------|-------|--------|
| CLB CLB_IO_CLK 帧/FAR 列 | prjuray / Bitfiltrator | 物理：每 FAR COL_ADDR 有多少 CLB_IO_CLK MINOR_ADDR | **12** | **16** |
| 平均 CLB_IO_CLK 帧/FAR 列 | Bitfiltrator | 物理：所有列类型的加权平均 | **26.1** | **33.9** |
| $f_x$ 系数 | 硅片 oracle 线性拟合 | 模型：注入公式中 SLICE-X 步长对应的帧数偏移系数 | **22** | **27** |

$f_x$ 不是对 CLB_IO_CLK 物理帧宽的直接测量，而是从硅片 oracle 线性拟合得到的集成系数，吸收非 CLB 列 (CMT/CLK/IO) 的物理帧贡献。两者在各自模型框架内正确，但语义不同。

## 3. 局限

1. **数据库不完整**：大部分 tile 类型只有部分 feature 被映射，I/O 和 clock 资源尤其薄弱
2. **缺乏 tilegrid.json**：仅有部分器件有完整 tilegrid
3. **社区停滞**：2020 年后贡献大幅下降，目前仅有偶发性维护
4. **已知 Bug**：HDIO IO configuration bits 存在问题 (Issue #15)
5. **器件覆盖率低**：远不及 prjxray 在 7-Series 上的覆盖广度，不能作为唯一数据源

## 参考资料

- [Project U-Ray GitHub](https://github.com/f4pga/prjuray)
- [Bitfiltrator: A General Approach for Reverse-Engineering Xilinx Bitstream Formats (FPL 2022, EPFL)](https://www.computer.org/csdl/proceedings-article/fpl/2022/739000a192/1KJwAykgqti)
- [Project X-Ray (前身项目)](https://github.com/f4pga/prjxray)
