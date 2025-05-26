const map = L.map('map').setView([52.25, 20.92], 13);

// Podkład OSM
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let bemowoBoundary;
let bemowoLayer;
let terminusLayer; // warstwa pętli/krańców

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

    // Najpierw linie, potem przystanki
    addLines('data/tram_lines.geojson', 'blue');
    addLines('data/bus_lines.geojson', 'green', true);

    addBusStopsWithLines('data/bus_lines.geojson', 'green');
    addTramStopsWithLines('data/tram_lines.geojson', 'blue');

    // PĘTLE NA SAMYM KOŃCU – zawsze nad innymi warstwami
    addTerminusLayer('data/petle.geojson');

    addLegend();
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

// Przystanki autobusowe: zielone kropki, tylko platformy, popup z nazwą i liniami
function addBusStopsWithLines(url, stopColor) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // tylko platformy!
      const pointFeatures = data.features.filter(
        f => isFeatureInBemowo(f) &&
             f.geometry.type === "Point" &&
             Array.isArray(f.properties["@relations"]) &&
             f.properties["@relations"].some(rel => rel.role === "platform")
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

// Przystanki tramwajowe: niebieskie kropki, tylko platformy, popup z nazwą i liniami tramwajowymi
function addTramStopsWithLines(url, stopColor) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // tylko platformy!
      const pointFeatures = data.features.filter(
        f => isFeatureInBemowo(f) &&
             f.geometry.type === "Point" &&
             Array.isArray(f.properties["@relations"]) &&
             f.properties["@relations"].some(rel => rel.role === "platform")
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

// Funkcja do dodania pętli/krańców z podziałem na kategorie (TERMINUS NA WIERZCHU!)
function addTerminusLayer(url) {
  fetch(url)
    .then(res => res.json())
    .then(data => {
      // Jeśli istnieje poprzednia warstwa, usuń ją, by zawsze była na wierzchu po aktualizacji
      if (terminusLayer) {
        map.removeLayer(terminusLayer);
      }
      terminusLayer = L.geoJSON(data, {
        pointToLayer: function(feature, latlng) {
          // Wybierz styl w zależności od typu i kategorii
          let color = "#222", radius = 10;
          switch (feature.properties.kategoria) {
            case "a": color = "green"; break;
            case "b": color = "red"; break;
            case "c": color = "orange"; break;
            case "d": color = "blue"; break;
          }
          return L.circleMarker(latlng, {
            radius: radius,
            fillColor: color,
            color: "#fff",
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
          });
        },
        onEachFeature: function(feature, layer) {
          layer.bindPopup(
            `<b>${feature.properties.name}</b><br>${feature.properties.type}<br>Kategoria: ${feature.properties.kategoria}<br><i>${feature.properties.opis || ""}</i>`
          );
        }
      }).addTo(map);

      // Warstwa pętli/krańców na samą górę
      terminusLayer.bringToFront();
    });
}

// Funkcja dodająca legendę do mapy
function addLegend() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function (map) {
    const div = L.DomUtil.create("div", "info legend");
    div.style.background = "white";
    div.style.padding = "10px";
    div.style.borderRadius = "10px";
    div.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";

    div.innerHTML = `
      <b>Legenda</b><br>
      <i style="background:green;width:12px;height:12px;display:inline-block;border-radius:50%"></i>
        Zielone linie/punkty – Autobusy/pętle kat. a<br>
      <i style="background:blue;width:12px;height:12px;display:inline-block;border-radius:50%"></i>
        Niebieskie linie/punkty – Tramwaje/pętle kat. d<br>
      <i style="background:red;width:12px;height:12px;display:inline-block;border-radius:50%"></i>
        Czerwone punkty – Pętle kat. b<br>
      <i style="background:orange;width:12px;height:12px;display:inline-block;border-radius:50%"></i>
        Pomarańczowe punkty – Pętle kat. c<br>
      <hr style="margin:4px 0">
      <b>Kategorie pętli:</b><br>
      <b>a</b>: Istniejąca, zgodna z MPZP<br>
      <b>b</b>: Istniejąca, niezgodna z MPZP<br>
      <b>c</b>: Istniejąca, nieuwzględniona w MPZP<br>
      <b>d</b>: Planowana, zgodna z MPZP
    `;
    return div;
  };

  legend.addTo(map);
}