import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';
import type { YearlyData, TempType } from '../types';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Title);

interface TempChartProps {
  container: HTMLElement;
}

export function TempChart({ container }: TempChartProps): { update: (data: YearlyData[], tempType: TempType, colors: Record<number, string>, cityName: string, labels: string[], averageLine?: (number | null)[]) => void; saveImage: (cityName: string) => void; destroy: () => void } {
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

  const canvas = document.createElement('canvas');
  canvas.className = 'temp-chart';
  wrapper.appendChild(canvas);

  let chart: Chart | null = null;
  let currentCityName = '';

  function saveImage(cityName: string) {
    if (!chart) return;
    const name = cityName || currentCityName || '气温对比';
    const url = chart.toBase64Image('image/png', 1);
    const link = document.createElement('a');
    link.download = `${name}_气温对比_${new Date().toISOString().slice(0, 10)}.png`;
    link.href = url;
    link.click();
  }

  saveBtn.addEventListener('click', () => {
    saveImage(currentCityName);
  });

  function update(
    data: YearlyData[],
    tempType: TempType,
    colors: Record<number, string>,
    cityName: string,
    labels: string[],
    averageLine?: (number | null)[],
  ) {
    currentCityName = cityName;
    if (chart) {
      chart.destroy();
    }

    if (data.length === 0) return;

    const datasets: any[] = data.map((yearData) => {
      const temps = tempType === 'max' ? yearData.maxTemps : yearData.minTemps;
      const color = colors[yearData.year] || '#374151';
      const forecastFlags = yearData.forecastFlags || [];

      const pointStyles = temps.map((_, i) => (forecastFlags[i] ? 'rectRot' : 'circle'));
      const pointRadiusArr = temps.map((_, i) => (forecastFlags[i] ? 2.5 : 2));
      const pointHoverRadiusArr = temps.map((_, i) => (forecastFlags[i] ? 4.5 : 4));
      const pointBgColors = temps.map((_, i) => (forecastFlags[i] ? color + '60' : color));

      return {
        label: `${yearData.year}年`,
        data: temps.map((t) => (t !== null ? Number(t.toFixed(1)) : null)),
        borderColor: color,
        backgroundColor: color,
        tension: 0.4,
        pointRadius: pointRadiusArr,
        pointHoverRadius: pointHoverRadiusArr,
        pointStyle: pointStyles,
        pointBackgroundColor: pointBgColors,
        borderWidth: 1.5,
        spanGaps: false,
        segment: {
          borderDash: (ctx: any) => {
            const idx = ctx.p1DataIndex;
            return forecastFlags[idx] ? [4, 4] : undefined;
          },
        },
      };
    });

    // 多年日均虚线（所选年份逐日均值），跟随 tempType
    if (averageLine && averageLine.length === labels.length) {
      datasets.push({
        label: '多年平均',
        data: averageLine.map((t) => (t !== null ? Number(t.toFixed(1)) : null)),
        borderColor: '#6b7280',
        backgroundColor: '#6b7280',
        borderDash: [6, 5],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0.4,
        spanGaps: false,
      });
    }

    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              padding: 16,
              font: {
                size: 12,
                family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
              },
              boxWidth: 8,
              boxHeight: 8,
            },
          },
          title: {
            display: true,
            text: `${cityName} · ${tempType === 'max' ? '最高气温对比' : '最低气温对比'}`,
            font: {
              size: 15,
              weight: 500,
              family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            },
            padding: { bottom: 16 },
            color: '#111827',
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.92)',
            titleFont: { size: 13 },
            bodyFont: { size: 13 },
            padding: 10,
            cornerRadius: 8,
            callbacks: {
              title: (items) => {
                return items[0]?.label || '';
              },
              label: (item) => {
                const val = item.parsed.y;
                return `${item.dataset.label}: ${val !== null ? val + '℃' : '无数据'}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(0,0,0,0.04)',
            },
            ticks: {
              font: { size: 12 },
              color: '#6b7280',
            },
            title: {
              display: true,
              text: '日期',
              font: { size: 12, weight: 500 },
              color: '#6b7280',
            },
          },
          y: {
            grid: {
              color: 'rgba(0,0,0,0.04)',
            },
            ticks: {
              font: { size: 12 },
              color: '#6b7280',
            },
            title: {
              display: true,
              text: '温度 (℃)',
              font: { size: 12, weight: 500 },
              color: '#6b7280',
            },
          },
        },
      },
    });
  }

  function destroy() {
    if (chart) {
      chart.destroy();
      chart = null;
    }
  }

  return { update, saveImage, destroy };
}
