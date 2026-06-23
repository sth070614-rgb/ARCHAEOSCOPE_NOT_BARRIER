const DEFAULT_CENTER = { lat: 37.5796, lng: 126.982 };
const DEFAULT_ZOOM = 14;

const ACCESSIBILITY_LEVELS = {
  easy: {
    label: "접근 용이",
    color: "#0b6f2a",
    strokeWeight: 4,
  },
  moderate: {
    label: "보통",
    color: "#c76a00",
    strokeWeight: 4,
  },
  difficult: {
    label: "주의 필요",
    color: "#a50f15",
    strokeWeight: 4,
  },
};

const CATEGORY_LABELS = {
  heritage: "문화유산",
  restaurant: "음식점",
  cafe: "카페",
  transit: "교통",
  support: "편의",
};

const CATEGORY_MARKS = {
  heritage: "문",
  restaurant: "식",
  cafe: "카",
  transit: "교",
  support: "편",
};

let map;
let bounds;

window.initMap = async function initMap() {
  const mapElement = document.getElementById("map");

  map = new google.maps.Map(mapElement, {
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  bounds = new google.maps.LatLngBounds();

  try {
    const [places, routes] = await Promise.all([loadPlaces(), loadRoutes()]);
    const routeCount = renderRoutes(routes);
    const placeCount = renderMarkers(places);

    fitMapToData();
    renderOverviewCard(placeCount, routeCount);
  } catch (error) {
    renderError("장소 데이터를 불러오지 못했습니다. 로컬 서버 주소에서 열었는지와 data/places.json 파일을 확인해주세요.");
    console.error(error);
  }
};

async function loadPlaces() {
  const data = await loadJson("./data/places.json");
  return Array.isArray(data) ? data : data.places || [];
}

async function loadRoutes() {
  try {
    const data = await loadJson("./data/routes.json");
    return Array.isArray(data) ? data : data.routes || [];
  } catch (error) {
    console.warn("접근성 경로 데이터를 불러오지 못했습니다.", error);
    return [];
  }
}

async function loadJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`${path} request failed: ${response.status}`);
  }

  return response.json();
}

function renderRoutes(routes) {
  const validRoutes = routes
    .map(normalizeRoute)
    .filter((route) => route.path.length >= 2);

  validRoutes.forEach((route) => {
    const style = getAccessibilityStyle(route.accessLevel);
    const polyline = new google.maps.Polyline({
      path: route.path,
      geodesic: true,
      strokeColor: style.color,
      strokeOpacity: 0.96,
      strokeWeight: style.strokeWeight,
      map,
    });

    polyline.addListener("click", () => {
      renderRouteCard(route);
    });

    polyline.addListener("mouseover", () => {
      polyline.setOptions({ strokeWeight: style.strokeWeight + 2 });
    });

    polyline.addListener("mouseout", () => {
      polyline.setOptions({ strokeWeight: style.strokeWeight });
    });

    route.path.forEach(extendBounds);
  });

  return validRoutes.length;
}

function renderMarkers(places) {
  const validPlaces = places
    .map(normalizePlace)
    .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));

  validPlaces.forEach((place) => {
    const position = { lat: place.lat, lng: place.lng };
    const marker = new google.maps.Marker({
      position,
      map,
      title: `${place.name} - ${getCategoryLabel(place.category)}`,
      icon: getMarkerIcon(place.accessLevel),
      label: {
        text: getCategoryMark(place.category),
        color: "#ffffff",
        fontSize: "12px",
        fontWeight: "700",
      },
    });

    marker.addListener("click", () => {
      map.panTo(position);
      renderInfoCard(place);
    });

    extendBounds(position);
  });

  return validPlaces.length;
}

function fitMapToData() {
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, 72);
    return;
  }

  map.setCenter(DEFAULT_CENTER);
  map.setZoom(DEFAULT_ZOOM);
}

function normalizePlace(place) {
  const location = place.location || place.position || {};
  const accessLevel = normalizeAccessLevel(readField(place, ["accessLevel", "accessibilityLevel", "접근성등급"], "moderate"));
  const category = normalizeCategory(readField(place, ["category", "type", "분류"], "heritage"));

  return {
    name: readField(place, ["name", "title", "placeName", "장소명"], "이름 없는 장소"),
    category,
    region: readField(place, ["region", "area", "권역"], "권역 정보 없음"),
    accessLevel,
    summary: readField(place, ["summary", "description", "요약"], "요약 정보가 없습니다."),
    mobility: readField(place, ["mobility", "mobilityAccess", "이동접근성"], "정보 없음"),
    visual: readField(place, ["visual", "visualAccess", "시각접근성"], "정보 없음"),
    hearing: readField(place, ["hearing", "hearingAccess", "청각접근성"], "정보 없음"),
    caution: readField(place, ["caution", "cautions", "notice", "주의사항"], "주의사항 없음"),
    lat: Number(place.lat ?? place.latitude ?? location.lat ?? location.latitude),
    lng: Number(place.lng ?? place.longitude ?? location.lng ?? location.longitude),
  };
}

function normalizeRoute(route) {
  return {
    name: readField(route, ["name", "title", "routeName", "경로명"], "이름 없는 경로"),
    accessLevel: normalizeAccessLevel(readField(route, ["accessLevel", "accessibilityLevel", "접근성등급"], "moderate")),
    summary: readField(route, ["summary", "description", "요약"], "경로 설명이 없습니다."),
    mobility: readField(route, ["mobility", "mobilityAccess", "이동접근성"], "정보 없음"),
    caution: readField(route, ["caution", "cautions", "notice", "주의사항"], "주의사항 없음"),
    path: normalizePath(route.path || route.coordinates || []),
  };
}

function normalizePath(path) {
  return path
    .map((point) => ({
      lat: Number(point.lat ?? point.latitude),
      lng: Number(point.lng ?? point.longitude),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function normalizeAccessLevel(level) {
  return ACCESSIBILITY_LEVELS[level] ? level : "moderate";
}

function normalizeCategory(category) {
  return CATEGORY_LABELS[category] ? category : "heritage";
}

function readField(source, keys, fallback) {
  const value = keys.map((key) => source[key]).find((item) => item !== undefined && item !== "");
  return value || fallback;
}

function extendBounds(position) {
  bounds.extend(position);
}

function getAccessibilityStyle(level) {
  return ACCESSIBILITY_LEVELS[level] || ACCESSIBILITY_LEVELS.moderate;
}

function getCategoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.heritage;
}

function getCategoryMark(category) {
  return CATEGORY_MARKS[category] || CATEGORY_MARKS.heritage;
}

function getMarkerIcon(accessLevel) {
  const style = getAccessibilityStyle(accessLevel);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52">
      <path d="M21 50C17.8 43.4 6 33.2 6 20.8C6 12.4 12.7 5.5 21 5.5s15 6.9 15 15.3C36 33.2 24.2 43.4 21 50Z" fill="${style.color}" stroke="#ffffff" stroke-width="3"/>
      <circle cx="21" cy="20.5" r="10.5" fill="rgba(255,255,255,0.18)"/>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(34, 42),
    anchor: new google.maps.Point(17, 42),
    labelOrigin: new google.maps.Point(17, 17),
  };
}

function renderOverviewCard(placeCount, routeCount) {
  const card = document.getElementById("info-card");

  card.innerHTML = `
    <p class="info-kicker">지도 요약</p>
    <h2>접근성 기준으로 장소와 길을 함께 표시합니다.</h2>
    <p class="meta-line">
      <span class="category-tag">장소 ${placeCount}개</span>
      <span class="category-tag">경로 ${routeCount}개</span>
    </p>
    <p class="info-summary">
      마커는 장소 분류를, 색상은 접근성 등급을 나타냅니다. 지도 위의 색상 경로를 클릭하면 대표 이동 동선의 접근성 정보를 확인할 수 있습니다.
    </p>
    <div class="access-list">
      ${renderAccessItem("초록", "상대적으로 평탄하거나 대중교통·주요 보행로와 연결되어 접근이 쉬운 구간입니다.")}
      ${renderAccessItem("주황", "일부 경사, 혼잡, 노면 차이, 턱이 있어 동행자나 사전 확인이 도움이 되는 구간입니다.")}
      ${renderAccessItem("빨강", "경사, 계단, 좁은 골목, 성곽길 등으로 이동 보조가 필요하거나 우회 동선 검토가 필요한 구간입니다.")}
    </div>
  `;
}

function renderInfoCard(place) {
  const card = document.getElementById("info-card");
  const style = getAccessibilityStyle(place.accessLevel);

  card.innerHTML = `
    <p class="info-kicker">${escapeHtml(place.region)}</p>
    <h2>${escapeHtml(place.name)}</h2>
    <p class="meta-line">
      <span class="category-tag">${escapeHtml(getCategoryLabel(place.category))}</span>
      <span class="access-pill access-pill--${place.accessLevel}">${escapeHtml(style.label)}</span>
    </p>
    <p class="info-summary">${escapeHtml(place.summary)}</p>
    <div class="access-list">
      ${renderAccessItem("이동접근성", place.mobility)}
      ${renderAccessItem("시각접근성", place.visual)}
      ${renderAccessItem("청각접근성", place.hearing)}
    </div>
    <div class="caution">
      <strong>주의사항</strong><br />
      ${escapeHtml(place.caution)}
    </div>
  `;
}

function renderRouteCard(route) {
  const card = document.getElementById("info-card");
  const style = getAccessibilityStyle(route.accessLevel);

  card.innerHTML = `
    <p class="info-kicker">접근성 경로</p>
    <h2>${escapeHtml(route.name)}</h2>
    <p class="meta-line">
      <span class="category-tag">대표 이동 동선</span>
      <span class="access-pill access-pill--${route.accessLevel}">${escapeHtml(style.label)}</span>
    </p>
    <p class="info-summary">${escapeHtml(route.summary)}</p>
    <div class="access-list">
      ${renderAccessItem("이동접근성", route.mobility)}
    </div>
    <div class="caution">
      <strong>주의사항</strong><br />
      ${escapeHtml(route.caution)}
    </div>
  `;
}

function renderAccessItem(label, value) {
  return `
    <section class="access-item">
      <p class="access-label">${escapeHtml(label)}</p>
      <p>${escapeHtml(value)}</p>
    </section>
  `;
}

function renderError(message) {
  const card = document.getElementById("info-card");
  card.innerHTML = `
    <p class="info-kicker">오류</p>
    <h2>지도 정보를 표시할 수 없습니다.</h2>
    <p class="error-message">${escapeHtml(message)}</p>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
