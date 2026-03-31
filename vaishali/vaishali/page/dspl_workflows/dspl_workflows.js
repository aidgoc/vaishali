frappe.pages['dspl-workflows'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'DSPL Workflows',
		single_column: true
	});

	// The HTML template is already loaded into wrapper by Frappe.
	// Initialize the page logic.
	init_workflows(wrapper);
};

function init_workflows(wrapper) {
	'use strict';

	var WORKFLOWS = {};

	// Check if user is System Manager
	if (!frappe.has_role('System Manager')) {
		show_access_denied(wrapper);
		return;
	}

	show_loading_state(wrapper);
	load_tutorials(wrapper);
	setup_tab_switching(wrapper);

	function show_access_denied(w) {
		var errorContainer = w.querySelector('#error-state');
		var errorMessageEl = w.querySelector('#error-message');
		var loadingContainer = w.querySelector('#loading-state');

		if (loadingContainer) loadingContainer.style.display = 'none';
		if (errorContainer && errorMessageEl) {
			errorMessageEl.textContent = 'Access Denied. Only System Managers can access this guide.';
			errorContainer.classList.add('visible');
		}
	}

	function show_loading_state(w) {
		var loadingContainer = w.querySelector('#loading-state');
		var errorContainer = w.querySelector('#error-state');
		if (loadingContainer) loadingContainer.style.display = 'flex';
		if (errorContainer) errorContainer.classList.remove('visible');
	}

	function hide_loading_state(w) {
		var loadingContainer = w.querySelector('#loading-state');
		if (loadingContainer) loadingContainer.style.display = 'none';
	}

	function show_error(w, message) {
		hide_loading_state(w);
		var errorContainer = w.querySelector('#error-state');
		var errorMessageEl = w.querySelector('#error-message');
		if (errorContainer && errorMessageEl) {
			errorMessageEl.textContent = message || 'An unexpected error occurred. Please try again.';
			errorContainer.classList.add('visible');
		}
	}

	function hide_error_state(w) {
		var errorContainer = w.querySelector('#error-state');
		if (errorContainer) errorContainer.classList.remove('visible');
	}

	function load_tutorials(w) {
		frappe.call({
			method: 'vaishali.api.workflows.get_tutorials',
			callback: function (r) {
				if (r.message) {
					WORKFLOWS = r.message;
					render_tutorials(w, WORKFLOWS);
					hide_loading_state(w);
					hide_error_state(w);
				}
			},
			error: function (r) {
				var errorMsg = 'Unable to load tutorials. Please refresh and try again.';
				if (r && r.responseJSON && r.responseJSON._server_messages) {
					try {
						var messages = JSON.parse(r.responseJSON._server_messages);
						if (Array.isArray(messages) && messages.length > 0) {
							errorMsg = messages[0];
						}
					} catch (e) {
						// fallback
					}
				}
				show_error(w, errorMsg);
			}
		});
	}

	function render_tutorials(w, data) {
		var roles = ['sales', 'field', 'hr', 'operations'];
		roles.forEach(function (role) {
			var contentContainer = w.querySelector('#' + role + '-workflows');
			if (contentContainer && data[role]) {
				render_role_content(contentContainer, data[role]);
			}
		});
		setup_expandable_sections(w);
	}

	function render_role_content(container, workflows) {
		container.textContent = '';
		if (!Array.isArray(workflows) || workflows.length === 0) {
			render_empty_state(container);
			return;
		}
		workflows.forEach(function (workflow, index) {
			var section = create_workflow_section(workflow, index);
			container.appendChild(section);
		});
	}

	function create_workflow_section(workflow, index) {
		var section = document.createElement('div');
		section.className = 'workflow-section';
		section.setAttribute('data-workflow-index', index);

		var header = create_workflow_header(workflow.name, index);
		section.appendChild(header);

		var body = create_workflow_body(workflow, index);
		section.appendChild(body);

		header.addEventListener('click', function (e) {
			e.preventDefault();
			toggle_workflow_section(section);
		});
		header.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle_workflow_section(section);
			}
		});

		return section;
	}

	function create_workflow_header(title, index) {
		var header = document.createElement('div');
		header.className = 'workflow-header';
		header.setAttribute('role', 'button');
		header.setAttribute('tabindex', '0');
		header.setAttribute('aria-expanded', 'false');
		header.setAttribute('aria-controls', 'workflow-body-' + index);

		var titleEl = document.createElement('div');
		titleEl.className = 'workflow-header-title';
		titleEl.textContent = title;

		var icon = document.createElement('div');
		icon.className = 'workflow-header-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = '\u25BC';

		header.appendChild(titleEl);
		header.appendChild(icon);
		return header;
	}

	function create_workflow_body(workflow, index) {
		var body = document.createElement('div');
		body.className = 'workflow-body';
		body.id = 'workflow-body-' + index;

		var content = document.createElement('div');
		content.className = 'workflow-body-content';

		if (workflow.description) {
			var desc = document.createElement('p');
			desc.textContent = workflow.description;
			content.appendChild(desc);
		}

		if (Array.isArray(workflow.steps) && workflow.steps.length > 0) {
			var stepsContainer = create_steps_container(workflow.steps);
			content.appendChild(stepsContainer);
		}

		if (Array.isArray(workflow.info_boxes) && workflow.info_boxes.length > 0) {
			workflow.info_boxes.forEach(function (box) {
				var boxEl = create_info_box(box);
				content.appendChild(boxEl);
			});
		}

		body.appendChild(content);
		return body;
	}

	function create_steps_container(steps) {
		var container = document.createElement('div');
		container.className = 'tutorial-steps';
		steps.forEach(function (step, stepIndex) {
			var stepEl = create_step(step, stepIndex + 1);
			container.appendChild(stepEl);
		});
		return container;
	}

	function create_step(step, stepNumber) {
		var stepEl = document.createElement('div');
		stepEl.className = 'step';

		var numberBadge = document.createElement('div');
		numberBadge.className = 'step-number';
		numberBadge.setAttribute('aria-label', 'Step ' + stepNumber);
		numberBadge.textContent = stepNumber;

		var content = document.createElement('div');
		content.className = 'step-content';

		if (step.title) {
			var title = document.createElement('div');
			title.className = 'step-title';
			title.textContent = step.title;
			content.appendChild(title);
		}
		if (step.description) {
			var desc = document.createElement('div');
			desc.className = 'step-description';
			desc.textContent = step.description;
			content.appendChild(desc);
		}
		if (step.screenshot_placeholder) {
			var screenshotContainer = document.createElement('div');
			screenshotContainer.className = 'step-screenshot';
			screenshotContainer.setAttribute('role', 'img');
			screenshotContainer.setAttribute('aria-label', 'Screenshot placeholder for step ' + stepNumber);
			screenshotContainer.textContent = step.screenshot_placeholder;
			content.appendChild(screenshotContainer);
		}

		stepEl.appendChild(numberBadge);
		stepEl.appendChild(content);
		return stepEl;
	}

	function create_info_box(box) {
		var boxEl = document.createElement('div');
		var boxType = box.type || 'info';
		boxEl.className = boxType + '-box';

		if (box.title) {
			var titleEl = document.createElement('div');
			titleEl.className = boxType + '-box-title';
			titleEl.textContent = box.title;
			boxEl.appendChild(titleEl);
		}
		if (box.content) {
			var contentEl = document.createElement('div');
			contentEl.className = boxType + '-box-text';
			contentEl.textContent = box.content;
			boxEl.appendChild(contentEl);
		}
		return boxEl;
	}

	function render_empty_state(container) {
		var emptyState = document.createElement('div');
		emptyState.className = 'empty-state';

		var title = document.createElement('div');
		title.className = 'empty-state-title';
		title.textContent = 'No workflows available';

		var text = document.createElement('div');
		text.className = 'empty-state-text';
		text.textContent = 'Workflows will be available soon. Please check back later.';

		emptyState.appendChild(title);
		emptyState.appendChild(text);
		container.appendChild(emptyState);
	}

	function setup_tab_switching(w) {
		var tabButtons = w.querySelectorAll('.tab-button');
		tabButtons.forEach(function (button) {
			button.addEventListener('click', function (e) {
				e.preventDefault();
				switch_to_tab(w, this);
			});
			button.addEventListener('keydown', function (e) {
				var currentIndex = Array.from(tabButtons).indexOf(this);
				if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
					e.preventDefault();
					var nextButton = tabButtons[currentIndex + 1];
					if (nextButton) { nextButton.focus(); nextButton.click(); }
				} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
					e.preventDefault();
					var prevButton = tabButtons[currentIndex - 1];
					if (prevButton) { prevButton.focus(); prevButton.click(); }
				}
			});
		});
	}

	function switch_to_tab(w, clickedButton) {
		var allButtons = w.querySelectorAll('.tab-button');
		allButtons.forEach(function (btn) {
			btn.classList.remove('active');
			btn.setAttribute('aria-selected', 'false');
		});
		clickedButton.classList.add('active');
		clickedButton.setAttribute('aria-selected', 'true');

		var allContent = w.querySelectorAll('.tab-content');
		allContent.forEach(function (content) {
			content.classList.remove('active');
		});

		var contentId = clickedButton.getAttribute('aria-controls');
		var activeContent = w.querySelector('#' + contentId);
		if (activeContent) activeContent.classList.add('active');
	}

	function setup_expandable_sections(w) {
		var workflowHeaders = w.querySelectorAll('.workflow-header');
		workflowHeaders.forEach(function (header) {
			var newHeader = header.cloneNode(true);
			header.parentNode.replaceChild(newHeader, header);
			newHeader.addEventListener('click', function (e) {
				e.preventDefault();
				toggle_workflow_section(newHeader.closest('.workflow-section'));
			});
			newHeader.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggle_workflow_section(newHeader.closest('.workflow-section'));
				}
			});
		});
	}

	function toggle_workflow_section(section) {
		if (!section) return;
		var isExpanded = section.classList.contains('expanded');
		if (isExpanded) {
			section.classList.remove('expanded');
		} else {
			section.classList.add('expanded');
		}
		var header = section.querySelector('.workflow-header');
		if (header) header.setAttribute('aria-expanded', !isExpanded);
	}
}
