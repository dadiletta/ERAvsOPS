// app/static/js/ui.js

/**
 * MLB ERA vs OPS Visualization - UI Module
 * Handles UI manipulation, DOM handling, and event listeners
 */

const MLBUI = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // App state
    const state = {
        snapshotCount: 0,
        resizeTimer: null
    };
    
    // DOM elements cached for performance
    const elements = {
        statusIndicatorTitle: null,
        statusTextTitle: null,
        updateProgress: null,
        progressBar: null,
        progressCount: null,
        refreshButton: null,
        lastUpdatedTitleElem: null,
        snapshotCountElem: null
        // Removed snapshotSelector
    };
    
    /**
     * Cache DOM elements for improved performance
     */
    function cacheElements() {
        elements.statusIndicatorTitle = $('#status-indicator-title');
        elements.statusTextTitle = $('#status-text-title');
        elements.updateProgress = $('#update-progress');
        elements.progressBar = $('#progress-bar');
        elements.progressCount = $('#progress-count');
        elements.refreshButton = $('#refresh-button');
        elements.lastUpdatedTitleElem = $('#lastUpdatedTitle');
        elements.snapshotCountElem = $('#snapshot-count');
        // Removed snapshotSelector
        
        logger.log("DOM elements cached");
    }
    
    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Refresh button click handler
        elements.refreshButton.on('click', function() {
            logger.log("Refresh button clicked");
            // Only start update if not already updating
            if (!MLBAPI.isUpdating()) {
                MLBAPI.startUpdate();
            } else {
                MLBConfig.showToast("Update already in progress", "info");
            }
        });
        
        // Removed snapshot selector change handler
        
        // Window resize handler
        $(window).on('resize', function() {
            // Debounce the resize event
            clearTimeout(state.resizeTimer);
            state.resizeTimer = setTimeout(function() {
                MLBChart.positionQuadrantLabels();
            }, 250);
        });
        
        logger.log("Event listeners initialized");
    }
    
    /**
     * Update the UI based on status
     */
    function updateStatusBar(status) {
        logger.log("Updating UI with status", status);
        
        // Update progress display
        if (status.in_progress) {
            elements.statusIndicatorTitle.addClass('active');
            elements.statusTextTitle.text('Updating');
            elements.updateProgress.addClass('visible');
            
            // Calculate percentage, ensuring it doesn't exceed 100%
            const teamsUpdated = Math.min(status.teams_updated, status.total_teams);
            const percent = status.total_teams > 0 
                ? (teamsUpdated / status.total_teams) * 100 
                : 0;
            
            // Cap at 100%
            const cappedPercent = Math.min(percent, 100);
            
            logger.log(`Update progress: ${teamsUpdated}/${status.total_teams} (${cappedPercent.toFixed(1)}%)`);
            
            // Update progress bar
            elements.progressBar.css('width', `${cappedPercent}%`);
            elements.progressCount.text(`${teamsUpdated}/${status.total_teams}`);
            
            // Hide refresh button during update
            elements.refreshButton.removeClass('visible');
        } else {
            elements.statusIndicatorTitle.removeClass('active');
            elements.updateProgress.removeClass('visible');
            
            // Update last updated timestamp if available
            if (status.last_updated) {
                elements.lastUpdatedTitleElem.text(status.last_updated);
            }
            
            // If cache is not fresh, show refresh button
            if (!status.cache_fresh) {
                elements.statusTextTitle.text('Stale');
                elements.refreshButton.addClass('visible');
            } else {
                elements.statusTextTitle.text('Fresh');
                elements.refreshButton.removeClass('visible');
            }
            
            // If there was an error, show it
            if (status.error) {
                MLBConfig.showToast(`Error: ${status.error}`, "error");
                logger.log("Error in update process:", status.error);
            }
            
            // Update snapshot count if available
            if (status.snapshot_count) {
                state.snapshotCount = status.snapshot_count;
                elements.snapshotCountElem.text(state.snapshotCount);
            }
        }
    }
    
    // Removed updateSnapshotSelector function
    
    /**
     * Initialize the user interface
     */
    function initialize() {
        logger.log("UI initialization started");
        
        // Cache DOM elements for better performance
        cacheElements();
        
        // Set up event listeners
        setupEventListeners();
        
        logger.log("UI initialization completed");
    }
    
    // Public API
    return {
        initialize: initialize,
        updateStatusBar: updateStatusBar
        // Removed updateSnapshotSelector
    };
})(window, document, jQuery, MLBConfig);