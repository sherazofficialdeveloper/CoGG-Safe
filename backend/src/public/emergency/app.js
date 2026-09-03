/**
 * Public emergency page — vanilla JS, no build step, no third-party
 * script dependencies (so it works under a strict same-origin CSP).
 *
 * Data source of truth: GET /api/emergency/:token (see
 * backend/src/modules/sos/emergencyLink.* for what this returns and why).
 * This file only ever reads that endpoint; it never writes anything —
 * the public page is read-only by design.
 */
(function () {
  'use strict';

  var REFRESH_INTERVAL_MS = 15000;

  var els = {
    banner: document.getElementById('stateBanner'),
    content: document.getElementById('content'),
    userInfo: document.getElementById('userInfo'),
    emergencyMessage: document.getElementById('emergencyMessage'),
    sosMeta: document.getElementById('sosMeta'),
    locationBadge: document.getElementById('locationBadge'),
    mapWrap: document.getElementById('mapWrap'),
    mapFrame: document.getElementById('mapFrame'),
    locationText: document.getElementById('locationText'),
    locationUpdated: document.getElementById('locationUpdated'),
    frontImageWrap: document.getElementById('frontImageWrap'),
    backImageWrap: document.getElementById('backImageWrap'),
    audioWrap: document.getElementById('audioWrap'),
    lastFetched: document.getElementById('lastFetched'),
  };

  var pollTimer = null;

  function getTokenFromPath() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    // Expected shape: /e/<token>
    var idx = parts.indexOf('e');
    if (idx === -1 || !parts[idx + 1]) return null;
    return decodeURIComponent(parts[idx + 1]);
  }

  function showBanner(message) {
    els.banner.textContent = message;
    els.banner.hidden = false;
    els.content.hidden = true;
  }

  function showContent() {
    els.banner.hidden = true;
    els.content.hidden = false;
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function formatDateTime(value) {
    if (!value) return null;
    var d = new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString();
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function renderUserInfo(data) {
    els.userInfo.innerHTML = '';
    var rows = [
      ['Name', data.userName],
      ['Group', data.collectionName],
    ];
    if (data.userPhone) {
      rows.push(['Mobile', data.userPhone]);
    }
    rows.forEach(function (pair) {
      if (!pair[1]) return;
      var dt = el('dt', null, pair[0]);
      var dd = el('dd', null, pair[1]);
      els.userInfo.appendChild(dt);
      els.userInfo.appendChild(dd);
    });
  }

  function renderMessage(data) {
    els.emergencyMessage.textContent = data.emergencyMessage || 'No emergency message was provided.';
    var created = formatDateTime(data.createdAt);
    els.sosMeta.textContent = created
      ? 'Status: ' + (data.status || 'unknown') + ' · Triggered: ' + created
      : 'Status: ' + (data.status || 'unknown');
  }

  function buildMapEmbedUrl(lat, lon) {
    var delta = 0.01;
    var bbox = [lon - delta, lat - delta, lon + delta, lat + delta].join('%2C');
    return (
      'https://www.openstreetmap.org/export/embed.html?bbox=' +
      bbox +
      '&layer=mapnik&marker=' +
      lat +
      '%2C' +
      lon
    );
  }

  function buildMapLinkUrl(lat, lon) {
    return 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon + '#map=16/' + lat + '/' + lon;
  }

  function renderLocation(data) {
    var liveLocation = data.liveLocation || {};
    var initialLocation = data.location || {};
    var isLiveActive = liveLocation.status === 'active' && liveLocation.lastLocation;

    var coords = null;
    var capturedAt = null;
    var badgeText;
    var badgeClass;

    if (isLiveActive) {
      coords = liveLocation.lastLocation;
      capturedAt = liveLocation.lastLocation.capturedAt;
      badgeText = 'LIVE';
      badgeClass = 'live';
    } else if (liveLocation.lastLocation) {
      // Live tracking existed but has stopped/expired — this is the last
      // known point from live tracking, clearly NOT labelled "live".
      coords = liveLocation.lastLocation;
      capturedAt = liveLocation.lastLocation.capturedAt;
      badgeText = 'Last known location (live tracking ended)';
      badgeClass = 'stale';
    } else if (initialLocation && initialLocation.latitude != null && initialLocation.longitude != null) {
      coords = initialLocation;
      capturedAt = initialLocation.capturedAt;
      badgeText = 'Location at time of SOS';
      badgeClass = 'stale';
    } else {
      badgeText = 'Location unavailable';
      badgeClass = 'none';
    }

    els.locationBadge.textContent = badgeText;
    els.locationBadge.className = 'badge ' + badgeClass;

    if (coords && coords.latitude != null && coords.longitude != null) {
      els.mapFrame.src = buildMapEmbedUrl(coords.latitude, coords.longitude);
      els.mapWrap.hidden = false;
      var mapLink = buildMapLinkUrl(coords.latitude, coords.longitude);
      els.locationText.innerHTML =
        coords.latitude.toFixed(5) +
        ', ' +
        coords.longitude.toFixed(5) +
        ' — <a href="' +
        mapLink +
        '" target="_blank" rel="noopener noreferrer">Open larger map</a>';
      var updated = formatDateTime(capturedAt);
      els.locationUpdated.textContent = updated ? 'Last updated: ' + updated : '';
    } else {
      els.mapWrap.hidden = true;
      els.mapFrame.removeAttribute('src');
      els.locationText.textContent =
        initialLocation && initialLocation.error ? initialLocation.error : 'No location has been reported for this SOS yet.';
      els.locationUpdated.textContent = '';
    }
  }

  function renderImage(wrapEl, statusId, media, label) {
    wrapEl.innerHTML = '';
    if (media && media.url) {
      var img = document.createElement('img');
      img.alt = label;
      img.loading = 'lazy';
      img.onerror = function () {
        wrapEl.innerHTML = '';
        wrapEl.appendChild(el('p', 'unavailable', label + ' unavailable'));
      };
      img.src = media.url;
      wrapEl.appendChild(img);
      return;
    }

    var status = media ? media.status : null;
    var text;
    if (status === 'pending' || status === 'processing') {
      text = label + ' pending — will appear once uploaded';
    } else if (status === 'failed') {
      text = label + ' unavailable' + (media.error ? ': ' + media.error : '');
    } else {
      text = label + ' unavailable';
    }
    wrapEl.appendChild(el('p', 'unavailable', text));
  }

  function renderAudio(wrapEl, media) {
    wrapEl.innerHTML = '';
    if (media && media.url) {
      var audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      // Deliberately no "autoplay" — the spec requires normal, user-initiated playback.
      audio.onerror = function () {
        wrapEl.innerHTML = '';
        wrapEl.appendChild(el('p', 'unavailable', 'Audio unavailable'));
      };
      audio.src = media.url;
      wrapEl.appendChild(audio);
      return;
    }

    var status = media ? media.status : null;
    var text;
    if (status === 'pending' || status === 'processing') {
      text = 'Audio pending — will appear once uploaded';
    } else if (status === 'failed') {
      text = 'Audio unavailable' + (media.error ? ': ' + media.error : '');
    } else {
      text = 'Audio unavailable';
    }
    wrapEl.appendChild(el('p', 'unavailable', text));
  }

  function renderMedia(data) {
    var media = data.media || {};
    renderImage(els.frontImageWrap, 'frontImageStatus', media.frontImage, 'Front image');
    renderImage(els.backImageWrap, 'backImageStatus', media.backImage, 'Back image');
    renderAudio(els.audioWrap, media.audio);
  }

  function render(data) {
    renderUserInfo(data);
    renderMessage(data);
    renderLocation(data);
    renderMedia(data);
    showContent();
    els.lastFetched.textContent = 'Page updated: ' + new Date().toLocaleTimeString();
  }

  function fetchAndRender(token) {
    fetch('/api/emergency/' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 404) {
          stopPolling();
          showBanner('Emergency link is invalid or unavailable.');
          return null;
        }
        if (!res.ok) {
          // Transient/backend error — keep polling, the link itself may
          // still be good once the backend recovers.
          showBanner('Unable to load emergency information right now. Retrying…');
          return null;
        }
        return res.json();
      })
      .then(function (body) {
        if (!body || !body.data) return;
        render(body.data);
      })
      .catch(function () {
        showBanner('Unable to load emergency information right now. Retrying…');
      });
  }

  function init() {
    var token = getTokenFromPath();
    if (!token) {
      showBanner('Emergency link is invalid or unavailable.');
      return;
    }

    fetchAndRender(token);
    pollTimer = setInterval(function () {
      fetchAndRender(token);
    }, REFRESH_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
