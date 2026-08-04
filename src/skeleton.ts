/**
 * 骨架屏模块：加载时显示占位，数据回填后无缝切换。
 * 仅创建骨架屏元素和真实内容容器，section 外壳由 main.ts 装配（便于插入 tab、标题等非骨架内容）。
 * - show(): 显示骨架 + 隐藏旧内容；hide(): 隐藏骨架 + 显示新内容。
 * 设计目的：骨架与真实内容高度相近，避免 display:none 导致的页面高度跳变。
 */
export interface SkeletonInstance {
  /** 图表骨架屏（插入 chart-container 内） */
  chartSkeleton: HTMLDivElement;
  /** 统计区骨架屏 */
  statsSkeleton: HTMLDivElement;
  /** 统计区真实内容容器 */
  statsContent: HTMLDivElement;
  /** 极端事件区骨架屏行（含 2 张卡片） */
  extremeSkeleton: HTMLDivElement;
  /** 极端事件区真实内容容器 */
  extremeContent: HTMLDivElement;
  /** 表格骨架屏 */
  tableSkeleton: HTMLDivElement;
  /** 表格真实内容容器 */
  tableContent: HTMLDivElement;
  show: () => void;
  hide: () => void;
}

export function createSkeletons(): SkeletonInstance {
  // 图表骨架屏：绝对定位铺满 chart-container，加载时遮挡空白画布
  const chartSkeleton = document.createElement('div');
  chartSkeleton.className = 'skeleton skeleton-chart';

  // 统计区骨架屏：8 张占位卡片（与 StatsCards 实际卡片数量一致）
  const statsSkeleton = document.createElement('div');
  statsSkeleton.className = 'skeleton skeleton-table skeleton-table--stats';
  const statsContent = document.createElement('div');
  statsContent.className = 'stats-content';
  statsContent.style.display = 'none';

  // 极端事件区骨架屏：2 张占位卡片
  const extremeSkeleton = document.createElement('div');
  extremeSkeleton.className = 'skeleton-row';
  for (let i = 0; i < 2; i++) {
    const c = document.createElement('div');
    c.className = 'skeleton skeleton-card';
    extremeSkeleton.appendChild(c);
  }
  const extremeContent = document.createElement('div');
  extremeContent.className = 'extreme-content';
  extremeContent.style.display = 'none';

  // 表格骨架屏
  const tableSkeleton = document.createElement('div');
  tableSkeleton.className = 'skeleton skeleton-table';
  const tableContent = document.createElement('div');
  tableContent.className = 'table-content';
  tableContent.style.display = 'none';

  function show(): void {
    chartSkeleton.style.display = 'block';
    statsSkeleton.style.display = 'block';
    extremeSkeleton.style.display = 'flex';
    tableSkeleton.style.display = 'block';
    statsContent.style.display = 'none';
    extremeContent.style.display = 'none';
    tableContent.style.display = 'none';
  }

  function hide(): void {
    chartSkeleton.style.display = 'none';
    statsSkeleton.style.display = 'none';
    extremeSkeleton.style.display = 'none';
    tableSkeleton.style.display = 'none';
    statsContent.style.display = 'block';
    extremeContent.style.display = 'block';
    tableContent.style.display = 'block';
  }

  return {
    chartSkeleton,
    statsSkeleton,
    statsContent,
    extremeSkeleton,
    extremeContent,
    tableSkeleton,
    tableContent,
    show,
    hide,
  };
}
