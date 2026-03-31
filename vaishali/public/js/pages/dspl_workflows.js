(function () {
	'use strict';

	/**
	 * DSPL Workflows — Interactive Guide
	 *
	 * A secure, accessible page for role-based workflow tutorials.
	 * Uses safe DOM manipulation (no innerHTML) to prevent XSS vulnerabilities.
	 *
	 * Key features:
	 * - Role-based access control (System Manager only)
	 * - Asynchronous tutorial loading via API
	 * - Tab switching with dynamic content rendering
	 * - Expandable workflow sections
	 * - Comprehensive error handling
	 * - Accessibility features (ARIA, keyboard navigation)
	 */

	var WORKFLOWS = {};

	/**
	 * Initialize the page
	 * Performs role check and starts the loading process
	 */
	function init() {
		// Check if user is System Manager
		if (!frappe.has_role('System Manager')) {
			showAccessDenied();
			return;
		}

		// Show loading state
		showLoadingState();

		// Load tutorials from API
		loadTutorials();

		// Setup event listeners
		setupTabSwitching();
	}

	/**
	 * Display access denied message for non-admin users
	 */
	function showAccessDenied() {
		var errorContainer = document.getElementById('error-state');
		var errorMessageEl = document.getElementById('error-message');
		var loadingContainer = document.getElementById('loading-state');

		if (loadingContainer) {
			loadingContainer.style.display = 'none';
		}

		if (errorContainer && errorMessageEl) {
			errorMessageEl.textContent = 'Access Denied. Only System Managers can access this guide.';
			errorContainer.classList.add('visible');
		}
	}

	/**
	 * Show loading state
	 */
	function showLoadingState() {
		var loadingContainer = document.getElementById('loading-state');
		var errorContainer = document.getElementById('error-state');

		if (loadingContainer) {
			loadingContainer.style.display = 'flex';
		}
		if (errorContainer) {
			errorContainer.classList.remove('visible');
		}
	}

	/**
	 * Hide loading state
	 */
	function hideLoadingState() {
		var loadingContainer = document.getElementById('loading-state');
		if (loadingContainer) {
			loadingContainer.style.display = 'none';
		}
	}

	/**
	 * Display error message safely
	 * @param {string} message - Error message to display
	 */
	function showError(message) {
		hideLoadingState();

		var errorContainer = document.getElementById('error-state');
		var errorMessageEl = document.getElementById('error-message');

		if (errorContainer && errorMessageEl) {
			// Use textContent instead of innerHTML to prevent XSS
			errorMessageEl.textContent = message || 'An unexpected error occurred. Please try again.';
			errorContainer.classList.add('visible');
		}
	}

	/**
	 * Hide error state
	 */
	function hideErrorState() {
		var errorContainer = document.getElementById('error-state');
		if (errorContainer) {
			errorContainer.classList.remove('visible');
		}
	}

	/**
	 * Fetch tutorials from API endpoint
	 * Uses frappe.call() for safe AJAX with CSRF protection
	 */
	function loadTutorials() {
		frappe.call({
			method: 'vaishali.api.workflows.get_tutorials',
			callback: function (r) {
				if (r.message) {
					WORKFLOWS = r.message;
					renderTutorials(WORKFLOWS);
					hideLoadingState();
					hideErrorState();
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
						// Fallback to default error message
					}
				}
				showError(errorMsg);
			}
		});
	}

	/**
	 * Render tutorial content for all tabs
	 * @param {object} data - Tutorial data from API
	 */
	function renderTutorials(data) {
		var roles = ['sales', 'field', 'hr', 'operations'];

		roles.forEach(function (role) {
			var contentContainer = document.getElementById(role + '-workflows');
			if (contentContainer && data[role]) {
				renderRoleContent(contentContainer, data[role]);
			}
		});

		// Setup expandable sections after rendering
		setupExpandableSections();
	}

	/**
	 * Render content for a specific role
	 * @param {HTMLElement} container - Target container element
	 * @param {array} workflows - Array of workflow objects
	 */
	function renderRoleContent(container, workflows) {
		// Clear existing content
		container.textContent = '';

		if (!Array.isArray(workflows) || workflows.length === 0) {
			renderEmptyState(container);
			return;
		}

		// Create workflow sections
		workflows.forEach(function (workflow, index) {
			var section = createWorkflowSection(workflow, index);
			container.appendChild(section);
		});
	}

	/**
	 * Create a workflow section element
	 * @param {object} workflow - Workflow data object
	 * @param {number} index - Section index for unique IDs
	 * @returns {HTMLElement} Workflow section element
	 */
	function createWorkflowSection(workflow, index) {
		var section = document.createElement('div');
		section.className = 'workflow-section';
		section.setAttribute('data-workflow-index', index);

		// Create header
		var header = createWorkflowHeader(workflow.name, index);
		section.appendChild(header);

		// Create body
		var body = createWorkflowBody(workflow, index);
		section.appendChild(body);

		// Add click handler for expandable functionality
		header.addEventListener('click', function (e) {
			e.preventDefault();
			toggleWorkflowSection(section);
		});

		// Allow keyboard navigation (Enter/Space)
		header.addEventListener('keydown', function (e) {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggleWorkflowSection(section);
			}
		});

		return section;
	}

	/**
	 * Create workflow section header
	 * @param {string} title - Header title
	 * @param {number} index - Section index
	 * @returns {HTMLElement} Header element
	 */
	function createWorkflowHeader(title, index) {
		var header = document.createElement('div');
		header.className = 'workflow-header';
		header.setAttribute('role', 'button');
		header.setAttribute('tabindex', '0');
		header.setAttribute('aria-expanded', 'false');
		header.setAttribute('aria-controls', 'workflow-body-' + index);

		// Title
		var titleEl = document.createElement('div');
		titleEl.className = 'workflow-header-title';
		titleEl.textContent = title;

		// Icon
		var icon = document.createElement('div');
		icon.className = 'workflow-header-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = '▼';

		header.appendChild(titleEl);
		header.appendChild(icon);

		return header;
	}

	/**
	 * Create workflow section body
	 * @param {object} workflow - Workflow data object
	 * @param {number} index - Section index
	 * @returns {HTMLElement} Body element
	 */
	function createWorkflowBody(workflow, index) {
		var body = document.createElement('div');
		body.className = 'workflow-body';
		body.id = 'workflow-body-' + index;

		var content = document.createElement('div');
		content.className = 'workflow-body-content';

		// Render description if available
		if (workflow.description) {
			var desc = document.createElement('p');
			desc.textContent = workflow.description;
			content.appendChild(desc);
		}

		// Render steps if available
		if (Array.isArray(workflow.steps) && workflow.steps.length > 0) {
			var stepsContainer = createStepsContainer(workflow.steps);
			content.appendChild(stepsContainer);
		}

		// Render info boxes if available
		if (Array.isArray(workflow.info_boxes) && workflow.info_boxes.length > 0) {
			workflow.info_boxes.forEach(function (box) {
				var boxEl = createInfoBox(box);
				content.appendChild(boxEl);
			});
		}

		body.appendChild(content);
		return body;
	}

	/**
	 * Create steps container
	 * @param {array} steps - Array of step objects
	 * @returns {HTMLElement} Steps container
	 */
	function createStepsContainer(steps) {
		var container = document.createElement('div');
		container.className = 'tutorial-steps';

		steps.forEach(function (step, stepIndex) {
			var stepEl = createStep(step, stepIndex + 1);
			container.appendChild(stepEl);
		});

		return container;
	}

	/**
	 * Create a single step element
	 * @param {object} step - Step data object
	 * @param {number} stepNumber - Step number (1-indexed)
	 * @returns {HTMLElement} Step element
	 */
	function createStep(step, stepNumber) {
		var stepEl = document.createElement('div');
		stepEl.className = 'step';

		// Step number badge
		var numberBadge = document.createElement('div');
		numberBadge.className = 'step-number';
		numberBadge.setAttribute('aria-label', 'Step ' + stepNumber);
		numberBadge.textContent = stepNumber;

		// Step content
		var content = document.createElement('div');
		content.className = 'step-content';

		// Step title
		if (step.title) {
			var title = document.createElement('div');
			title.className = 'step-title';
			title.textContent = step.title;
			content.appendChild(title);
		}

		// Step description
		if (step.description) {
			var desc = document.createElement('div');
			desc.className = 'step-description';
			desc.textContent = step.description;
			content.appendChild(desc);
		}

		// Step screenshot placeholder
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

	/**
	 * Create an info box element (info, tips, warning)
	 * @param {object} box - Info box data object
	 * @returns {HTMLElement} Info box element
	 */
	function createInfoBox(box) {
		var boxEl = document.createElement('div');
		var boxType = box.type || 'info';
		boxEl.className = boxType + '-box';

		// Title
		if (box.title) {
			var titleEl = document.createElement('div');
			titleEl.className = boxType + '-box-title';
			titleEl.textContent = box.title;
			boxEl.appendChild(titleEl);
		}

		// Content/Text
		if (box.content) {
			var contentEl = document.createElement('div');
			contentEl.className = boxType + '-box-text';
			contentEl.textContent = box.content;
			boxEl.appendChild(contentEl);
		}

		return boxEl;
	}

	/**
	 * Render empty state when no workflows available
	 * @param {HTMLElement} container - Target container
	 */
	function renderEmptyState(container) {
		var emptyState = document.createElement('div');
		emptyState.className = 'empty-state';

		var icon = document.createElement('div');
		icon.className = 'empty-state-icon';
		icon.setAttribute('aria-hidden', 'true');
		icon.textContent = '📋';

		var title = document.createElement('div');
		title.className = 'empty-state-title';
		title.textContent = 'No workflows available';

		var text = document.createElement('div');
		text.className = 'empty-state-text';
		text.textContent = 'Workflows will be available soon. Please check back later.';

		emptyState.appendChild(icon);
		emptyState.appendChild(title);
		emptyState.appendChild(text);

		container.appendChild(emptyState);
	}

	/**
	 * Setup tab switching functionality
	 */
	function setupTabSwitching() {
		var tabButtons = document.querySelectorAll('.tab-button');

		tabButtons.forEach(function (button) {
			button.addEventListener('click', function (e) {
				e.preventDefault();
				var role = this.getAttribute('data-role');
				switchToTab(role, this);
			});

			// Keyboard navigation (Arrow keys)
			button.addEventListener('keydown', function (e) {
				var key = e.key;
				var currentIndex = Array.from(tabButtons).indexOf(this);

				if (key === 'ArrowRight' || key === 'ArrowDown') {
					e.preventDefault();
					var nextButton = tabButtons[currentIndex + 1];
					if (nextButton) {
						nextButton.focus();
						nextButton.click();
					}
				} else if (key === 'ArrowLeft' || key === 'ArrowUp') {
					e.preventDefault();
					var prevButton = tabButtons[currentIndex - 1];
					if (prevButton) {
						prevButton.focus();
						prevButton.click();
					}
				} else if (key === 'Home') {
					e.preventDefault();
					tabButtons[0].focus();
					tabButtons[0].click();
				} else if (key === 'End') {
					e.preventDefault();
					var lastButton = tabButtons[tabButtons.length - 1];
					lastButton.focus();
					lastButton.click();
				}
			});
		});
	}

	/**
	 * Switch to a specific tab and load its content
	 * @param {string} role - Role name (sales, field, hr, operations)
	 * @param {HTMLElement} clickedButton - The button that was clicked
	 */
	function switchToTab(role, clickedButton) {
		// Update active button state
		var allButtons = document.querySelectorAll('.tab-button');
		allButtons.forEach(function (btn) {
			btn.classList.remove('active');
			btn.setAttribute('aria-selected', 'false');
		});

		clickedButton.classList.add('active');
		clickedButton.setAttribute('aria-selected', 'true');

		// Hide all tab content
		var allContent = document.querySelectorAll('.tab-content');
		allContent.forEach(function (content) {
			content.classList.remove('active');
		});

		// Show active tab content
		var contentId = clickedButton.getAttribute('aria-controls');
		var activeContent = document.getElementById(contentId);
		if (activeContent) {
			activeContent.classList.add('active');
		}
	}

	/**
	 * Setup expandable sections for workflow headers
	 */
	function setupExpandableSections() {
		var workflowHeaders = document.querySelectorAll('.workflow-header');

		workflowHeaders.forEach(function (header) {
			// Remove any existing listeners by cloning
			var newHeader = header.cloneNode(true);
			header.parentNode.replaceChild(newHeader, header);

			// Add fresh listener
			newHeader.addEventListener('click', function (e) {
				e.preventDefault();
				toggleWorkflowSection(newHeader.closest('.workflow-section'));
			});

			// Keyboard support
			newHeader.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleWorkflowSection(newHeader.closest('.workflow-section'));
				}
			});
		});
	}

	/**
	 * Toggle workflow section expanded state
	 * @param {HTMLElement} section - Workflow section element
	 */
	function toggleWorkflowSection(section) {
		if (!section) {
			return;
		}

		var isExpanded = section.classList.contains('expanded');

		if (isExpanded) {
			section.classList.remove('expanded');
		} else {
			section.classList.add('expanded');
		}

		// Update ARIA attribute
		var header = section.querySelector('.workflow-header');
		if (header) {
			header.setAttribute('aria-expanded', !isExpanded);
		}
	}

	/**
	 * Public API for the page
	 */
	window.DSPLWorkflows = {
		init: init,
		loadTutorials: loadTutorials,
		renderTutorials: renderTutorials,
		showError: showError,
		switchToTab: switchToTab
	};

	// Initialize when document is ready
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		// DOM is already ready
		init();
	}
})();
