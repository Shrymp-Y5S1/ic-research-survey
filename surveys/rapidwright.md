# RapidWright 详细调研报告

> AMD/Xilinx 研究院开源的 Vivado DCP 编程化操作框架 | [github.com/Xilinx/RapidWright](https://github.com/Xilinx/RapidWright)

## 快速概览

| 维度            | 内容                                                        |
| --------------- | ----------------------------------------------------------- |
| 定位            | Vivado 外部 DCP 读写框架——依赖 Vivado 但不依赖其 Tcl 接口 |
| 目标器件        | 7-Series / UltraScale / UltraScale+ 全系列（Versal 开发中） |
| 核心方法        | DCP 双向读写 + 六层器件模型 + TileTypeEnum 枚举             |
| 对精确故障注入的贡献 | TileTypeEnum 权威 Tile 枚举——支撑逻辑资源→物理地址映射；六层器件模型——统一术语体系 |
| 成熟度          | ★★★★★ 生产级                                           |

## 1. 技术方法与关键发现

### 1.1 DCP 双向读写

核心能力：在 Vivado 外部直接读写未加密的 Vivado Design Checkout (`.dcp`) 文件，绕开 Tcl 脚本接口。

| 能力   | 说明                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| 读 DCP | 解析 `.dcp`，还原完整逻辑网表（Cell/Net/Port）+ 物理网表（Site Placement/PIP/Node） |
| 写 DCP | 将修改后的设计写回 `.dcp`，可在 Vivado 中重新打开并生成 bitstream                   |

```
Vivado (OOC 综合/布局/布线) → .dcp → RapidWright (编程化操作) → .dcp → Vivado (bitstream 生成)
```

这是一个**双向通道**：RapidWright 操作的是 DCP（逻辑+物理网表），而非直接翻转 `.bit` 文件中的比特位。其 `ConfigArray` 类提供了 Row→Block→Frame 层次的 bitstream 配置数组视图，`getConfigBlock(tile)` 实现 "tile → Block → Frame[]" 正向查询。

### 1.2 六层器件模型

RapidWright 定义了 Xilinx FPGA 的六层物理体系，为本项目故障注入术语体系提供权威对齐基准：

| 层级             | 概念                                                             | 本项目对应             |
| ---------------- | ---------------------------------------------------------------- | --------------------- |
| **BEL**    | 原子单元：Logic BEL (LUT/FF/CARRY) + Routing BEL (FFMUX/DOUTMUX) | 故障注入目标          |
| **Site**   | BEL 容器 (SLICEL/SLICEM)，含 SitePin 和 SiteWire                 | SLICE                 |
| **Tile**   | 2D 网格基本单元，含 Wire 和 PIP                                  | tile_type / grid 坐标 |
| **FSR**    | Clock Region，US/US+ 统一 60 CLB 高                              | —                    |
| **SLR**    | 多 die SSIT 器件中的单个 die                                     | —                    |
| **Device** | 完整 FPGA 芯片                                                   | DeviceProfile         |

关键设计决策：Wire/PIP/Node 对象为**瞬态创建**（`new Wire(tile, index)`），不缓存在 Device 中——避免数百万对象同时驻留内存。Wire 由 `(tile, wireIndex)` 标识，O(1) 查找。

### 1.3 关键发现：TileTypeEnum

RapidWright **TileTypeEnum** 含 **1,887 种**官方 tile type（生成日期 2025-11-11），是本项目 tile type 前缀分类器（`CLEL_*` / `CLEM*` / `CLBLL_*` / `CLBLM_*`）的推导源。AMD 官方分类体系杜绝了前缀启发式的跨族不稳定问题。

### 1.4 器件支持

| 系列        | 状态          | 代表型号                                       |
| ----------- | ------------- | ---------------------------------------------- |
| 7-Series    | ★★★★★    | Artix-7, Kintex-7, Virtex-7, Zynq-7, Spartan-7 |
| UltraScale  | ★★★★★    | Kintex US, Virtex US                           |
| UltraScale+ | ★★★★★    | Kintex US+, Virtex US+, Zynq US+               |
| Versal      | ★★★ 开发中 | 部分支持，器件信息讨论见 GitHub Issue #631     |

## 2. 与本项目的关联

### 2.1 能力对照

| 方面          | 本项目 (当前)                       | RapidWright 可提供的                                    |
| ------------- | ----------------------------------- | ------------------------------------------------------- |
| 器件模型来源  | 自建 DeviceProfile + 手动 tile dump | 完整 tile/site/wire/PIP 数据库，可直接查询              |
| FAR 地址计算  | frame_adjust_table 逐列帧宽累加     | ConfigArray Row→Block→Frame 层次可交叉验证            |
| Tile 类型覆盖 | Vivado Tcl 导出 CELLS.csv           | TileTypeEnum 官方枚举验证                               |
| 故障地址生成  | 扫描链地址 = f(frame, word, bit)    | wire→site→BEL 物理对应关系映射                        |
| 逻辑资源定位  | 手动 BEL 坐标推导                   | `updateUserStateBits()` 展示 Cell→bitstream bit 定位 |

两者为**互补关系**：RapidWright 是"设计→位流"正向链路，本项目是"位流→故障→观察"逆向链路。

### 2.2 潜在集成路径

```
Vivado (设计 + bitstream)
        ↓
RapidWright (解析 DCP → 获取目标 BEL/Wire → 映射到 Tile/Frame)
        ↓
本项目 (Frame 地址计算 → 故障注入 → 结果分类)
```

关键接口点：`Wire.getTile()` → `Tile.getRow()/getColumn()` → `(row, col) → FAR` 映射。打通后可实现"指定逻辑资源（LUT/FF）→ 自动生成故障地址列表"闭环。

### 2.3 已验证项

- ConfigArray 的 Row→Block→Frame 组织与本项目 FAR→frame→word→bit 扫描链模型在概念上完全对应
- `getConfigBlock(tile)` 的正向查询逻辑与本项目 DeviceProfile + frame_adjust_table 目标一致
- Routing BEL (FFMUX 等) 对理解 scan chain 在 site 内部物理路径有参考价值

## 3. 局限

1. **非 AMD 官方产品**：研究项目，设计正确性由社区保证
2. **Vivado 依赖**：需安装 Vivado 获取器件数据库（`.device` 缓存）和生成 bitstream
3. **Java 技术栈**：核心为 Java，Python 绑定通过 Py4J 桥接，有额外进程通信开销
4. **Versal 支持不完整**：新一代 Versal 器件支持仍在开发中
5. **仅支持未加密 DCP**：加密 DCP 无法操作

## 参考资料

- [RapidWright GitHub](https://github.com/Xilinx/RapidWright)
- [RapidWright 官方文档](https://www.rapidwright.io/docs/)
- [RapidWright Javadoc](https://www.rapidwright.io/javadoc/)
- [Bitstream Manipulation](https://www.rapidwright.io/docs/Bitstream_Manipulation.html) — Packet/ConfigArray 双模型、Frame 读写
- [Xilinx Architecture Terminology](https://www.rapidwright.io/docs/Xilinx_Architecture.html) — BEL→Site→Tile→FSR→SLR→Device 六层体系
- [FPGA Interchange Schema](https://github.com/chipsalliance/fpga-interchange-schema) — 与 F4PGA 生态互操作格式
