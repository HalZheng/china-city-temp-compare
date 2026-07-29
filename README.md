# 中国城市历年气温对比

一个查询中国任意城市历史气温数据并进行多年对比的可视化网站。支持选择日期范围和多个年份，通过折线图直观对比各年度的气温趋势，快速判断某年是否比往年更热。

## ✨ 功能特性

- 🏙️ **城市搜索** — 支持中国任意城市的搜索与定位
- 📅 **日期范围选择** — 自由设定查询的起止日期
- 📆 **多年份对比** — 同时对比最多 10 个年份的气温数据
- 📈 **折线图可视化** — 平滑折线图展示各年度气温走势
- 🌡️ **最高/最低气温切换** — 可分别查看最高气温和最低气温
- 🎨 **温度着色** — 高温自动标记醒目颜色，便于识别异常温度
- 🔮 **预报数据区分** — 当年未发生的日期以虚线展示预报数据
- 🖼️ **保存为图片** — 一键将图表导出为 PNG 图片
- 📱 **响应式设计** — 支持桌面端和移动端

## 🛠️ 技术栈

- **框架**: Vite + TypeScript + Vanilla JS
- **图表**: Chart.js
- **数据源**: [Open-Meteo](https://open-meteo.com/) 免费气象 API
- **地理编码**: Open-Meteo Geocoding API

## 🚀 快速开始

### 环境要求

- Node.js >= 18
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

# 预览生产版本
npm run preview
```

开发服务器启动后访问 `http://localhost:5173` 即可使用。

## 📖 使用说明

1. **选择城市** — 在搜索框中输入城市名称（如"大连"、"北京"、"上海"），从下拉列表中选择
2. **选择日期范围** — 设定起止日期，默认范围为今天前后 10 天
3. **选择年份** — 勾选要对比的年份（最多 10 个），默认包含过去 5 年（含当年）
4. **点击查询** — 系统将从 Open-Meteo API 获取历史气象数据
5. **查看图表** — 折线图展示各年度气温对比，可切换最高/最低气温视图
6. **保存图片** — 点击图表右上角"保存为图片"按钮导出 PNG

## 🏗️ 项目结构

```
temp-compare/
├── public/
│   └── favicon.svg          # 网站图标
├── src/
│   ├── api/
│   │   └── open-meteo.ts   # Open-Meteo API 封装
│   ├── components/
│   │   ├── CitySearch.ts   # 城市搜索组件
│   │   ├── DateRangePicker.ts  # 日期范围选择器
│   │   ├── YearSelector.ts # 年份选择器
│   │   ├── TempChart.ts    # 气温折线图组件
│   │   └── DataTable.ts    # 详细数据表格组件
│   ├── types/
│   │   └── index.ts        # TypeScript 类型定义
│   ├── utils/
│   │   └── helpers.ts      # 工具函数
│   ├── main.ts             # 应用入口
│   └── style.css           # 样式表
├── index.html              # HTML 入口
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
└── vite.config.ts          # Vite 配置
```

## 🔌 API 说明

本项目使用 [Open-Meteo](https://open-meteo.com/) 免费开放的气象数据 API：

| API | 用途 |
|-----|------|
| Geocoding API | 城市搜索与坐标获取 |
| Historical Weather API | 历史气象数据查询 |
| Forecast API | 预报数据查询（当年未来日期） |

所有 API 均为免费使用，无需 API Key。

## 📄 License

本项目基于 MIT 许可证开源。

## 🙏 致谢

- 数据来源: [Open-Meteo](https://open-meteo.com/)
- 灵感参考: [historicaltemperature.org](https://historicaltemperature.org/)
