/* Camera data loading. Runs on the user's device (browser), not on the build server.
   Sources: OpenStreetMap via Overpass (known tag schema) and NYC Open Data via Socrata (discovered at runtime). */
(function (root) {
  var BBOX = '40.49,-74.27,40.92,-73.68'; // NYC: south,west,north,east
  var OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  var SOCRATA_CATALOG = 'https://api.us.socrata.com/api/catalog/v1';
  var NYC_HOST = 'https://data.cityofnewyork.us';

  function fetchJson(url, opts, ms) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms || 45000);
    opts = Object.assign({ signal: ctl.signal }, opts || {});
    return fetch(url, opts).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).finally(function () { clearTimeout(t); });
  }

  function osmType(tags) {
    if (tags.enforcement === 'traffic_signals' || tags['enforcement'] === 'red_light') return 'redlight';
    if (tags.highway === 'speed_camera' || tags.enforcement === 'maxspeed') return 'speed';
    if (/ALPR|anpr/i.test(tags['surveillance:type'] || '') || /ALPR|anpr/i.test(tags['camera:type'] || '')) return 'alpr';
    return null;
  }

  function loadOsm() {
    var q = '[out:json][timeout:60];(' +
      'node["highway"="speed_camera"](' + BBOX + ');' +
      'node["enforcement"~"maxspeed|traffic_signals|red_light"](' + BBOX + ');' +
      'node["surveillance:type"~"ALPR|anpr",i](' + BBOX + ');' +
      ');out body;';
    var body = 'data=' + encodeURIComponent(q);
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body };
    var i = 0;
    function attempt() {
      return fetchJson(OVERPASS[i], opts, 60000).catch(function (e) {
        if (++i < OVERPASS.length) return attempt();
        throw e;
      });
    }
    return attempt().then(function (j) {
      var cams = [];
      (j.elements || []).forEach(function (el) {
        if (el.type !== 'node' || el.lat == null) return;
        var t = el.tags || {};
        var type = osmType(t);
        if (!type) return;
        var dir = parseFloat(t.direction || t['camera:direction']);
        cams.push({ lat: el.lat, lon: el.lon, type: type, dir: isNaN(dir) ? null : dir, src: 'osm',
          limit: parseInt(t.maxspeed, 10) || null });
      });
      return cams;
    });
  }

  // ---- NYC Open Data: look for camera *location* datasets, parse whatever coordinate columns they have.
  function pickCoords(row) {
    var lat = null, lon = null;
    Object.keys(row).forEach(function (k) {
      var kl = k.toLowerCase(), v = row[k];
      if (/^(lat|latitude|y_coord.*)$/.test(kl) && !isNaN(parseFloat(v))) lat = parseFloat(v);
      if (/^(lon|lng|long|longitude)$/.test(kl) && !isNaN(parseFloat(v))) lon = parseFloat(v);
      if (v && typeof v === 'object' && Array.isArray(v.coordinates) && v.coordinates.length === 2 &&
        /^(point|location|the_geom|geocoded_column|georeference)/.test(kl)) {
        lon = v.coordinates[0]; lat = v.coordinates[1];
      }
      if (v && typeof v === 'object' && v.latitude != null && v.longitude != null) {
        lat = parseFloat(v.latitude); lon = parseFloat(v.longitude);
      }
    });
    if (lat == null || lon == null) return null;
    if (lat < 40.4 || lat > 41.0 || lon < -74.4 || lon > -73.5) return null; // outside NYC
    return { lat: lat, lon: lon };
  }

  function discoverNyc(report) {
    var queries = [['speed camera', 'speed'], ['red light camera', 'redlight']];
    var seen = {};
    return Promise.all(queries.map(function (qq) {
      var url = SOCRATA_CATALOG + '?domains=data.cityofnewyork.us&only=dataset&limit=15&q=' + encodeURIComponent(qq[0]);
      return fetchJson(url, {}, 30000).then(function (j) {
        var picks = (j.results || []).filter(function (r) {
          var n = r.resource.name || '';
          return /camera/i.test(n) && /(location|site|zone|intersection)/i.test(n) && !/violation|ticket|summons/i.test(n);
        }).filter(function (r) {
          // Classify by the dataset's own name, and only take each dataset once across both searches.
          var n = r.resource.name || '';
          r.camType = /red.?light/i.test(n) ? 'redlight' : /speed/i.test(n) ? 'speed' : null;
          if (!r.camType || seen[r.resource.id]) return false;
          seen[r.resource.id] = true;
          return true;
        });
        report.push({ source: 'NYC catalog "' + qq[0] + '"', status: 'ok', note: picks.length + ' candidate dataset(s): ' +
          picks.map(function (p) { return p.resource.name + ' [' + p.resource.id + ']'; }).join('; ') });
        return Promise.all(picks.slice(0, 3).map(function (p) {
          var u = NYC_HOST + '/resource/' + p.resource.id + '.json?$limit=5000';
          return fetchJson(u, {}, 45000).then(function (rows) {
            var cams = [];
            rows.forEach(function (row) {
              var c = pickCoords(row);
              if (c) cams.push({ lat: c.lat, lon: c.lon, type: p.camType, dir: null, src: 'nyc:' + p.resource.id, limit: null });
            });
            report.push({ source: p.resource.name, status: cams.length ? 'ok' : 'no-coords',
              note: rows.length + ' rows, ' + cams.length + ' with usable coordinates' });
            return cams;
          }).catch(function (e) {
            report.push({ source: p.resource.name, status: 'error', note: String(e.message || e) });
            return [];
          });
        }));
      }).catch(function (e) {
        report.push({ source: 'NYC catalog "' + qq[0] + '"', status: 'error', note: String(e.message || e) });
        return [];
      });
    })).then(function (groups) {
      var flat = [];
      groups.forEach(function (g) { g.forEach(function (arr) { flat = flat.concat(arr); }); });
      return flat;
    });
  }

  function loadAll() {
    var report = [];
    var osm = loadOsm().then(function (c) {
      var counts = { speed: 0, redlight: 0, alpr: 0 };
      c.forEach(function (x) { counts[x.type]++; });
      report.push({ source: 'OpenStreetMap (Overpass)', status: 'ok',
        note: counts.speed + ' speed, ' + counts.redlight + ' red-light, ' + counts.alpr + ' license-plate' });
      return c;
    }).catch(function (e) {
      report.push({ source: 'OpenStreetMap (Overpass)', status: 'error', note: String(e.message || e) });
      return [];
    });
    var nyc = discoverNyc(report).catch(function (e) {
      report.push({ source: 'NYC Open Data', status: 'error', note: String(e.message || e) });
      return [];
    });
    return Promise.all([osm, nyc]).then(function (r) {
      var all = CamLogic.dedupe(r[0].concat(r[1]), 20);
      return { cameras: all, report: report };
    });
  }

  root.CamData = { loadAll: loadAll };
})(self);
