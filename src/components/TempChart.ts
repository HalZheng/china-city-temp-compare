import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { YearlyData, TempType } from '../types';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer]);

interface TempChartProps {
  container: HTMLElement;
}

type EChartsInstance = ReturnType<typeof echarts.init>;

export function TempChart({ container }: TempChartProps): {
  update: (data: YearlyData[], tempType: TempType, colors: Record<number, string>, cityName: string, labels: string[], averageLine?: (number | null)[]) => void;
  saveImage: (cityName: string) => void;
  destroy: () => void;
} {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-wrapper';
  wrapper.style.position = 'relative';
  container.appendChild(wrapper);

  const toolbar = document.createElement('div');
  toolbar.className = 'chart-toolbar';
  toolbar.style.display = 'flex';
  toolbar.style.justifyContent = 'flex-end';
  toolbar.style.marginBottom = '8px';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.textContent = '保存为图片';
  saveBtn.className = 'save-img-btn';
  saveBtn.style.padding = '6px 12px';
  saveBtn.style.border = '1px solid #e5e7eb';
  saveBtn.style.borderRadius = '6px';
  saveBtn.style.background = '#ffffff';
  saveBtn.style.fontSize = '13px';
  saveBtn.style.color = '#374151';
  saveBtn.style.cursor = 'pointer';
  saveBtn.style.transition = 'all 0.2s';
  saveBtn.addEventListener('mouseenter', () => {
    saveBtn.style.background = '#f3f4f6';
  });
  saveBtn.addEventListener('mouseleave', () => {
    saveBtn.style.background = '#ffffff';
  });

  toolbar.appendChild(saveBtn);
  wrapper.appendChild(toolbar);

  // ECharts 容器必须是带显式尺寸的 <div>（由 CSS 控制高度）
  const chartEl = document.createElement('div');
  chartEl.className = 'temp-chart';
  wrapper.appendChild(chartEl);

  let chart: EChartsInstance | null = null;
  let currentCityName = '';
  // 以「年份整数」为 key 记录被隐藏的系列，跨 tempType 切换 / 重查询保持稳定
  const hiddenYears = new Set<number>();

  // 调试钩子：仅在 URL 带 ?debug=chart 时暴露实例，便于 E2E 精确读取 option；生产环境无此参数则完全不生效
  if (typeof location !== 'undefined' && location.search.includes('debug=chart')) {
    (window as any).__getTempChart = () => chart;
  }

  const resizeObserver = new ResizeObserver(() => {
    if (chart) chart.resize();
  });

  // 同步原生图例切换状态，使隐藏年份在 notMerge 重建后得以恢复
  function handleLegendSelectChanged(params: any) {
    const sel = params?.selected as Record<string, boolean> | undefined;
    if (!sel) return;
    hiddenYears.clear();
    for (const [name, on] of Object.entries(sel)) {
      if (!on) {
        const y = parseYearFromName(name);
        if (!Number.isNaN(y)) hiddenYears.add(y);
      }
    }
  }

  function ensureInit() {
    if (chart) return;
    chart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
    resizeObserver.observe(chartEl);
    chart.on('legendselectchanged', handleLegendSelectChanged);
  }

  function saveImage(cityName: string) {
    if (!chart) return;
    const name = cityName || currentCityName || '气温对比';
    const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `${name}_气温对比_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = url;
    link.click();
  }

  saveBtn.addEventListener('click', () => {
    saveImage(currentCityName);
  });

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
    const series: any[] = data.map((yd) => {
      const temps = tempType === 'max' ? yd.maxTemps : yd.minTemps;
      const color = colors[yd.year] || '#374151';
      const forecastFlags = yd.forecastFlags || [];
      const points = temps.map((t, i) => {
        if (t === null) return null;
        const v = Number(t.toFixed(1));
        // 预报点用菱形 + 半透明色，与原 Chart.js 视觉意图一致
        if (forecastFlags[i]) {
          return {
            value: v,
            symbol: 'diamond',
            symbolSize: 5,
            itemStyle: { color: `${color}99` },
          };
        }
        return v;
      });
      return {
        name: `${yd.year}年`,
        type: 'line',
        data: points,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 3,
        smooth: false,
        connectNulls: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { focus: 'series' },
      };
    });

    if (averageLine && averageLine.length === labels.length) {
      series.push({
        name: '多年平均',
        type: 'line',
        data: averageLine.map((t) => (t === null ? null : Number(t.toFixed(1)))),
        showSymbol: false,
        smooth: false,
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
  ): echarts.EChartsCoreOption {
    const tempLabel = tempType === 'max' ? '最高气温对比' : '最低气温对比';
    return {
      // 关闭动画：图例切换 / 数据更新均为一帧内完成，避免默认 1s 过渡造成的"卡顿"
      animation: false,
      color: Object.values(colors),
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
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { fontSize: 12, color: '#374151' },
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
    currentCityName = cityName;

    if (data.length === 0) return;

    const series = buildSeries(data, tempType, colors, labels, averageLine);
    const option = buildOption(cityName, tempType, labels, series, colors);

    ensureInit();
    // notMerge 保证查询年份变化时不会残留旧系列
    chart!.setOption(option, { notMerge: true });

    // 恢复用户隐藏的年份（notMerge 会重置 legend 选中态）
    if (hiddenYears.size > 0) {
      const selected: Record<string, boolean> = {};
      for (const s of series) {
        const year = parseYearFromName(s.name);
        selected[s.name] = !hiddenYears.has(year);
      }
      chart!.setOption({ legend: { selected } });
    }

    chart!.resize();
  }

  function destroy() {
    resizeObserver.disconnect();
    if (chart) {
      chart.dispose();
      chart = null;
    }
  }

  return { update, saveImage, destroy };
}
