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
  // 标准全屏图标：矩形四角箭头向外（expand）；退出时换四角箭头向内（compress）
  // 使用 Material Design filled 图标，四角箭头形状更直观
  const ICON_EXPAND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
  const ICON_COMPRESS = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>';
  fsBtn.innerHTML = ICON_EXPAND;
  // 挂到 container 而非 wrapper：全屏旋转时 wrapper 会 rotate，按钮需固定位置
  container.appendChild(fsBtn);

  // 下载图表按钮：独立 DOM 不随 wrapper 旋转，全屏/非全屏均在左上角
  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'chart-download-btn';
  downloadBtn.title = '保存为图片';
  downloadBtn.setAttribute('aria-label', '保存为图片');
  const ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>';
  downloadBtn.innerHTML = ICON_DOWNLOAD;
  container.appendChild(downloadBtn);

  let chart: EChartsInstance | null = null;
  // 以「年份整数」为 key 记录被隐藏的系列，跨 tempType 切换 / 重查询保持稳定
  const hiddenYears = new Set<number>();
  // 「多年平均」默认隐藏
  let avgHidden = true;
  // 最近一次 update 的 labels（横轴天数），供全屏切换时重算 dataZoom 默认区间
  let latestLabels: string[] = [];
  // 最近一次 update 的城市名，供下载按钮命名文件
  let latestCityName = '';

  // 按可用宽度与总天数计算 dataZoom 默认显示区间（百分比）
  // 每个横轴标签(MM-DD)最小可读宽度约 24px；至少 15%，最多 100%
  function calcDataZoomEnd(totalDays: number, availableWidth: number): number {
    if (totalDays <= 0) return 100;
    const minLabelWidth = 24;
    const usable = Math.max(120, availableWidth - 40); // 减去 grid left/right 近似 padding
    const visibleDays = Math.floor(usable / minLabelWidth);
    const end = Math.round((visibleDays / totalDays) * 100);
    return Math.max(15, Math.min(100, end));
  }

  // 取当前 container 可用宽度（全屏时为视口宽，非全屏为容器宽）
  function getChartWidth(): number {
    return container.getBoundingClientRect().width;
  }

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

  // ===== 横屏全屏：CSS transform 旋转绕开 screen.orientation.lock（iOS 不支持）=====
  function isFullscreen() {
    return container.classList.contains('fullscreen-landscape');
  }

  // 按当前视口方向切换 class：竖屏视口→CSS rotate 横屏；系统已横屏→加 is-landscape-viewport 类直接铺满
  // 尺寸与居中全由 CSS（dvh/dvw + translate）处理，避免 JS 计算时机/精度问题
  function applyFullscreenLayout() {
    const isPortrait = window.innerHeight > window.innerWidth;
    container.classList.toggle('is-landscape-viewport', !isPortrait);
    requestAnimationFrame(() => {
      chart?.resize();
      // 切换后宽度变化，dataZoom 默认区间需按新宽度重算（竖屏与全屏解耦）
      resetDataZoom();
    });
  }

  // 按当前布局（全屏/非全屏）重算 dataZoom 默认区间并局部更新（不触碰系列/图例）
  // 使用 replaceMerge 完全替换 dataZoom 组件，确保全屏(1项)↔窄屏(2项)切换时项目数正确
  function resetDataZoom() {
    if (!chart || latestLabels.length === 0) return;
    const fs = isFullscreen();
    const isNarrow = window.matchMedia('(max-width: 768px)').matches && !fs;
    const dzEnd = isNarrow ? calcDataZoomEnd(latestLabels.length, getChartWidth()) : 100;
    const dataZoom: any[] = [
      { type: 'inside', start: 0, end: dzEnd, zoomOnMouseWheel: true, moveOnMouseMove: true },
    ];
    if (isNarrow) {
      dataZoom.push({
        type: 'slider', start: 0, end: dzEnd, height: 18, bottom: 8,
        borderColor: 'transparent',
        backgroundColor: 'rgba(128,128,128,0.08)',
        fillerColor: 'rgba(128,128,128,0.2)',
        handleStyle: { color: getCssVar('--icon') || '#6b7280' },
        textStyle: { color: getCssVar('--icon') || '#6b7280', fontSize: 11 },
      });
    }
    chart.setOption({ dataZoom }, { replaceMerge: ['dataZoom'] } as any);
  }

  async function enterFullscreen() {
    container.classList.add('fullscreen-landscape');
    fsBtn.innerHTML = ICON_COMPRESS;
    fsBtn.title = '退出全屏';
    fsBtn.setAttribute('aria-label', '退出全屏');
    // 优先原生 Fullscreen API（隐藏地址栏；iOS Safari 对非 video 元素不支持，降级到 CSS fixed overlay）
    const el = container as HTMLElement & { requestFullscreen?: () => Promise<void> };
    if (typeof el.requestFullscreen === 'function') {
      try { await el.requestFullscreen(); } catch { /* 降级 */ }
    }
    // 尝试锁横屏（Android Chrome 在 fullscreen 下有效；iOS 抛 NotSupportedError，忽略）
    try {
      const orient = (screen as Screen & { orientation?: { lock?: (o: string) => Promise<void> } }).orientation;
      await orient?.lock?.('landscape');
    } catch { /* iOS 不支持，靠 CSS rotate + 监听视口变化兜底 */ }
    applyFullscreenLayout();
  }

  async function exitFullscreen() {
    container.classList.remove('fullscreen-landscape');
    container.classList.remove('is-landscape-viewport');
    fsBtn.innerHTML = ICON_EXPAND;
    fsBtn.title = '横屏全屏查看';
    fsBtn.setAttribute('aria-label', '横屏全屏查看');
    try { (screen as any).orientation?.unlock?.(); } catch { /* ignore */ }
    if (document.fullscreenElement) {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
    }
    // 用 setTimeout 等待浏览器全屏退出动画完成后再 resize + 重算 dataZoom
    // 双 rAF 在某些浏览器上不够，原生全屏退出有视觉过渡，容器宽度可能尚未稳定
    setTimeout(() => {
      chart?.resize();
      resetDataZoom();
    }, 150);
  }

  function toggleFullscreen() {
    if (isFullscreen()) void exitFullscreen(); else void enterFullscreen();
  }

  // 系统级退出（ESC / F11）时同步移除 CSS 类
  function handleFullscreenChange() {
    if (!document.fullscreenElement && isFullscreen()) {
      container.classList.remove('fullscreen-landscape');
      container.classList.remove('is-landscape-viewport');
      fsBtn.innerHTML = ICON_EXPAND;
      fsBtn.title = '横屏全屏查看';
      fsBtn.setAttribute('aria-label', '横屏全屏查看');
      setTimeout(() => {
        chart?.resize();
        resetDataZoom();
      }, 150);
    }
  }

  // 视口方向变化（系统自动旋转 / orientation.unlock）：重新布局保持横屏姿态
  function handleOrientationChange() {
    if (isFullscreen()) applyFullscreenLayout();
  }

  // 下载图表为 PNG：调用 ECharts getDataURL，文件名含城市名
  function handleDownload() {
    if (!chart) return;
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: getCssVar('--surface') || '#ffffff',
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${latestCityName}_气温对比.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  fsBtn.addEventListener('click', toggleFullscreen);
  downloadBtn.addEventListener('click', handleDownload);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('resize', handleOrientationChange);
  window.addEventListener('orientationchange', handleOrientationChange);

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

    // 图例只包含真实系列；均值口径作为标题副文案，避免伪系列触发 ECharts 告警。
    const yearNames = data.map((yd) => `${yd.year}`);
    const legendData: any[] = [...yearNames];
    if (averageLine) legendData.push('多年平均');

    // dataZoom 默认区间按可用宽度与总天数动态计算（非全屏窄屏才显示 slider）
    const isNarrow = window.matchMedia('(max-width: 768px)').matches && !isFullscreen();
    const dzEnd = isNarrow ? calcDataZoomEnd(labels.length, getChartWidth()) : 100;
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

    latestLabels = labels;
    latestCityName = cityName;
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
    downloadBtn.removeEventListener('click', handleDownload);
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('resize', handleOrientationChange);
    window.removeEventListener('orientationchange', handleOrientationChange);
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
