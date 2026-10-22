/* Pure alert logic for the camera-approach warning. No DOM, no network.
   Loaded as a global (CamLogic) in the browser and via require() in node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CamLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var MPH = 0.44704;
  var R = 6371000;
  var COMFORT_DECEL = 3.0;   // m/s^2, a firm-but-normal stop (~0.3 g)
  var REACTION_S = 1.0;      // s
  var WARN_LEAD_S = 4.0;     // warn this many seconds before reaching the "can't stop comfortably" point
  var INFO_RANGE_M = 450;    // "camera ahead" announcement range
  var AHEAD_CONE_DEG = 40;

  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }

  function distance(a, b) {
    var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function bearing(a, b) {
    var y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    var x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
      Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return (deg(Math.atan2(y, x)) + 360) % 360;
  }

  function angleDiff(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function destination(p, bearingDeg, meters) {
    var br = rad(bearingDeg), d = meters / R, la = rad(p.lat), lo = rad(p.lon);
    var la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
    var lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return { lat: deg(la2), lon: deg(lo2) };
  }

  // ITE-style yellow interval: 1 s perception + v / (2 * 10 ft/s^2), floored at NYC's 3 s practical minimum.
  function yellowSeconds(limitMph) {
    var vFps = limitMph * 1.46667;
    return Math.max(3, 1 + vFps / 20);
  }

  // Distance needed to stop comfortably from speed v (m/s), including reaction time.
  function stopDistance(v) {
    return v * REACTION_S + (v * v) / (2 * COMFORT_DECEL);
  }

  function dilemmaZone(v, limitMph) {
    var clear = v * yellowSeconds(limitMph);
    var stop = stopDistance(v);
    return { stopDist: stop, clearDist: clear, hasZone: stop > clear, nearM: clear, farM: stop };
  }

  function fmtDist(m) {
    var ft = m * 3.28084;
    return ft >= 1000 ? (m / 1609.34).toFixed(1) + ' mi' : Math.round(ft / 50) * 50 + ' ft';
  }

  var LABEL = { speed: 'Speed camera', redlight: 'Red-light camera', alpr: 'License-plate camera' };

  /* Decide what (if anything) to say about one camera right now.
     Returns { level: 0|1|2, text } where 1 = heads-up, 2 = ease off.
     opts: { speedMps, limitMph, showAlpr } */
  function assess(cam, distM, opts) {
    var v = opts.speedMps, limit = opts.limitMph;
    var vMph = v / MPH;
    var label = LABEL[cam.type] || 'Camera';
    if (cam.type === 'alpr') {
      if (!opts.showAlpr || distM > INFO_RANGE_M) return { level: 0 };
      return { level: 1, text: label + ' ahead, ' + fmtDist(distM) + '.' };
    }
    if (v < 2.2) return { level: 0 };                       // basically stopped/crawling
    if (distM > INFO_RANGE_M && distM > stopDistance(v) + v * WARN_LEAD_S) return { level: 0 };

    if (cam.type === 'speed') {
      var over = vMph - limit;
      if (over > 2 && distM < Math.max(INFO_RANGE_M, v * 8)) {
        return { level: 2, text: 'Speed camera ' + fmtDist(distM) + ' ahead. You are doing ' +
          Math.round(vMph) + ', limit ' + limit + '. Ease off.' };
      }
      return { level: 1, text: label + ' ahead, ' + fmtDist(distM) + '. Limit ' + limit + '.' };
    }

    // Red-light camera: warn before the point where a comfortable stop is no longer possible.
    var stopD = stopDistance(v);
    var warnAt = stopD + v * WARN_LEAD_S;
    if (distM <= warnAt && distM > stopD * 0.6) {
      return { level: 2, text: 'Red-light camera ' + fmtDist(distM) + ' ahead at ' + Math.round(vMph) +
        '. Ease off now so you can stop smoothly if it changes.' };
    }
    if (distM <= stopD * 0.6) return { level: 0 };           // already committed; do not coach braking
    return { level: 1, text: label + ' ahead, ' + fmtDist(distM) + '.' };
  }

  /* Cameras ahead of the driver, nearest first. */
  function camerasAhead(cams, pos, headingDeg, maxM) {
    var out = [];
    for (var i = 0; i < cams.length; i++) {
      var c = cams[i];
      if (Math.abs(c.lat - pos.lat) > 0.01 || Math.abs(c.lon - pos.lon) > 0.015) continue; // cheap prefilter (~1 km)
      var d = distance(pos, c);
      if (d > maxM || d < 8) continue;
      if (headingDeg != null) {
        if (angleDiff(bearing(pos, c), headingDeg) > AHEAD_CONE_DEG) continue;
        // Cameras tagged with a facing direction only matter when we drive toward them.
        if (c.dir != null && angleDiff(c.dir, (headingDeg + 180) % 360) > 75) continue;
      }
      out.push({ cam: c, dist: d });
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out;
  }

  function dedupe(cams, meters) {
    var out = [], deg = meters / 90000 + 0.0001; // cheap lat/lon prefilter before haversine
    cams.forEach(function (c) {
      for (var i = 0; i < out.length; i++) {
        var o = out[i];
        if (Math.abs(o.lat - c.lat) > deg || Math.abs(o.lon - c.lon) > deg * 1.4) continue;
        if (o.type === c.type && distance(o, c) < meters) return;
      }
      out.push(c);
    });
    return out;
  }

  var SCHOOL_RADIUS_M = 300;    // NYC school speed cameras sit within about a quarter mile of the school
  var SCHOOL_LIMIT_MPH = 25;

  /* Schools within radiusM of the driver, nearest first (a school zone surrounds the school, so no heading cone). */
  function nearSchools(schools, pos, radiusM) {
    var out = [];
    for (var i = 0; i < schools.length; i++) {
      var s = schools[i];
      if (Math.abs(s.lat - pos.lat) > 0.006 || Math.abs(s.lon - pos.lon) > 0.008) continue;
      var d = distance(pos, s);
      if (d <= radiusM) out.push({ school: s, dist: d });
    }
    out.sort(function (a, b) { return a.dist - b.dist; });
    return out;
  }

  /* Level 1 is on-screen only (silent); level 2 means over the school-zone limit. */
  function assessSchool(distM, opts) {
    var limit = Math.min(opts.limitMph, SCHOOL_LIMIT_MPH);
    var vMph = opts.speedMps / MPH;
    if (opts.speedMps < 2.2) return { level: 0 };
    if (vMph > limit + 2) {
      return { level: 2, text: 'School zone. Speed cameras possible. You are doing ' + Math.round(vMph) +
        ', limit ' + limit + '. Ease off.' };
    }
    return { level: 1, silent: true, text: 'School zone nearby. Speed cameras possible. Limit ' + limit + '.' };
  }

  return {
    MPH: MPH, distance: distance, bearing: bearing, angleDiff: angleDiff, destination: destination,
    yellowSeconds: yellowSeconds, stopDistance: stopDistance, dilemmaZone: dilemmaZone,
    assess: assess, camerasAhead: camerasAhead, dedupe: dedupe, fmtDist: fmtDist,
    nearSchools: nearSchools, assessSchool: assessSchool, SCHOOL_RADIUS_M: SCHOOL_RADIUS_M,
    INFO_RANGE_M: INFO_RANGE_M
  };
});
