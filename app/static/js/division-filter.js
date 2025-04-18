// app/static/js/division-filter.js

/**
 * MLB ERA vs OPS Visualization - Division Filter Module
 * Handles division toggling and filtering functionality
 */

const MLBDivisionFilter = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // Store active divisions
    const state = {
        activeDivisions: new Set([
            'AL East', 'AL Central', 'AL West', 
            'NL East', 'NL Central', 'NL West'
        ]),
        initialized: false
    };
    
    /**
     * Initialize division toggle functionality
     */
    function initialize() {
        logger.log("Initializing division filter module");
        
        // Set up event listeners for division toggle buttons
        setupEventListeners();
        
        state.initialized = true;
        logger.log("Division filter module initialized with " + state.activeDivisions.size + " active divisions");
    }
    
    /**
     * Toggle all divisions in a league
     * @param {string} league - League identifier ('AL' or 'NL')
     */
    function toggleLeagueDivisions(league) {
        // Find all division toggle buttons for this league
        const divisionButtons = $(`.division-toggle[data-division^="${league}"]`);
        
        // Check if all division toggles in this league are currently active
        const allActive = divisionButtons.length === divisionButtons.filter('.active').length;
        
        // Check if there are any active divisions in the other league
        const otherLeaguePrefix = league === 'AL' ? 'NL' : 'AL';
        const otherLeagueButtons = $(`.division-toggle[data-division^="${otherLeaguePrefix}"]`);
        const otherLeagueActive = otherLeagueButtons.filter('.active').length > 0;
        
        if (allActive && otherLeagueActive) {
            // All divisions in this league are active, and there are active divisions in the other league
            // Deactivate all divisions in this league
            divisionButtons.each(function() {
                $(this).removeClass('active');
                const division = $(this).data('division');
                state.activeDivisions.delete(division);
                logger.log(`Removed division: ${division}`);
            });
        } else {
            // Either not all divisions in this league are active, or there are no active divisions in the other league
            // Activate all divisions in this league
            divisionButtons.each(function() {
                $(this).addClass('active');
                const division = $(this).data('division');
                state.activeDivisions.add(division);
                logger.log(`Added division: ${division}`);
            });
        }
        
        // Apply filter once after all toggles
        applyDivisionFilter();
        
        logger.log(`Toggled all ${league} divisions`);
    }
    
    /**
     * Set up event listeners for toggle buttons
     */
    function setupEventListeners() {
        // Division toggle click event
        $('.division-toggle').on('click', function() {
            const division = $(this).data('division');
            
            // Toggle active class
            $(this).toggleClass('active');
            
            // Update active divisions list
            if ($(this).hasClass('active')) {
                state.activeDivisions.add(division);
                logger.log("Added division: " + division);
            } else {
                state.activeDivisions.delete(division);
                logger.log("Removed division: " + division);
            }
            
            // Make sure we always have at least one division selected
            if (state.activeDivisions.size === 0) {
                $(this).addClass('active');
                state.activeDivisions.add(division);
                MLBConfig.showToast("At least one division must be selected", "info");
                return;
            }
            
            // Apply filter
            applyDivisionFilter();
        });
        
        // League label click event (new)
        $('.league-label').on('click', function() {
            const league = $(this).text().trim();
            toggleLeagueDivisions(league);
        });
    }
    
    /**
     * Apply division filter to chart
     */
    function applyDivisionFilter() {
        if (!window.mlbChart || !window.mlbChart.data || !window.mlbChart.data.datasets) {
            logger.error("Chart not initialized, cannot apply division filter");
            return;
        }
        
        // Get the chart instance
        const chart = window.mlbChart;
        
        // Get all teams from the dataset
        const allTeams = chart.data.datasets[0].data;
        if (!allTeams || allTeams.length === 0) {
            logger.error("No team data available in chart");
            return;
        }
        
        // Set visibility based on division filter
        for (let i = 0; i < allTeams.length; i++) {
            const team = allTeams[i];
            
            // Set hidden property based on division
            const visible = state.activeDivisions.has(team.division);
            const chartPoint = chart.getDatasetMeta(0).data[i];
            chartPoint.hidden = !visible;
            
            // ADDITIONAL CODE: Apply custom attribute to help with CSS targeting
            if (chartPoint._view && chartPoint._view.controlPoint) {
                chartPoint._view.controlPoint.skip = !visible;
            }
            
            // Set custom attribute that can be used by event handlers
            chartPoint.options = chartPoint.options || {};
            chartPoint.options.hoverEnabled = visible;
            chartPoint.options.events = visible ? ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'] : [];
        }
        
        // Force an update with specific options to avoid flickering
        const originalDuration = chart.options.animation.duration;
        chart.options.animation.duration = 0;
        
        // Add a custom hidden class to all hidden points for CSS targeting
        const canvas = chart.canvas;
        canvas.setAttribute('data-has-hidden', 'true');
        
        // Clear any existing hover states to prevent stuck tooltips
        chart.tooltip._active = [];
        
        // Update the chart
        chart.update();
        chart.options.animation.duration = originalDuration;
        
        logger.log("Applied division filter, showing divisions: " + Array.from(state.activeDivisions).join(', '));
    }
    
    /**
     * Reset division filter to show all divisions
     */
    function resetFilters() {
        // Select all division buttons
        $('.division-toggle').addClass('active');
        
        // Clear and re-add all divisions
        state.activeDivisions.clear();
        $('.division-toggle').each(function() {
            state.activeDivisions.add($(this).data('division'));
        });
        
        // Apply filter
        applyDivisionFilter();
        
        logger.log("Division filters reset");
    }
    
    /**
     * Get active divisions
     * @returns {Set} Set of active division names
     */
    function getActiveDivisions() {
        return new Set(state.activeDivisions);
    }
    
    // Public API
    return {
        initialize: initialize,
        applyDivisionFilter: applyDivisionFilter,
        resetFilters: resetFilters,
        getActiveDivisions: getActiveDivisions,
        isInitialized: function() { return state.initialized; }
    };
})(window, document, jQuery, MLBConfig);