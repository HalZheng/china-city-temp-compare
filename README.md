# 中国城市历年气温对比

一个面向日常使用的中国城市历年气温对比工具。通过同一日期区间的逐年曲线和统计指标，快速判断某年是否比往年更热。

## ✨ 功能特性

- 🏙️ **城市与区县** — 支持行政区划级联、中文与拼音搜索
- 📍 **当前位置** — 获得授权后自动切换到当前位置并重新查询
- 📅 **日期范围选择** — 自由设定查询的起止日期
- 📆 **多年份对比** — 同时对比最多 10 个年份的气温数据
- 📈 **折线图可视化** — 平滑折线图展示各年度气温走势
- 🌡️ **最高/最低气温切换** — 可分别查看最高气温和最低气温
- 📊 **逐年统计** — 按年份对比区间均值、高温日、热夜、寒潮、冰冻日等指标
- 🔥 **极端天气识别** — 识别高温热浪，以及基于绝对低温阈值的简化寒潮/严寒时段
- 🎨 **温度着色** — 高温自动标记醒目颜色，便于识别异常温度
- 🔮 **预报数据区分** — 当年未发生的日期以虚线展示预报数据
- 🖼️ **保存为图片** — 一键将图表导出为 PNG 图片
- 🔗 **分享查询** — URL 保存城市坐标、日期、年份和温度类型，可复现当前查询
- 🌓 **主题切换** — 支持浅色、深色和跟随系统
- 📱 **响应式设计** — 支持桌面端和移动端

## 🛠️ 技术栈

- **框架**: Vite + TypeScript + Vanilla JS
- **图表**: ECharts
- **数据源**: [Open-Meteo](https://open-meteo.com/) 免费气象 API
- **地理编码**: Open-Meteo Geocoding API

## 🚀 快速开始

### 环境要求

- Node.js >= 20.19.0
- npm

### 安装与运行

```bash
# 进入项目目录
cd temp-compare

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行逻辑回归测试
npm test

# 预览生产版本
npm run preview
```

开发服务器启动后访问 `http://localhost:5173` 即可使用。

## 📖 使用说明

1. **选择城市** — 搜索城市/区县或使用省、市、区县三级选择；允许定位时会自动查询当前位置
2. **选择日期范围** — 设定起止日期，默认范围为今天前后 10 天
3. **选择年份** — 勾选要对比的年份（最多 10 个），默认包含过去 5 年（含当年）
4. **点击查询** — 系统将从 Open-Meteo API 获取历史气象数据
5. **查看图表** — 折线图展示各年度气温对比，可切换最高/最低气温视图
6. **查看统计与明细** — 逐年统计用于横向比较，详情表每格按“最高 / 最低”展示
7. **保存图片** — 点击图表右上角“保存为图片”按钮导出 PNG

## 🏗️ 项目结构

```
temp-compare/
├── public/
│   ├── favicon.svg          # 网站图标
│   └── icons.svg            # 图标集合
├── src/
│   ├── api/
│   │   └── open-meteo.ts   # Open-Meteo API 封装
│   ├── components/
│   │   ├── CascaderCitySearch.ts # 城市/区县搜索与级联选择
│   │   ├── DataTable.ts    # 详细数据表格组件
│   │   ├── DateRangePicker.ts  # 日期范围选择器
│   │   ├── ExtremeCards.ts # 高温热浪 / 寒潮极端天气卡片
│   │   ├── StatsCards.ts   # 逐年统计表
│   │   ├── TempChart.ts    # 气温折线图组件
│   │   └── YearSelector.ts # 年份选择器
│   ├── logic/
│   │   ├── extremes.ts     # 极端天气判定阈值与统计
│   │   └── stats.ts        # 统计计算（均值、多年逐日均值）
│   ├── types/
│   │   └── index.ts        # TypeScript 类型定义
│   ├── utils/
│   │   └── helpers.ts      # 工具函数
│   ├── main.ts             # 应用入口
│   └── style.css           # 样式表
├── index.html              # HTML 入口
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts          # Vite 配置
├── vercel.json             # Vercel 部署配置
└── .nvmrc                  # Node 版本约束
```

## 🔌 API 说明

本项目使用 [Open-Meteo](https://open-meteo.com/) 免费开放的气象数据 API：

| API | 用途 |
|-----|------|
| Geocoding API | 城市搜索与坐标获取 |
| Historical Weather API | 历史气象数据查询 |
| Forecast API | 预报数据查询（当年未来日期） |

浏览器定位后的中文地名由 BigDataCloud Reverse Geocoding API 提供。历史请求在当前页面会话内缓存，预报请求缓存 10 分钟。预报通常只覆盖未来约 15 天，超出范围或请求失败时页面会明确提示。

## 📐 指标口径

- 高温日：日最高气温 ≥ 35℃；连续至少 3 天为一次高温热浪。
- 热夜：日最低气温 ≥ 25℃。
- 冰冻日：日最低气温 ≤ 0℃；极端寒夜：日最低气温 ≤ -5℃。
- 寒潮采用适合本工具快速比较的简化绝对低温规则，不等同于包含降温幅度条件的完整气象业务标准。

所有 API 均为免费使用，无需 API Key。

## 📄 License

仓库当前未单独提供开源许可证文件。

## 🙏 致谢

- 数据来源: [Open-Meteo](https://open-meteo.com/)
- 灵感参考: [historicaltemperature.org](https://historicaltemperature.org/)
