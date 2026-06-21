# FPGA 故障注入系统跨厂商扩展可行性调研

> **调研范围**: Xilinx/AMD → Intel/Altera, Gowin/高云, 紫光同创/Pango, 安路科技/Anlogic, Lattice, Efinix, 复旦微
> **核心结论**: Lattice ECP5 是唯一具备立即启动条件的非 Xilinx 目标；Gowin 次之；其余厂商当前不具备可行性。

---

## 快速概览

| 厂商                             | 开源位流 DB | 位流格式理解度 | 寻址模型     | 学术 FI 先例 | 综合可行性     |
| -------------------------------- | ----------- | -------------- | ------------ | ------------ | -------------- |
| **Xilinx 7-S/US** (基线)   | ★★★★★  | ★★★★★     | FAR 帧模型   | ★★★★★   | 已实现         |
| **Lattice iCE40/ECP5**     | ★★★★★  | ★★★★★     | 2D tile 网格 | ★★★★☆   | **高**   |
| **Gowin LittleBee/Arora**  | ★★★★☆  | ★★★★☆     | 2D tile 网格 | ☆☆☆☆☆   | **中高** |
| **Intel/Altera Cyclone V** | ★★★☆☆  | ★★☆☆☆     | FAR-like     | ★★☆☆☆   | 中低           |
| **Anlogic EAGLE/PHOENIX**  | ★★★☆☆  | ★★☆☆☆     | 未知         | ☆☆☆☆☆   | 低             |
| **紫光同创 Titan/Logos**   | ☆☆☆☆☆  | ☆☆☆☆☆     | 未知         | ☆☆☆☆☆   | 极低           |
| **Efinix Trion/Titanium**  | ☆☆☆☆☆  | ☆☆☆☆☆     | 未知         | ☆☆☆☆☆   | 极低           |
| **复旦微**                 | ☆☆☆☆☆  | ☆☆☆☆☆     | 未知         | ☆☆☆☆☆   | 极低           |

---

## 1. 动机与核心障碍

### 1.1 跨厂商扩展的学术意义

当前 FPGA 故障注入系统完全依赖 Xilinx/AMD 生态——位流格式解析基于 FAR 帧地址寄存器，器件几何模型仅适配 UltraScale / UltraScale+ / 7-Series，EDA 工具链集成（Vivado Tcl batch mode）不可移植到其他厂商，所有参考数据源（Project X-Ray, RapidWright, prjxray-db）均为 Xilinx 专属。

跨厂商扩展有三重动机：

1. **学术普适性**：若能在 2+ 厂商平台上完成故障注入实验，论文结论将不再受限于 "Xilinx-specific" 质疑
2. **方法学验证**：基于 tile type 的白盒分类器、架构真理注册表等核心设计思想是否真正跨架构通用，需要第二厂商验证
3. **生态覆盖**：国产 FPGA（高云、紫光、安路）在关键领域替代 Xilinx 趋势明显

### 1.2 核心障碍：配置寻址模型差异

跨厂商移植的根本技术挑战在于**不同厂商的配置内存寻址模型不同**：

| 厂商架构                    | 寻址模型                                                              | 与 Xilinx FAR 模型的相似度 |
| --------------------------- | --------------------------------------------------------------------- | -------------------------- |
| **Xilinx 7-S/US/US+** | FAR (Frame Address Register): BlockType + Half + Row + Column + Minor | 100% (基线)                |
| **Intel/Altera**      | FAR-like: Row + Column + BlockType + FrameIndex                       | ~70% (同为帧寻址)          |
| **Lattice iCE40**     | 2D tile 网格: (row, col) → tile 内 bit 偏移                          | ~20% (非帧寻址)            |
| **Lattice ECP5**      | 2D tile 网格 + 帧列（混合模型）                                       | ~40%                       |
| **Gowin (Apicula)**   | 2D tile 网格: (row, col) → tile bitmap → bit 位置                   | ~20% (非帧寻址)            |
| **Anlogic (prjtang)** | 未知（可能类似 Gowin tile 网格）                                      | ~10%                       |

**关键洞察**：Xilinx 的 FAR 帧模型在行业中并非主流。Lattice 和 Gowin 采用更直接的 tile 网格寻址，意味着现有的帧级地址计算公式（`(列偏移 × f_x + 行内索引 × f_y) × w_f`）需替换为 `tile[row][col].config_offset + bel_internal_bit_offset` 的二维查找表模式。寻址模型的根本差异是跨厂商移植的核心技术难点，也是决定厂商可行性的首要因素。

---

## 2. 各厂商生态分析

### 2.1 Intel/Altera

#### 器件覆盖

- **Cyclone 系列**：Cyclone IV (60nm), Cyclone V (28nm), Cyclone 10
- **Arria 系列**：中端，带收发器
- **Stratix 系列**：高端，最大容量
- **MAX 系列**：CPLD/小容量 FPGA
- **Agilex 系列**：最新 (Intel 7/10nm)，Chiplet 架构

#### 开源位流逆向工程现状

| 项目                                | 覆盖器件            | 成熟度     | 说明                                            |
| ----------------------------------- | ------------------- | ---------- | ----------------------------------------------- |
| **mistral** (gatecat/mistral) | Cyclone V           | ★★★☆☆ | 帧结构解析、器件几何、部分 fuzzing 数据         |
| **Cyclone IV RE**             | Cyclone IV EP4CE6   | ★★☆☆☆ | 2025 年新项目，6272 LE、392 LAB 映射完成        |
| **debit** (djn3m0/debit)      | 多厂商（含 Altera） | ★☆☆☆☆ | 2016 年停更，仅有基本 .rbf 读取                 |
| **openFPGALoader**            | 多数 Altera 器件    | ★★★★☆ | 支持 .rbf/.sof 下载，但**不解析**位流内容 |

#### 位流格式已知信息

- **格式**：RBF (Raw Binary File) 为最简格式，直接 dump 配置数据
- **帧结构**：基于 FAR（Frame Address Register），字段包括 Row/Column/BlockType/FrameIndex
- **配置内存**：按列类型分块（LAB, M9K, DSP, I/O），类似 Xilinx 的三分类法
- **关键未知**：Intel 未公开帧到逻辑资源的精确 bit 映射；不同器件系列的 FrameSize 尚需实测

#### 学术故障注入工作

| 论文                                      | 方法                               | 器件       | 年份 |
| ----------------------------------------- | ---------------------------------- | ---------- | ---- |
| **SCFIT** (DATE 2012)               | JTAG 扫描链 SEU 注入（FF + 内存）  | Altera     | 2012 |
| **Asadi et al.** (FPT 2003)         | CRAM 位流直接操作                  | Flex10K200 | 2003 |
| **FITO** (Shokrollah-Shirazi)       | 综合后网表修改 + 重 P&R            | Altera     | 2008 |
| **Shadow Components** (Sharif Univ) | JTAG/SignalTap 注入 (SEU/MBU/串扰) | Altera     | —   |

**共同缺陷**：大多数工作在 10+ 年前完成，方法依赖旧版 Quartus II，未形成可复用的开源工具链。

#### Quartus Tcl API 能力

| 需求                | 对应 API                                       | 状态    |
| ------------------- | ---------------------------------------------- | ------- |
| 获取 CELL 位置      | `get_location_assignment`, `get_cell_info` | ✅ 可用 |
| 获取布线后节点信息  | `::quartus::sta::get_node_info`              | ✅ 可用 |
| 导出逻辑位置文件    | 无直接等价于 Vivado .ll 的功能                 | ❌ 缺失 |
| 导出 Essential Bits | 无等价功能                                     | ❌ 缺失 |
| 导出位流            | `execute_module -module asm`                 | ✅ 可用 |
| 批量模式 Tcl        | `quartus_sh -t <script.tcl>`                 | ✅ 可用 |

**关键差距**：Quartus 缺少 Vivado 的 `write_bitstream -logic_location_file -essential_bits` 一体化导出。需要通过 `quartus_cdb`（Chip Database）、`quartus_fit` 的 report 输出、以及 `.qsf` assignment 交叉计算来**间接获取**逻辑单元物理坐标。

#### 可行性评估

| 维度           | 评级       | 说明                                              |
| -------------- | ---------- | ------------------------------------------------- |
| 位流格式可及性 | ★★☆☆☆ | 仅有碎片化逆向数据 (Cyclone IV/V)，无生产级数据库 |
| EDA 工具集成   | ★★★☆☆ | Quartus Tcl API 存在，但缺 .ll/.ebd 等价导出      |
| 学术参考       | ★★☆☆☆ | 论文老旧，方法不可直接复用                        |
| 器件文档开放度 | ★★☆☆☆ | Intel 位流格式专有，公开文档极少                  |
| 社区生态       | ★★☆☆☆ | mistral 是最活跃项目，但人力极少                  |

**总体可行性：低～中**。若仅针对 Cyclone V（mistral 覆盖最好），存在概念验证的可能。但面向前沿器件（Agilex/Stratix 10），基础设施几乎为零。

---

### 2.2 Gowin/高云

#### 器件覆盖

| 系列                                  | 类型                | LUT 规模  | 工艺 | 特性                  |
| ------------------------------------- | ------------------- | --------- | ---- | --------------------- |
| **LittleBee** (GW1N/R/Z/NS/NRF) | Flash-based, 非易失 | 1K–10K   | 55nm | 硬核 MCU/BLE/安全变体 |
| **Arora** (GW2A/AR/AN/ANR)      | SRAM-based          | 10K–55K  | 55nm | 位流加解密 + 解压缩   |
| **Arora V** (GW5A/5AST)         | SRAM, 最新高端      | 25K–138K | 22nm | SerDes, DSP, MIPI     |
| **GW3A** (2026)                 | SerDes/MIPI 增强    | —        | —   | 即将发布              |

#### 开源位流逆向工程 — Project Apicula

[Project Apicula](https://github.com/YosysHQ/apicula) 是 Gowin 生态最重要的开源资产：

| 组件                              | 功能                                             | 成熟度              |
| --------------------------------- | ------------------------------------------------ | ------------------- |
| `apycula` (Python 包)           | 位流解析、chipdb 生成、fuse 表管理               | ★★★★☆ 生产可用 |
| `gowin_pack` / `gowin_unpack` | 位流打包/解包                                    | ★★★★☆ 生产可用 |
| fuzzers (`tiled_fuzzer.py`)     | 自动化 tile→bit 映射逆向                        | ★★★★☆ 活跃开发 |
| nextpnr-himbaechel                | 布局布线（Gowin 架构目标）                       | ★★★★☆ 生产可用 |
| Yosys `synth_gowin`             | 综合                                             | ★★★★☆ 生产可用 |
| chipdb (Pickle)                   | 器件 tile 网格、BEL、PIP、bit 位置               | ★★★★☆ 完整     |
| vendor file parsers               | .dat (PnR data), .fse (fuse table), .tm (timing) | ★★★★☆ 完整     |

#### 位流格式已知信息

Apicula 对 Gowin 位流格式的逆向理解已经相当完整：

- **结构**：文本命令头 + 二进制数据段（每 tile 一行，每行约 60×24 bit）
- **Tile 模型**：逻辑 tile 底部 4 行 = LUT+FF，顶部 20 行 = 路由 MUX
- **chipdb 包含**：每个 tile 的 (row, col) 坐标 → BEL 列表 → 每个 BEL 的配置 bit 位置
- **跨器件覆盖**：GW1N-1/GW1N-9/GW1NR-9 最完整；GW2A/GW5A 较新，尚在完善

**关键差异**：Gowin 不使用 Frame Address Register (FAR) 模式，而是基于 tile 网格的二维寻址。现有帧级地址计算公式不直接适用，但 tile 网格的寻址模型可能更简单（直接 tile 坐标 → bit 偏移）。

#### 学术故障注入

**目前未发现针对 Gowin FPGA 的学术故障注入论文**。Apicula 提供了位流级别的读写能力，理论上可以构建故障注入工具链，但需要从头开发。

#### Gowin EDA (YunYuan) Tcl 能力

- `gw_sh` 命令行 Tcl shell：支持 `run_synthesis`, `run_place_and_route`, `run_bitstream`
- 物理约束文件 (`.cst`)：定义 IO 和布局约束
- 报告输出：`.rpt`, `.pin`, `.power.html`
- **缺失**：无 Vivado `write_bitstream -logic_location_file` 等价功能；需要从 `.fs` 位流和 Apicula 的 chipdb 间接重建逻辑位置映射

#### 可行性评估

| 维度           | 评级       | 说明                                     |
| -------------- | ---------- | ---------------------------------------- |
| 位流格式可及性 | ★★★★☆ | Apicula chipdb 提供完整的 tile→bit 映射 |
| EDA 工具集成   | ★★★☆☆ | gw_sh 存在但 API 远不如 Vivado 丰富      |
| 学术参考       | ★☆☆☆☆ | 无先例                                   |
| 器件文档开放度 | ★★★☆☆ | 厂商文档有限，但 Apicula 补全了大量空白  |
| 社区生态       | ★★★★☆ | YosysHQ 维护，活跃社区                   |

**总体可行性：中～高**。在所有候选厂商中，Gowin 拥有最完整的开源位流逆向工程成果。Apicula 的 chipdb 数据模型（tile 网格 + BEL bitmap）与基于 tile type 的分类方法天然契合。且率先完成 Gowin 故障注入具有显著的学术新颖性。

---

### 2.3 紫光同创/Pango

#### 器件覆盖

| 系列                    | 定位            | 代表器件                   | 工艺        |
| ----------------------- | --------------- | -------------------------- | ----------- |
| **Titan**         | 高性能          | PGT180H, PG2T390H, PG3T500 | 28nm/FinFET |
| **Logos/Logos-2** | 高性价比        | PGL22G, PGL50H, PG2L200H   | 28nm        |
| **Compa**         | CPLD            | PGC2400G                   | —          |
| **Kosmo**         | SoPC (FPGA+CPU) | PG2K100, PG2K400           | —          |

#### 开源位流逆向工程

**无。** 目前没有任何已知的紫光位流逆向工程项目。

#### 位流格式

**完全专有。** 紫光未公开任何位流格式信息。Pango Design Suite (PDS) 生成专有位流文件，格式未文档化。

#### PDS Tcl API

PDS 提供 `pds_shell.exe` 命令行 Tcl 接口，但公开的 Tcl API 文档极不完整。未发现类似 Vivado `get_tiles`/`get_sites`/`get_bels` 的器件内省 API。

#### 学术故障注入

**未发现。** 搜索中英文数据库未找到任何针对紫光 FPGA 的故障注入研究。

#### 可行性评估

| 维度           | 评级       | 说明                            |
| -------------- | ---------- | ------------------------------- |
| 位流格式可及性 | ☆☆☆☆☆ | 零公开信息                      |
| EDA 工具集成   | ★☆☆☆☆ | pds_shell 存在但 API 严重不完整 |
| 学术参考       | ☆☆☆☆☆ | 无                              |
| 器件文档开放度 | ★☆☆☆☆ | 仅基础用户手册                  |
| 社区生态       | ☆☆☆☆☆ | 无开源社区                      |

**总体可行性：极低。** 紫光同创在可预见的未来不具备支撑故障注入系统的基础设施。

---

### 2.4 安路科技/Anlogic

#### 器件覆盖

| 系列                     | 定位                 | 代表器件        |
| ------------------------ | -------------------- | --------------- |
| **ELF** (AL3)      | 低功耗, 非易失       | AL3-10          |
| **EAGLE** (EG4)    | 中等规模, 集成 SDRAM | EG4S20, EG4D20  |
| **PHOENIX** (PH1A) | 高性能               | PH1A60, PH1A100 |
| **SWIFT** (SF1)    | SoC (FPGA+CPU)       | SF1S60          |
| **DRAGON** (DR1)   | 高端                 | DR1M90          |

#### 开源位流逆向工程 — Project Tang (prjtang)

| 项目                               | 覆盖器件                | 成熟度     | 说明                         |
| ---------------------------------- | ----------------------- | ---------- | ---------------------------- |
| **prjtang** (mmicko/prjtang) | EAGLE EG4, PHOENIX PH1A | ★★★☆☆ | 位流格式解析，开源工具链支持 |
| Yosys `synth_anlogic`            | EG4, PH1A               | ★★★☆☆ | 综合支持                     |
| nextpnr-anlogic                    | EG4, PH1A               | ★★★☆☆ | 布局布线                     |
| openFPGALoader                     | EG4, PH1A               | ★★★★☆ | 位流下载                     |

**2026 Q1 量产验证结果**（来自 prjtang 开发者报告）：

- 中等设计，LUT 使用率偏差 +4.3%，Fmax 偏差 -5.5%
- 已在真实硬件上完成流片验证

#### 位流格式

prjtang 已对 Anlogic EG4 和 PH1A 的位流格式进行了部分逆向，但文档化程度远不如 Project Apicula (Gowin) 或 Project X-Ray (Xilinx 7-Series)。位流是专有的，prjtang 的知识来自 fuzzing。

#### 学术故障注入

**未发现**针对 Anlogic 器件的故障注入论文。

#### 可行性评估

| 维度           | 评级       | 说明                                 |
| -------------- | ---------- | ------------------------------------ |
| 位流格式可及性 | ★★★☆☆ | prjtang 有部分逆向，但不完整         |
| EDA 工具集成   | ★★☆☆☆ | Anlogic TD IDE 有 Tcl 支持，文档有限 |
| 学术参考       | ☆☆☆☆☆ | 无                                   |
| 器件文档开放度 | ★★☆☆☆ | 有限                                 |
| 社区生态       | ★★☆☆☆ | prjtang 活跃，但贡献者极少           |

**总体可行性：低。** prjtang 提供了一个起点，但与 Gowin/Apicula 的差距很大。

---

### 2.5 Lattice

#### 器件覆盖

| 系列                   | 类型              | LUT 规模   | 开源工具链          |
| ---------------------- | ----------------- | ---------- | ------------------- |
| **iCE40**        | 超低功耗          | 384–7,680 | Project IceStorm ✅ |
| **ECP5**         | 中端, SERDES      | 12K–85K   | Project Trellis ✅  |
| **MachXO2/3**    | 非易失            | 256–9,408 | 部分 (Trellis)      |
| **CrossLink-NX** | 嵌入式视觉        | 17K–40K   | 有限                |
| **Certus-NX**    | 通用, 28nm FD-SOI | 17K–40K   | Radiant only        |
| **Avant**        | 中高端, 16nm      | 100K–500K | Radiant only        |

#### 开源位流逆向工程 — 最成熟生态

Lattice 是除 Xilinx 7-Series 外，拥有最完整开源位流数据库的 FPGA 厂商：

| 项目                       | 覆盖器件     | 成熟度     | 位流数据完整性                                |
| -------------------------- | ------------ | ---------- | --------------------------------------------- |
| **Project IceStorm** | iCE40 全系列 | ★★★★★ | tile→bit 映射、routing graph、时序模型均完整 |
| **Project Trellis**  | ECP5 全系列  | ★★★★☆ | 逻辑块、互连、EBR、PLL、IOLOGIC 完整          |
| **libtrellis** (C++) | ECP5         | ★★★★☆ | Python 绑定可用，位流读写 API                 |

#### 学术故障注入

Lattice 是唯一在近年有系统性故障注入研究的非 Xilinx 厂商：

| 论文                       | 器件  | 方法                          | 年份            | 关键发现                        |
| -------------------------- | ----- | ----------------------------- | --------------- | ------------------------------- |
| Fibich et al. (IOLTS 2025) | ECP5  | 位级故障建模 (NEORV32 RISC-V) | 2025            | 工作量减少 90% vs 传统方法      |
| Fibich et al.              | iCE40 | 系统性 SEU 注入               | DATE 2021, 2023 | 器件间差异 + 互连冲突故障严重性 |
| Kyber PQC 攻击             | ECP5  | 位流故障注入攻击              | 2024            | 后量子密码学安全分析            |

**关键意义**：这些工作证明了 "开源位流数据库 → 学术故障注入" 的路径可行，且能产出高水平论文 (DATE, IOLTS)。互连故障行为（Open→stuck-at-1, Conflict→wired-AND）与 Xilinx 7-Series 一致。[→ 详细论文分析](./ecp5-seu-paper)

#### Lattice Radiant Tcl API

Radiant (新) 和 Diamond (旧) 提供 Tcl 脚本接口，覆盖全流程：综合 → 布局布线 → 位流生成。缺失类似 Vivado .ll / .ebd 的逻辑位置和 essential bits 导出，但由于 IceStorm/Trellis 提供了完整的 tile→bit 映射，可从开源数据库侧重建逻辑位置映射。

#### 可行性评估

| 维度           | 评级       | 说明                               |
| -------------- | ---------- | ---------------------------------- |
| 位流格式可及性 | ★★★★★ | IceStorm + Trellis 完整开源        |
| EDA 工具集成   | ★★★☆☆ | Radiant Tcl 存在但缺 .ll/.ebd 导出 |
| 学术参考       | ★★★★☆ | 近年有系统性故障注入论文           |
| 器件文档开放度 | ★★★☆☆ | Lattice 文档有限，开源 DB 补全     |
| 社区生态       | ★★★★★ | 最活跃的开源 FPGA 社区之一         |

**总体可行性：高。** Lattice iCE40/ECP5 拥有仅次于 Xilinx 7-Series 的完整开源基础设施，且有学术先例证明故障注入可行。如果要在 Xilinx 之外选择第一个扩展目标，**Lattice ECP5 是最佳候选**。

---

### 2.6 Efinix / 复旦微 / 其他

#### Efinix

| 维度             | 评级                          | 说明                                 |
| ---------------- | ----------------------------- | ------------------------------------ |
| 器件             | Trion (40nm), Titanium (16nm) | Quantum 架构 (LUT+乘法器交换单元)    |
| 开源逆向         | ★☆☆☆☆                    | "Project Oxide" 传闻存在但未公开发布 |
| 工具链           | Efinity IDE, 有 Python API    | 非标准 Tcl 接口                      |
| 学术故障注入     | ☆☆☆☆☆                    | 无                                   |
| **可行性** | **极低**                | 无可用基础设施                       |

#### 复旦微 (Fudan Micro)

| 维度             | 评级                        | 说明                                               |
| ---------------- | --------------------------- | -------------------------------------------------- |
| 器件             | 50K–4000K LUT, 28nm/FinFET | 含 PSoC, RF-FPGA, FPAI (FPGA+NPU AI 芯片)          |
| 开源逆向         | ☆☆☆☆☆                  | 无                                                 |
| 工具链           | Procise IDE                 | 无公开 Tcl API                                     |
| 学术故障注入     | ★☆☆☆☆                  | 复旦微作者有 Xilinx 故障注入论文，但不针对自家器件 |
| **可行性** | **极低**              | 面向 AI 加速等差异化市场，暂不考虑                 |

#### 跨厂商框架

存在两个值得关注的厂商无关故障注入框架，但它们在**网表级**而非位流级运作：

| 框架                                          | 方法                                     | 厂商覆盖                    | 限制                              |
| --------------------------------------------- | ---------------------------------------- | --------------------------- | --------------------------------- |
| **FIJI** (Fault InJection Instrumenter) | 综合后 Verilog 网表修改，UART 运行时控制 | 所有厂商（需厂商 P&R 工具） | 重跑完整流程，无法做位级 LUT 翻转 |
| **RADSAFiE** (2025, IEEE Access)        | Python GUI+CLI，网表级故障建模           | 所有厂商                    | 模拟方式，非真实硬件注入          |

**与本系统的差异**：本系统的核心能力在于位流级精确翻转（直接修改 CRAM 中的 LUT INIT 值），而非网表级重综合。这个能力需要位流格式知识，是跨厂商扩展的核心难点，也是核心价值。

---

## 3. 综合评估

### 3.1 可行性分级

```
第一梯队（高可行性 — 开源基础设施完整，已有学术先例）:
  Lattice ECP5 — Project Trellis 位流数据库完整，DATE 2025/IOLTS 2025 论文先例
  估计工作量: 4–6 人月 (含学习成本)

第二梯队（中高可行性 — 开源基础设施成熟但缺学术先例）:
  Gowin GW1N/GW2A — Apicula chipdb 成熟度高，但零故障注入论文
  估计工作量: 3–5 人月

第三梯队（观望 — 开源项目不够成熟）:
  Intel/Altera Cyclone V — mistral 不够成熟
  Anlogic EAGLE — prjtang 不够成熟

第四梯队（当前不具备条件）:
  紫光同创、Efinix、复旦微 — 零开源基础设施
```

### 3.2 风险分析

| 风险                                      | 概率 | 影响                   | 缓解措施                               |
| ----------------------------------------- | ---- | ---------------------- | -------------------------------------- |
| 开源位流 DB 存在未发现的错误或缺失        | 中   | 高（坐标计算全盘错误） | 每个新厂商先做 FAR Oracle 等效验证     |
| 厂商 EDA 工具版本升级改变位流格式         | 低   | 中                     | 锁定已知良好版本，开源 DB 持续跟踪     |
| 抽象接口过度/不足                         | 中   | 中                     | 等 2+ 厂商经验后再固化接口规范         |
| 第一厂商 (Lattice) 学习曲线消耗过多时间   | 高   | 中                     | 从 iCE40 开始（最简单），再扩展到 ECP5 |
| 基于 tile type 的分类方法在其他厂商不适用 | 中   | 高                     | 优先调研各厂商 EDA 是否有等价内省 API  |

### 3.3 论文策略

若目标是发表跨厂商故障注入论文，建议路径：

- **小跨** (Xilinx US → Xilinx 7-Series)：数据可在同一框架内对比，架构差异最小
- **中跨** (Xilinx → Lattice)：架构不同但有同等质量的开源 DB，方法论对比有说服力
- **大跨** (Xilinx → Gowin)：国产替代叙事 + 学术空白，论文立意更高但技术风险更大

---

## 4. 局限与不确定性

1. **开源 DB 成熟度梯度不均**：Xilinx 7-Series (prjxray) 和 Lattice (Trellis/IceStorm) 成熟度远超其他厂商，其余厂商数据库存在未知的位映射错误或缺失
2. **学术先例稀疏**：仅在 Lattice iCE40/ECP5 上有系统性故障注入研究。Gowin、Anlogic、紫光等领域完全没有论文先例，意味着若在这些厂商上工作，所有方法论需要独立探索和验证
3. **寻址模型差异本质难度**：FAR 帧模型 ↔ tile 网格的转换不是简单的参数替换，需要重新构建坐标映射关系。相似度仅 20–40% 的厂商（Lattice iCE40, Gowin）需要全新的地址生成路径
4. **EDA API 能力不对称**：除 Vivado 外，没有任何厂商提供 `write_bitstream -logic_location_file` 等价的一体化导出。逻辑位置映射需要从多种间接来源（chipdb, report files, assignment databases）交叉重建
5. **生态动态变化**：开源 FPGA 工具链发展迅速，建议持续跟踪各厂商可行性评级变化

---

## 参考资料

#### Lattice

| 资源                       | 链接                                  | 说明                         |
| -------------------------- | ------------------------------------- | ---------------------------- |
| Project Trellis            | https://github.com/YosysHQ/prjtrellis | ECP5 位流数据库 + 工具链     |
| Project IceStorm           | https://github.com/YosysHQ/icestorm   | iCE40 位流数据库 + 工具链    |
| nextpnr                    | https://github.com/YosysHQ/nextpnr    | 开源 FPGA P&R (支持 Lattice) |
| libtrellis Python bindings | https://prjtrellis.readthedocs.io/    | Python API 文档              |

#### Gowin

| 资源            | 链接                                        | 说明                    |
| --------------- | ------------------------------------------- | ----------------------- |
| Project Apicula | https://github.com/YosysHQ/apicula          | Gowin 位流逆向 + chipdb |
| apycula 文档    | https://github.com/YosysHQ/apicula/wiki     | Python API              |
| Gowin 官方文档  | https://www.gowinsemi.com.cn/document/index | 数据手册、用户指南      |

#### Intel/Altera

| 资源             | 链接                                                                               | 说明               |
| ---------------- | ---------------------------------------------------------------------------------- | ------------------ |
| mistral          | https://github.com/gatecat/mistral                                                 | Cyclone V 位流逆向 |
| Quartus Tcl 参考 | https://www.intel.com/content/www/us/en/programmable/quartushelp/current/index.htm | 官方 Tcl API 文档  |

#### Anlogic

| 资源    | 链接                              | 说明                      |
| ------- | --------------------------------- | ------------------------- |
| prjtang | https://github.com/mmicko/prjtang | Anlogic EG4/PH1A 位流逆向 |

#### 跨厂商

| 资源           | 链接                                         | 说明               |
| -------------- | -------------------------------------------- | ------------------ |
| openFPGALoader | https://github.com/trabucayre/openFPGALoader | 多厂商位流下载工具 |
| Yosys          | https://github.com/YosysHQ/yosys             | 开源综合 (多厂商)  |

#### 学术论文索引

| 论文                         | 年份 | 会议/期刊   | 厂商           | 主题               |
| ---------------------------- | ---- | ----------- | -------------- | ------------------ |
| SCFIT                        | 2012 | DATE        | Altera         | 扫描链 SEU 注入    |
| Asadi et al.                 | 2003 | FPT         | Altera Flex10K | CRAM 位流操作      |
| FITO                         | 2008 | —          | Altera         | 网表级 FI          |
| Fibich et al.                | 2021 | DATE        | Lattice iCE40  | SEU 故障注入       |
| Fibich et al.                | 2023 | —          | Lattice iCE40  | 互连冲突故障       |
| Leveraging OS Bitstream Docs | 2025 | IOLTS       | Lattice ECP5   | 软错误鲁棒性       |
| Kyber PQC FI                 | 2024 | —          | Lattice ECP5   | 后量子密码 FI 攻击 |
| RADSAFiE                     | 2025 | IEEE Access | 跨厂商         | 网表级故障建模     |
