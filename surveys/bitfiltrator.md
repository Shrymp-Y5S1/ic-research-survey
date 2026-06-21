# Bitfiltrator 论文详细总结

> **论文标题**：Bitfiltrator: A General Approach for Reverse-Engineering Xilinx Bitstream Formats
>
> **作者**：Sahand Kashani, Mahyar Emami, James R. Larus (EPFL, Switzerland)
>
> **发表**：FPL 2022, Belfast, UK | **DOI**：`10.1109/FPL57034.2022.00039` | **奖项**：Michal Servit Best Paper Award

## 快速概览

| 维度                 | 内容                                                                         |
| -------------------- | ---------------------------------------------------------------------------- |
| 定位                 | 全自动化 Xilinx FPGA bitstream 格式逆向工程工具                              |
| 目标器件             | UltraScale / UltraScale+ (Kintex, Virtex, Zynq US+, Alveo) — 覆盖 40 个器件，均为 WebPack 免费许可证器件 |
| 核心方法             | 全自动探针 LUT 法：唯一输入为器件型号，零人工干预                            |
| 对精确故障注入的贡献 | US/US+ 物理常数独立验证 ($w_f$, CLB/BRAM/DSP 帧数)；$f_x$ 物理自洽性确认 |
| 成熟度               | ★★★★★ (学术论文级，经 40 器件验证)                                      |

## 1. 技术方法与关键发现

### 1.1 核心流程

```
器件枚举 (Device Enumeration)
  → 发现 clock region 数、row/column 数、每列 frame 数
    → BEL 属性 Fuzzing (LUT/FF/LUTRAM/BRAM)
      → 验证 (写回设计，确认 Vivado 生成相同 bitstream)
```

**器件枚举**：在每个 clock region 的目标列放置 LUT1 探针 → 生成 bitstream → 比较相邻列 FAR 地址差 → 得到每列 frame 数。同时检测 clocking 资源空隙处的 FAR 地址跳跃，发现 hidden rows。

**BEL Fuzzing**：使用 `(* DONT_TOUCH = "true" *)` + 随机 LFSR 输入防止 Vivado 常量折叠；使用独特 INIT 值模式防止坐标歧义。

### 1.2 FAR 寄存器格式 (32-bit)

| 位域       | UltraScale | UltraScale+ | 说明                           |
| ---------- | ---------- | ----------- | ------------------------------ |
| Block Type | [25:23]    | [26:24]     | US+ 上移 1 bit                 |
| Row        | [22:17]    | [23:18]     | US+ 增宽 1 bit                 |
| Column     | [16:7]     | [17:8]      | 大列地址                       |
| Minor      | [6:0]      | [7:0]       | US+ 扩展为 8 bit (≤256 帧/列) |

### 1.3 关键物理常数

| 参数               | UltraScale (xcku3p) | UltraScale+ (xcku5p) |
| ------------------ | ------------------- | -------------------- |
| words/frame        | **123**       | **93**         |
| frames/CLB column  | **12**        | **16**         |
| CLB words/column   | 1,476               | 1,488                |
| frames/BRAM column | **128**       | **256**        |
| BRAM words/column  | 15,744              | 23,808               |
| frames/DSP column  | 4–6                | 8                    |
| CLBs/clock region  | 60                  | 60                   |
| LUT minors         | 8                   | 12                   |
| FF minors          | 1                   | 1                    |

### 1.4 CLB 列内部 Minor 分配

**UltraScale (12 minors total)**

| Minor | 内容                                 |
| ----- | ------------------------------------ |
| 0–7  | LUT INIT (6-LUT 的 64-bit 真值表)    |
| 8     | FF INIT (16 FF × 1 bit)             |
| 9–10 | LUTRAM (分布式 RAM，仅 SLICEM)       |
| 11    | Carry + F7MUX/F8MUX/F9MUX + 内部路由 |

**UltraScale+ (16 minors total)**

| Minor  | 内容                     |
| ------ | ------------------------ |
| 0–11  | LUT INIT                 |
| 12     | FF INIT                  |
| 13–14 | LUTRAM (仅 SLICEM)       |
| 15     | Carry + F-MUX + 内部路由 |

### 1.5 关键发现

1. **LUT INIT bit 交错排列**：非简单连续排列，论文给出精确 $\text{bit} \to \text{LUT\_INIT}[i]$ 映射公式
2. **FF INIT 反相存储**：$\text{bitstream\_bit} = \sim \text{INIT\_value}$
3. **SLICEM 额外 minors**：SLICEM 的 LUTRAM 额外占用 2 个 minors (US: 9–10; US+: 13–14)，SLICEL 无
4. **CLB 列中线间隙**：第 30 和第 31 个 CLB 之间 (clock region 中线) 存在 clocking 资源导致的 FAR 不连续
5. **硅级物理常数**：同一 tile type 在不同器件上帧数一致——frame 数是硅级物理常数，不随器件规模变化

### 1.6 与 prjuray 的交叉验证

Bitfiltrator 的结果与 prjuray 数据库一致 (LUT 等式映射、BRAM 内容、FF INIT、column minor 计数)，但**超越** prjuray：

- prjuray 仅覆盖 ZU3EG，Bitfiltrator 覆盖 40 个 US/US+ 器件
- 实现跨器件的参数翻译——同一 tile type 在不同器件上的 bit 位置可自动推导

## 2. 与本项目的关联

### 2.1 物理自洽性验证

Bitfiltrator 在 xcku040 上实测平均 26.11 帧/FAR 列，与 oracle 测试 $\text{slope} \cdot f_x = 26.1$ 偏差 <0.2%。在 xcku5p 上 $f_x = 27$ 通过验证 (偏差 1.6%)，$f_x = 22$ 被拒绝 (偏差 17.2%)。这确立了关键口径：

| 指标                      | US 值          | US+ 值         | 来源                  |
| ------------------------- | -------------- | -------------- | --------------------- |
| 物理 CLB 帧/FAR 列        | **12**   | **16**   | Bitfiltrator 硅级测量 |
| 平均 CLB_IO_CLK 帧/FAR 列 | **26.1** | **33.9** | Bitfiltrator 列枚举   |
| $f_x$ 注入系数          | **22**   | **27**   | 硅片 oracle 线性拟合  |

**物理 CLB 帧宽 $\neq$ $f_x$ 注入系数**：$f_x$ 是集成系数，吸收非 CLB 列 (CMT/CLK/IO) 的物理帧贡献。两者在各自模型框架内正确，不可直接比较。

### 2.2 可借鉴的技术细节

- **FF INIT 反相**：若支持 FF 注入路径，需注意 bitstream 中 INIT 值是反相的
- **SLICEM 额外 minors**：LUTRAM 定位需区分 SLICEL/SLICEM
- **CLB 列中线间隙**：第 30/31 CLB 之间的 FAR 不连续影响 clock region 边界附近的地址计算
- **跨器件一致性**：同一架构内 frame 数为硅级常数，验证了 ARCH_REGISTRY 设常数的设计决策

## 3. 局限

1. **仅覆盖 US/US+**：未涉及 7-Series，7-Series 验证仍需依赖 prjxray
2. **未提供完整 tilegrid**：论文验证参数一致性，但未提供类似 prjxray-db 的 tilegrid.json 完整数据库
3. **未涉及 IO/clock 资源**：IO tile 和 clock distribution 的 bit 映射未完成
4. **工具未开源**：截至 2026 年，Bitfiltrator 工具本身未开源，无法直接运行
5. **LUTRAM/BRAM 跨器件翻译未完整给出**：论文声称实现，但未给出完整公式

## 参考资料

- [Bitfiltrator FPL 2022 Paper (IEEE)](https://www.computer.org/csdl/proceedings-article/fpl/2022/739000a192/1KJwAykgqti)
- [Project U-Ray (交叉验证源)](https://github.com/f4pga/prjuray)
- [Project X-Ray (方法论前身)](https://github.com/f4pga/prjxray)
