/* daily_call_report_form.js — embed a mini-map of the visit's GPS points */

function _dcr_load_leaflet() {
	if (window.L) return Promise.resolve(window.L);
	if (window._leafletLoading) return window._leafletLoading;
	window._leafletLoading = new Promise(function (resolve, reject) {
		var css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
		css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
		css.crossOrigin = '';
		document.head.appendChild(css);

		var script = document.createElement('script');
		script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
		script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
		script.crossOrigin = '';
		script.onload = function () { resolve(window.L); };
		script.onerror = function () { reject(new Error('Failed to load Leaflet')); };
		document.head.appendChild(script);
	});
	return window._leafletLoading;
}

function _dcr_parse_gps(s) {
	if (!s) return null;
	var parts = String(s).split(',');
	if (parts.length !== 2) return null;
	var lat = parseFloat(parts[0]);
	var lng = parseFloat(parts[1]);
	if (isNaN(lat) || isNaN(lng)) return null;
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
	return { lat: lat, lng: lng };
}

function _dcr_pin_icon(L, color, label) {
	var svgNS = 'http://www.w3.org/2000/svg';
	var svg = document.createElementNS(svgNS, 'svg');
	svg.setAttribute('width', '32');
	svg.setAttribute('height', '40');
	svg.setAttribute('viewBox', '0 0 32 40');

	var path = document.createElementNS(svgNS, 'path');
	path.setAttribute('d', 'M16 0C7.16 0 0 7.16 0 16c0 11 16 24 16 24s16-13 16-24C32 7.16 24.84 0 16 0z');
	path.setAttribute('fill', color);
	svg.appendChild(path);

	var circle = document.createElementNS(svgNS, 'circle');
	circle.setAttribute('cx', '16');
	circle.setAttribute('cy', '16');
	circle.setAttribute('r', '8');
	circle.setAttribute('fill', '#fff');
	svg.appendChild(circle);

	var text = document.createElementNS(svgNS, 'text');
	text.setAttribute('x', '16');
	text.setAttribute('y', '20');
	text.setAttribute('text-anchor', 'middle');
	text.setAttribute('font-size', '11');
	text.setAttribute('font-weight', '700');
	text.setAttribute('fill', color);
	text.textContent = label;
	svg.appendChild(text);

	var wrap = document.createElement('div');
	wrap.appendChild(svg);

	return L.divIcon({
		html: wrap,
		className: 'dcr-form-pin',
		iconSize: [32, 40],
		iconAnchor: [16, 40],
		popupAnchor: [0, -36]
	});
}

function _dcr_render_map(frm, mapDiv) {
	var inGps = _dcr_parse_gps(frm.doc.check_in_gps);
	var outGps = _dcr_parse_gps(frm.doc.check_out_gps);

	if (!inGps && !outGps) {
		mapDiv.style.display = 'none';
		return;
	}
	mapDiv.style.display = 'block';

	// Clear any previous map (form refreshes can re-run this)
	while (mapDiv.firstChild) mapDiv.removeChild(mapDiv.firstChild);
	if (mapDiv._leafletMap) {
		try { mapDiv._leafletMap.remove(); } catch (e) {}
		mapDiv._leafletMap = null;
	}

	var canvas = document.createElement('div');
	canvas.style.cssText = 'width:100%;height:320px;border-radius:8px;overflow:hidden;background:#f1f1f1;display:flex;align-items:center;justify-content:center;color:#6b6b70';
	canvas.textContent = __('Loading map…');
	mapDiv.appendChild(canvas);

	// Direction link (works without Leaflet)
	var actions = document.createElement('div');
	actions.style.cssText = 'margin-top:8px;display:flex;gap:12px;font-size:13px';

	function add_action(label, href) {
		var a = document.createElement('a');
		a.href = href;
		a.target = '_blank';
		a.rel = 'noopener';
		a.textContent = label;
		a.style.color = '#1a73e8';
		actions.appendChild(a);
	}
	if (inGps) add_action(__('Check-in in Google Maps'), 'https://www.google.com/maps?q=' + inGps.lat + ',' + inGps.lng);
	if (outGps) add_action(__('Check-out in Google Maps'), 'https://www.google.com/maps?q=' + outGps.lat + ',' + outGps.lng);
	if (inGps && outGps) {
		var dirHref = 'https://www.google.com/maps/dir/?api=1&origin=' + inGps.lat + ',' + inGps.lng
			+ '&destination=' + outGps.lat + ',' + outGps.lng;
		add_action(__('Directions'), dirHref);
	}
	mapDiv.appendChild(actions);

	_dcr_load_leaflet().then(function (L) {
		canvas.textContent = '';
		canvas.style.display = 'block';

		var center = inGps || outGps;
		var map = L.map(canvas, { zoomControl: true, attributionControl: true })
			.setView([center.lat, center.lng], 16);
		mapDiv._leafletMap = map;

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '© OpenStreetMap'
		}).addTo(map);

		var bounds = [];
		if (inGps) {
			L.marker([inGps.lat, inGps.lng], { icon: _dcr_pin_icon(L, '#16a34a', 'IN') })
				.addTo(map)
				.bindPopup(__('Check-in') + '<br>' + inGps.lat.toFixed(6) + ', ' + inGps.lng.toFixed(6));
			bounds.push([inGps.lat, inGps.lng]);
		}
		if (outGps) {
			L.marker([outGps.lat, outGps.lng], { icon: _dcr_pin_icon(L, '#dc2626', 'OUT') })
				.addTo(map)
				.bindPopup(__('Check-out') + '<br>' + outGps.lat.toFixed(6) + ', ' + outGps.lng.toFixed(6));
			bounds.push([outGps.lat, outGps.lng]);
		}
		if (inGps && outGps) {
			L.polyline([[inGps.lat, inGps.lng], [outGps.lat, outGps.lng]], {
				color: '#6b7280',
				weight: 2,
				dashArray: '6,4'
			}).addTo(map);
		}
		if (bounds.length > 1) {
			map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
		}
		setTimeout(function () { map.invalidateSize(); }, 200);
	}).catch(function (err) {
		canvas.textContent = __('Failed to load map: ') + (err.message || err);
	});
}

function _dcr_ensure_map_div(frm) {
	if (frm._dcrMapDiv && document.body.contains(frm._dcrMapDiv)) {
		return frm._dcrMapDiv;
	}
	var anchorField = frm.fields_dict.check_out_gps || frm.fields_dict.check_in_gps;
	if (!anchorField || !anchorField.$wrapper) return null;

	var mapDiv = document.createElement('div');
	mapDiv.className = 'dcr-form-map';
	mapDiv.style.cssText = 'margin:12px 0 4px;padding:0';

	var heading = document.createElement('div');
	heading.textContent = __('Visit map');
	heading.style.cssText = 'font-size:12px;font-weight:600;color:#6b6b70;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:8px';
	mapDiv.appendChild(heading);

	// Insert below the GPS field's section row
	var section = anchorField.$wrapper.closest('.section-body, .form-section').first();
	if (section.length) {
		section.after(mapDiv);
	} else {
		anchorField.$wrapper.after(mapDiv);
	}

	frm._dcrMapDiv = mapDiv;
	return mapDiv;
}

frappe.ui.form.on('Daily Call Report', {
	refresh: function (frm) {
		if (frm.doc.__islocal) return;
		var mapDiv = _dcr_ensure_map_div(frm);
		if (!mapDiv) return;
		_dcr_render_map(frm, mapDiv);
	},
	check_in_gps: function (frm) {
		var mapDiv = _dcr_ensure_map_div(frm);
		if (mapDiv) _dcr_render_map(frm, mapDiv);
	},
	check_out_gps: function (frm) {
		var mapDiv = _dcr_ensure_map_div(frm);
		if (mapDiv) _dcr_render_map(frm, mapDiv);
	}
});
