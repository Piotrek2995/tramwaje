const map = L.map('map').setView([52.25, 20.92], 13);

// Podkład OSM
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let bemowoBoundary;
let bemowoLayer;

// Sprawdza czy element leży w granicach Bemowa
function isFeatureInBemowo(feature) {
  if (!bemowoBoundary || !bemowoLayer) return false;
  const bounds = bemowoLayer.getBounds();

  if (feature.geometry.type === "Point") {
    const [lng, lat] = feature.geometry.coordinates;
    return bounds.contains([lat, lng]);
  }
  if (feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString") {
    const coords = feature.geometry.type === "LineString"
      ? feature.geometry.coordinates
      : feature.geometry.coordinates.flat();
    return coords.some(coord => bounds.contains([coord[1], coord[0]]));
  }
  return false;
}

// Dodaj granicę Bemowa i ustaw mapę na jej zasięg
fetch('data/bemowo.geojson')
  .then(res => res.json())
  .then(data => {
    bemowoBoundary = data;
    bemowoLayer = L.geoJSON(data, { color: 'gray', weight: 1 }).addTo(map);
    map.fitBounds(bemowoLayer.getBounds());

    // Najpierw linie, potem przystanki. Przystanki tramwajowe na końcu (nad innymi warstwami)
    addLines('data/tram_lines.geojson', 'blue');
    addLines('data/bus_lines.geojson', 'green', true);

    addBusStopsWithLines('data/bus_lines.geojson', 'green');
    addTramStopsWithLines('data/tram_lines.geojson', 'blue');
  });

// Funkcja do ładowania linii (bus/tram)
function addLines(url, lineColor, isBus = false) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      const lineFeatures = data.features.filter(
        f => isFeatureInBemowo(f) && (f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
      );
      L.geoJSON({ type: "FeatureCollection", features: lineFeatures }, {
        style: { color: lineColor, weight: 3, dashArray: isBus ? '5,5' : undefined }
      }).addTo(map);
    });
}

// Funkcja do pobierania nazwy przystanku
function getStopName(feature) {
  if (feature.properties.name) return feature.properties.name;
  if (feature.properties["@relations"]?.length > 0) {
    for (const rel of feature.properties["@relations"]) {
      if (rel.reltags?.stop_name) return rel.reltags.stop_name;
    }
  }
  return "Przystanek";
}

// Przystanki autobusowe: zielone kropki, popup z nazwą i liniami
function addBusStopsWithLines(url, stopColor) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      const pointFeatures = data.features.filter(
        f => isFeatureInBemowo(f) && f.geometry.type === "Point"
      );
      L.geoJSON({ type: "FeatureCollection", features: pointFeatures }, {
        pointToLayer: function(feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: stopColor,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
          });
        },
        onEachFeature: function(feature, layer) {
          const stopName = getStopName(feature);
          // Zbierz wszystkie linie autobusowe
          let buses = [];
          if (feature.properties["@relations"]?.length > 0) {
            buses = feature.properties["@relations"]
              .map(rel => rel.reltags)
              .filter(tag => tag && tag.route === "bus" && tag.ref)
              .map(tag => {
                if (tag.url) {
                  return `<a href="${tag.url}" target="_blank">${tag.ref}</a>`;
                } else {
                  return tag.ref;
                }
              });
          }
          buses = [...new Set(buses)];
          const popupHtml = `
            <b>${stopName}</b><br/>
            <b>Autobusy:</b> ${buses.length ? buses.join(", ") : "brak"}
          `;
          layer.bindPopup(popupHtml);
        }
      }).addTo(map);
    });
}

// Przystanki tramwajowe: niebieskie kropki, popup z nazwą i liniami tramwajowymi
function addTramStopsWithLines(url, stopColor) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      const pointFeatures = data.features.filter(
        f => isFeatureInBemowo(f) && f.geometry.type === "Point"
      );
      L.geoJSON({ type: "FeatureCollection", features: pointFeatures }, {
        pointToLayer: function(feature, latlng) {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: stopColor,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.9
          });
        },
        onEachFeature: function(feature, layer) {
          const stopName = getStopName(feature);
          // Zbierz wszystkie linie tramwajowe
          let trams = [];
          if (feature.properties["@relations"]?.length > 0) {
            trams = feature.properties["@relations"]
              .map(rel => rel.reltags)
              .filter(tag => tag && tag.route === "tram" && tag.ref)
              .map(tag => {
                if (tag.url) {
                  return `<a href="${tag.url}" target="_blank">${tag.ref}</a>`;
                } else {
                  return tag.ref;
                }
              });
          }
          trams = [...new Set(trams)];
          const popupHtml = `
            <b>${stopName}</b><br/>
            <b>Tramwaje:</b> ${trams.length ? trams.join(", ") : "brak"}
          `;
          layer.bindPopup(popupHtml);
        }
      }).addTo(map);
    });
}