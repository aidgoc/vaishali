/* daily_call_report_list.js — adds a "Map view" button to the DCR list */
frappe.listview_settings['Daily Call Report'] = {
	hide_name_column: false,
	onload: function (listview) {
		listview.page.add_inner_button(__('Map view'), function () {
			open_dcr_map(listview);
		});
	}
};

function load_leaflet() {
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

function parse_gps(s) {
	if (!s) return null;
	var parts = String(s).split(',');
	if (parts.length !== 2) return null;
	var lat = parseFloat(parts[0]);
	var lng = parseFloat(parts[1]);
	if (isNaN(lat) || isNaN(lng)) return null;
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
	return { lat: lat, lng: lng };
}

function status_color(status) {
	var s = (status || '').toLowerCase();
	if (s === 'completed') return '#16a34a';
	if (s === 'ongoing' || s === 'in progress') return '#f59e0b';
	return '#6b7280';
}

function svg_marker_icon(L, color) {
	var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">'
		+ '<path d="M14 1C6.82 1 1 6.82 1 14c0 9.5 13 22 13 22s13-12.5 13-22C27 6.82 21.18 1 14 1z" '
		+ 'fill="' + color + '" stroke="#fff" stroke-width="2"/>'
		+ '<circle cx="14" cy="14" r="5.5" fill="#fff"/>'
		+ '</svg>';
	return L.divIcon({
		html: svg,
		className: 'dcr-map-marker',
		iconSize: [28, 38],
		iconAnchor: [14, 38],
		popupAnchor: [0, -34]
	});
}

function format_time(iso) {
	if (!iso) return '';
	var d = new Date(String(iso).replace(' ', 'T'));
	if (isNaN(d.getTime())) return '';
	var h = d.getHours();
	var m = d.getMinutes();
	var ampm = h >= 12 ? 'PM' : 'AM';
	h = h % 12 || 12;
	return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

function build_map_container() {
	var c = document.createElement('div');
	c.className = 'dcr-map-container';
	c.style.cssText = 'width:100%;height:65vh;min-height:420px;border-radius:8px;overflow:hidden;background:#f1f1f1;display:flex;align-items:center;justify-content:center;color:#6b6b70';
	c.textContent = __('Loading…');
	return c;
}

function open_dcr_map(listview) {
	var filters = listview.get_filters_for_args ? listview.get_filters_for_args() : (listview.filter_area ? listview.filter_area.get() : []);

	var dialog = new frappe.ui.Dialog({
		title: __('Visits — Map view'),
		size: 'extra-large',
		fields: [
			{ fieldtype: 'HTML', fieldname: 'map_area' },
			{ fieldtype: 'HTML', fieldname: 'meta' }
		]
	});

	var bodyEl = dialog.get_field('map_area').$wrapper[0];
	while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
	var container = build_map_container();
	bodyEl.appendChild(container);

	var metaWrap = dialog.get_field('meta').$wrapper;
	metaWrap.css({ 'margin-top': '8px', 'font-size': '12px', color: '#6b6b70', 'text-align': 'center' });

	dialog.show();

	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Daily Call Report',
			filters: filters,
			fields: [
				'name', 'employee_name', 'date', 'status',
				'visit_purpose', 'service_purpose',
				'customer', 'customer_name', 'prospect_name',
				'check_in_time', 'check_in_gps',
				'check_out_time', 'check_out_gps'
			],
			order_by: 'date desc, check_in_time desc',
			limit_page_length: 500
		},
		callback: function (r) {
			var items = (r && r.message) || [];
			render_map(dialog, container, items);
		}
	});
}

function render_map(dialog, container, items) {
	var metaEl = dialog.get_field('meta').$wrapper[0];
	while (metaEl.firstChild) metaEl.removeChild(metaEl.firstChild);

	var points = [];
	var without_gps = 0;
	for (var i = 0; i < items.length; i++) {
		var dcr = items[i];
		var gps = parse_gps(dcr.check_in_gps) || parse_gps(dcr.check_out_gps);
		if (gps) points.push({ dcr: dcr, lat: gps.lat, lng: gps.lng });
		else without_gps++;
	}

	var metaText = items.length + ' visit' + (items.length === 1 ? '' : 's')
		+ ' · ' + points.length + ' on map'
		+ (without_gps ? ' · ' + without_gps + ' without GPS' : '');
	metaEl.appendChild(document.createTextNode(metaText));

	if (!points.length) {
		container.textContent = __('No visits with GPS coordinates match the current filters');
		return;
	}

	if (typeof _dcr_inject_pin_css === 'function') _dcr_inject_pin_css();
	load_leaflet().then(function (L) {
		container.textContent = '';
		container.style.display = 'block';

		var first = points[0];
		var map = L.map(container, { zoomControl: true, attributionControl: true })
			.setView([first.lat, first.lng], 12);

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '© OpenStreetMap'
		}).addTo(map);

		var bounds = [];
		for (var i = 0; i < points.length; i++) {
			(function (p) {
				var dcr = p.dcr;
				var who = dcr.customer_name || dcr.customer || dcr.prospect_name || __('Unknown');
				var purpose = dcr.visit_purpose || dcr.service_purpose || '';
				var time = format_time(dcr.check_in_time);
				var status = dcr.status || 'Planned';
				var employee = dcr.employee_name || '';

				var marker = L.marker([p.lat, p.lng], {
					icon: svg_marker_icon(L, status_color(status))
				}).addTo(map);

				var pop = document.createElement('div');
				pop.style.cssText = 'min-width:200px;font-size:13px';

				var who_el = document.createElement('div');
				who_el.style.cssText = 'font-weight:600;margin-bottom:4px';
				who_el.textContent = who;
				pop.appendChild(who_el);

				if (purpose) {
					var p_el = document.createElement('div');
					p_el.style.color = '#6b6b70';
					p_el.textContent = purpose;
					pop.appendChild(p_el);
				}

				var meta_el = document.createElement('div');
				meta_el.style.cssText = 'color:#6b6b70;margin-bottom:6px';
				meta_el.textContent = [employee, time, status].filter(Boolean).join(' · ');
				pop.appendChild(meta_el);

				var link = document.createElement('a');
				link.href = '/app/daily-call-report/' + encodeURIComponent(dcr.name);
				link.target = '_blank';
				link.style.cssText = 'color:#1a73e8;font-weight:500';
				link.textContent = __('Open visit') + ' →';
				pop.appendChild(link);

				marker.bindPopup(pop);
				bounds.push([p.lat, p.lng]);
			})(points[i]);
		}

		if (bounds.length > 1) {
			map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 });
		}

		setTimeout(function () { map.invalidateSize(); }, 200);
	}).catch(function (err) {
		container.textContent = __('Failed to load map: ') + (err.message || err);
	});
}
