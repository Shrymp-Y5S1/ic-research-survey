# FPGA 位流几何统一编址 — 外部调研综述

> **覆盖项目**：[Project X-Ray](https://github.com/f4pga/prjxray) / [Bitfiltrator](https://github.com/epfl-vlsc/bitfiltrator) / [Project U-Ray](https://github.com/f4pga/prjuray) / [RapidWright](https://github.com/Xilinx/RapidWright)
>
> **目标**：为三大家族（7-Series / UltraScale / UltraScale+）统一 frame 编址模型建立可追溯的外部知识基础。

---

## 1. 调研对象一览

| 项目 | 定位 | 覆盖器件 | 对本项目的核心贡献 | 详情 |
|------|------|---------|-------------------|------|
| **Project X-Ray** | 7-Series bitstream 逆向 | Artix-7, Zynq-7, Kintex-7 | 逐列帧宽独立验证, FAR 位布局文档化 | [→](./prjxray) |
| **Bitfiltrator** | US/US+ 独立物理 Oracle | 40 个 US/US+ 器件 | $f_x$ 系数独立验证, 物理自洽性确认 | [论文→](./bitfiltrator) · [代码→](./bitfiltrator-oss) |
| **Project U-Ray** | US/US+ 逆向（不完整） | ZU3EG | $w_f$/CLB/BRAM 物理常数确认 | [→](./prjuray) |
| **RapidWright** | AMD 官方 Tile 模型 | 7-S/US/US+ 全系列 | TileTypeEnum 权威分类, 术语对齐 | [→](./rapidwright) |
| **IOLTS 2025** | ECP5 SEU 鲁棒性分析 | LFE5UM-45F | 跨厂商故障行为一致性验证 | [→](./ecp5-seu-paper) |

---

## 2. 各项目核心贡献

### 2.1 Project X-Ray — 7-Series 物理帧几何

prjxray-db `part.json` 逐列帧数与 ARCH_REGISTRY 一致：**CLB=36, BRAM/DSP=28**。CFG_CLB 配置总线在 Artix-7 位流中确认不存在，验证仅处理 block-type-0 的决策正确。器件覆盖：xc7a100t / xc7z020 有完整 `part.json`；xc7k325t 以 xc7k70t fabric 数据作代理（同架构，tilegrid/segbits 可用）。

> 📋 [详细调研 →](./prjxray)

### 2.2 Bitfiltrator — US/US+ 注入系数独立物理测量

在 xcku040 上实测 **26.11 帧/FAR 列**，与 oracle 测试偏差 **<0.2%**（xcku5p 上 $f_x=27$ 通过验证，$f_x=22$ 被拒绝）。确立关键口径：**物理 CLB 帧宽 $\neq f_x$**——US 物理 12 帧/FAR 列但 $f_x=22$，US+ 物理 16 帧但 $f_x=27$；$f_x$ 是集成系数，吸收非 CLB 列（CMT/CLK/IO）贡献。覆盖 40 器件（论文）/ 38 器件（开源复现）。

> 📋 [论文 →](./bitfiltrator) · [代码 →](./bitfiltrator-oss)

### 2.3 Project U-Ray — 交叉验证基线

确认 LUT 等式、BRAM 内容、FF INIT、column minor 计数及 $w_f$/CLB/BRAM/DSP 常数与 Bitfiltrator 全部一致，为 US/US+ 地址计算提供独立交叉验证。

> 📋 [详细调研 →](./prjuray)

### 2.4 RapidWright — Tile Type 命名权威对齐

**TileTypeEnum**（1,887 种官方 tile type，生成日期 2025-11-11）为本项目前缀分类器提供 AMD 官方推导源。六层器件模型（BEL→Site→Tile→FSR→SLR→Device）杜绝前缀启发式（`CLBLL_*`/`CLBLM_*` vs `CLEL_*`/`CLEM_*`）的跨族不稳定。

> 📋 [详细调研 →](./rapidwright)

### 2.5 IOLTS 2025 — 跨厂商故障行为一致性

在 Lattice ECP5 (LFE5UM-45F) 上以完全开源工具链（Yosys + nextpnr + pyTrellis）实现位流级故障注入。互连故障行为（Open→stuck-at-1, Conflict→wired-AND）与 7-Series 一致，为跨厂商统一故障模型提供独立实验证据。

> 📋 [论文详情 →](./ecp5-seu-paper)

---

## 3. 跨厂商适配可行性

| 厂商 | 开源位流 DB | 格式理解度 | 寻址模型 | 学术 FI 先例 | 可行性 |
|------|-----------|----------|---------|-----------|--------|
| **Xilinx 7-S/US** (基线) | ★★★★★ | ★★★★★ | FAR 帧模型 | ★★★★★ | 已实现 |
| **Lattice iCE40/ECP5** | ★★★★★ | ★★★★★ | 2D tile 网格 | ★★★★☆ | **高** |
| **Gowin LittleBee/Arora** | ★★★★☆ | ★★★★☆ | 2D tile 网格 | ☆☆☆☆☆ | **中高** |
| **Intel/Altera Cyclone V** | ★★★☆☆ | ★★☆☆☆ | FAR-like | ★★☆☆☆ | 中低 |
| **Anlogic / 紫光 / Efinix / 复旦微** | ★☆☆☆☆ | ☆☆☆☆☆ | 未知 | ☆☆☆☆☆ | 低–极低 |

> 📋 [详细报告 →](./multi-vendor-feasibility)

**ECP5 (Lattice)**：IOLTS 2025 论文验证了完全开源工具链（Yosys + nextpnr + pyTrellis）在 ECP5 上实现位流级故障注入的可行性——互连故障行为（Open→stuck-at-1, Conflict→wired-AND）与 7-Series 一致。局限：离线 bitstream 篡改 + 重新加载方式不适合大规模统计注入。📋 [论文详情 →](./ecp5-seu-paper)

**Gowin**：GOWIN_FI 独立原型（12 模块, 48 测试）已验证 tile-grid 二维寻址可承载 LUT 级故障注入，GW2A-18 chipdb 构建成功。GW5A-25A 受阻于 Apicula FSE parser 对 V1.9.12 的兼容性问题。

**核心障碍**：跨厂商移植的根本难点是配置寻址模型差异——Xilinx FAR 线性帧模型 vs Lattice/Gowin 二维 tile 网格（相似度仅 20–40%），帧公式需替换为 `tile[row][col].config_offset + bel_internal_bit_offset` 的 tile 内位坐标查找模式。

---

## 4. 结论

各调研对象为本项目提供了独立可追溯的外部验证：

1. **7-Series 逐列帧宽** ← prjxray-db `part.json` 与 ARCH_REGISTRY 一致（CLB=36, BRAM/DSP=28）
2. **US/US+ 物理常数与 $f_x$ 系数** ← Bitfiltrator 独立物理测量，与 oracle 偏差 <0.2%；Project U-Ray 交叉验证常数一致
3. **三族 tile type 命名** ← RapidWright TileTypeEnum 1,887 种官方枚举，六层器件模型提供权威对齐
4. **跨厂商故障行为一致性** ← IOLTS 2025 验证 ECP5 互连故障行为与 7-Series 一致
5. **跨厂商寻址模型差异** ← 明确为 FAR 线性帧 vs tile 二维网格的根本分歧，Lattice ECP5 路径可行性最高
