import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  ToolboxComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { YearlyData, TempType } from '../types';
import { getCssVar } from '../utils/helpers';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, ToolboxComponent, DataZoomComponent, CanvasRenderer]);

interface TempChartProps {
  container: HTMLElement;
}

type EChartsInstance = ReturnType<typeof echarts.init>;

export function TempChart({ container }: TempChartProps): {
  update: (data: YearlyData[], tempType: TempType, colors: Record<number, string>, cityName: string, labels: string[], averageLine?: (number | null)[], yearAverages?: { year: number; average: number | null }[]) => void;
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

  // 横屏全屏按钮：CSS transform 旋转绕开系统方向锁，iOS 降级为 fixed overlay
  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.className = 'chart-fullscreen-btn';
  fsBtn.title = '横屏全屏查看';
  fsBtn.setAttribute('aria-label', '横屏全屏查看');
  fsBtn.innerHTML = '&#10548;'; // ↥ 向上右斜箭头，语义"撑满"
  wrapper.appendChild(fsBtn);

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

  // ===== 横屏全屏：CSS transform 旋转，绕开 screen.orientation.lock（iOS 不支持）=====
  function isFullscreen() {
    return container.classList.contains('fullscreen-landscape');
  }

  async function enterFullscreen() {
    container.classList.add('fullscreen-landscape');
    fsBtn.innerHTML = '&#10060;'; // ✕ 退出
    fsBtn.title = '退出全屏';
    fsBtn.setAttribute('aria-label', '退出全屏');
    // 优先原生 Fullscreen API（隐藏地址栏，体验最佳；iOS Safari 对非 video 元素不支持，会抛错，降级到 CSS fixed overlay）
    const el = container as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (typeof el.requestFullscreen === 'function') {
      try { await el.requestFullscreen(); } catch { /* 降级：仅靠 CSS 类的 fixed inset:0 模拟全屏 */ }
    }
    // 旋转后尺寸变化，下一帧 resize 让 ECharts 重排
    requestAnimationFrame(() => chart?.resize());
  }

  async function exitFullscreen() {
    container.classList.remove('fullscreen-landscape');
    fsBtn.innerHTML = '&#10548;';
    fsBtn.title = '横屏全屏查看';
    fsBtn.setAttribute('aria-label', '横屏全屏查看');
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
    }
    requestAnimationFrame(() => chart?.resize());
  }

  function toggleFullscreen() {
    if (isFullscreen()) void exitFullscreen(); else void enterFullscreen();
  }

  // 系统级退出（ESC / F11）时同步移除 CSS 类
  function handleFullscreenChange() {
    if (!document.fullscreenElement && isFullscreen()) {
      container.classList.remove('fullscreen-landscape');
      fsBtn.innerHTML = '&#10548;';
      fsBtn.title = '横屏全屏查看';
      fsBtn.setAttribute('aria-label', '横屏全屏查看');
      requestAnimationFrame(() => chart?.resize());
    }
  }

  fsBtn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', handleFullscreenChange);

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
      const color = colors[yd.year] || getCssVar('--text') || '#374151';
      const forecastFlags = yd.forecastFlags || [];
      const hasForecast = forecastFlags.some(Boolean);
      const firstFc = forecastFlags.findIndex(Boolean);

      // 历史实线：仅含 history，终点为 firstFc-1（不含任何预报点）。
      // 与预报虚线在边界点 firstFc-1 相接但不重叠，避免两段各自平滑时
      // 重叠区间因切线不同而产生的"不贴合"缝隙。
      const histData = temps.map((t, i) => {
        if (t === null) return null;
        if (forecastFlags[i]) return null;
        return Number(t.toFixed(1));
      });
      const yearName = `${yd.year}`;
      series.push({
        name: yearName,
        type: 'line',
        data: histData,
        smooth: false,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 3,
        connectNulls: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        emphasis: { focus: 'series' },
      });

      // 预报虚线：与实线同名 -> 图例只显示一项；含历史末点 firstFc-1 作为衔接点，
      // 从 firstFc-1 出发绘制到预报末点。两段共享边界点、无重叠区间，
      // 各自独立平滑，相接处可能有极轻微切线差，但不会出现重叠错位。
      if (hasForecast) {
        const fcData = temps.map((t, i) => {
          if (t === null) return null;
          if (forecastFlags[i]) return Number(t.toFixed(1));
          if (i === firstFc - 1) return Number(t.toFixed(1));
          return null;
        });
        series.push({
          name: yearName,
          type: 'line',
          data: fcData,
          smooth: false,
          showSymbol: true,
          symbol: 'diamond',
          symbolSize: 4,
          connectNulls: false,
          lineStyle: { color, width: 1.5, type: 'dashed' },
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
        smooth: false,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { type: 'dashed', color: getCssVar('--icon') || '#6b7280', width: 2 },
        itemStyle: { color: getCssVar('--icon') || '#6b7280' },
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
    data: YearlyData[],
    averageLine?: (number | null)[],
    yearAverages?: { year: number; average: number | null }[],
  ): echarts.EChartsCoreOption {
    const tempLabel = tempType === 'max' ? '最高气温对比' : '最低气温对比';
    // 图例左侧说明文字：解释温度数值含义（跟随 tempType 切换）
    const legendCaption = tempType === 'max' ? '区间最高气温均值' : '区间最低气温均值';
    // 年份 -> 区间均值映射，供 legend formatter 查询
    const avgMap: Record<number, number | null> = {};
    if (yearAverages) for (const ya of yearAverages) avgMap[ya.year] = ya.average;
    // 读取当前主题的 CSS 变量值（主题切换后 buildOption 重新执行，拿到新值）
    const cTextH = getCssVar('--text-h') || '#111827';
    const cText = getCssVar('--text') || '#374151';
    const cMuted = getCssVar('--icon') || '#6b7280';
    const cBorder = getCssVar('--border') || '#e5e7eb';
    const cSurface = getCssVar('--surface') || '#ffffff';

    // 图例只包含真实系列；均值口径作为标题副文案，避免伪系列触发 ECharts 告警。
    const yearNames = data.map((yd) => `${yd.year}`);
    const legendData: any[] = [...yearNames];
    if (averageLine) legendData.push('多年平均');

    // 移动端竖屏：默认只显示前 60%，留出平移空间 + 底部 slider；全屏横屏 / 桌面：全显，仅 inside 缩放
    const isNarrow = window.matchMedia('(max-width: 768px)').matches && !isFullscreen();
    const dzEnd = isNarrow ? 60 : 100;
    const dataZoom: any[] = [
      { type: 'inside', start: 0, end: dzEnd, zoomOnMouseWheel: true, moveOnMouseMove: true },
    ];
    if (isNarrow) {
      dataZoom.push({
        type: 'slider',
        start: 0,
        end: dzEnd,
        height: 18,
        bottom: 8,
        borderColor: 'transparent',
        backgroundColor: 'rgba(128,128,128,0.08)',
        fillerColor: 'rgba(128,128,128,0.2)',
        handleStyle: { color: cMuted },
        textStyle: { color: cMuted, fontSize: 11 },
      });
    }

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
        subtext: legendCaption,
        top: 8,
        left: 'center',
        textStyle: { fontSize: 15, color: cTextH, fontWeight: 500 },
        subtextStyle: { fontSize: 12, color: cMuted },
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
        top: 64,
        left: 'center',
        data: legendData,
        selectedMode: 'multiple',
        selected,
        itemWidth: 22,
        itemHeight: 10,
        // 图例项两行显示：首行年份（深色），次行区间均值（浅色小字）。
        // 左侧说明文字项作为无图标的第一项，与年份图例整体居中。
        formatter: (name: string) => {
          if (name === '多年平均') return name;
          const y = parseYearFromName(name);
          if (Number.isNaN(y)) return name;
          const avg = avgMap[y];
          return `{year|${y}}\n{temp|${avg != null ? avg.toFixed(1) + '℃' : '—'}}`;
        },
        textStyle: {
          fontSize: 14,
          color: cText,
          rich: {
            year: { fontSize: 14, color: cText, lineHeight: 18, width: 42, align: 'left' },
            temp: { fontSize: 13, color: cMuted, lineHeight: 18, width: 54, align: 'left' },
          },
        },
      },
      toolbox: {
        right: 12,
        top: 6,
        feature: {
          saveAsImage: {
            name: `${cityName}_气温对比`,
            title: '保存为图片',
            backgroundColor: cSurface,
            pixelRatio: 2,
          },
        },
      },
      // 图例两行 + 说明文字占用更多顶部空间，grid.top 相应下调
      // 移动端竖屏：底部预留 dataZoom slider 空间；全屏横屏 / 桌面：无需 slider
      grid: { top: 124, left: 56, right: 28, bottom: isNarrow ? 80 : 48, containLabel: false },
      dataZoom,
      xAxis: {
        type: 'category',
        data: labels,
        boundaryGap: false,
        name: '日期',
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: 12, color: cMuted },
        axisLine: { lineStyle: { color: cBorder } },
        axisTick: { show: false },
        axisLabel: { fontSize: 12, color: cMuted },
        splitLine: { show: true, lineStyle: { color: 'rgba(128,128,128,0.08)' } },
      },
      yAxis: {
        type: 'value',
        // 按可见年份的极值动态自适应纵轴（不含强制 0 基线，避免曲线被压扁）
        scale: true,
        name: '温度(℃)',
        nameTextStyle: { fontSize: 12, color: cMuted },
        axisLabel: { fontSize: 12, color: cMuted, formatter: '{value}°' },
        splitLine: { lineStyle: { color: 'rgba(128,128,128,0.1)' } },
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
    yearAverages?: { year: number; average: number | null }[],
  ) {
    if (data.length === 0) return;

    const series = buildSeries(data, tempType, colors, labels, averageLine);

    // 依据当前隐藏状态构造 legend.selected（notMerge 会重置选中态，需重建）
    const selected: Record<string, boolean> = {};
    for (const s of series) {
      if (s.name === '多年平均') selected[s.name] = !avgHidden;
      else selected[s.name] = !hiddenYears.has(parseYearFromName(s.name));
    }

    const option = buildOption(cityName, tempType, labels, series, colors, selected, data, averageLine, yearAverages);

    ensureInit();
    // notMerge 保证查询年份变化时不会残留旧系列
    chart!.setOption(option, { notMerge: true });
    chart!.resize();
  }

  function destroy() {
    resizeObserver.disconnect();
    fsBtn.removeEventListener('click', toggleFullscreen);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    if (document.fullscreenElement) {
      try { void document.exitFullscreen(); } catch { /* ignore */ }
    }
    if (chart) {
      chart.dispose();
      chart = null;
    }
  }

  return { update, destroy };
}
