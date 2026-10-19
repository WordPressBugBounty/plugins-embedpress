import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip);

// Dashed vertical cursor line at the hovered x position.
const hoverLinePlugin = {
  id: 'epHoverLine',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length) return;
    const { ctx, chartArea } = chart;
    const x = active[0].element.x;
    ctx.save();
    ctx.beginPath();
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#333333';
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

const SplineChart = ({ data, loading, viewType }) => {
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if pro is active
  const isProActive = window.embedpressAnalyticsData?.isProActive || false;

  // Fetch real data from API only if pro is active
  useEffect(() => {
    // Pro-only series: with Pro inactive the chart stays empty rather than
    // showing fabricated figures (it only renders inside <ProOverlay>).
    if (!isProActive) {
      setChartData([]);
      setIsLoading(false);
      return;
    }

    const fetchChartData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${window.embedpressAnalyticsData?.restUrl}spline-chart?date_range=30`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-WP-Nonce': window.embedpressAnalyticsData?.nonce || window.wpApiSettings?.nonce
          }
        });

        if (response.ok) {
          const result = await response.json();

          if (result.success && result.data) {
            setChartData(result.data);
          } else {
            setChartData([]);
          }
        } else {
          setChartData([]);
        }
      } catch (error) {
        setChartData([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchChartData();
  }, [viewType, isProActive]);

  const seriesConfig = {
    clicks: { name: "Clicks", field: "clicks", color: "#5B4E96" },
    views: { name: "Views", field: "views", color: "#8A76E3" },
    impressions: { name: "Impressions", field: "impressions", color: "#C8B9FF" }
  };

  // Show all three lines for 'all' (or unset), otherwise only the selected one.
  const activeSeries = (!viewType || viewType === 'all')
    ? [seriesConfig.clicks, seriesConfig.views, seriesConfig.impressions]
    : (seriesConfig[viewType] ? [seriesConfig[viewType]] : []);

  // Dynamic max value based on data, with 20% headroom.
  const getMaxValue = () => {
    if (!chartData || chartData.length === 0) return 120;

    let maxValue = 0;
    chartData.forEach(item => {
      const clicks = item.clicks || 0;
      const views = item.views || 0;
      const impressions = item.impressions || 0;
      maxValue = Math.max(maxValue, clicks, views, impressions);
    });

    return Math.ceil(maxValue * 1.2) || 120;
  };

  const lineData = {
    labels: chartData.map(item => item.month),
    datasets: activeSeries.map(series => ({
      label: series.name,
      data: chartData.map(item => Number(item[series.field]) || 0),
      borderColor: series.color,
      backgroundColor: series.color,
      borderWidth: 3,
      tension: 0.4,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 4,
      pointHoverBorderWidth: 2,
      pointHoverBackgroundColor: '#ffffff',
      pointHoverBorderColor: series.color,
    })),
  };

  const gridStyle = {
    color: 'rgba(229, 229, 229, 0.5)',
    tickColor: 'transparent',
  };
  const borderStyle = { display: false, dash: [2, 2] };
  const tickStyle = { color: '#999999', font: { size: 12 } };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 1000 },
    layout: { padding: 20 },
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        grid: gridStyle,
        border: borderStyle,
        ticks: { ...tickStyle, padding: 15, maxRotation: 0, autoSkipPadding: 20 },
      },
      y: {
        min: 0,
        // suggestedMax (not max) so Chart.js rounds up to a clean tick step.
        suggestedMax: getMaxValue(),
        grid: gridStyle,
        border: borderStyle,
        ticks: { ...tickStyle, padding: 15, precision: 0 },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#000',
        titleColor: '#fff',
        bodyColor: '#fff',
        titleFont: { size: 10, weight: '600' },
        bodyFont: { size: 10, weight: '400' },
        padding: { top: 6, bottom: 6, left: 8, right: 8 },
        cornerRadius: 8,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`,
          labelColor: (ctx) => ({
            borderColor: ctx.dataset.borderColor,
            backgroundColor: ctx.dataset.borderColor,
          }),
        },
      },
    },
  };

  // Generate legend items based on viewType
  const getLegendItems = () => {
    const legendConfig = {
      clicks: { color: '#5B4E96', label: 'Clicks' },
      views: { color: '#8A76E3', label: 'Views' },
      impressions: { color: '#C8B9FF', label: 'Impressions' }
    };

    if (!viewType || viewType === 'all') {
      // Show all legend items
      return Object.entries(legendConfig).map(([key, config]) => (
        <div key={key} className="legend-item">
          <span className="legend-color" style={{
            backgroundColor: config.color,
            width: '12px',
            height: '12px',
            borderRadius: '2px',
            display: 'inline-block'
          }}></span>
          <span className="legend-text">{config.label}</span>
        </div>
      ));
    } else {
      // Show only selected legend item
      const config = legendConfig[viewType];
      if (config) {
        return (
          <div className="legend-item">
            <span className="legend-color" style={{
              backgroundColor: config.color,
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              display: 'inline-block'
            }}></span>
            <span className="legend-text">{config.label}</span>
          </div>
        );
      }
    }
    return null;
  };

  return (
    <>
      {/* Dynamic legend based on viewType */}
      <div className="chart-legend-custom" style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        margin: '0',
        padding: '0',
        gap: '20px'
      }}>
        {getLegendItems()}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div style={{
          width: "100%",
          height: "360px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          border: "1px solid #e0e0e0",
          borderRadius: "4px"
        }}>
          <div>Loading chart data...</div>
        </div>
      )}

      {/* Chart container */}
      {!isLoading && (
        <div
          style={{
            width: "100%",
            height: "360px",
            backgroundColor: "#ffffff",
            overflow: "hidden",
            position: "relative"
          }}
        >
          {chartData.length > 0 && (
            <Line data={lineData} options={options} plugins={[hoverLinePlugin]} />
          )}
        </div>
      )}

    </>

  );
};

export default SplineChart;
