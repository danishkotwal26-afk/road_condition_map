// ─── Tile Layer Definitions ──────────────────────────────────────────────────
const TILES = {
  street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }),
  satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: '© Esri'
  }),
  dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors, © CARTO'
  })
};

// ─── Map Init ────────────────────────────────────────────────────────────────
const map = L.map('map', { zoomControl: true });
TILES.street.addTo(map);

// ─── State ───────────────────────────────────────────────────────────────────
let allRoads        = [];
let activeFilter    = 'all';
let activeLayer     = 'street';
let roadLayer       = L.layerGroup().addTo(map);
let selectedLine    = null;
let firstLoad       = true;
const REFRESH_MS    = 30_000;

// ─── Draw Mode State ──────────────────────────────────────────────────────────
let drawMode        = false;
let drawCoords      = [];
let drawMarkers     = [];
let drawPolyline    = null;
let drawCondition   = 'good';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getColor(condition) {
  return { good: '#22c55e', medium: '#f59e0b', bad: '#ef4444' }[condition] ?? '#64748b';
}
function conditionLabel(condition) {
  return { good: 'Good', medium: 'Fair', bad: 'Bad' }[condition] ?? 'Unknown';
}
function segmentLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++)
    total += L.latLng(coords[i - 1]).distanceTo(L.latLng(coords[i]));
  return (total / 1000).toFixed(2);
}

// ─── Render Roads ─────────────────────────────────────────────────────────────
function renderRoads() {
  roadLayer.clearLayers();
  if (!drawMode) { selectedLine = null; clearDetailPanel(); }

  const filtered = activeFilter === 'all'
    ? allRoads
    : allRoads.filter(r => r.condition === activeFilter);

  filtered.forEach((road, idx) => {
    const color = getColor(road.condition);
    const line  = L.polyline(road.coords, { color, weight: 5, opacity: 0.85, lineJoin: 'round' });

    line.on('mouseover', () => { if (line !== selectedLine) line.setStyle({ weight: 7, opacity: 1 }); });
    line.on('mouseout',  () => { if (line !== selectedLine) line.setStyle({ weight: 5, opacity: 0.85 }); });
    line.on('click', (e) => {
      if (drawMode) return;
      L.DomEvent.stopPropagation(e);
      selectRoad(line, road, idx);
    });

    roadLayer.addLayer(line);
  });

  updateStats();
}

function selectRoad(line, road, idx) {
  if (selectedLine) selectedLine.setStyle({ weight: 5, opacity: 0.85 });
  selectedLine = line;
  line.setStyle({ weight: 8, opacity: 1 });

  const len   = segmentLength(road.coords);
  const start = road.coords[0];
  document.getElementById('road-detail').innerHTML = `
    <div id="road-detail-content">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <span class="detail-badge ${road.condition}">${conditionLabel(road.condition)}</span>
        <button class="delete-btn" data-idx="${idx}">🗑 Delete</button>
      </div>
      <div class="detail-row"><strong>Segment #</strong> ${idx + 1}</div>
      <div class="detail-row"><strong>Length</strong> ~${len} km</div>
      <div class="detail-row"><strong>Points</strong> ${road.coords.length} coords</div>
      <div class="detail-row"><strong>Start</strong> ${start[0].toFixed(5)}, ${start[1].toFixed(5)}</div>
    </div>
  `;

  document.querySelector('.delete-btn')?.addEventListener('click', (e) => {
    allRoads.splice(parseInt(e.target.dataset.idx), 1);
    renderRoads();
    clearDetailPanel();
    showToast('Segment deleted. Click Export to save changes.');
  });
}

function clearDetailPanel() {
  document.getElementById('road-detail').innerHTML =
    '<p id="no-selection">Click a road segment to see details.</p>';
}

function updateStats() {
  const counts = { good: 0, medium: 0, bad: 0 };
  allRoads.forEach(r => { if (counts[r.condition] !== undefined) counts[r.condition]++; });
  document.getElementById('count-good').textContent   = counts.good;
  document.getElementById('count-medium').textContent = counts.medium;
  document.getElementById('count-bad').textContent    = counts.bad;
}

// ─── Load Roads ───────────────────────────────────────────────────────────────
function loadRoads() {
  showLoading(true);
  fetch('data/roads.json?v=' + Date.now())
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
    .then(data => {
      allRoads = data;
      renderRoads();
      if (firstLoad && allRoads.length > 0) {
        map.fitBounds(L.latLngBounds(allRoads.flatMap(r => r.coords)), { padding: [40, 40] });
        firstLoad = false;
      }
      showLoading(false);
    })
    .catch(err => { console.error('Error loading roads:', err); showLoading(false); });
}

// ─── DRAW MODE ────────────────────────────────────────────────────────────────
function enterDrawMode() {
  drawMode = true; drawCoords = []; drawMarkers = []; drawPolyline = null;
  map.getContainer().classList.add('draw-cursor');
  document.getElementById('draw-toolbar').classList.remove('hidden');
  document.getElementById('draw-btn').classList.add('active');
  updateConditionPills();
  showToast('Click map to add points · Double-click or Save to finish');
}

function exitDrawMode(save = false) {
  if (save && drawCoords.length >= 2) {
    allRoads.push({ coords: [...drawCoords], condition: drawCondition });
    renderRoads();
    showToast(`✅ Saved (${conditionLabel(drawCondition)}, ${drawCoords.length} pts) — click Export to download JSON`);
  } else if (save) {
    showToast('Need at least 2 points to save a segment.');
  }

  drawMarkers.forEach(m => map.removeLayer(m));
  if (drawPolyline) map.removeLayer(drawPolyline);
  drawCoords = []; drawMarkers = []; drawPolyline = null;
  drawMode = false;
  map.getContainer().classList.remove('draw-cursor');
  document.getElementById('draw-toolbar').classList.add('hidden');
  document.getElementById('draw-btn').classList.remove('active');
}

function undoLastPoint() {
  if (!drawCoords.length) return;
  drawCoords.pop();
  const m = drawMarkers.pop();
  if (m) map.removeLayer(m);
  updateDrawPreview();
}

function updateDrawPreview() {
  if (drawPolyline) map.removeLayer(drawPolyline);
  if (drawCoords.length >= 2) {
    drawPolyline = L.polyline(drawCoords, {
      color: getColor(drawCondition), weight: 4, opacity: 0.75, dashArray: '8 6'
    }).addTo(map);
  }
}

function updateConditionPills() {
  document.querySelectorAll('.cond-pill').forEach(p =>
    p.classList.toggle('active', p.dataset.cond === drawCondition));
  if (drawPolyline) drawPolyline.setStyle({ color: getColor(drawCondition) });
}

map.on('click', (e) => {
  if (!drawMode) return;
  const { lat, lng } = e.latlng;
  drawCoords.push([lat, lng]);
  drawMarkers.push(
    L.circleMarker([lat, lng], {
      radius: 5, color: '#fff',
      fillColor: getColor(drawCondition), fillOpacity: 1, weight: 2
    }).addTo(map)
  );
  updateDrawPreview();
});

map.on('dblclick', (e) => {
  if (!drawMode) return;
  L.DomEvent.stopPropagation(e);
  // remove the duplicate point added by the second click
  drawCoords.pop();
  const m = drawMarkers.pop();
  if (m) map.removeLayer(m);
  exitDrawMode(true);
});

// ─── EXPORT JSON ─────────────────────────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(allRoads, null, 2)], { type: 'application/json' });
  const a    = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob), download: 'roads.json'
  });
  a.click();
  URL.revokeObjectURL(a.href);
  showToast('📥 roads.json downloaded — replace data/roads.json and git push');
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 5000);
}

function showLoading(v) {
  document.getElementById('loading-indicator').classList.toggle('hidden', !v);
}

// ─── UI WIRING ────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderRoads();
  })
);

['good', 'medium', 'bad'].forEach(cond => {
  document.getElementById(`stat-${cond}`).addEventListener('click', () => {
    activeFilter = activeFilter === cond ? 'all' : cond;
    document.querySelectorAll('.filter-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.filter === activeFilter));
    renderRoads();
  });
});

document.querySelectorAll('.layer-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    if (btn.dataset.layer === activeLayer) return;
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    map.removeLayer(TILES[activeLayer]);
    activeLayer = btn.dataset.layer;
    TILES[activeLayer].addTo(map);
    TILES[activeLayer].bringToBack();
  })
);

document.getElementById('draw-btn').addEventListener('click',         () => drawMode ? exitDrawMode(false) : enterDrawMode());
document.getElementById('save-segment-btn').addEventListener('click', () => exitDrawMode(true));
document.getElementById('undo-point-btn').addEventListener('click',   undoLastPoint);
document.getElementById('cancel-draw-btn').addEventListener('click',  () => exitDrawMode(false));
document.getElementById('export-btn').addEventListener('click',       exportJSON);
document.querySelectorAll('.cond-pill').forEach(p =>
  p.addEventListener('click', () => { drawCondition = p.dataset.cond; updateConditionPills(); })
);

document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  setTimeout(() => btn.classList.remove('spinning'), 700);
  loadRoads();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadRoads();
setInterval(loadRoads, REFRESH_MS);