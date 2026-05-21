/*
  Sample Data Dashboard
  - Generates deterministic mock dataset
  - Computes aggregates based on filters
  - Renders charts with Chart.js
*/

(() => {
  const $ = (id) => document.getElementById(id);

  // ---------- Sample dataset (deterministic) ----------
  const categories = ["Retail", "Wholesale", "Online", "Enterprise"]; 
  const seed = 1337;
  function mulberry32(a){
    return function(){
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(seed);

  function isoDate(d){
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  // Create daily records for last 120 days
  const DAY_MS = 24*60*60*1000;
  const today = new Date();
  today.setHours(0,0,0,0);
  const days = 120;
  const start = new Date(today.getTime() - (days-1)*DAY_MS);

  /** @type {Array<{date:string, category:string, revenue:number, orders:number, sessions:number}>} */
  const raw = [];

  for(let i=0;i<days;i++){
    const d = new Date(start.getTime() + i*DAY_MS);
    const date = isoDate(d);

    // baseline trend
    const t = i/(days-1);
    const seasonal = 1 + 0.08*Math.sin(2*Math.PI*t*1.7) + 0.05*Math.cos(2*Math.PI*t*0.6);

    for(const cat of categories){
      const catFactor =
        cat === "Retail" ? 1.00 :
        cat === "Wholesale" ? 0.72 :
        cat === "Online" ? 0.86 :
        1.12;

      const sessionsBase = 9000 * seasonal * catFactor * (0.95 + rand()*0.18);
      const conv = (cat === "Enterprise" ? 0.028 : cat === "Wholesale" ? 0.022 : 0.020) * (0.9 + rand()*0.25);
      const orders = Math.max(20, Math.round(sessionsBase * conv));
      const aovBase = cat === "Enterprise" ? 290 : cat === "Wholesale" ? 140 : cat === "Retail" ? 95 : 115;
      const aov = aovBase * (0.9 + rand()*0.28);
      const revenue = Math.round(orders * aov * (0.93 + rand()*0.12));

      raw.push({ date, category: cat, revenue, orders, sessions: Math.round(sessionsBase) });
    }
  }

  // ---------- UI + state ----------
  const startDateEl = $("startDate");
  const endDateEl = $("endDate");
  const categoryEl = $("category");
  const applyBtn = $("applyBtn");
  const rangeLabel = $("rangeLabel");

  // KPI elements
  const kpiRevenue = $("kpiRevenue");
  const kpiOrders = $("kpiOrders");
  const kpiAov = $("kpiAov");
  const kpiConv = $("kpiConv");

  const kpiRevenueDelta = $("kpiRevenueDelta");
  const kpiOrdersDelta = $("kpiOrdersDelta");
  const kpiAovDelta = $("kpiAovDelta");
  const kpiConvDelta = $("kpiConvDelta");

  // populate categories
  for(const c of categories){
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    categoryEl.appendChild(opt);
  }

  // defaults: last 30 days
  const minDate = isoDate(start);
  const maxDate = isoDate(today);

  const defaultStart = new Date(today.getTime() - 29*DAY_MS);
  const defaultStartIso = isoDate(defaultStart);

  startDateEl.min = minDate;
  startDateEl.max = maxDate;
  endDateEl.min = minDate;
  endDateEl.max = maxDate;

  startDateEl.value = defaultStartIso;
  endDateEl.value = maxDate;

  // ---------- Helpers for aggregation ----------
  function parseIsoDate(s){
    const [y,m,d] = s.split("-").map(Number);
    return new Date(y, m-1, d);
  }

  function formatMoney(n){
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  function formatNumber(n){
    return n.toLocaleString();
  }
  function formatPct(n){
    return `${(n*100).toFixed(2)}%`;
  }

  function filterData(){
    const startD = parseIsoDate(startDateEl.value);
    const endD = parseIsoDate(endDateEl.value);
    const cat = categoryEl.value;

    const startT = startD.getTime();
    const endT = endD.getTime();

    return raw.filter(r => {
      const t = parseIsoDate(r.date).getTime();
      if(t < startT || t > endT) return false;
      if(cat !== "all" && r.category !== cat) return false;
      return true;
    });
  }

  function compareWithPreviousWindow(current){
    // compute previous window with same length
    const startD = parseIsoDate(startDateEl.value);
    const endD = parseIsoDate(endDateEl.value);
    const lenDays = Math.round((endD.getTime()-startD.getTime())/DAY_MS) + 1;

    const prevEnd = new Date(startD.getTime() - DAY_MS);
    const prevStart = new Date(prevEnd.getTime() - (lenDays-1)*DAY_MS);

    const cat = categoryEl.value;

    const prevStartT = prevStart.getTime();
    const prevEndT = prevEnd.getTime();

    const prev = raw.filter(r => {
      const t = parseIsoDate(r.date).getTime();
      if(t < prevStartT || t > prevEndT) return false;
      if(cat !== "all" && r.category !== cat) return false;
      return true;
    });

    return { prev, current };
  }

  function summarize(data){
    const revenue = data.reduce((s,r)=>s+r.revenue,0);
    const orders = data.reduce((s,r)=>s+r.orders,0);
    const sessions = data.reduce((s,r)=>s+r.sessions,0);
    const aov = orders ? revenue/orders : 0;
    const conv = sessions ? orders/sessions : 0;
    return { revenue, orders, sessions, aov, conv };
  }

  // ---------- Charts ----------
  const palette = {
    blue: "#60a5fa",
    green: "#34d399",
    amber: "#fbbf24",
    red: "#f87171",
    slate: "#94a3b8",
  };

  let lineChart, pieChart, barChart, hbarChart;

  function destroyAll(){
    for(const c of [lineChart, pieChart, barChart, hbarChart]){
      if(c){ c.destroy(); }
    }
    lineChart = pieChart = barChart = hbarChart = null;
  }

  function updateCharts(){
    const data = filterData();
    const { prev } = compareWithPreviousWindow(data);

    const curr = summarize(data);
    const prevS = summarize(prev);

    // KPI + deltas
    kpiRevenue.textContent = formatMoney(curr.revenue);
    kpiOrders.textContent = formatNumber(curr.orders);
    kpiAov.textContent = formatMoney(curr.aov);
    kpiConv.textContent = formatPct(curr.conv);

    const delta = (a,b) => {
      if(b === 0) return null;
      return (a-b)/b;
    };
    const dRev = delta(curr.revenue, prevS.revenue);
    const dOrd = delta(curr.orders, prevS.orders);
    const dAov = delta(curr.aov, prevS.aov);
    const dConv = delta(curr.conv, prevS.conv);

    const fmtDelta = (x) => x===null ? "—" : `${x>=0?"▲":"▼"} ${(Math.abs(x)*100).toFixed(2)}% vs prev`;

    kpiRevenueDelta.textContent = fmtDelta(dRev);
    kpiOrdersDelta.textContent = fmtDelta(dOrd);
    kpiAovDelta.textContent = fmtDelta(dAov);
    kpiConvDelta.textContent = fmtDelta(dConv);

    // Range label
    rangeLabel.textContent = `Showing ${data.length} records from ${startDateEl.value} to ${endDateEl.value} · Category: ${categoryEl.value}`;

    // Build line (daily revenue total)
    const daysMap = new Map();
    for(const r of data){
      daysMap.set(r.date, (daysMap.get(r.date) || 0) + r.revenue);
    }

    const lineLabels = Array.from(daysMap.keys()).sort();
    const lineValues = lineLabels.map(d => daysMap.get(d));

    // Pie (share of revenue by category)
    const byCatRevenue = new Map(categories.map(c=>[c,0]));
    for(const r of data){
      byCatRevenue.set(r.category, byCatRevenue.get(r.category)+r.revenue);
    }

    const pieLabels = categories.slice();
    const pieValues = pieLabels.map(c=>byCatRevenue.get(c));

    // Bar (orders by category)
    const byCatOrders = new Map(categories.map(c=>[c,0]));
    for(const r of data){
      byCatOrders.set(r.category, byCatOrders.get(r.category)+r.orders);
    }

    const barValues = pieLabels.map(c=>byCatOrders.get(c));

    // Horizontal bars-ish: revenue by category
    const hbarValues = pieLabels.map(c=>byCatRevenue.get(c));

    destroyAll();

    const gridColor = "rgba(148,163,184,.25)";
    const tickColor = "rgba(229,231,235,.85)";

    // Line chart
    lineChart = new Chart($("lineChart"), {
      type: "line",
      data: {
        labels: lineLabels,
        datasets: [{
          label: "Revenue",
          data: lineValues,
          borderColor: palette.blue,
          backgroundColor: "rgba(96,165,250,.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatMoney(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { color: "rgba(148,163,184,.12)" } },
          y: { ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });

    // Pie
    const pieColors = [palette.blue, palette.green, palette.amber, palette.red];
    pieChart = new Chart($("pieChart"), {
      type: "pie",
      data: {
        labels: pieLabels,
        datasets: [{
          data: pieValues,
          backgroundColor: pieColors,
          borderColor: "rgba(255,255,255,.15)",
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = pieValues.reduce((a,b)=>a+b,0) || 1;
                const v = ctx.parsed;
                const pct = (v / total);
                return ` ${formatMoney(v)} (${(pct*100).toFixed(1)}%)`;
              }
            }
          }
        }
      }
    });

    // Bar (orders)
    barChart = new Chart($("barChart"), {
      type: "bar",
      data: {
        labels: pieLabels,
        datasets: [{
          label: "Orders",
          data: barValues,
          backgroundColor: [palette.blue, palette.green, palette.amber, palette.red],
          borderColor: "rgba(255,255,255,.10)",
          borderWidth: 1,
          borderRadius: 10
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor } },
          tooltip: {
            callbacks: { label: (ctx)=> ` ${formatNumber(ctx.parsed.y)} orders` }
          }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { display:false } },
          y: { ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true }
        }
      }
    });

    // "Stacked-like" using horizontal bars? Use bar with multiple datasets for visual depth.
    // We'll split revenue into (orders*0.6, orders*0.4) proxy purely for aesthetics.
    const revenueTotal = hbarValues;
    const first = revenueTotal.map(v => v*0.6);
    const second = revenueTotal.map(v => v*0.4);

    hbarChart = new Chart($("hbarChart"), {
      type: "bar",
      data: {
        labels: pieLabels,
        datasets: [
          { label: "Core revenue", data: first, backgroundColor: "rgba(96,165,250,.75)", borderRadius: 10, stack: "rev" },
          { label: "Add-ons", data: second, backgroundColor: "rgba(52,211,153,.65)", borderRadius: 10, stack: "rev" }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: tickColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatMoney(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: { ticks: { color: tickColor }, grid: { display:false } },
          y: { ticks: { color: tickColor }, grid: { color: gridColor }, beginAtZero: true, stacked: true }
        }
      }
    });
  }

  // ---------- Interactivity ----------
  applyBtn.addEventListener("click", updateCharts);
  categoryEl.addEventListener("change", updateCharts);

  // auto apply when dates change
  startDateEl.addEventListener("change", () => {
    // clamp end date
    if(endDateEl.value && endDateEl.value < startDateEl.value) endDateEl.value = startDateEl.value;
    updateCharts();
  });
  endDateEl.addEventListener("change", () => {
    if(startDateEl.value && startDateEl.value > endDateEl.value) startDateEl.value = endDateEl.value;
    updateCharts();
  });

  // initial render
  updateCharts();
})();

