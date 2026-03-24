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
// NOTE: No hardcoded center — we auto-fit to data bounds after loading.
const map = L.map('map', { zoomControl: true });
TILES.street.addTo(map);

// ─── State ───────────────────────────────────────────────────────────────────
let allRoads     = [];           // raw data from JSON
let activeFilter = 'all';        // current filter
let activeLayer  = 'street';     // current tile style
let roadLayer    = L.layerGroup().addTo(map);
let selectedLine = null;         // currently highlighted polyline
let firstLoad    = true;         // fit bounds only on first load
const REFRESH_MS = 30_000;       // 30 seconds (was 10s — no need to hammer static file)

// ─── Color Helper ────────────────────────────────────────────────────────────
function getColor(condition) {
  return { good: '#22c55e', medium: '#f59e0b', bad: '#ef4444' }[condition] ?? '#64748b';
}

// ─── Condition Label ─────────────────────────────────────────────────────────
function conditionLabel(condition) {
  return { good: 'Good', medium: 'Fair', bad: 'Bad' }[condition] ?? 'Unknown';
}

// ─── Segment Length (metres, approx) ─────────────────────────────────────────
function segmentLength(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = L.latLng(coords[i - 1]);
    const b = L.latLng(coords[i]);
    total += a.distanceTo(b);
  }
  return (total / 1000).toFixed(2); // km
}

// ─── Render Roads ─────────────────────────────────────────────────────────────
function renderRoads() {
  roadLayer.clearLayers();
  selectedLine = null;
  clearDetailPanel();

  const filtered = activeFilter === 'all'
    ? allRoads
    : allRoads.filter(r => r.condition === activeFilter);

  filtered.forEach((road, idx) => {
    const color = getColor(road.condition);
    const line = L.polyline(road.coords, {
      color,
      weight: 5,
      opacity: 0.85,
      lineJoin: 'round'
    });

    line.on('mouseover', () => {
      if (line !== selectedLine) line.setStyle({ weight: 7, opacity: 1 });
    });
    line.on('mouseout', () => {
      if (line !== selectedLine) line.setStyle({ weight: 5, opacity: 0.85 });
    });
    line.on('click', () => selectRoad(line, road, idx));

    roadLayer.addLayer(line);
  });

  updateStats();
}

// ─── Select Road ──────────────────────────────────────────────────────────────
function selectRoad(line, road, idx) {
  // Deselect previous
  if (selectedLine) {
    selectedLine.setStyle({ weight: 5, opacity: 0.85 });
  }

  // Select new
  selectedLine = line;
  line.setStyle({ weight: 8, opacity: 1 });

  // Show detail panel
  const len = segmentLength(road.coords);
  const start = road.coords[0];
  document.getElementById('road-detail').innerHTML = `
    <div id="road-detail-content">
      <span class="detail-badge ${road.condition}">${conditionLabel(road.condition)}</span>
      <div class="detail-row"><strong>Segment #</strong> ${idx + 1}</div>
      <div class="detail-row"><strong>Length</strong> ~${len} km</div>
      <div class="detail-row"><strong>Points</strong> ${road.coords.length} coords</div>
      <div class="detail-row"><strong>Start</strong> ${start[0].toFixed(5)}, ${start[1].toFixed(5)}</div>
    </div>
  `;
}

function clearDetailPanel() {
  document.getElementById('road-detail').innerHTML =
    '<p id="no-selection">Click a road segment to see details.</p>';
}

// ─── Update Stats Counts ──────────────────────────────────────────────────────
function updateStats() {
  const counts = { good: 0, medium: 0, bad: 0 };
  allRoads.forEach(r => { if (counts[r.condition] !== undefined) counts[r.condition]++; });
  document.getElementById('count-good').textContent   = counts.good;
  document.getElementById('count-medium').textContent = counts.medium;
  document.getElementById('count-bad').textContent    = counts.bad;
}

// ─── Load Roads from JSON ─────────────────────────────────────────────────────
function loadRoads() {
  showLoading(true);

  // Cache-bust so we always get the latest version
  fetch('data/roads.json?v=' + Date.now())
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => {
      allRoads = data;
      renderRoads();

      // BUG FIX: Fit map to actual data bounds on first load
      // (previously hardcoded to Bangalore — data is near Belagavi)
      if (firstLoad && allRoads.length > 0) {
        const allCoords = allRoads.flatMap(r => r.coords);
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [40, 40] });
        firstLoad = false;
      }

      showLoading(false);
    })
    .catch(err => {
      console.error('Error loading roads:', err);
      showLoading(false);
    });
}

// ─── Loading Indicator ────────────────────────────────────────────────────────
function showLoading(visible) {
  document.getElementById('loading-indicator').classList.toggle('hidden', !visible);
}

// ─── Filter Buttons ───────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderRoads();
  });
});

// ─── Stat Clicks → Quick Filter ───────────────────────────────────────────────
['good', 'medium', 'bad'].forEach(cond => {
  document.getElementById(`stat-${cond}`).addEventListener('click', () => {
    const isSame = activeFilter === cond;
    activeFilter = isSame ? 'all' : cond;

    // Sync filter buttons
    document.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.filter === activeFilter);
    });
    renderRoads();
  });
});

// ─── Layer / Tile Switcher ────────────────────────────────────────────────────
document.querySelectorAll('.layer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.layer === activeLayer) return;
    document.querySelectorAll('.layer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    map.removeLayer(TILES[activeLayer]);
    activeLayer = btn.dataset.layer;
    TILES[activeLayer].addTo(map);
    TILES[activeLayer].bringToBack(); // keep roads on top
  });
});

// ─── Manual Refresh Button ────────────────────────────────────────────────────
document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  setTimeout(() => btn.classList.remove('spinning'), 700);
  loadRoads();
});

// ─── Auto Refresh ─────────────────────────────────────────────────────────────
loadRoads();
setInterval(loadRoads, REFRESH_MS);