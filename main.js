const map = L.map('map').setView([52.25, 20.92], 13);

let bemowoBoundary;  // tutaj będziemy trzymać geojson granic Bemowa
let bemowoLayer;     // warstwa granicy Bemowa

// Funkcja do sprawdzania, czy punkt lub linia leży w granicy Bemowa
function isFeatureInBemowo(feature) {
  if (!bemowoBoundary) return false;

  // zamieniamy granice Bemowa na leafletowy polygon
  if (!bemowoLayer) return false;

  // Leaflet ma metodę contains, ale działa tylko na obiektach typu LatLngBounds
  // dlatego robimy: utwórz polygon i używamy turf.js do sprawdzenia (jeśli chcesz)

  // Albo uproszczona metoda: sprawdzanie bounding box:
  const bounds = bemowoLayer.getBounds();

  if (feature.geometry.type === "Point") {
    const [lng, lat] = feature.geometry.coordinates;
    return bounds.contains([lat, lng]);
  }
  if (feature.geometry.type === "LineString") {
    // Sprawdzamy czy którykolwiek punkt linii leży w granicy (przybliżenie)
    return feature.geometry.coordinates.some(coord => bounds.contains([coord[1], coord[0]]));
  }
  // dla innych typów można dodać analogicznie
  return false;
}

// Dodanie granicy Bemowa i ustawienie mapy na jej bounds
fetch('data/bemowo.geojson')
  .then(res => res.json())
  .then(data => {
    bemowoBoundary = data;
    bemowoLayer = L.geoJSON(data, {color: 'gray', weight: 1}).addTo(map);
    map.fitBounds(bemowoLayer.getBounds());
  });

// Funkcja dodająca geojson z filtrowaniem
function addGeoJSONFiltered(url, style) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // Filtrujemy elementy
      const filtered = {
        type: "FeatureCollection",
        features: data.features.filter(isFeatureInBemowo)
      };
      L.geoJSON(filtered, {style: style}).addTo(map);
    });
}

// Dodanie linii tramwajowych i autobusowych tylko w granicach Bemowa
addGeoJSONFiltered('data/tram_lines.geojson', { color: 'blue', weight: 3 });
addGeoJSONFiltered('data/bus_lines.geojson', { color: 'green', weight: 2, dashArray: '5,5' });
