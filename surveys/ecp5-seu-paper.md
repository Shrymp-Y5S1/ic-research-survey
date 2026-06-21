# ECP5 SEU 鲁棒性分析 论文详细总结

> **论文标题**：Leveraging Open-Source Bitstream Documentation for FPGA Soft-Error Robustness Analysis
>
> **作者**：Christian Fibich, Leonardo Lovric (University of Applied Sciences Technikum Wien, Austria)
>
> **发表**：IOLTS 2025 | **DOI**：`10.1109/IOLTS65288.2025.11116854`
>
> **开源代码**：https://doi.org/10.5281/zenodo.15495990

## 快速概览

| 维度 | 内容 |
|------|------|
| 定位 | 首个面向现代非 AMD/Xilinx SRAM FPGA 的完全开源 SEU 鲁棒性分析方法 |
| 目标器件 | Lattice ECP5 (LFE5U25F) — Colorlight 5A-75B 开发板 |
| 核心方法 | 全开源工具链 (Yosys+NextPNR+pyTrellis) + Essential Bit 过滤 + 关键性预测 |
| 对精确故障注入的贡献 | 跨厂商互连故障行为一致性验证；故障注入工作量降低 >90% 的过滤框架 |
| 成熟度 | ★★★★☆ (完整实验验证，NEORV32 RISC-V CPU 案例研究) |

## 1. 技术方法与关键发现

### 1.1 全开源工具链路径

该论文首次展示完全脱离厂商私有工具的 SEU 分析流程：

```
Yosys 综合 → NextPNR 布局布线 → pyTrellis (Project Trellis) bitstream API
  → Bitstream 解码 + PnR Netlist 解析
    → 互连分析 (MUX 故障模型)
      → BEL/Cell 交叉引用
        → Don't Care 分析 + Secondary Interconnect 分析
          → 关键性预测
```

**输入**：bitstream + post-routing netlist；**输出**：每个 bit → {故障类型, 受影响 netlist 元素, 关键性评估}。

### 1.2 互连故障模型

ECP5 互连 MUX 采用**两级译码**结构，与 AMD 7-Series 一致。单 bit 翻转产生三种故障：

| 故障类型 | 触发条件 | 电路效果 |
|---------|---------|---------|
| **Bridge** | 未使用 MUX 中一个 bit 0→1 | MUX 输出切换到其他 wire |
| **Open** | 路由中 MUX 的 bit 1→0 | 连接断开 |
| **Short (Conflict)** | 已用 MUX 中某 bit 0→1 | 两根 wire 短路 |
| **Input Antenna** | Short 中源 wire 未被设计使用 | MUX 输入端形成"天线" |

### 1.3 实验表征结果

| 故障类型 | 测试 bit 数 | 关键发现 |
|---------|------------|---------|
| **Open** | 3,238 | **100% 导致 stuck-at-1** |
| **Input Antenna** | 11,594 | 仅 32 次导致 stuck-at-0，**全部是 G_HPBX 全局互连 wire**；其余 benign |
| **Conflict** | 2,003 | **100% 仅影响 wire A**，且仅在 pattern=1/toggle 时受扰 → **wired-AND 行为** |

**与 AMD 7-Series 对比**：ECP5 互连故障行为与 7-Series **一致** (Open→stuck-at-1, Conflict→wired-AND, Input Antenna→mostly benign except global wires)，表明两级译码 MUX 结构具有跨厂商普遍性。

### 1.4 Essential Bit 过滤与关键性预测

**六条 Essential Bit 分类规则 (E1–E6)**：涵盖已配置 bit、可变更枚举值、未配置 MUX、BRAM MIB_EBR、未文档化 bit 等类别。

**五条关键性预测规则 (C1–C5)**：
- C1: 所有 Open 和 Conflict 互连 bit → Critical
- C2: 关联全局 wire 的 Input Antenna → 重新归类为 Conflict, Critical
- C3: 未用 MUX 可被单 bit 激活 → Critical
- C4: LUT 配置 bit → Don't Care 分析过滤
- C5: 其他 Essential bit → 默认 Critical

### 1.5 NEORV32 实验验证

实验设计：NEORV32 RISC-V CPU (4,307 LUTs / 1,598 FFs / 23 BRAMs / 10 DSPs)，Coremark 基准程序，两块 Colorlight 5A-75B 开发板，置信度 99%。

| 指标 | 结果 |
|------|------|
| 总非空 tile bit 数 | 1,595,935 (601,219 Essential + 994,716 Non-Essential) |
| Essential Bit 过滤效果 | **零漏报**；故障注入工作量减少 **86.5%** |
| 关键性预测效果 | Predicted Critical 再减少 **30%**；总减少 **>90%**；仍**零漏报** |
| 误报率 | Predicted Critical 中 ~70.5% 实际 benign |

按故障类型，互连 Open (52.6%) 和互连 Conflict (39.8%) 是最关键的两类；LUT 为 31.0%。Don't Care 分析和 Input Antenna bit 均为 0% critical——验证了去悲观化规则的有效性。

按 CPU 模块，LSU (45.2%)、Register File (44.2%)、CPU Top (44.1%) 最为脆弱。

## 2. 与本项目的关联

### 2.1 可借鉴的方法论

| 方法 | 借鉴价值 |
|------|---------|
| **Essential Bit → Critical 两层过滤** | 论证故障列表"充分性"的统计框架——置信度/误差计算公式可直接采用 |
| **Don't Care 分析** | LUT 未使用输入的 INIT bit 过滤——减少冗余注入 |
| **互连故障三类模型** | Open/Conflict/Input Antenna——若扩展到路由级故障注入可直接适用 |
| **硬件故障注入实验设计** | golden 参考 + 双路由 + mismatch 计数器的表征方法 |

### 2.2 跨厂商一致性结论

ECP5 MUX 故障行为与 AMD 7-Series 一致，加强了对两级译码模型跨厂商普遍性的信心。全开源工具链路径 (Yosys + nextpnr + 开源 bitstream DB) 为多厂商扩展提供了参考。

### 2.3 架构差异

| 关注点 | 本项目 (XCKU/XCA/XC7K) | 本文 (Lattice ECP5) |
|-------|----------------------|---------------------|
| 工具链 | Vivado (闭源) | Yosys+NextPNR (开源) |
| Bitstream 文档 | 部分公开 (FAR) + prjxray | Project Trellis (完整) |
| 故障注入方式 | UART 在线注入 | 离线 bitstream 篡改 + 重新加载 |
| FAR 寻址 | 有 (ICAP via SEM IP) | 无公开 FAR 结构 |
| 故障空间精炼 | 安全机制评估 | Essential→Critical 过滤 |

## 3. 局限

1. **仅覆盖 Lattice ECP5**：方法声称通用，但实际验证仅在 ECP5 上进行
2. **BRAM/DSP 故障模型缺失**：C5 规则保守地将 BRAM/DSP bit 标记为 Critical，缺乏专用模型
3. **离线故障注入限制**：依赖 bitstream 重新生成+下载，不适合大规模统计级注入
4. **误报率高**：Predicted Critical 中 ~70.5% 实际 benign，需引入故障仿真降误报
5. **跨器件泛化未验证**：仅测试一个器件 (LFE5U25F)，同架构泛化性待验证

## 参考资料

- [IOLTS 2025 Paper (IEEE)](https://doi.org/10.1109/IOLTS65288.2025.11116854)
- [开源代码 (Zenodo)](https://doi.org/10.5281/zenodo.15495990)
- [Project Trellis (ECP5 bitstream 文档)](https://github.com/YosysHQ/prjtrellis)
- [Project IceStorm (iCE40 bitstream 文档)](https://github.com/YosysHQ/icestorm)
