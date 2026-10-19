import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip);

const COLORS = [
  "#5945B0",
  "#7158E0",
  "#8C73FA",
  "#A084FF",
  "#B49BFF",
  "#C8B2FF",
  "#DCC9FF",
  "#F0E0FF",
];

const getColor = (index) => COLORS[index % COLORS.length];

const PieChart = ({ activeTab = 'device', subTab = 'device', data }) => {
  // No placeholder figures: this chart only renders inside <ProOverlay>,
  // and with Pro inactive it must not carry fabricated data of its own either.
  const isProActive = window.embedpressAnalyticsData?.isProActive || false;

  const getChartData = () => {
    if (!isProActive) {
      return [];
    }
    const sourceData = data;

    if (activeTab === 'device') {
      if (subTab === 'resolutions') {
        return (sourceData?.deviceAnalytics?.resolutions || []).map(r => ({
          category: r.screen_resolution || 'Unknown',
          value: parseInt(r.count) || parseInt(r.visitors) || 0,
        }));
      }
      return (sourceData?.deviceAnalytics?.devices || []).map(d => ({
        category: d.device_type?.charAt(0).toUpperCase() + d.device_type?.slice(1),
        value: parseInt(d.count) || parseInt(d.visitors) || 0,
      }));
    }

    if (activeTab === 'browser') {
      if (subTab === 'browsers') {
        return (sourceData?.browser?.browsers || []).map(b => ({
          category: b.browser_name || 'Unknown',
          value: parseInt(b.count) || 0,
        }));
      }
      if (subTab === 'os') {
        return (sourceData?.browser?.operating_systems || []).map(os => ({
          category: os.operating_system || 'Unknown',
          value: parseInt(os.count) || 0,
        }));
      }
      if (subTab === 'devices') {
        return (sourceData?.browser?.devices || []).map(d => ({
          category: d.device_type?.charAt(0).toUpperCase() + d.device_type?.slice(1),
          value: parseInt(d.count) || 0,
        }));
      }
    }

    return [];
  };

  const chartData = getChartData();
  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const doughnutData = {
    labels: chartData.map(item => item.category),
    datasets: [
      {
        data: chartData.map(item => item.value),
        backgroundColor: chartData.map((_, index) => getColor(index)),
        hoverBackgroundColor: chartData.map((_, index) => getColor(index)),
        borderColor: '#fff',
        borderWidth: 2,
        borderRadius: 10,
        hoverOffset: 0,
        hoverBorderColor: '#fff',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    animation: false,
    layout: { padding: 30 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#000',
        titleColor: '#fff',
        bodyColor: '#fff',
        bodyFont: { size: 10, weight: '400' },
        padding: { top: 6, bottom: 6, left: 8, right: 8 },
        cornerRadius: 12,
        displayColors: false,
        callbacks: {
          title: () => '',
          label: (ctx) => {
            const value = ctx.parsed || 0;
            const percent = total ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${ctx.label}: ${value} (${percent}%)`;
          },
        },
      },
    },
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '100%', height: '320px', position: 'relative' }}>
        {/* Inner icon + total label — sits under the (transparent) canvas so the tooltip draws on top of it */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f0f3f7',
            borderRadius: '50%',
            boxSizing: 'border-box',
            padding: '16px',
            width: '160px',
            height: '160px',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              backgroundColor: '#f0eaff',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" stroke="#5945B0" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 21v-2a4 4 0 0 0-8 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
            </svg>
          </div>
          <div style={{ fontWeight: 600, fontSize: '20px', color: '#1F2148' }}>{total.toLocaleString()}</div>
          <div style={{ fontSize: '13px', color: '#888' }}>Unique Visitor</div>
        </div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <Doughnut data={doughnutData} options={options} />
        </div>
      </div>
      {/* Dynamic Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '30px',
          marginTop: '15px',
          flexWrap: 'wrap',
        }}
      >
        {chartData.map((item, index) => {
          const percent = total ? ((item.value / total) * 100).toFixed(0) : 0;
          return (
            <div
              key={item.category}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <svg width="16" height="16">
                <circle cx="8" cy="8" r="8" fill={getColor(index)} />
              </svg>
              <span style={{ fontWeight: 500, color: '#444' }}>
                {item.category} {percent}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PieChart;
