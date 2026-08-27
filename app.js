const state = {
  data: null,
  valueData: null,
  trendPeriod: "day",
  trendOffset: 0,
  industryPeriod: 1,
  etfPeriod: 1,
  selectedSeries: new Set(),
  selectedIndexes: new Set(),
  selectedFunds: new Set(),
  selectedBoards: new Set(),
  selectedFutures: new Set(),
  selectedValues: new Set(),
  selectedCross: new Set(),
  indexFutureFamily: "IM",
  indexFuturesRealtime: null,
  indexFuturesError: null,
  fundGroup: "a_share_industry",
  boardGroup: "theme",
  futureGroup: "domestic",
  marketView: "overview",
  valueFilter: "all",
  comparisonViews: {
    indexes: { range: 60, mode: "normalized", offset: 0 },
    funds: { range: 60, mode: "normalized", offset: 0 },
    futures: { range: 60, mode: "normalized", offset: 0 },
    ratio: { range: 750, mode: "actual", offset: 0 },
    cross: { range: 60, mode: "normalized", offset: 0, alignCommonDates: true },
    values: { range: 60, mode: "normalized", offset: 0 },
    boards: { range: 60, mode: "normalized", offset: 0 }
  },
  page: "market"
};

const seriesColors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];
const comparisonColors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
const comparisonRangeLabels = { 5: "近一周", 20: "近一月", 60: "近一季", 120: "近半年", 250: "近一年", 750: "近三年" };
const dashboardConfig = window.MARKET_DASHBOARD_CONFIG || {};
const snapshotCacheKey = "market-dashboard-latest-snapshot-v1";
const trendPeriods = {
  day: { label: "近一日", window: 1 },
  week: { label: "近一周", window: 5 },
  month: { label: "近一月", window: 20 },
  quarter: { label: "近一季", window: 60 },
  halfyear: { label: "近半年", window: 120 },
  year: { label: "近一年", window: 250 }
};
const number = new Intl.NumberFormat("zh-CN");
const decimal = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const themeStorageKey = "market-dashboard-theme";
const initializedSelections = new WeakSet();
const clearedSelections = new WeakSet();

function applyTheme(theme, persist = false) {
  const resolved = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = resolved;
  document.querySelector('meta[name="theme-color"]').content = resolved === "dark" ? "#0d1412" : "#f2efe7";
  document.querySelectorAll("[data-theme-option]").forEach(button => {
    const active = button.dataset.themeOption === resolved;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (persist) {
    try {
      localStorage.setItem(themeStorageKey, resolved);
    } catch (_) {}
  }
}

applyTheme(document.documentElement.dataset.theme);
document.querySelectorAll("[data-theme-option]").forEach(button => {
  button.addEventListener("click", () => applyTheme(button.dataset.themeOption, true));
});

function percent(value) {
  if (value === null || value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${decimal.format(value)}%`;
}

function changeClass(value) {
  if (value > 0) return "change-up";
  if (value < 0) return "change-down";
  return "";
}

function setChange(id, value) {
  const element = document.getElementById(id);
  element.textContent = percent(value);
  element.className = changeClass(value);
}

function formatTrillion(value) {
  return `${decimal.format(value / 1e12)} 万亿`;
}

function formatActive(value) {
  return `${decimal.format(value / 10000)} 万亿`;
}

function formatAmount(value) {
  return `${decimal.format(value / 1e8)} 亿`;
}

function formatSignedAmount(value) {
  if (value === null || value === undefined) return "--";
  return `${value > 0 ? "+" : ""}${decimal.format(value / 1e8)}亿`;
}

function svgNode(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}


function bindHorizontalDrag(target, onMove) {
  let startX = null;
  let pointerId = null;
  target.addEventListener("pointerdown", event => {
    // 触摸手势用于逐日查看数值；鼠标拖动仍用于平移历史窗口。
    if (event.pointerType === "touch") return;
    startX = event.clientX;
    pointerId = event.pointerId;
    target.setPointerCapture?.(pointerId);
    target.classList.add("dragging");
  });
  target.addEventListener("pointerup", event => {
    if (event.pointerType === "touch") return;
    if (startX !== null) {
      const distance = event.clientX - startX;
      if (Math.abs(distance) >= 24) onMove(distance);
    }
    startX = null;
    pointerId = null;
    target.classList.remove("dragging");
  });
  target.addEventListener("pointercancel", () => {
    startX = null;
    pointerId = null;
    target.classList.remove("dragging");
  });
}


function renderEtfs() {
  const items = state.data.etf_proxies.items;
  const key = `change_${state.etfPeriod}d_pct`;
  const broad = items.filter(item => item.group === "broad");
  const industry = items.filter(item => item.group === "industry").sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
  const maximum = Math.max(1, ...industry.map(item => Math.abs(item[key] || 0)));

  document.getElementById("broad-etf-grid").innerHTML = broad.map(item => `
    <article class="benchmark-card">
      <header><h3>${item.name}</h3><code>${item.code}</code></header>
      <strong class="${changeClass(item[key])}">${percent(item[key])}</strong>
      <div class="benchmark-meta"><span>收盘 ${decimal.format(item.close)}</span><span>成交 ${formatAmount(item.amount)}</span></div>
    </article>`).join("");

  document.getElementById("industry-etf-grid").innerHTML = industry.map(item => {
    const heat = 8 + Math.min(22, Math.abs(item[key] || 0) / maximum * 22);
    const direction = item[key] >= 0 ? "positive" : "negative";
    return `<article class="sector-tile ${direction}" style="--heat:${heat.toFixed(1)}%">
      <header><h3>${item.name}</h3><code>${item.code}</code></header>
      <strong class="${changeClass(item[key])}">${percent(item[key])}</strong>
      <div class="sector-meta"><span>成交 ${formatAmount(item.amount)}</span><span>5日相对300 ${percent(item.relative_to_csi300_5d_pct)}</span></div>
    </article>`;
  }).join("");

  const leaders = industry.slice(0, 2).map(item => item.name).join("、");
  const laggards = industry.slice(-2).reverse().map(item => item.name).join("、");
  document.getElementById("sector-leaders").textContent = `${state.etfPeriod}日相对强势：${leaders} · 相对弱势：${laggards}`;
}

function unpackPoints(item) {
  return (item.points || []).map(point => Array.isArray(point)
    ? { date: point[0], value: Number(point[1]) }
    : { date: point.date, value: Number(point.value ?? point.close) }
  ).filter(point => point.date && Number.isFinite(point.value));
}

function availableSeriesIds(items) {
  return items
    .filter(item => item.status !== "unavailable" && unpackPoints(item).length > 1)
    .map(item => item.id);
}

function ensureSelection(selection, items) {
  const availableIds = new Set(availableSeriesIds(items));
  [...selection].forEach(id => { if (!availableIds.has(id)) selection.delete(id); });
  if (!selection.size && (!initializedSelections.has(selection) || !clearedSelections.has(selection))) {
    const first = availableIds.values().next().value;
    if (first) selection.add(first);
  }
  initializedSelections.add(selection);
}

function renderSelectionControls(key, items, selection, rerender) {
  const controls = document.querySelector(`[data-selection-controls="${key}"]`);
  if (!controls) return;
  const availableIds = availableSeriesIds(items);
  const selectAll = controls.querySelector('[data-selection-action="all"]');
  const clearAll = controls.querySelector('[data-selection-action="none"]');
  selectAll.disabled = !availableIds.length || availableIds.every(id => selection.has(id));
  clearAll.disabled = selection.size === 0;
  selectAll.onclick = () => {
    availableIds.forEach(id => selection.add(id));
    clearedSelections.delete(selection);
    rerender();
  };
  clearAll.onclick = () => {
    selection.clear();
    clearedSelections.add(selection);
    rerender();
  };
}

function renderSeriesSelector(containerId, key, items, selection, rerender) {
  const container = document.getElementById(containerId);
  container.innerHTML = items.map(item => {
    const active = selection.has(item.id);
    const disabled = item.status === "unavailable" || unpackPoints(item).length < 2;
    return `<button type="button" data-universe-id="${item.id}" aria-pressed="${active}" ${disabled ? "disabled" : ""}>
      <span>${item.name}</span><small>${item.code || ""}</small>
    </button>`;
  }).join("");
  container.querySelectorAll("[data-universe-id]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.universeId;
      if (selection.has(id)) {
        selection.delete(id);
        if (!selection.size) clearedSelections.add(selection);
      } else {
        selection.add(id);
        clearedSelections.delete(selection);
      }
      rerender();
    });
  });
  renderSelectionControls(key, items, selection, rerender);
}

function comparisonColor(index) {
  if (index < comparisonColors.length) return comparisonColors[index];
  return `hsl(${Math.round(index * 137.508) % 360} 56% 42%)`;
}

function formatChartNumber(value) {
  const absolute = Math.abs(value);
  const digits = absolute >= 1000 ? 0 : absolute >= 100 ? 1 : absolute >= 1 ? 2 : 4;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function formatActualChartValue(item, value) {
  const unit = item.unit && item.unit !== "price" ? ` ${item.unit}` : "";
  return `${formatChartNumber(value)}${unit}`;
}

function dailyChangePct(points, index) {
  if (index <= 0) return null;
  const current = Number(points[index]?.value);
  if (!Number.isFinite(current)) return null;
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = Number(points[previousIndex]?.value);
    if (Number.isFinite(previous) && previous !== 0) return (current / previous - 1) * 100;
  }
  return null;
}

function tooltipChange(value) {
  return `<small class="tooltip-change ${changeClass(value)}">较前收盘 ${percent(value)}</small>`;
}

function ensureComparisonTooltip(svg) {
  const wrapper = svg.parentElement;
  let tooltip = wrapper.querySelector(".comparison-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.className = "chart-tooltip comparison-tooltip";
    tooltip.hidden = true;
    wrapper.appendChild(tooltip);
  }
  tooltip.hidden = true;
  return tooltip;
}

function renderComparisonControls(key, selection) {
  const settings = state.comparisonViews[key];
  if (selection.size !== 1 && settings.mode === "actual") settings.mode = "normalized";
  document.querySelectorAll(`[data-comparison-key="${key}"][data-comparison-range]`).forEach(button => {
    const active = Number(button.dataset.comparisonRange) === settings.range;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  document.querySelectorAll(`[data-comparison-key="${key}"][data-comparison-mode]`).forEach(button => {
    const active = button.dataset.comparisonMode === settings.mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    if (button.dataset.comparisonMode === "actual") {
      button.disabled = selection.size !== 1;
      button.title = selection.size === 1
        ? "显示真实纵轴数值；只改变数值尺度，不改变走势形状"
        : "仅选择一条序列时可用";
    } else {
      button.title = "将所选周期起点换算为 100；只改变数值尺度，不改变走势形状";
    }
  });
  const modeLabel = settings.mode === "actual" ? "实际值" : "起点归一化 100";
  document.getElementById(`${key}-comparison-note`).textContent = `${selection.size} 条 · ${comparisonRangeLabels[settings.range]} · ${modeLabel}`;
  return settings;
}

function renderComparisonPanControls(svg, key, settings, total, windowSize) {
  const wrapper = svg.parentElement;
  let controls = wrapper.querySelector(".comparison-pan-controls");
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "comparison-pan-controls";
    controls.innerHTML = `
      <button type="button" data-pan-direction="older" aria-label="查看更早一段数据">←<span>较早</span></button>
      <button type="button" data-pan-direction="newer" aria-label="查看更新一段数据"><span>较新</span>→</button>`;
    wrapper.appendChild(controls);
  }

  const maximumOffset = Math.max(0, total - windowSize);
  const step = Math.max(1, windowSize);
  const older = controls.querySelector('[data-pan-direction="older"]');
  const newer = controls.querySelector('[data-pan-direction="newer"]');
  older.disabled = settings.offset >= maximumOffset;
  newer.disabled = settings.offset <= 0;
  older.onclick = () => {
    settings.offset = Math.min(maximumOffset, settings.offset + step);
    rerenderComparison(key);
  };
  newer.onclick = () => {
    settings.offset = Math.max(0, settings.offset - step);
    rerenderComparison(key);
  };
}

function renderComparisonChart(key, svgId, legendId, items, selection, settings) {
  const svg = document.getElementById(svgId);
  const tooltip = ensureComparisonTooltip(svg);
  svg.innerHTML = "";
  const selectedItems = items.filter(item => selection.has(item.id));
  const actualMode = settings.mode === "actual" && selectedItems.length === 1;
  const sourcePointSets = selectedItems.map(item => unpackPoints(item));
  let displayPointSets = sourcePointSets;
  if (settings.alignCommonDates && sourcePointSets.length > 1) {
    const commonDates = sourcePointSets
      .slice(1)
      .reduce(
        (dates, points) => {
          const availableDates = new Set(points.map(point => point.date));
          return new Set([...dates].filter(date => availableDates.has(date)));
        },
        new Set(sourcePointSets[0].map(point => point.date))
      );
    displayPointSets = sourcePointSets.map(points => points.filter(point => commonDates.has(point.date)));
  }
  const total = displayPointSets.length
    ? Math.min(...displayPointSets.map(points => points.length))
    : 0;
  const windowSize = Math.min(settings.range, total);
  settings.offset = Math.min(settings.offset, Math.max(0, total - windowSize));
  renderComparisonPanControls(svg, key, settings, total, windowSize);
  const chosen = selectedItems.map((item, index) => {
    const allPoints = displayPointSets[index];
    const sourcePoints = sourcePointSets[index];
    const sourceIndexes = new Map(sourcePoints.map((point, pointIndex) => [point.date, pointIndex]));
    const endIndex = allPoints.length - settings.offset;
    const startIndex = Math.max(0, endIndex - windowSize);
    const points = allPoints.slice(startIndex, endIndex).map(point => ({
      ...point,
      change_1d_pct: dailyChangePct(sourcePoints, sourceIndexes.get(point.date))
    }));
    const base = points[0]?.value;
    return {
      ...item,
      color: comparisonColor(index),
      points: actualMode
        ? points.map(point => ({ ...point, plotted: point.value }))
        : base ? points.map(point => ({ ...point, plotted: point.value / base * 100 })) : []
    };
  }).filter(item => item.points.length > 1);

  const legend = document.getElementById(legendId);
  if (!chosen.length) {
    svg.innerHTML = '<text x="450" y="170" text-anchor="middle" class="chart-axis">请选择至少一条可用序列</text>';
    legend.innerHTML = "";
    return;
  }

  const width = 900;
  const height = Number(svg.getAttribute("viewBox").split(" ")[3]) || 340;
  const margin = { top: 24, right: 24, bottom: 34, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const allPoints = chosen.flatMap(item => item.points);
  const sharedDates = [...new Set(allPoints.map(point => point.date))].sort();
  const dateIndexes = new Map(sharedDates.map((date, index) => [date, index]));
  const rawMin = Math.min(...allPoints.map(point => point.plotted));
  const rawMax = Math.max(...allPoints.map(point => point.plotted));
  const pad = actualMode
    ? Math.max(0.0001, (rawMax - rawMin) * 0.1, Math.abs(rawMax) * 0.01)
    : Math.max(1, (rawMax - rawMin) * 0.1);
  const min = actualMode ? rawMin - pad : Math.floor((rawMin - pad) / 2) * 2;
  const max = actualMode ? rawMax + pad : Math.ceil((rawMax + pad) / 2) * 2;
  const x = date => margin.left + dateIndexes.get(date) / Math.max(1, sharedDates.length - 1) * plotWidth;
  const y = value => margin.top + (max - value) / Math.max(1, max - min) * plotHeight;

  const modeLabel = svgNode("text", { class: "chart-axis chart-mode-label", x: margin.left, y: 15 });
  const actualUnit = chosen[0].unit && chosen[0].unit !== "price" ? `（${chosen[0].unit}）` : "";
  modeLabel.textContent = actualMode ? `纵轴：实际值${actualUnit}` : "纵轴：归一化（起点 = 100）";
  svg.appendChild(modeLabel);

  for (let index = 0; index <= 5; index += 1) {
    const tick = min + (max - min) * index / 5;
    svg.appendChild(svgNode("line", { class: "chart-grid", x1: margin.left, x2: width - margin.right, y1: y(tick), y2: y(tick) }));
    const label = svgNode("text", { class: "chart-axis", x: margin.left - 9, y: y(tick) + 4, "text-anchor": "end" });
    label.textContent = actualMode ? formatChartNumber(tick) : tick.toFixed(0);
    svg.appendChild(label);
  }
  if (!actualMode) {
    const baseLine = svgNode("line", { class: "comparison-baseline", x1: margin.left, x2: width - margin.right, y1: y(100), y2: y(100) });
    svg.appendChild(baseLine);
  }

  chosen.forEach(item => {
    const points = item.points.map(point => `${x(point.date)},${y(point.plotted)}`).join(" ");
    svg.appendChild(svgNode("polyline", { class: "chart-line comparison-line", points, stroke: item.color }));
    const latest = item.points.at(-1);
    svg.appendChild(svgNode("circle", { class: "chart-focus", cx: x(latest.date), cy: y(latest.plotted), r: 4, fill: item.color }));
  });

  const dateValues = [sharedDates[0], sharedDates[Math.floor((sharedDates.length - 1) / 2)], sharedDates.at(-1)];
  dateValues.forEach((dateLabel, index) => {
    const label = svgNode("text", { class: "chart-axis", x: x(dateLabel), y: height - 8, "text-anchor": index === 0 ? "start" : index === 2 ? "end" : "middle" });
    label.textContent = settings.range > 250 ? dateLabel.slice(0, 7) : dateLabel.slice(5, 10);
    svg.appendChild(label);
  });

  const pointsByDate = chosen.map(item => new Map(item.points.map(point => [point.date, point])));
  const crosshair = svgNode("line", {
    class: "comparison-crosshair",
    y1: margin.top,
    y2: height - margin.bottom
  });
  const hoverPoints = chosen.map(item => svgNode("circle", {
    class: "comparison-hover-point",
    r: 4.5,
    fill: item.color
  }));
  const hoverLayer = svgNode("g", { class: "comparison-hover-layer", hidden: "" });
  hoverLayer.append(crosshair, ...hoverPoints);
  svg.appendChild(hoverLayer);

  let touchPointerId = null;
  let tooltipPinned = false;
  const showHover = event => {
    const box = svg.getBoundingClientRect();
    const localX = (event.clientX - box.left) * width / box.width;
    const hoverIndex = Math.max(0, Math.min(
      sharedDates.length - 1,
      Math.round((localX - margin.left) / plotWidth * (sharedDates.length - 1))
    ));
    const hoverDate = sharedDates[hoverIndex];
    const hoverX = x(hoverDate);
    crosshair.setAttribute("x1", hoverX);
    crosshair.setAttribute("x2", hoverX);
    hoverPoints.forEach((circle, index) => {
      const point = pointsByDate[index].get(hoverDate);
      circle.toggleAttribute("hidden", !point);
      if (point) {
        circle.setAttribute("cx", hoverX);
        circle.setAttribute("cy", y(point.plotted));
      }
    });
    hoverLayer.removeAttribute("hidden");
    tooltip.innerHTML = `<strong>${hoverDate}<small>${actualMode ? "实际值 / 较前收盘" : "实际值 / 归一化 / 较前收盘"}</small></strong>${chosen.map((item, index) => {
      const point = pointsByDate[index].get(hoverDate);
      const values = point
        ? actualMode
          ? formatActualChartValue(item, point.value)
          : `${formatActualChartValue(item, point.value)} <small>/ ${decimal.format(point.plotted)}</small>`
        : "--";
      return `<span><i><em style="--tooltip-color:${item.color}"></em>${item.name}</i><b>${values}${point ? tooltipChange(point.change_1d_pct) : ""}</b></span>`;
    }).join("")}`;
    tooltip.hidden = false;
    const renderedWidth = box.width;
    const pointerX = event.clientX - box.left;
    const tooltipWidth = Math.min(230, renderedWidth - 12);
    const preferredLeft = pointerX + 14;
    tooltip.style.width = `${tooltipWidth}px`;
    const tooltipLeft = preferredLeft + tooltipWidth > renderedWidth ? pointerX - tooltipWidth - 14 : preferredLeft;
    const tooltipTop = Math.min(box.height - tooltip.offsetHeight - 4, event.clientY - box.top - 32);
    tooltip.style.left = `${Math.max(4, tooltipLeft)}px`;
    tooltip.style.top = `${Math.max(4, tooltipTop)}px`;
  };
  const hideHover = () => {
    tooltipPinned = false;
    touchPointerId = null;
    hoverLayer.setAttribute("hidden", "");
    tooltip.hidden = true;
  };
  const hoverTarget = svgNode("rect", {
    class: "chart-hover",
    x: margin.left,
    y: margin.top,
    width: plotWidth,
    height: plotHeight
  });
  hoverTarget.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch") {
      touchPointerId = event.pointerId;
      tooltipPinned = true;
      hoverTarget.setPointerCapture?.(event.pointerId);
    }
    showHover(event);
  });
  hoverTarget.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" && touchPointerId !== event.pointerId) return;
    showHover(event);
  });
  hoverTarget.addEventListener("pointerup", event => {
    if (event.pointerType !== "touch") return;
    hoverTarget.releasePointerCapture?.(event.pointerId);
    touchPointerId = null;
  });
  hoverTarget.addEventListener("pointercancel", event => {
    if (event.pointerType === "touch") touchPointerId = null;
  });
  hoverTarget.addEventListener("pointerleave", event => {
    if (event.pointerType !== "touch" && !tooltipPinned) hideHover();
  });
  svg._comparisonDismissController?.abort();
  const dismissController = new AbortController();
  svg._comparisonDismissController = dismissController;
  document.addEventListener("pointerdown", event => {
    if (tooltipPinned && !svg.contains(event.target)) hideHover();
  }, { signal: dismissController.signal });
  bindHorizontalDrag(hoverTarget, distance => {
    const step = Math.max(1, Math.round(Math.abs(distance) / plotWidth * windowSize));
    settings.offset = Math.max(0, Math.min(total - windowSize, settings.offset + (distance > 0 ? step : -step)));
    hideHover();
    rerenderComparison(key);
  });
  svg.appendChild(hoverTarget);

  legend.innerHTML = chosen.map(item => {
    const latest = item.points.at(-1).plotted;
    const first = item.points[0].plotted;
    const rangeChange = first ? (latest / first - 1) * 100 : 0;
    const displayed = actualMode ? formatChartNumber(latest) : decimal.format(latest);
    return `<span><i style="--legend-color:${item.color}"></i><b>${item.name}</b><strong class="${changeClass(rangeChange)}">${displayed}</strong></span>`;
  }).join("");
  svg.setAttribute("aria-label", `${chosen.map(item => item.name).join("、")}${comparisonRangeLabels[settings.range]}${actualMode ? "实际值" : "归一化"}走势`);
}

function renderRankingRows(targetId, items, mode = "fund") {
  const rows = [...items].sort((a, b) => (b.change_20d_pct ?? -Infinity) - (a.change_20d_pct ?? -Infinity));
  document.getElementById(targetId).innerHTML = rows.map(item => mode === "future"
    ? `<tr>
      <td>${item.name}<small><code>${item.code}</code></small></td>
      <td>${item.latest === null ? "--" : decimal.format(item.latest)}</td>
      <td class="${changeClass(item.change_1d_pct)}">${percent(item.change_1d_pct)}</td>
      <td class="${changeClass(item.change_5d_pct)}">${percent(item.change_5d_pct)}</td>
      <td class="${changeClass(item.change_20d_pct)}">${percent(item.change_20d_pct)}</td>
    </tr>`
    : `<tr>
      <td>${item.name}</td><td><code>${item.code}</code></td>
      <td class="${changeClass(item.change_1d_pct)}">${percent(item.change_1d_pct)}</td>
      <td class="${changeClass(item.change_5d_pct)}">${percent(item.change_5d_pct)}</td>
      <td class="${changeClass(item.change_20d_pct)}">${percent(item.change_20d_pct)}</td>
      <td>${item.latest_date || "--"}</td>
    </tr>`).join("");
}

const boardIndexNames = new Set(["中证500", "科创板", "创业板", "上证50", "沪深300", "北证", "双创50", "标普", "恒生", "恒生科技", "可转债", "红利"]);
const boardTypeNames = new Set(["微盘股", "小微盘量化", "大科技", "量化", "现金流", "亚太", "蓝筹", "海外医药", "沪港深消费", "港股互联", "港股红利", "红利低波", "混债", "债基", "货币基金"]);

function boardGroupOf(item) {
  if (item.status === "unavailable" || boardTypeNames.has(item.name)) return "fundtype";
  if (boardIndexNames.has(item.name)) return "index";
  return "theme";
}

function themeConceptRanking() {
  const items = state.data.boards.items.filter(item => item.status === "ok" && boardGroupOf(item) === "theme");
  const pointSets = items.map(item => unpackPoints(item));
  const total = pointSets.length ? Math.min(...pointSets.map(points => points.length)) : 0;
  const windowSize = Math.min(state.comparisonViews.boards.range, total);
  if (windowSize < 2) return [];

  return items.map((item, index) => {
    const points = pointSets[index].slice(-windowSize);
    const base = points[0]?.value;
    const latest = points.at(-1)?.value;
    return {
      name: item.name,
      value: base && Number.isFinite(latest) ? latest / base * 100 : null
    };
  }).filter(item => Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value);
}

function openBoardRankingDialog() {
  if (!state.data) return;
  const rows = themeConceptRanking();
  const rangeLabel = comparisonRangeLabels[state.comparisonViews.boards.range];
  document.getElementById("board-ranking-period").textContent = `${rangeLabel} · 起点归一化为 100 · 数值越低越靠前`;
  document.getElementById("board-ranking-count").textContent = `${rows.length} 个`;
  document.getElementById("board-ranking-list").innerHTML = rows.map((item, index) => `
    <div class="board-ranking-row" role="listitem">
      <span>${String(index + 1).padStart(2, "0")}</span>
      <strong>${item.name}</strong>
      <b>${item.value.toFixed(2)}</b>
    </div>`).join("");
  const dialog = document.getElementById("board-ranking-dialog");
  if (!dialog.open) dialog.showModal();
}

function renderBoardsPage() {
  const items = state.data.boards.items;
  const groupItems = items.filter(item => boardGroupOf(item) === state.boardGroup);
  ensureSelection(state.selectedBoards, groupItems);
  document.getElementById("board-available-count").textContent = `${items.filter(i => i.status === "ok").length}/${items.length}`;
  document.getElementById("board-taxonomy-note").textContent = "同花顺板块指数 + 腾讯指数 + 新浪北证50 归一化比较（只读观察，不构成投资建议）。";
  renderSeriesSelector("board-selector", "boards", groupItems, state.selectedBoards, renderBoardsPage);
  const settings = renderComparisonControls("boards", state.selectedBoards);
  renderComparisonChart("boards", "board-comparison-chart", "board-comparison-legend", groupItems, state.selectedBoards, settings);
  renderRankingRows("board-ranking-rows", groupItems);
}

function renderFundPage() {
  const universe = state.data.comparison_universes.funds;
  const items = universe.items.filter(item => item.group === state.fundGroup);
  ensureSelection(state.selectedFunds, items);
  document.getElementById("fund-available-count").textContent = `${universe.available_count}/${universe.items.length}`;
  document.getElementById("fund-taxonomy-note").textContent = "数据来自腾讯公开行情接口。";
  renderSeriesSelector("fund-selector", "funds", items, state.selectedFunds, renderFundPage);
  const settings = renderComparisonControls("funds", state.selectedFunds);
  renderComparisonChart("funds", "fund-comparison-chart", "fund-comparison-legend", items, state.selectedFunds, settings);
  renderRankingRows("fund-ranking-rows", items);
}
function render(data) {
  state.data = data;
  renderEtfs();
  renderFundPage();
  renderBoardsPage();
  document.getElementById("coverage-note").textContent = `数据覆盖：${data.quality.readable_series}/${data.quality.named_series} 个市场序列 · ${data.comparison_universes.funds.items.length} 个基金 · ${data.etf_proxies.items.length} 只 ETF 代理 · ${data.boards.items.length} 个板块 · 数据源：腾讯公开行情`;
  document.title = `${data.as_of} 基金情况 · 大盘脉搏（复刻）`;
}

function setPage(page, navigation = "none") {
  state.page = page;
  const pages = {
    market: "market-page",
    funds: "funds-page",
    boards: "boards-page",
    futures: "futures-page",
    value: "value-page",
    observe: "observe-page",
    realtime: "realtime-page"
  };
  Object.entries(pages).forEach(([name, id]) => {
    const element = document.getElementById(id);
    if (element) element.hidden = page !== name;
  });
  document.getElementById("market-subtabs").hidden = page !== "market";
  document.querySelectorAll("[data-page]").forEach(button => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (page === "funds") {
    document.getElementById("session-date").textContent = `${state.data.as_of} 收盘`;
    document.getElementById("source-mode").textContent = "腾讯公开行情";
    document.title = `${state.data.as_of} 基金情况 · 大盘脉搏（复刻）`;
  } else {
    document.getElementById("session-date").textContent = `${state.data.as_of} 收盘`;
    document.getElementById("source-mode").textContent = "腾讯公开行情";
    document.title = `${state.data.as_of} 大盘脉搏（复刻）`;
  }
  if (navigation === "push") history.pushState({ page }, "", `#${page === "market" ? "" : page}`);
}

const comparisonRenderers = {
  funds: renderFundPage,
  boards: renderBoardsPage
};

function rerenderComparison(key) {
  if (state.data) comparisonRenderers[key]();
}

document.querySelectorAll("[data-comparison-range]").forEach(button => {
  button.addEventListener("click", () => {
    const key = button.dataset.comparisonKey;
    state.comparisonViews[key].range = Number(button.dataset.comparisonRange);
    state.comparisonViews[key].offset = 0;
    rerenderComparison(key);
  });
});

document.querySelectorAll("[data-comparison-mode]").forEach(button => {
  button.addEventListener("click", () => {
    const key = button.dataset.comparisonKey;
    state.comparisonViews[key].mode = button.dataset.comparisonMode;
    rerenderComparison(key);
  });
});

document.querySelectorAll("[data-etf-period]").forEach(button => {
  button.addEventListener("click", () => {
    state.etfPeriod = Number(button.dataset.etfPeriod);
    document.querySelectorAll("[data-etf-period]").forEach(peer => {
      const active = peer === button;
      peer.classList.toggle("active", active);
      peer.setAttribute("aria-pressed", String(active));
    });
    if (state.data) renderEtfs();
  });
});

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => setPage(button.dataset.page, "push"));
});

document.querySelectorAll("[data-fund-group]").forEach(button => {
  button.addEventListener("click", () => {
    state.fundGroup = button.dataset.fundGroup;
    state.selectedFunds.clear();
    initializedSelections.delete(state.selectedFunds);
    clearedSelections.delete(state.selectedFunds);
    document.querySelectorAll("[data-fund-group]").forEach(peer => {
      const active = peer === button;
      peer.classList.toggle("active", active);
      peer.setAttribute("aria-pressed", String(active));
    });
    renderFundPage();
  });
});

document.querySelectorAll("[data-board-group]").forEach(button => {
  button.addEventListener("click", () => {
    state.boardGroup = button.dataset.boardGroup;
    state.selectedBoards.clear();
    initializedSelections.delete(state.selectedBoards);
    clearedSelections.delete(state.selectedBoards);
    document.querySelectorAll("[data-board-group]").forEach(peer => {
      const active = peer === button;
      peer.classList.toggle("active", active);
      peer.setAttribute("aria-pressed", String(active));
    });
    renderBoardsPage();
  });
});

document.getElementById("open-board-ranking").addEventListener("click", openBoardRankingDialog);
document.getElementById("close-board-ranking").addEventListener("click", () => {
  document.getElementById("board-ranking-dialog").close();
});
document.getElementById("board-ranking-dialog").addEventListener("click", event => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

function pageFromHash() {
  if (location.hash === "#realtime") return "realtime";
  if (location.hash === "#value") return "value";
  if (location.hash === "#observe") return "observe";
  if (location.hash === "#boards") return "boards";
  if (location.hash === "#funds") return "funds";
  if (location.hash === "#futures") return "futures";
  return "market";
}

window.addEventListener("popstate", () => {
  setPage(pageFromHash(), "none");
});

function showSyncStatus(title, message, stateName = "error") {
  const status = document.getElementById("sync-status");
  document.getElementById("sync-status-title").textContent = title;
  document.getElementById("sync-status-message").textContent = message;
  status.dataset.state = stateName;
  status.hidden = false;
}

document.getElementById("dismiss-sync-status").addEventListener("click", () => {
  document.getElementById("sync-status").hidden = true;
});

function validateSnapshot(data) {
  if (!data?.boards?.items || !data?.comparison_universes?.funds?.items) {
    throw new Error("行情快照结构不完整");
  }
  return data;
}

function readCachedSnapshot() {
  try {
    const cached = localStorage.getItem(snapshotCacheKey);
    return cached ? validateSnapshot(JSON.parse(cached)) : null;
  } catch (_) {
    return null;
  }
}

function cacheSnapshot(data) {
  try {
    localStorage.setItem(snapshotCacheKey, JSON.stringify(data));
  } catch (_) {
    // 缓存空间不足不影响本次数据显示。
  }
}

async function fetchSnapshot(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Latest snapshot: HTTP ${response.status}`);
  return validateSnapshot(await response.json());
}

function applySnapshot(data) {
  render(data);
  setPage(pageFromHash(), "none");
}

async function initialize() {
  let activeSnapshot = readCachedSnapshot();
  if (activeSnapshot) {
    applySnapshot(activeSnapshot);
  } else {
    try {
      activeSnapshot = await fetchSnapshot("data/latest.json");
      cacheSnapshot(activeSnapshot);
      applySnapshot(activeSnapshot);
    } catch (_) {
      activeSnapshot = null;
    }
  }

  if (!dashboardConfig.remoteDataUrl) {
    if (!activeSnapshot) throw new Error("没有可用的本地行情快照");
    return;
  }

  try {
    const remoteSnapshot = await fetchSnapshot(`${dashboardConfig.remoteDataUrl}?t=${Date.now()}`);
    cacheSnapshot(remoteSnapshot);
    if (!activeSnapshot || remoteSnapshot.generated_at !== activeSnapshot.generated_at) {
      applySnapshot(remoteSnapshot);
    }
    document.getElementById("source-mode").textContent = "云端每日自动更新";
  } catch (error) {
    if (!activeSnapshot) throw error;
    document.getElementById("source-mode").textContent = "缓存数据 · 联网更新失败";
    showSyncStatus("联网更新失败", `当前显示 ${activeSnapshot.as_of || "上次成功更新"} 的缓存数据，请稍后重试。`);
    console.info("Remote dashboard snapshot unavailable; cached data is in use.");
  }
}

initialize().catch(error => {
  console.error("Dashboard data load failed", error);
  document.getElementById("load-error").hidden = false;
});
