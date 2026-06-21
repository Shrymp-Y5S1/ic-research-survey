# Bitfiltrator 开源项目

> 全自动化 Xilinx UltraScale / UltraScale+ bitstream 参数逆向工程工具 | [epfl-vlsc/bitfiltrator](https://github.com/epfl-vlsc/bitfiltrator)

## 快速概览

| 维度 | 内容 |
|------|------|
| 定位 | 全自动化 US/US+ bitstream 参数提取工具——唯一输入为器件型号，零人工干预 |
| 目标器件 | **38 个** US/US+ 器件（Kintex / Virtex / Zynq / Alveo），均为 WebPack 免费许可证器件 |
| 核心方法 | 三阶段全自动流程：器件枚举 → BEL Fuzzing → 验证 |
| 对本项目的贡献 | 物理常数独立验证、Device/Architecture JSON 参考数据、FAR 列映射交叉验证 |
| 作者/发表 | Sahand Kashani et al. (EPFL), FPL 2022 **Michal Servit Best Paper Award** |
| 语言/许可 | Python 3.10 + Tcl, MIT |

**核心能力**：
- 全自动提取器件级参数（column 类型 → FAR 列地址映射、每列 minor 帧数、SLR 边界）
- 全自动提取架构级参数（LUT/FF/BRAM/LUTRAM INIT bit 在 frame 内的 `(minor, frame_offset)` 编码）
- 提供 BEL 定位引擎，查询任意 BEL 的配置 bit 位（SLR 名、FAR 地址、frame offset、bitstream 字节偏移）

---

## 1. 技术方法与关键发现

### 1.1 目录与架构总览

```
resources/
├── archs/   ← US/US+ 架构参数 JSON (~1 MB each)
└── devices/ ← 38 个器件参数 JSON
src/
├── 数据模型:   arch_spec.py, frame.py, frame_spec.py, packet.py, bitstream.py
├── 器件枚举:   create_device_summary.py, extract_*_from_*.py (6 个模块)
├── 架构提取:   create_arch_summary.py, lut_init_sweep_to_logic_loc.py
├── 验证:       bitstream_state_checker.py, u-ray_*_comparator.py
├── 查询:       bit_locator.py, demo.py, resources.py
└── tcl/        Vivado Tcl 脚本 (13 个)
```

**核心类层次**：

```
ArchSpec (抽象基类)                     — FAR 位域布局 + 物理常数
├── UltraScaleSpec                      — US: W=123, Minor[6:0], Col[16:7]
└── UltraScalePlusSpec                  — US+: W=93, Minor[7:0], Col[17:8]

FrameAddressRegister                    — 单个 FAR (reserved, block_type, row, col, minor)
FrameAddressIncrementer                 — FAR 自动递增器 (含 per-column minor 计数)

LogicLocationFile                       — Vivado .ll 文件解析
├── SliceLoc → RegLoc / LutramLoc / LutLoc
└── BramLoc → BramRegLoc / BramMemLoc / BramMemParityLoc

DeviceSummary / ArchSummary             — JSON 运行时访问器
BitLocator                              — BEL 名 → (SLR, FAR[], frame_offset[]) 查询引擎
```

### 1.2 物理常数与 FAR 位布局

| 常数 | UltraScale | UltraScale+ |
|------|--------|---------|
| `words/frame` | **123** | **93** |
| `CLB/column` | **60** | **60** |
| `LUT/CLB` | **8** | **8** |
| `FF/CLB` | **16** | **16** |
| `DSP/column` | **24** | **24** |
| `36K BRAM/column` | **12** | **12** |
| `LUT INIT bits` | 64 | 64 |
| `BRAM memory bits` | 16384 | 16384 |
| `BRAM parity bits` | 2048 | 2048 |
| FAR Reserved | [31:26] | [31:27] |
| FAR Block Type | [25:23] | [26:24] |
| FAR Row | [22:17] | [23:18] |
| FAR Column | [16:7] | [17:8] |
| FAR Minor | [6:0] | [7:0] |

**FAR 位布局对比**：

```
UltraScale FAR (32-bit):
  ┌──────────┬──────┬──────┬──────────┬───────┐
  │ Reserved │Block │ Row  │ Column   │ Minor │
  │  31..26  │25..23│22..17│ 16..7    │ 6..0  │
  └──────────┴──────┴──────┴──────────┴───────┘

UltraScale+ FAR (32-bit):
  ┌──────────┬──────┬──────┬──────────┬───────┐
  │ Reserved │Block │ Row  │ Column   │ Minor │
  │  31..27  │26..24│23..18│ 17..8    │ 7..0  │
  └──────────┴──────┴──────┴──────────┴───────┘
```

US+ 相比 US：Row 拓宽 1 bit（64→128），Minor 拓宽 1 bit（128→256），Column 拓宽 1 bit。Block Type 区分 `CLB_IO_CLK` (0) 和 `BRAM_CONTENT` (1) 两条独立配置总线。

### 1.3 三阶段工作流

**Phase 1 — 器件枚举**

目的：发现每个 clock region 中每列的 FAR column address 和 minor 帧数。

核心方法：空设计 → per-frame-CRC bitstream → 解析所有 CLB_IO_CLK/BRAM_CONTENT 类型的 FAR 写入 → 通过 minor 回绕检测列边界 → 分别对 CLB/BRAM/DSP 列做 targeted 设计（每列 1 个 BEL），从 Vivado `.ll` 文件反推 `SLICE_X → FAR_COL` 映射。

DSP 列提取使用 **2-pass 差分算法**：Pass 1 找剩余列中 minor 最多的列（CLB 互连 ~58 minor），Pass 2 选 minor 小于该值的列为 DSP（4 或 6 minor）。

**Phase 2 — BEL Fuzzing**

对每种 BEL 类型提取其配置 bit 的 `(minor, frame_offset)` 编码：

| BEL 类型 | 提取方法 | 关键挑战 |
|----------|---------|---------|
| LUT INIT | 64 个 one-hot 方程逐位扫描 + 差分 | 单 bit 翻转触发 4~6 个物理 bit 变化（INIT + 辅助控制） |
| FF INIT | 全部 FF 实例化 → .ll 解析 | bitstream 反相存储 |
| LUTRAM | 全部 LUTRAM 实例化 → .ll 解析 | 仅 SLICEM (CLEM tile) |
| BRAM | 全部 BRAM 实例化 → .ll 解析 | 内容+校验两条总线 |

**Median 去噪**（LUT INIT 核心算法）：对每次翻转产生的多个变化帧偏移取 median，离群最远的点即为真正的 INIT bit，其余为辅助控制 bit。

**偏移传播**：仅对 Y=0 的 CLB 做 LUT INIT sweep，然后以 FF 为 anchor 传播到 Y=1..59——同一 tile type 内 LUT 相对 FF 的 `(minor_delta, frame_delta)` 在整列内保持不变。

**Phase 3 — 验证**

随机填充设计 → 用提取到的参数从 bitstream 读回实际值 → 逐 bit 对比期望值。覆盖 LUT（64-bit INIT）、FF（16 个/CLB）、BRAM（16384+2048 bit）。

### 1.4 JSON 数据格式

**Device JSON**（38 个器件文件，以 `xcku5p.json` 为例）：

```json
{
  "device": "xcku5p", "num_luts": 216960, "num_regs": 433920,
  "num_brams": 480, "num_dsps": 1824, "num_slrs": 1,
  "slrs": { "SLR0": {
    "idcode": "0x04a62093", "config_order_idx": 0,
    "rowMajors": { "0": {
      "clb_colMajors": { "0": 5, "1": 6, ... },         // SLICE_X → FAR_COL
      "clb_tileTypes": { "0": "CLEL_R", "1": "CLEM", ... },
      "bram_reg_colMajors": { ... }, "bram_content_colMajors": { ... },
      "dsp_colMajors": { ... },
      "num_minors_per_std_colMajor": [8,4,12,4,76,16,...],  // 每列 minor 帧数
      "num_minors_per_bram_content_colMajor": [256,256,...]
    }}
  }}
}
```

`num_minors_per_std_colMajor` 揭示 US/US+ 列宽异构性：CLB=12/16, DSP=4/6, INT=76, BRAM content=256（独立 Block Type 总线）。

**Architecture JSON**（按 tile type 组织 BEL 编码）：

```json
{
  "archName": "ULTRASCALE_PLUS",
  "tile_encodings": {
    "CLEL_R": {
      "LutLoc": { "Y_ofst": { "0": {
        "minor": { "A6LUT": [0,1,0,1,...], ... },          // INIT[i] → minor
        "frame_ofst": { "A6LUT": [624,624,639,639,...], ... } // INIT[i] → frame offset
      }}}
    },
    "RegLoc": { "Y_ofst": { "0": { "minor": {"AFF": 12, ...}, "frame_ofst": {...} }}}
  }
}
```

LUT INIT 在不同输入 pin 之间**交错排列**，FF INIT 在 bitstream 中**反相**存储（`bitstream_bit = ~INIT_value`）。

### 1.5 关键提取算法

**Per-frame-CRC FAR 提取**：正常 bitstream 中连续配置帧是批量 FDRI 写入的，无法区分帧边界。启用 per-frame-CRC（UG908 Table 41）后 Vivado 为每个 FAR 单独写入 + 附加 CRC，使 FAR 提取精确。

**Column 边界检测**：通过检测 FAR 地址中的 minor 回绕确定列边界（`more_itertools.split_when`）。同理检测 row 边界（col_addr 回绕）和 clock region 间隙（row 中 FAR 不连续）。

**FF Offset 传播**：`LUT_INIT[i].minor(k) = LUT_INIT[i].minor(0) + (FF.minor(k) - FF.minor(0))`，利用同一 tile type 内 `(minor_delta, frame_delta)` 不变的特性将 Y=0 的 sweep 结果传播到整列。

---

## 2. 与本项目的关联

### 2.1 物理常数独立验证

Bitfiltrator 在 38 个器件上实测的物理常数，为本项目的帧编址模型提供了独立验证通路：

| 参数 | Bitfiltrator 实测 | 本项目 oracle 值 | 偏差 |
|------|-----------------|-----------------|------|
| US CLB minor/FAR 列 | **12** | — | — |
| US+ CLB minor/FAR 列 | **16** | — | — |
| US 平均帧/列 | **26.1** | **26.1** (slope·f_x) | **<0.2%** |
| US+ 平均帧/列 | **33.9** | **33.9** (slope·f_x) | **~1.6%** |

确立了关键口径：物理 CLB 帧宽 (12/16) 与注入模型中的集成系数 (US=22, US+=27) 是不同口径——后者吸收了非 CLB 列（CMT/CLK/IO）的物理帧贡献。两者在各自模型框架内正确，不可直接比较。

### 2.2 预计算数据库参考价值

Bitfiltrator 预计算的 38 个器件 JSON + 2 个架构 JSON 构成了目前公开可获取的**最完整的 US/US+ bitstream 参数数据集**：

- **Device JSON**：提供每器件每 SLR 的列映射（`SLICE_X → FAR_COL`）、列 minor 帧数分布、tile type 分类和 IDCODE，可用于新器件的 FAR 地址预测模型交叉验证
- **Architecture JSON**：按 tile type（`CLEL_R`/`CLEM`/`BRAM` 等）记录 LUT/FF/BRAM/LUTRAM 配置 bit 在 frame 内的 `(minor, frame_offset)` 精确位置

---

## 3. 局限

1. **依赖 Vivado 闭源工具**：三阶段工作流全部依赖 Vivado 2021.1/2022.1 进行综合和 bitstream 生成，无法脱离 AMD 工具链独立运行
2. **仅覆盖 US/US+**：未涉及 7-Series；7-Series 的器件枚举和 BEL Fuzzing 仍需依赖 prjxray
3. **IO/Clock 资源未完成**：IO tile 和 clock distribution 的 bit 映射未覆盖，DSP 映射依赖启发式 2-pass 算法而非直接解析
4. **一次性提取，非增量式**：对新器件的参数提取需完整重跑流程，无法基于已有器件参数增量推导
5. **跨器件参数翻译未完整公开**：论文声称 LUTRAM/BRAM 可在同架构器件间自动翻译 bit 位置，但公式未完整给出
6. **复现门槛高**：核心 Python 代码完整（MIT），但配套运行环境需 Vivado 许可，限制了独立复现和验证

---

## 参考资料

- [Bitfiltrator GitHub](https://github.com/epfl-vlsc/bitfiltrator)
- [Bitfiltrator FPL 2022 Paper (IEEE)](https://www.computer.org/csdl/proceedings-article/fpl/2022/739000a192/1KJwAykgqti)
- [Project U-Ray (交叉验证源)](https://github.com/f4pga/prjuray)
- [Project X-Ray (方法论前身)](https://github.com/f4pga/prjxray)
- [UG908: Vivado Design Suite User Guide — Programming and Debugging](https://docs.amd.com/r/en-US/ug908-vivado-programming-debugging)
