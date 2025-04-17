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
            chart.getDatasetMeta(0).data[i].hidden = !visible;
        }
        
        // Update the chart with no animation
        const originalDuration = chart.options.animation.duration;
        chart.options.animation.duration = 0;
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