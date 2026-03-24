const map = L.map('map').setView([12.9716, 77.5946], 13); // Bangalore

// Load OpenStreetMap tiles
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

// Load road data
fetch('data/roads.json')
  .then(res => res.json())
  .then(data => {
    data.forEach(road => {
      L.polyline(road.coords, {
        color: getColor(road.condition),
        weight: 5
      }).addTo(map);
    });
  });