// app/static/js/theme-toggler.js

/**
 * MLB ERA vs OPS Visualization - Theme Toggler
 * Handles switching between light and dark modes
 */

const ThemeToggler = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig ? MLBConfig.logger : console;
    
    // Theme state
    const state = {
        isDarkMode: true, // Default to dark mode
        initialized: false
    };
    
    /**
     * Initialize the theme toggler
     */
    function initialize() {
        logger.log("Initializing theme toggler");
        
        // Create toggle button if it doesn't exist
        if (!$('.theme-toggle').length) {
            createToggleButton();
        }
        
        // Setup event listeners
        setupEventListeners();
        
        // Check for saved preference in localStorage
        const savedTheme = localStorage.getItem('mlb-theme');
        
        if (savedTheme === 'light') {
            disableDarkMode(false); // Don't save again
        } else {
            // Enable dark mode by default
            enableDarkMode(false);
        }
        
        state.initialized = true;
        logger.log("Theme toggler initialized with mode: " + (state.isDarkMode ? "dark" : "light"));
    }
    
    /**
     * Create the new toggle button with checkbox
     */
    function createToggleButton() {
        // First make sure Font Awesome is loaded
        if (!$('link[href*="font-awesome"]').length) {
            // Add Font Awesome if not present
            $('head').append('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">');
        }
        
        const toggleBtn = $(`
            <div class="theme-toggle">
                <input type="checkbox" class="theme-checkbox" id="theme-toggle-checkbox" checked>
                <label class="theme-checkbox-label" for="theme-toggle-checkbox">
                    <i class="fas fa-moon"></i>
                    <i class="fas fa-sun"></i>
                    <div class="toggle-ball"></div>
                </label>
            </div>
        `);
        
        // Append to the hero-content
        $('.hero-content').append(toggleBtn);
    }
    
    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Toggle button click
        $('#theme-toggle-checkbox').on('change', function() {
            toggleDarkMode();
        });
    }
    
    /**
     * Toggle between dark and light mode
     */
    function toggleDarkMode() {
        if (state.isDarkMode) {
            disableDarkMode();
        } else {
            enableDarkMode();
        }
    }
    
    /**
     * Enable dark mode
     * @param {boolean} savePreference - Whether to save the preference to localStorage
     */
    function enableDarkMode(savePreference = true) {
        $('body').addClass('dark-mode');
        $('#theme-toggle-checkbox').prop('checked', true);
        state.isDarkMode = true;
        
        // Save preference if requested
        if (savePreference) {
            localStorage.setItem('mlb-theme', 'dark');
        }
        
        // Update chart if it exists
        updateChartTheme();
        
        logger.log("Dark mode enabled");
    }
    
    /**
     * Disable dark mode
     * @param {boolean} savePreference - Whether to save the preference to localStorage
     */
    function disableDarkMode(savePreference = true) {
        $('body').removeClass('dark-mode');
        $('#theme-toggle-checkbox').prop('checked', false);
        state.isDarkMode = false;
        
        // Save preference if requested
        if (savePreference) {
            localStorage.setItem('mlb-theme', 'light');
        }
        
        // Update chart if it exists
        updateChartTheme();
        
        logger.log("Light mode enabled");
    }
    
    /**
     * Update Chart.js theme
     */
    function updateChartTheme() {
        if (window.mlbChart) {
            const chart = window.mlbChart;
            const isDark = state.isDarkMode;
            
            try {
                // Update scales
                if (chart.options.scales.x) {
                    chart.options.scales.x.grid.color = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
                    chart.options.scales.x.ticks.color = isDark ? '#bdbdbd' : '#666';
                    chart.options.scales.x.title.color = isDark ? 'rgba(0, 77, 180, 0.9)' : 'rgba(0, 45, 114, 0.8)';
                }
                
                if (chart.options.scales.y) {
                    chart.options.scales.y.grid.color = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';
                    chart.options.scales.y.ticks.color = isDark ? '#bdbdbd' : '#666';
                    chart.options.scales.y.title.color = isDark ? 'rgba(255, 77, 109, 0.9)' : 'rgba(227, 25, 55, 0.8)';
                }
                
                // Update tooltips
                if (chart.options.plugins && chart.options.plugins.tooltip) {
                    chart.options.plugins.tooltip.backgroundColor = isDark ? 'rgba(45, 45, 45, 0.95)' : 'rgba(255, 255, 255, 0.95)';
                    chart.options.plugins.tooltip.titleColor = isDark ? '#f0f0f0' : MLBConfig.COLORS.blue;
                    chart.options.plugins.tooltip.bodyColor = isDark ? '#bdbdbd' : '#333';
                }
                
                // Update annotations
                if (chart.options.plugins && chart.options.plugins.annotation && chart.options.plugins.annotation.annotations) {
                    const annotations = chart.options.plugins.annotation.annotations;
                    
                    if (annotations.verticalLine) {
                        annotations.verticalLine.borderColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
                        if (annotations.verticalLine.label) {
                            annotations.verticalLine.label.backgroundColor = isDark ? 'rgba(45, 45, 45, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                            annotations.verticalLine.label.color = isDark ? '#bdbdbd' : '#666';
                        }
                    }
                    
                    if (annotations.horizontalLine) {
                        annotations.horizontalLine.borderColor = isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)';
                        if (annotations.horizontalLine.label) {
                            annotations.horizontalLine.label.backgroundColor = isDark ? 'rgba(45, 45, 45, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                            annotations.horizontalLine.label.color = isDark ? '#bdbdbd' : '#666';
                        }
                    }
                }
                
                // Update the chart
                chart.update();
                logger.log("Chart theme updated successfully");
            } catch (error) {
                logger.error("Error updating chart theme:", error);
            }
        }
    }
    
    // Public API
    return {
        initialize: initialize,
        toggleDarkMode: toggleDarkMode,
        isDarkMode: function() { return state.isDarkMode; },
        isInitialized: function() { return state.initialized; }
    };
})(window, document, jQuery, window.MLBConfig);

// Initialize when document is ready
$(document).ready(function() {
    // Wait a short time to ensure other scripts are loaded
    setTimeout(function() {
        ThemeToggler.initialize();
    }, 100);
});