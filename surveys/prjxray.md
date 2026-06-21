# Project X-Ray (prjxray) 详细调研报告

> 7-Series bitstream 黑盒差分 Fuzzing 逆向工程 | [github.com/f4pga/prjxray](https://github.com/f4pga/prjxray)
>
## 快速概览

| 维度 | 内容 |
|------|------|
| 定位 | 7-Series bitstream 格式逆向文档化——F4PGA 生态旗舰项目 |
| 目标器件 | Artix-7 (最成熟), Zynq-7, Kintex-7 (以 xc7k70t 为代理) |
| 核心方法 | 黑盒差分 Fuzzing：自动生成数千微小设计 → Vivado 编译 → 差分对比 bitstream |
| 对精确故障注入的贡献 | 逐列帧宽独立验证——支撑 frame 级地址计算；FAR 位布局文档化——支撑寄存器级注入定位 |
| 成熟度 | ★★★★★ (Artix-7/Zynq-7); ★★ (Kintex-7, 无 xc7k325t 专属 part 文件) |

## 1. 技术方法与关键发现

### 1.1 Fuzzing 方法论

Project X-Ray 使用**黑盒差分分析**（Black-box Differential Fuzzing），不依赖 Xilinx 内部文档：

1. **设计生成** — Vivado 2017.2 自动生成数千个微小 FPGA 设计，每个只改变一个逻辑/布线特性
2. **Bitstream 编译** — 通过 Vivado 生成每个设计的 bitstream
3. **差分对比** — 对比 bitstream 差异，使用约束求解器（segmatch）消除歧义，定位哪些 bit 控制哪些特性
4. **数据库组装** — 将验证后的 bit→feature 映射写入 `.db` 文件

关键工具类型：**Fuzzer**（自动化生成/编译/对比）、**Minitest**（人工可读验证设计）、**Segmatch**（约束求解段匹配器）。

### 1.2 7-Series Bitstream 架构

```
Bitstream 文件
├── 同步字 (0xAA995566)
├── 配置包序列
│   ├── Type 1 包 (寄存器写入, 32-bit)
│   │   ├── CMD (NULL/WRITE/RESET)
│   │   ├── IDCODE
│   │   ├── FAR (Frame Address Register)
│   │   ├── FDRI (Frame Data Register, Input)
│   │   ├── MASK / CTL0 / CTL1
│   └── Type 2 包 (长写入, 用于 FDRI)
│       └── Frame Data payload (N × 101 words)
└── DESYNC 命令
```

### 1.3 关键物理常数

| 参数 | 值 | 说明 |
|------|-----|------|
| Words per Frame | 101 | 每 frame 含 101 个 32-bit word |
| CLB Column Frames | 36 | 每个 CLB 列 36 个 frame |
| BRAM Column Frames | 128 | BRAM 内容+配置 frame |
| 配置总线 | 3 条 | `CLB_IO_CLK` (000), `BLOCK_RAM` (001), `CFG_CLB` (010) |
| FAR 结构 | 32-bit | BlockType[2:0] + Top/Bottom + Row[4:0] + Column[9:0] + Minor[6:0] |
| Tile 坐标 | (grid_x, grid_y) | grid_x 左→右递增, grid_y 上→下递增; `_L`/`_R` = clock spine 左/右半侧 |

### 1.4 数据库文件格式

prjxray-db 提供以下数据库文件：

| 文件 | 格式 | 说明 |
|------|------|------|
| `tilegrid.json` | JSON | 全局 tile 网格：所有 tile 坐标、类型、segment、frame 数 |
| `tileconn.json` | JSON | Tile 间互连线映射 |
| `segbits_<tile>.db` | 文本 | Bit→Feature 映射：`<tile_type>.<feature> <bit_offset> <frame_offset>` |
| `mask_<tile>.db` | 文本 | 掩码：去除恒为 0/1 的 bit |
| `ppips_<tile>.db` | 文本 | Pseudo-PIP：无配置 bit 的逻辑连接 |
| `tile_type_<tile>.json` | JSON | Tile 详细：PIP、site pin、wire、delay |
| `site_type_<site>.json` | JSON | Site 内部 pin/PIP（SLICEL/SLICEM/RAMB36E1） |

tilegrid.json 中每个 segment 将功能 tile (CLB/BRAM/DSP) 和其关联 INT tile 绑定，共享同一组配置 frame：

```json
{
  "SEG_CLBLL_L_X16Y149": {
    "baseaddr": ["0x00020800", 99],
    "frames": 36,
    "tiles": ["CLBLL_L_X16Y149", "INT_L_X16Y149"],
    "type": "clbll_l",
    "words": 2
  }
}
```

Segbits 格式：
```
<tile_type>.<feature> <bit_offset> <frame_offset>
INT_L.SS0BEG0.SS0END0 32 23
```

## 2. 与本项目的关联

### 2.1 直接可用资源

| 资源 | 对本项目的价值 |
|------|---------------|
| `tilegrid.json` | 验证/补全 DeviceProfile tilegrid 坐标和类型映射 |
| `tileconn.json` | 信号路径参考——安全机制冗余检查 |
| segbits 数据库 | LUT INIT bit→frame 位置精确映射——故障注入目标定位 |
| frame 架构文档 | FAR Oracle 线性回归模型交叉验证 |
| `tile_type_*.json` | 每个 tile 类型 PIP/site pin 详细定义 |

### 2.2 目标器件验证（P1 核对）

| 目标器件 | prjxray-db 实际状态 |
|-----------|---------------------|
| **xc7k325t** | **无专属 part 文件**（仅 xc7k70t 有 4 个 package 变体），以 xc7k70t fabric 数据代理 |
| **xc7a100t** | 官方完整支持：`artix7/xc7a100tcsg324-{1,2}/part.json` 已确认 |
| **xc7z020** | 官方支持：`zynq7/xc7z020clg484-1/part.json` 已确认 |

逐列帧数核对（`CLB_IO_CLK` 配置总线，三器件）：

| 参数 | ARCH_REGISTRY | prjxray-db 实测 | 状态 |
|------|--------------|----------------|------|
| CLB 列帧数 | 36 | 36（主导值，70–78% 列） | **一致** |
| BRAM 列帧数 | 28 | 28（11–16% 列） | **一致** |
| DSP 列帧数 | 28 | 28 | **一致** |
| IO/CLK/HCLK | 0（bundled） | 30/32/42 帧特殊列（10–14%） | **口径差异，见注** |

> **口径差异说明**：ARCH_REGISTRY 将 INT/IO/HCLK 标记为有效帧宽=0 是基于 `.ebd` 注入模型（这些列不在 CLB 地址空间内），而 prjxray-db `CLB_IO_CLK` 总线物理上包含 30/32/42 帧的 IO/CMT 列。两者口径不同，各自模型框架内正确——本项目的 $f_y$ 参数（CLB 列有效帧数积分系数）已吸收这些列的物理帧。

## 3. 局限

1. **Kintex-7 覆盖不完整**：xc7k325t 无专属 `part.json`，以 xc7k70t fabric 数据代理
2. **仅覆盖 7-Series**：UltraScale/US+ 需由 prjuray / Bitfiltrator 补充
3. **社区趋于稳定维护**：活跃期 2017–2024，目前偶发性更新
4. **Virtex-7/Spartan-7 成熟度低**（★★），数据库完整度不足

## 参考资料

- [Project X-Ray GitHub](https://github.com/f4pga/prjxray)
- [prjxray-db 数据库](https://github.com/f4pga/prjxray-db)
- [在线数据库浏览器](https://f4pga.github.io/prjxray-db)
- [技术文档](https://f4pga.readthedocs.io/projects/prjxray/en/latest/)
- [Fuzzer 开发指南](https://f4pga.readthedocs.io/projects/prjxray/en/latest/db_dev_process/readme.html)
