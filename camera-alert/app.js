(function () {
  var $ = function (id) { return document.getElementById(id); };
  var CL = CamLogic;
  var CACHE_KEY = 'camalert.cameras.v1';
  var REPORTS_KEY = 'camalert.reports.v1';
  var cameras = [], baseCameras = [], schools = [], reports = load(REPORTS_KEY, []);
  var watchId = null, simTimer = null, wakeLock = null;
  var lastNote = '';
  var lastPos = null, lastHeading = null, lastSpoken = {}; // camKey -> highest level spoken
  var settings = load('camalert.settings', { limit: 25, voice: true, alpr: false, school: true });

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  // ---------- map ----------
  var map = null, camLayer = null, schoolLayer = null, meMarker = null, follow = true, reportText = '', lastSchoolSpeech = 0;
  var COLORS = { speed: '#e0a100', redlight: '#d62839', alpr: '#7b3fe4' };
  var NAMES = { speed: 'Speed camera', redlight: 'Red-light camera', alpr: 'License-plate camera' };

  function initMap() {
    if (!window.L || !$('map')) return;
    try {
      map = L.map('map', { preferCanvas: true }).setView([40.73, -73.98], 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      schoolLayer = L.layerGroup();
      camLayer = L.layerGroup().addTo(map);
      map.on('dragstart', function () { follow = false; $('recenter').hidden = false; });
      map.on('zoomend', syncSchoolLayer);
      map.on('popupopen', function (e) {
        var a = e.popup.getElement().querySelector('[data-del]');
        if (a) a.onclick = function (ev) { ev.preventDefault(); removeReport(a.getAttribute('data-del')); map.closePopup(); };
      });
    } catch (e) { map = null; }
  }

  function drawCameras() {
    if (!map) return;
    camLayer.clearLayers();
    cameras.forEach(function (c) {
      if (c.type === 'alpr' && !settings.alpr) return;
      var mine = c.src === 'you';
      L.circleMarker([c.lat, c.lon], { radius: mine ? 8 : 6, color: mine ? '#111' : '#fff', weight: mine ? 2.5 : 1.5, fillColor: COLORS[c.type], fillOpacity: 0.95 })
        .bindPopup('<b>' + NAMES[c.type] + '</b><br>Source: ' + (mine ? 'reported by you' : esc(c.src || '')) +
          (c.dir != null ? '<br>Faces: ' + Math.round(c.dir) + '°' : '') +
          (mine ? '<br><a href="#" data-del="' + esc(c.id) + '">Remove this report</a>' : ''))
        .addTo(camLayer);
    });
    drawSchools();
  }

  function drawSchools() {
    if (!map) return;
    schoolLayer.clearLayers();
    schools.forEach(function (s) {
      L.circleMarker([s.lat, s.lon], { radius: 5, color: '#fff', weight: 1, fillColor: '#0f9d8a', fillOpacity: 0.85 })
        .bindPopup('<b>School</b>' + (s.name ? '<br>' + esc(s.name) : '') + '<br>School-zone speed cameras are possible nearby.')
        .addTo(schoolLayer);
    });
    syncSchoolLayer();
  }

  // Schools are numerous; only draw them when zoomed in far enough to read.
  function syncSchoolLayer() {
    if (!map || !schoolLayer) return;
    var want = settings.school && map.getZoom() >= 14;
    if (want && !map.hasLayer(schoolLayer)) schoolLayer.addTo(map);
    if (!want && map.hasLayer(schoolLayer)) map.removeLayer(schoolLayer);
  }

  function updateMap(here, heading) {
    if (!map) return;
    var html = '<div class="me" style="transform:rotate(' + (heading == null ? 0 : Math.round(heading)) + 'deg)">' + (heading == null ? '●' : '▲') + '</div>';
    var icon = L.divIcon({ className: 'me-wrap', html: html, iconSize: [28, 28], iconAnchor: [14, 14] });
    if (!meMarker) { meMarker = L.marker([here.lat, here.lon], { icon: icon, interactive: false, keyboard: false }).addTo(map); map.setView([here.lat, here.lon], 16); }
    else { meMarker.setLatLng([here.lat, here.lon]); meMarker.setIcon(icon); }
    if (follow) map.panTo([here.lat, here.lon], { animate: true });
  }

  // ---------- data ----------
  function setCameras(list, note, schoolList) {
    baseCameras = list;
    if (schoolList) schools = schoolList;
    rebuild(note);
  }

  function reportCameras() {
    return reports.map(function (r) { return { lat: r.lat, lon: r.lon, type: r.type, dir: null, src: 'you', id: r.id }; });
  }

  function rebuild(note) {
    cameras = baseCameras.concat(reportCameras());
    var n = { speed: 0, redlight: 0, alpr: 0 };
    cameras.forEach(function (c) { n[c.type]++; });
    if (note !== undefined) lastNote = note;
    $('count').textContent = cameras.length + ' cameras loaded (' + n.speed + ' speed, ' + n.redlight + ' red-light, ' + n.alpr + ' plate, ' +
      schools.length + ' schools; ' + reports.length + ' reported by you)' + (lastNote ? ' ' + lastNote : '');
    drawCameras();
  }

  // ---------- user reports ----------
  function addReport() {
    var type = $('reportType').value;
    var p = lastPos || (meMarker && { lat: meMarker.getLatLng().lat, lon: meMarker.getLatLng().lng }) ||
      (map && { lat: map.getCenter().lat, lon: map.getCenter().lng });
    if (!p) { $('reportMsg').textContent = 'No location yet. Tap Start or wait for GPS.'; return; }
    reports.push({ id: 'r' + Date.now(), lat: p.lat, lon: p.lon, type: type, t: Date.now() });
    save(REPORTS_KEY, reports);
    $('reportMsg').textContent = 'Saved a ' + NAMES[type].toLowerCase() + ' at your location.';
    rebuild();
  }
  function removeReport(id) {
    reports = reports.filter(function (r) { return r.id !== id; });
    save(REPORTS_KEY, reports);
    rebuild();
  }
  function undoReport() {
    if (!reports.length) { $('reportMsg').textContent = 'Nothing to undo.'; return; }
    reports.pop(); save(REPORTS_KEY, reports);
    $('reportMsg').textContent = 'Removed your last report.';
    rebuild();
  }

  function renderReport(report) {
    reportText = report.map(function (r) { return r.source + ' [' + r.status + ']: ' + r.note; }).join('\n');
    $('report').innerHTML = report.map(function (r) {
      return '<li class="' + r.status + '"><b>' + esc(r.source) + '</b>: ' + esc(r.note) + '</li>';
    }).join('');
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function refreshData() {
    $('count').textContent = 'Loading camera data…';
    $('reload').disabled = true;
    return CamData.loadAll().then(function (res) {
      renderReport(res.report);
      if (res.cameras.length || res.schools.length) {
        save(CACHE_KEY, { t: Date.now(), cameras: res.cameras, schools: res.schools });
        setCameras(res.cameras, '', res.schools);
      } else {
        var cached = load(CACHE_KEY, null);
        if (cached) setCameras(cached.cameras, '(from saved copy, ' + new Date(cached.t).toLocaleDateString() + ')', cached.schools || []);
        else setCameras([], '— nothing could be loaded; check connection', []);
      }
    }).finally(function () { $('reload').disabled = false; });
  }

  // ---------- alerts ----------
  function speak(text) {
    if (!settings.voice || !('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      speechSynthesis.speak(u);
    } catch (e) { }
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
  }

  function showStatus(level, text) {
    var el = $('status');
    el.className = 'status l' + level;
    el.textContent = text;
  }

  function onFix(pos, simulated) {
    var c = pos.coords;
    var here = { lat: c.latitude, lon: c.longitude };
    var v = c.speed != null && !isNaN(c.speed) ? c.speed : 0;
    var heading = (c.heading != null && !isNaN(c.heading) && v > 1.5) ? c.heading : null;
    if (heading == null && lastPos && CL.distance(lastPos, here) > 10) heading = CL.bearing(lastPos, here);
    if (heading != null) lastHeading = heading;
    if (lastPos == null || CL.distance(lastPos, here) > 10) lastPos = here;

    updateMap(here, lastHeading);
    $('speed').textContent = Math.round(v / CL.MPH);
    $('limitShown').textContent = settings.limit;
    $('hdg').textContent = lastHeading == null ? '–' : Math.round(lastHeading) + '°';

    var ahead = CL.camerasAhead(cameras, here, lastHeading, 700);
    var best = { level: 0, text: ahead.length ? 'Nearest camera ahead: ' + CL.fmtDist(ahead[0].dist) : 'No cameras ahead.' };
    ahead.forEach(function (a) {
      var r = CL.assess(a.cam, a.dist, { speedMps: v, limitMph: settings.limit, showAlpr: settings.alpr });
      if (!r.level) return;
      var key = a.cam.lat.toFixed(5) + ',' + a.cam.lon.toFixed(5) + a.cam.type;
      if ((lastSpoken[key] || 0) < r.level) { lastSpoken[key] = r.level; speak(r.text); }
      if (r.level > best.level || (r.level === best.level && best.text.indexOf('Nearest') === 0)) best = r;
    });
    var nearSch = settings.school ? CL.nearSchools(schools, here, CL.SCHOOL_RADIUS_M) : [];
    if (nearSch.length) {
      var sr = CL.assessSchool(nearSch[0].dist, { speedMps: v, limitMph: settings.limit });
      if (sr.level) {
        var skey = 'school:' + nearSch[0].school.lat.toFixed(5) + ',' + nearSch[0].school.lon.toFixed(5);
        var now = Date.now();
        if (!sr.silent && (lastSpoken[skey] || 0) < sr.level && now - lastSchoolSpeech > 30000) {
          lastSpoken[skey] = sr.level; lastSchoolSpeech = now; speak(sr.text);
        }
        if (sr.level > best.level || (sr.level === best.level && best.text.indexOf('Nearest') === 0) || best.level === 0) best = sr;
      }
    }
    showStatus(best.level, best.text);
    var rows = ahead.slice(0, 5).map(function (a) {
      var name = { speed: 'Speed', redlight: 'Red-light', alpr: 'Plate reader' }[a.cam.type];
      return '<li>' + name + ' — ' + CL.fmtDist(a.dist) + '</li>';
    });
    if (nearSch.length) rows.unshift('<li>School zone — ' + CL.fmtDist(nearSch[0].dist) + (nearSch[0].school.name ? ' (' + esc(nearSch[0].school.name) + ')' : '') + '</li>');
    $('ahead').innerHTML = rows.join('') || '<li>–</li>';
    if (simulated) $('simnote').textContent = 'SIMULATION';
  }

  // ---------- GPS / wake lock ----------
  function requestWake() {
    if ('wakeLock' in navigator) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () { });
  }

  function start() {
    if (!('geolocation' in navigator)) { showStatus(0, 'This device has no GPS access.'); return; }
    stopAll();
    speak('Camera alerts on.');
    requestWake();
    $('toggle').textContent = 'Stop';
    watchId = navigator.geolocation.watchPosition(function (p) { $('simnote').textContent = ''; onFix(p, false); }, function (e) {
      showStatus(0, 'Location error: ' + e.message + '. Allow location access for this site.');
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  function stopAll() {
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    if (simTimer) clearInterval(simTimer);
    watchId = simTimer = null;
    if (wakeLock) { try { wakeLock.release(); } catch (e) { } wakeLock = null; }
    lastPos = lastHeading = null; lastSpoken = {};
    $('toggle').textContent = 'Start';
    $('simnote').textContent = '';
  }

  // ---------- simulation: drive toward a red-light camera (or any camera) at a chosen speed ----------
  function simulate() {
    stopAll();
    var target = cameras.filter(function (c) { return c.type === 'redlight'; })[0] || cameras[0] ||
      { lat: 40.7527, lon: -73.9772, type: 'redlight', dir: null }; // Grand Central area fallback
    var mph = parseInt($('simSpeed').value, 10) || 35;
    var v = mph * CL.MPH;
    var brg = 90;
    var start = CL.destination(target, (brg + 180) % 360, 800);
    var traveled = 0;
    speak('Simulation started.');
    simTimer = setInterval(function () {
      traveled += v;
      var p = CL.destination(start, brg, traveled);
      onFix({ coords: { latitude: p.lat, longitude: p.lon, speed: v, heading: brg } }, true);
      if (traveled > 900) { clearInterval(simTimer); simTimer = null; $('simnote').textContent = 'Simulation finished'; }
    }, 1000);
    $('toggle').textContent = 'Stop';
  }

  // ---------- wire up ----------
  $('toggle').onclick = function () { if (watchId != null || simTimer) stopAll(); else start(); };
  $('reload').onclick = refreshData;
  $('sim').onclick = simulate;
  $('limit').value = settings.limit;
  $('voice').checked = settings.voice;
  $('alpr').checked = settings.alpr;
  $('school').checked = settings.school;
  $('limit').onchange = function () { settings.limit = parseInt($('limit').value, 10) || 25; save('camalert.settings', settings); };
  $('voice').onchange = function () { settings.voice = $('voice').checked; save('camalert.settings', settings); };
  $('alpr').onchange = function () { settings.alpr = $('alpr').checked; save('camalert.settings', settings); drawCameras(); };
  $('school').onchange = function () { settings.school = $('school').checked; save('camalert.settings', settings); syncSchoolLayer(); };
  $('reportBtn').onclick = addReport;
  $('undoBtn').onclick = undoReport;
  $('recenter').onclick = function () { follow = true; $('recenter').hidden = true; if (meMarker) map.panTo(meMarker.getLatLng()); };
  $('copyReport').onclick = function () {
    var txt = $('count').textContent + '\n' + reportText;
    var done = function () { $('copyReport').textContent = 'Copied!'; setTimeout(function () { $('copyReport').textContent = 'Copy report'; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { window.prompt('Copy this:', txt); });
    else window.prompt('Copy this:', txt);
  };
  initMap();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && watchId != null) requestWake(); });

  var cached = load(CACHE_KEY, null);
  if (cached) setCameras(cached.cameras, '(saved copy, ' + new Date(cached.t).toLocaleDateString() + ')', cached.schools || []);
  else rebuild();
  refreshData();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
  window.__camalert = { setCameras: setCameras, onFix: onFix, addReport: addReport };
})();
