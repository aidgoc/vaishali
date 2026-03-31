frappe.pages['dspl-workflows'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'DSPL Workflows',
		single_column: true
	});

	// Build page structure into page.body using safe DOM methods
	build_page_structure(page.body);

	// Add CSS
	if (!document.getElementById('dspl-workflows-style')) {
		var style = document.createElement('style');
		style.id = 'dspl-workflows-style';
		style.textContent = get_page_css();
		document.head.appendChild(style);
	}

	init_workflows($(page.body)[0]);
};

function build_page_structure(body) {
	var $body = $(body);
	var container = document.createElement('div');
	container.className = 'dspl-workflows-container';

	// Header
	var header = document.createElement('header');
	header.className = 'dspl-wf-header';
	var headerContent = document.createElement('div');
	headerContent.className = 'dspl-wf-header-content';
	var h2 = document.createElement('h2');
	h2.className = 'dspl-wf-title';
	h2.textContent = 'DSPL Workflows \u2014 Interactive Guide';
	var desc = document.createElement('p');
	desc.className = 'dspl-wf-desc';
	desc.textContent = 'Learn step-by-step how to complete key workflows in the DSPL ERP system. Select your role below to view role-specific tutorials.';
	headerContent.appendChild(h2);
	headerContent.appendChild(desc);
	header.appendChild(headerContent);

	// Tabs
	var nav = document.createElement('nav');
	nav.className = 'dspl-wf-tabs';
	nav.setAttribute('role', 'tablist');
	nav.setAttribute('aria-label', 'Workflow roles');
	var roles = [
		{id: 'sales', label: 'Sales'},
		{id: 'field', label: 'Field'},
		{id: 'hr', label: 'HR'},
		{id: 'operations', label: 'Operations'}
	];
	roles.forEach(function(role, i) {
		var btn = document.createElement('button');
		btn.className = 'dspl-wf-tab' + (i === 0 ? ' active' : '');
		btn.setAttribute('role', 'tab');
		btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
		btn.setAttribute('aria-controls', role.id + '-content');
		btn.setAttribute('data-role', role.id);
		btn.textContent = role.label;
		nav.appendChild(btn);
	});
	header.appendChild(nav);
	container.appendChild(header);

	// Main content
	var main = document.createElement('main');
	main.className = 'dspl-wf-content';

	// Loading
	var loading = document.createElement('div');
	loading.className = 'dspl-wf-loading';
	loading.id = 'dspl-loading';
	var spinner = document.createElement('div');
	spinner.className = 'dspl-wf-spinner';
	var loadText = document.createElement('p');
	loadText.textContent = 'Loading workflows...';
	loading.appendChild(spinner);
	loading.appendChild(loadText);
	main.appendChild(loading);

	// Error
	var error = document.createElement('div');
	error.className = 'dspl-wf-error';
	error.id = 'dspl-error';
	error.style.display = 'none';
	var errTitle = document.createElement('div');
	errTitle.className = 'dspl-wf-error-title';
	errTitle.textContent = 'Unable to Load Workflows';
	var errMsg = document.createElement('div');
	errMsg.id = 'dspl-error-msg';
	errMsg.textContent = 'Please refresh and try again.';
	error.appendChild(errTitle);
	error.appendChild(errMsg);
	main.appendChild(error);

	// Tab panels
	roles.forEach(function(role, i) {
		var panel = document.createElement('div');
		panel.className = 'dspl-wf-tabpanel' + (i === 0 ? ' active' : '');
		panel.id = role.id + '-content';
		panel.setAttribute('role', 'tabpanel');
		var wfDiv = document.createElement('div');
		wfDiv.id = role.id + '-workflows';
		panel.appendChild(wfDiv);
		main.appendChild(panel);
	});

	container.appendChild(main);
	$body.append(container);
}

function get_page_css() {
	return ''
		+ '.dspl-workflows-container { max-width: 960px; margin: 0 auto; padding: 20px 16px; }'
		+ '.dspl-wf-header { margin-bottom: 24px; }'
		+ '.dspl-wf-title { font-size: 22px; font-weight: 700; letter-spacing: -0.04em; margin: 0 0 8px; color: var(--text-color, #1a1a1a); }'
		+ '.dspl-wf-desc { font-size: 14px; color: var(--text-muted, #6b6b70); margin: 0 0 20px; line-height: 1.5; }'
		+ '.dspl-wf-tabs { display: flex; gap: 0; border-bottom: 1px solid rgba(0,0,0,0.08); }'
		+ '.dspl-wf-tab { padding: 10px 20px; border: none; background: none; font-size: 14px; font-weight: 500; color: var(--text-muted, #6b6b70); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: color 0.15s, border-color 0.15s; }'
		+ '.dspl-wf-tab:hover { color: var(--text-color, #1a1a1a); }'
		+ '.dspl-wf-tab.active { color: #E60005; border-bottom-color: #E60005; font-weight: 600; }'
		+ '.dspl-wf-content { margin-top: 20px; }'
		+ '.dspl-wf-tabpanel { display: none; }'
		+ '.dspl-wf-tabpanel.active { display: block; }'
		+ '.dspl-wf-loading { display: flex; flex-direction: column; align-items: center; padding: 60px 0; color: var(--text-muted, #6b6b70); }'
		+ '.dspl-wf-spinner { width: 32px; height: 32px; border: 3px solid rgba(0,0,0,0.08); border-top-color: #E60005; border-radius: 50%; animation: dspl-spin 0.8s linear infinite; margin-bottom: 12px; }'
		+ '@keyframes dspl-spin { to { transform: rotate(360deg); } }'
		+ '.dspl-wf-error { text-align: center; padding: 40px 0; }'
		+ '.dspl-wf-error-title { font-size: 16px; font-weight: 600; color: #E60005; margin-bottom: 8px; }'
		+ '.dspl-wf-section { background: var(--fg-color, #fff); border: 1px solid rgba(0,0,0,0.06); border-radius: 10px; margin-bottom: 12px; overflow: hidden; }'
		+ '.dspl-wf-section-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; cursor: pointer; user-select: none; }'
		+ '.dspl-wf-section-header:hover { background: rgba(0,0,0,0.02); }'
		+ '.dspl-wf-section-title { font-size: 15px; font-weight: 600; color: var(--text-color, #1a1a1a); }'
		+ '.dspl-wf-section-icon { font-size: 12px; color: var(--text-muted, #6b6b70); transition: transform 0.2s; }'
		+ '.dspl-wf-section.expanded .dspl-wf-section-icon { transform: rotate(180deg); }'
		+ '.dspl-wf-section-body { display: none; padding: 0 20px 20px; border-top: 1px solid rgba(0,0,0,0.06); }'
		+ '.dspl-wf-section.expanded .dspl-wf-section-body { display: block; }'
		+ '.dspl-wf-steps { margin-top: 16px; }'
		+ '.dspl-wf-step { display: flex; gap: 14px; margin-bottom: 16px; }'
		+ '.dspl-wf-step-num { width: 28px; height: 28px; min-width: 28px; border-radius: 50%; background: #E60005; color: #fff; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; margin-top: 2px; }'
		+ '.dspl-wf-step-content { flex: 1; }'
		+ '.dspl-wf-step-title { font-size: 14px; font-weight: 600; color: var(--text-color, #1a1a1a); margin-bottom: 4px; }'
		+ '.dspl-wf-step-desc { font-size: 13px; color: var(--text-muted, #6b6b70); line-height: 1.5; }'
		+ '.dspl-wf-step-details { margin: 8px 0 0 0; padding-left: 16px; font-size: 13px; color: var(--text-muted, #6b6b70); }'
		+ '.dspl-wf-step-details li { margin-bottom: 4px; }'
		+ '.dspl-wf-step-expected { font-size: 12px; color: #22c55e; margin-top: 6px; font-weight: 500; }'
		+ '.dspl-wf-info-box { background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 12px 16px; border-radius: 0 8px 8px 0; margin-top: 16px; }'
		+ '.dspl-wf-info-box-title { font-size: 13px; font-weight: 600; color: #1e40af; margin-bottom: 4px; }'
		+ '.dspl-wf-info-box-text { font-size: 13px; color: #1e3a5f; line-height: 1.5; }'
		+ '.dspl-wf-quick-links { margin-top: 16px; }'
		+ '.dspl-wf-quick-links-title { font-size: 12px; font-weight: 500; color: var(--text-muted, #6b6b70); margin-bottom: 8px; }'
		+ '.dspl-wf-quick-link { display: inline-block; padding: 6px 14px; background: rgba(0,0,0,0.04); border-radius: 6px; font-size: 13px; color: var(--text-color, #1a1a1a); text-decoration: none; margin-right: 8px; margin-bottom: 8px; }'
		+ '.dspl-wf-quick-link:hover { background: rgba(0,0,0,0.08); text-decoration: none; color: var(--text-color, #1a1a1a); }'
		+ '.dspl-wf-empty { text-align: center; padding: 40px 0; color: var(--text-muted, #6b6b70); }'
		+ '.dspl-wf-status { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; margin-left: 8px; }'
		+ '.dspl-wf-status-auto { background: #dcfce7; color: #166534; }'
		+ '.dspl-wf-status-manual { background: #fef3c7; color: #92400e; }'
		+ '.dspl-wf-status-mobile { background: #dbeafe; color: #1e40af; }';
}

function init_workflows(container) {
	'use strict';

	if (!frappe.user.has_role('System Manager')) {
		var loading = container.querySelector('#dspl-loading');
		if (loading) loading.style.display = 'none';
		var err = container.querySelector('#dspl-error');
		if (err) {
			err.style.display = 'block';
			var msg = container.querySelector('#dspl-error-msg');
			if (msg) msg.textContent = 'Access Denied. Only System Managers can access this guide.';
		}
		return;
	}

	setup_tab_switching(container);
	load_tutorials(container);

	function load_tutorials(w) {
		frappe.call({
			method: 'vaishali.api.workflows.get_tutorials',
			callback: function (r) {
				var loading = w.querySelector('#dspl-loading');
				if (loading) loading.style.display = 'none';
				if (r.message) {
					render_tutorials(w, r.message);
				}
			},
			error: function () {
				var loading = w.querySelector('#dspl-loading');
				if (loading) loading.style.display = 'none';
				var err = w.querySelector('#dspl-error');
				if (err) err.style.display = 'block';
			}
		});
	}

	function render_tutorials(w, data) {
		var roles = ['sales', 'field', 'hr', 'operations'];
		roles.forEach(function (role) {
			var target = w.querySelector('#' + role + '-workflows');
			if (target && data[role]) {
				var workflows = data[role].workflows || data[role].modules || [];
				if (!Array.isArray(workflows) || workflows.length === 0) {
					var empty = document.createElement('div');
					empty.className = 'dspl-wf-empty';
					empty.textContent = 'No workflows available yet.';
					target.appendChild(empty);
					return;
				}
				workflows.forEach(function (wf, i) {
					target.appendChild(build_workflow_section(wf, role + '-' + i));
				});
			}
		});
	}

	function build_workflow_section(wf, id) {
		var section = document.createElement('div');
		section.className = 'dspl-wf-section';

		var header = document.createElement('div');
		header.className = 'dspl-wf-section-header';
		header.setAttribute('role', 'button');
		header.setAttribute('tabindex', '0');
		header.setAttribute('aria-expanded', 'false');

		var titleEl = document.createElement('span');
		titleEl.className = 'dspl-wf-section-title';
		titleEl.textContent = wf.name || 'Workflow';

		if (wf.status) {
			var statusEl = document.createElement('span');
			var statusClass = 'dspl-wf-status';
			if (wf.status === 'Automated') statusClass += ' dspl-wf-status-auto';
			else if (wf.status === 'Manual') statusClass += ' dspl-wf-status-manual';
			else if (wf.status === 'Mobile-first') statusClass += ' dspl-wf-status-mobile';
			statusEl.className = statusClass;
			statusEl.textContent = wf.status;
			titleEl.appendChild(document.createTextNode(' '));
			titleEl.appendChild(statusEl);
		}

		var icon = document.createElement('span');
		icon.className = 'dspl-wf-section-icon';
		icon.textContent = '\u25BC';

		header.appendChild(titleEl);
		header.appendChild(icon);

		var body = document.createElement('div');
		body.className = 'dspl-wf-section-body';

		if (Array.isArray(wf.steps) && wf.steps.length > 0) {
			var stepsDiv = document.createElement('div');
			stepsDiv.className = 'dspl-wf-steps';
			wf.steps.forEach(function (step, idx) {
				var stepEl = document.createElement('div');
				stepEl.className = 'dspl-wf-step';

				var num = document.createElement('div');
				num.className = 'dspl-wf-step-num';
				num.textContent = idx + 1;

				var content = document.createElement('div');
				content.className = 'dspl-wf-step-content';

				if (step.title) {
					var t = document.createElement('div');
					t.className = 'dspl-wf-step-title';
					t.textContent = step.title;
					content.appendChild(t);
				}
				if (step.description) {
					var d = document.createElement('div');
					d.className = 'dspl-wf-step-desc';
					d.textContent = step.description;
					content.appendChild(d);
				}
				if (Array.isArray(step.details) && step.details.length > 0) {
					var ul = document.createElement('ul');
					ul.className = 'dspl-wf-step-details';
					step.details.forEach(function (detail) {
						var li = document.createElement('li');
						li.textContent = detail;
						ul.appendChild(li);
					});
					content.appendChild(ul);
				}
				if (step.expected) {
					var exp = document.createElement('div');
					exp.className = 'dspl-wf-step-expected';
					exp.textContent = '\u2713 ' + step.expected;
					content.appendChild(exp);
				}

				stepEl.appendChild(num);
				stepEl.appendChild(content);
				stepsDiv.appendChild(stepEl);
			});
			body.appendChild(stepsDiv);
		}

		if (wf.what_happens_next) {
			var infoBox = document.createElement('div');
			infoBox.className = 'dspl-wf-info-box';
			var infoTitle = document.createElement('div');
			infoTitle.className = 'dspl-wf-info-box-title';
			infoTitle.textContent = 'What happens next?';
			var infoText = document.createElement('div');
			infoText.className = 'dspl-wf-info-box-text';
			infoText.textContent = wf.what_happens_next;
			infoBox.appendChild(infoTitle);
			infoBox.appendChild(infoText);
			body.appendChild(infoBox);
		}

		if (Array.isArray(wf.quick_links) && wf.quick_links.length > 0) {
			var linksDiv = document.createElement('div');
			linksDiv.className = 'dspl-wf-quick-links';
			var linksTitle = document.createElement('div');
			linksTitle.className = 'dspl-wf-quick-links-title';
			linksTitle.textContent = 'Quick links';
			linksDiv.appendChild(linksTitle);
			wf.quick_links.forEach(function (link) {
				var a = document.createElement('a');
				a.className = 'dspl-wf-quick-link';
				a.textContent = link.label || link.text;
				a.href = link.url || link.route || '#';
				linksDiv.appendChild(a);
			});
			body.appendChild(linksDiv);
		}

		section.appendChild(header);
		section.appendChild(body);

		header.addEventListener('click', function () {
			var expanded = section.classList.toggle('expanded');
			header.setAttribute('aria-expanded', expanded);
		});
		header.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				var expanded = section.classList.toggle('expanded');
				header.setAttribute('aria-expanded', expanded);
			}
		});

		return section;
	}

	function setup_tab_switching(w) {
		var tabs = w.querySelectorAll('.dspl-wf-tab');
		tabs.forEach(function (tab) {
			tab.addEventListener('click', function () {
				tabs.forEach(function (t) {
					t.classList.remove('active');
					t.setAttribute('aria-selected', 'false');
				});
				tab.classList.add('active');
				tab.setAttribute('aria-selected', 'true');

				var panels = w.querySelectorAll('.dspl-wf-tabpanel');
				panels.forEach(function (p) { p.classList.remove('active'); });
				var target = w.querySelector('#' + tab.getAttribute('aria-controls'));
				if (target) target.classList.add('active');
			});
		});
	}
}
