import { Chart, DoughnutController, ArcElement, Tooltip } from 'chart.js';

// Chart.js is driven imperatively here (not via react-chartjs-2): this
// component renders inside the block editor's React (wp.element), and
// react-chartjs-2 would pull in the bundle's own React copy for its hooks.
Chart.register(DoughnutController, ArcElement, Tooltip);

const { useLayoutEffect, useRef, useState, useEffect } = wp.element;

const COLORS = ["#5B4E96", "#8C73FA", "#C4B5E8"];

// HTML tooltip rendered next to the canvas so it can overflow the 70px chart
// (a canvas-drawn tooltip would be clipped to the canvas bounds).
const externalTooltip = (context) => {
  const { chart, tooltip } = context;
  const parent = chart.canvas.parentNode;
  let el = parent.querySelector('.ep-mini-pie-tooltip');

  if (!el) {
    el = document.createElement('div');
    el.className = 'ep-mini-pie-tooltip';
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      background: '#fff',
      color: '#333',
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
      padding: '4px 6px',
      fontSize: '10px',
      fontWeight: '400',
      lineHeight: '1.2',
      zIndex: '20',
      transform: 'translate(-50%, -50%)',
      transition: 'opacity 0.1s ease',
    });
    parent.appendChild(el);
  }

  if (tooltip.opacity === 0) {
    el.style.opacity = '0';
    return;
  }

  el.textContent = (tooltip.body || []).map(b => b.lines.join(' ')).join(' ');
  el.style.left = `${tooltip.caretX}px`;
  el.style.top = `${tooltip.caretY}px`;
  el.style.opacity = '1';
};

const MiniPieChart = ({ size = 70 }) => {
  const canvasRef = useRef(null);
  const [chartData, setChartData] = useState([]);
  const [totalEmbeds, setTotalEmbeds] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch overview analytics data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch overview data
        const epRest = ((embedpressGutenbergData && embedpressGutenbergData.restUrl) || ((window.wpApiSettings && window.wpApiSettings.root) ? window.wpApiSettings.root + 'embedpress/v1/' : '/wp-json/embedpress/v1/'));
        const overviewResponse = await fetch(epRest + 'analytics/overview?date_range=30', {
          headers: {
            'X-WP-Nonce': embedpressGutenbergData.nonce || wpApiSettings.nonce
          }
        });
        const overviewResult = await overviewResponse.json();

        // Process overview data - views, clicks, impressions
        // Handle both direct response and nested overview structure
        const overview = overviewResult.overview || overviewResult;

        if (overview) {
          const data = [
            { category: 'Views', value: parseInt(overview.total_views) || 0 },
            { category: 'Clicks', value: parseInt(overview.total_clicks) || 0 },
            { category: 'Impr', value: parseInt(overview.total_impressions) || 0 }
          ];
          setChartData(data);
          setTotalEmbeds(parseInt(overview.total_embeds) || 0);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching analytics data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useLayoutEffect(() => {
    // Don't render chart if still loading or no data
    if (loading || !canvasRef.current) {
      return;
    }

    // Use real analytics data or fallback to sample data
    let data = chartData.length > 0 ? chartData : [
      { category: 'Views', value: 1 },
      { category: 'Clicks', value: 1 },
      { category: 'Impr', value: 1 }
    ];

    // If all values are 0, show minimal sample data for visualization
    const hasData = data.some(item => item.value > 0);
    if (!hasData) {
      data = [
        { category: 'Views', value: 1 },
        { category: 'Clicks', value: 1 },
        { category: 'Impr', value: 1 }
      ];
    }

    const chart = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: data.map(item => item.category),
        datasets: [{
          data: data.map(item => item.value),
          backgroundColor: COLORS,
          hoverBackgroundColor: COLORS,
          borderColor: '#fff',
          borderWidth: 1,
          borderRadius: 4,
          hoverOffset: 0,
          hoverBorderColor: '#fff',
        }],
      },
      options: {
        responsive: false,
        maintainAspectRatio: false,
        animation: false,
        cutout: '75%',
        radius: '100%',
        layout: { padding: 0 },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: externalTooltip,
            callbacks: {
              title: () => '',
              label: (ctx) => `${ctx.label}: ${ctx.parsed}`,
            },
          },
        },
      },
    });

    // Cleanup
    return () => chart.destroy();
  }, [loading, chartData, totalEmbeds]);

  if (loading) {
    return (
      <div style={{ width: `${size}px`, height: `${size}px`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: '10px', color: '#999' }}>Loading...</span>
      </div>
    );
  }

  // Show 1 instead of 0 to avoid blank display
  const displayEmbeds = totalEmbeds || 1;

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        overflow: 'visible',
        position: 'relative',
        zIndex: 10
      }}
    >
      <canvas ref={canvasRef} width={size} height={size} style={{ width: `${size}px`, height: `${size}px`, display: 'block' }} />
      {/* Total embeds in the center */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          pointerEvents: 'none',
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 700, color: '#092161' }}>{displayEmbeds.toLocaleString()}</span>
        <span style={{ fontSize: '7px', fontWeight: 400, color: '#666' }}>Total Embeds</span>
      </div>
    </div>
  );
};

export default MiniPieChart;

