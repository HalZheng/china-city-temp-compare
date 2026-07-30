import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { YearlyData, TempType } from '../types';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, ToolboxComponent, CanvasRenderer]);

interface TempChartProps {
  container: HTMLElement;
}

type EChartsInstance = ReturnType<typeof echarts.init>;

export function TempChart({ container }: TempChartProps): {
  update: (data: YearlyData[], tempType: TempType, colors: Record<number, string>, cityName: string, labels: string[], averageLine?: (number | null)[]) => void;
  destroy: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-wrapper';
  wrapper.style.position = 'relative';
  container.appendChild(wrapper);

  // ECharts 容器必须是带显式尺寸的 <div>（由 CSS 控制高度）
  const chartEl = document.createElement('div');
  chartEl.className = 'temp-chart';
  wrapper.appendChild(chartEl);

  let chart: EChartsInstance | null = null;
  // 以「年份整数」为 key 记录被隐藏的系列，跨 tempType 切换 / 重查询保持稳定
  const hiddenYears = new Set<number>();
  // 「多年平均」默认隐藏
  let avgHidden = true;

  // 调试钩子：仅在 URL 带 ?debug=chart 时暴露实例，便于 E2E 精确读取 option；生产环境无此参数则完全不生效
  if (typeof location !== 'undefined' && location.search.includes('debug=chart')) {
    (window as any).__getTempChart = () => chart;
  }

  const resizeObserver = new ResizeObserver(() => {
    if (chart) chart.resize();
  });

  // 同步原生图例切换状态，使隐藏状态在 notMerge 重建后得以恢复
  function handleLegendSelectChanged(params: any) {
    const sel = params?.selected as Record<string, boolean> | undefined;
    if (!sel) return;
    hiddenYears.clear();
    for (const [name, on] of Object.entries(sel)) {
      if (name === '多年平均') {
        avgHidden = !on;
        continue;
      }
      const y = parseYearFromName(name);
      if (!Number.isNaN(y) && !on) hiddenYears.add(y);
    }
  }

  function ensureInit() {
    if (chart) return;
    chart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
    resizeObserver.observe(chartEl);
    chart.on('legendselectchanged', handleLegendSelectChanged);
  }

  function parseYearFromName(name: string): number {
    const m = name.match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function buildSeries(
    data: YearlyData[],
    tempType: TempType,
    colors: Record<number, string>,
    labels: string[],
    averageLine?: (number | null)[],
  ): any[] {
    const series: any[] = [];

    for (const yd of data) {
      const temps = tempType === 'max' ? yd.maxTemps : yd.minTemps;
      const color = colors[yd.year] || '#374151';
      const forecastFlags = yd.forecastFlags || [];
      const hasForecast = forecastFlags.some(Boolean);
      const firstFc = forecastFlags.findIndex(Boolean);

      // 历史实线：包含 history + 第一个预报点 firstFc。
      // 关键技巧：实线多延伸一个点，使边界(firstFc-1)在实线里成为"内部点"，
      // 其平滑切线由 firstFc-2 与 firstFc 共同决定（更接近整体走势），
      // 与虚线首段(firstFc-1→firstFc)的方向差更小，从而把衔接折角压到最小。
      const histData = temps.map((t, i) => {
        if (t === null) return null;
        if (forecastFlags[i] && i !== firstFc) return null;
        return Number(t.toFixed(1));
      });
      series.push({
        name: `${yd.year}年`,
        type: 'line',
        data: histData,
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 3,
        connectNulls: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { focus: 'series' },
      });

      // 预报虚线：与实线同名 -> 图例只显示一项；含历史末点 firstFc-1 以连接。
      // 两条 series 各自独立平滑，边界处会有极轻微的切线偏差（ECharts 限制），
      // 通过上述"实线多延伸一点"已把该偏差压到肉眼难辨的程度。
      if (hasForecast) {
        const fcData = temps.map((t, i) => {
          if (t === null) return null;
          if (forecastFlags[i]) return Number(t.toFixed(1));
          if (i === firstFc - 1) return Number(t.toFixed(1));
          return null;
        });
        series.push({
          name: `${yd.year}年`,
          type: 'line',
          data: fcData,
          smooth: true,
          showSymbol: true,
          symbol: 'diamond',
          symbolSize: 5,
          connectNulls: false,
          lineStyle: { color, width: 2, type: 'dashed' },
          itemStyle: { color: `${color}99` },
          emphasis: { focus: 'series' },
          z: 2,
        });
      }
    }

    if (averageLine && averageLine.length === labels.length) {
      series.push({
        name: '多年平均',
        type: 'line',
        data: averageLine.map((t) => (t === null ? null : Number(t.toFixed(1)))),
        smooth: true,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { type: 'dashed', color: '#6b7280', width: 2 },
        itemStyle: { color: '#6b7280' },
        z: 1,
      });
    }

    return series;
  }

  function buildOption(
    cityName: string,
    tempType: TempType,
    labels: string[],
    series: any[],
    colors: Record<number, string>,
    selected: Record<string, boolean>,
  ): echarts.EChartsCoreOption {
    const tempLabel = tempType === 'max' ? '最高气温对比' : '最低气温对比';
    return {
      // 图例显隐属于"更新"操作，走 animationDurationUpdate -> 精致过渡动画；
      // 全量重建(查询/切类型, notMerge:true)使用 animationDuration:0，避免整图入场抖动
      animation: true,
      animationDuration: 0,
      animationDurationUpdate: 300,
      animationEasingUpdate: 'cubicOut',
      color: Object.values(colors),
      backgroundColor: 'transparent',
      title: {
        text: `${cityName} · ${tempLabel}`,
        top: 8,
        left: 'center',
        textStyle: { fontSize: 15, color: '#111827', fontWeight: 500 },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(17, 24, 39, 0.92)',
        borderWidth: 0,
        textStyle: { color: '#ffffff', fontSize: 13 },
        valueFormatter: (value: any) => (value == null ? '无数据' : `${value}℃`),
      },
      legend: {
        type: 'scroll',
        top: 44,
        left: 'center',
        selectedMode: true,
        selected,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { fontSize: 12, color: '#374151' },
      },
      toolbox: {
        right: 12,
        top: 6,
        feature: {
          saveAsImage: {
            name: `${cityName}_气温对比`,
            title: '保存为图片',
            backgroundColor: '#ffffff',
            pixelRatio: 2,
          },
        },
      },
      grid: { top: 92, left: 56, right: 28, bottom: 48, containLabel: false },
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        name: '日期',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: 12, color: '#6b7280' },
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: { fontSize: 12, color: '#6b7280' },
        splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.04)' } },
      },
      yAxis: {
        type: 'value',
        // 按可见年份的极值动态自适应纵轴（不含强制 0 基线，避免曲线被压扁）
        scale: true,
        name: '温度(℃)',
        nameTextStyle: { fontSize: 12, color: '#6b7280' },
        axisLabel: { fontSize: 12, color: '#6b7280', formatter: '{value}°' },
        splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } },
      },
      series,
    };
  }

  function update(
    data: YearlyData[],
    tempType: TempType,
    colors: Record<number, string>,
    cityName: string,
    labels: string[],
    averageLine?: (number | null)[],
  ) {
    if (data.length === 0) return;

    const series = buildSeries(data, tempType, colors, labels, averageLine);

    // 依据当前隐藏状态构造 legend.selected（notMerge 会重置选中态，需重建）
    const selected: Record<string, boolean> = {};
    for (const s of series) {
      if (s.name === '多年平均') selected[s.name] = !avgHidden;
      else selected[s.name] = !hiddenYears.has(parseYearFromName(s.name));
    }

    const option = buildOption(cityName, tempType, labels, series, colors, selected);

    ensureInit();
    // notMerge 保证查询年份变化时不会残留旧系列
    chart!.setOption(option, { notMerge: true });
    chart!.resize();
  }

  function destroy() {
    resizeObserver.disconnect();
    if (chart) {
      chart.dispose();
      chart = null;
    }
  }

  return { update, destroy };
}
