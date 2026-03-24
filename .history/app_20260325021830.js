// Initialize map (Bangalore default view)
const map = L.map('map').setView([12.9716, 77.5946], 13);

// OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

// Color logic
function getColor(condition) {
  if (condition === "good") return "green";
  if (condition === "medium") return "orange";
  if (condition === "bad") return "red";
  return "gray";
}

// Layer holder (so we can refresh cleanly)
let roadLayer = L.layerGroup().addTo(map);

// Load roads dynamically
function loadRoads() {
  const url = 'data/roads.json?v=' + new Date().getTime(); // cache buster

  fetch(url)
    .then(res => res.json())
    .then(data => {
      console.log("Latest roads loaded:", data);

      // Clear old roads
      roadLayer.clearLayers();

      // Draw new roads
      data.forEach(road => {
        const polyline = L.polyline(road.coords, {
          color: getColor(road.condition),
          weight: 5
        });

        roadLayer.addLayer(polyline);
      });
    })
    .catch(err => {
      console.error("Error loading roads:", err);
    });
}

// Initial load
loadRoads();

// Auto refresh every 10 seconds (no full reload)
setInterval(loadRoads, 10000);