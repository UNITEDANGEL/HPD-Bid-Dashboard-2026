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
    var enf = tags.enforcement || '', st = tags['surveillance:type'] || '', ct = tags['camera:type'] || '';
    if (/traffic_signals|red.?light/i.test(enf) || /red.?light/i.test(st + ' ' + ct)) return 'redlight';
    if (tags.highway === 'speed_camera' || /maxspeed|speed/i.test(enf) || /speed/i.test(st + ' ' + ct)) return 'speed';
    if (/ALPR|anpr/i.test(tags['surveillance:type'] || '') || /ALPR|anpr/i.test(tags['camera:type'] || '')) return 'alpr';
    return null;
  }

  function overpass(q, ms) {
    var body = 'data=' + encodeURIComponent(q);
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body };
    var i = 0;
    function attempt() {
      return fetchJson(OVERPASS[i], opts, ms || 60000).catch(function (e) {
        if (++i < OVERPASS.length) return attempt();
        throw e;
      });
    }
    return attempt();
  }

  function loadOsm() {
    var q = '[out:json][timeout:60];(' +
      'node["highway"="speed_camera"](' + BBOX + ');' +
      'node["enforcement"](' + BBOX + ');' +
      'node["surveillance:type"~"ALPR|anpr|red.?light|speed",i](' + BBOX + ');' +
      ');out body;';
    return overpass(q, 60000).then(function (j) {
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
  function wkt(v) {
    var m = /POINT\s*\(\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\)/i.exec(v);
    return m ? { lon: parseFloat(m[1]), lat: parseFloat(m[2]) } : null;
  }

  function pickCoords(row) {
    var lat = null, lon = null;
    Object.keys(row).forEach(function (k) {
      var kl = k.toLowerCase(), v = row[k];
      if (typeof v === 'string') {
        var w = wkt(v);
        if (w) { lat = w.lat; lon = w.lon; return; }
      }
      if (/^lat/.test(kl) || /_lat/.test(kl)) { if (!isNaN(parseFloat(v))) lat = parseFloat(v); }
      if (/^(lon|lng|long)/.test(kl) || /_(lon|lng|long)/.test(kl)) { if (!isNaN(parseFloat(v))) lon = parseFloat(v); }
      if (v && typeof v === 'object' && Array.isArray(v.coordinates) && v.coordinates.length === 2 && typeof v.coordinates[0] === 'number') {
        lon = v.coordinates[0]; lat = v.coordinates[1];
      }
      if (v && typeof v === 'object' && v.latitude != null && v.longitude != null) {
        lat = parseFloat(v.latitude); lon = parseFloat(v.longitude);
      }
    });
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
    if (lat < 40.4 || lat > 41.0 || lon < -74.4 || lon > -73.5) return null; // outside NYC
    return { lat: lat, lon: lon };
  }

  function discoverNyc(report) {
    var queries = ['speed camera', 'red light camera', 'school zone speed camera', 'automated enforcement camera', 'speed camera locations'];
    var seen = {};
    return Promise.all(queries.map(function (q) {
      var url = SOCRATA_CATALOG + '?domains=data.cityofnewyork.us&limit=20&q=' + encodeURIComponent(q);
      return fetchJson(url, {}, 30000).then(function (j) {
        var all = j.results || [];
        report.push({ source: 'NYC search "' + q + '"', status: all.length ? 'ok' : 'no-coords',
          note: all.length + ' result(s): ' + all.slice(0, 8).map(function (r) {
            return r.resource.name + ' [' + r.resource.id + ', ' + r.resource.type + ']';
          }).join('; ') });
        return all.filter(function (r) {
          var n = r.resource.name || '';
          if (r.resource.type !== 'dataset' && r.resource.type !== 'map' && r.resource.type !== 'filter' ) return false;
          if (!/(speed|red.?light|camera)/i.test(n)) return false;
          if (/(violation|ticket|summons|parking|complaint|311|crash|collision|injur)/i.test(n)) return false;
          if (seen[r.resource.id]) return false;
          seen[r.resource.id] = true;
          return true;
        });
      }).catch(function (e) {
        report.push({ source: 'NYC search "' + q + '"', status: 'error', note: String(e.message || e) });
        return [];
      });
    })).then(function (groups) {
      var picks = [];
      groups.forEach(function (g) { picks = picks.concat(g); });
      picks = picks.slice(0, 8);
      return Promise.all(picks.map(function (p) {
        var n = p.resource.name || '';
        var type = /red.?light/i.test(n) ? 'redlight' : /(speed|school)/i.test(n) ? 'speed' : null;
        if (!type) {
          report.push({ source: n, status: 'no-coords', note: 'skipped: cannot tell if speed or red-light' });
          return [];
        }
        return fetchJson(NYC_HOST + '/resource/' + p.resource.id + '.json?$limit=5000', {}, 45000).then(function (rows) {
          var cams = [];
          rows.forEach(function (row) {
            var c = pickCoords(row);
            if (c) cams.push({ lat: c.lat, lon: c.lon, type: type, dir: null, src: 'nyc:' + p.resource.id, limit: null });
          });
          report.push({ source: n + ' [' + p.resource.id + ']', status: cams.length ? 'ok' : 'no-coords',
            note: rows.length + ' rows, ' + cams.length + ' usable as ' + type +
              (!cams.length && rows[0] ? '. Columns: ' + Object.keys(rows[0]).join(', ') : '') });
          return cams;
        }).catch(function (e) {
          report.push({ source: n, status: 'error', note: String(e.message || e) });
          return [];
        });
      })).then(function (arrs) {
        var flat = [];
        arrs.forEach(function (a) { flat = flat.concat(a); });
        return flat;
      });
    });
  }


  // ---- Schools: school-zone speed cameras sit near schools, so schools mark where cameras are likely.
  function loadSchoolsOsm() {
    var q = '[out:json][timeout:90];(nwr["amenity"="school"](' + BBOX + '););out center;';
    return overpass(q, 90000).then(function (j) {
      var out = [];
      (j.elements || []).forEach(function (el) {
        var lat = el.lat != null ? el.lat : (el.center && el.center.lat);
        var lon = el.lon != null ? el.lon : (el.center && el.center.lon);
        if (lat == null || lon == null) return;
        out.push({ lat: lat, lon: lon, name: (el.tags && el.tags.name) || '', src: 'osm' });
      });
      return out;
    });
  }

  function loadSchoolsNyc(report) {
    var queries = ['school locations', 'school point locations'];
    var seen = {};
    return Promise.all(queries.map(function (q) {
      var url = SOCRATA_CATALOG + '?domains=data.cityofnewyork.us&limit=20&q=' + encodeURIComponent(q);
      return fetchJson(url, {}, 30000).then(function (j) {
        var all = j.results || [];
        report.push({ source: 'NYC search "' + q + '"', status: all.length ? 'ok' : 'no-coords',
          note: all.length + ' result(s): ' + all.slice(0, 6).map(function (r) { return r.resource.name + ' [' + r.resource.id + ']'; }).join('; ') });
        return all.filter(function (r) {
          var n = r.resource.name || '';
          if (r.resource.type !== 'dataset') return false;
          if (!/school/i.test(n) || !/(location|point|site)/i.test(n)) return false;
          if (/(zone|district|attendance|boundary|enrollment|demographic|survey|report|safety|bus|lunch|meal|construction|capital)/i.test(n)) return false;
          if (seen[r.resource.id]) return false;
          seen[r.resource.id] = true;
          return true;
        });
      }).catch(function (e) {
        report.push({ source: 'NYC search "' + q + '"', status: 'error', note: String(e.message || e) });
        return [];
      });
    })).then(function (groups) {
      var picks = [];
      groups.forEach(function (g) { picks = picks.concat(g); });
      return Promise.all(picks.slice(0, 3).map(function (p) {
        return fetchJson(NYC_HOST + '/resource/' + p.resource.id + '.json?$limit=5000', {}, 45000).then(function (rows) {
          var out = [];
          rows.forEach(function (row) {
            var c = pickCoords(row);
            if (c) out.push({ lat: c.lat, lon: c.lon, name: row.location_name || row.school_name || row.name || row.loc_name || '', src: 'nyc:' + p.resource.id });
          });
          report.push({ source: p.resource.name + ' [' + p.resource.id + ']', status: out.length ? 'ok' : 'no-coords',
            note: rows.length + ' rows, ' + out.length + ' usable schools' +
              (!out.length && rows[0] ? '. Columns: ' + Object.keys(rows[0]).join(', ') : '') });
          return out;
        }).catch(function (e) {
          report.push({ source: p.resource.name, status: 'error', note: String(e.message || e) });
          return [];
        });
      })).then(function (arrs) {
        var flat = [];
        arrs.forEach(function (a) { flat = flat.concat(a); });
        return flat;
      });
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
    // Run after the camera query so we don't hit Overpass with two requests at once.
    var schoolsOsm = osm.then(function () { return loadSchoolsOsm(); }).then(function (s) {
      report.push({ source: 'OpenStreetMap schools', status: s.length ? 'ok' : 'no-coords', note: s.length + ' schools' });
      return s;
    }).catch(function (e) {
      report.push({ source: 'OpenStreetMap schools', status: 'error', note: String(e.message || e) });
      return [];
    });
    var schoolsNyc = loadSchoolsNyc(report).catch(function (e) {
      report.push({ source: 'NYC schools', status: 'error', note: String(e.message || e) });
      return [];
    });
    return Promise.all([osm, nyc, schoolsOsm, schoolsNyc]).then(function (r) {
      var all = CamLogic.dedupe(r[0].concat(r[1]), 20);
      var schools = CamLogic.dedupe(r[2].concat(r[3]), 60);
      return { cameras: all, schools: schools, report: report };
    });
  }

  root.CamData = { loadAll: loadAll };
})(self);
