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
        cleanButton: null,
        lastUpdatedTitleElem: null,
        snapshotCountElem: null
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
        elements.cleanButton = $('#clean-button');
        elements.lastUpdatedTitleElem = $('#lastUpdatedTitle');
        elements.snapshotCountElem = $('#snapshot-count');
        
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
            elements.refreshButton.prop('disabled', true); // Add explicit disable
        } else {
            elements.statusIndicatorTitle.removeClass('active');
            elements.updateProgress.removeClass('visible');
            
            // Update last updated timestamp if available
            if (status.last_updated) {
                elements.lastUpdatedTitleElem.text(status.last_updated);
            }
            
            // Show the status as fresh or stale, but always show refresh button
            if (!status.cache_fresh) {
                elements.statusTextTitle.text('Stale');
            } else {
                elements.statusTextTitle.text('Fresh');
            }
            
            // CRITICAL FIX: Always show refresh button regardless of freshness
            elements.refreshButton.addClass('visible');
            elements.refreshButton.prop('disabled', false); // Explicitly enable
            elements.refreshButton.css('opacity', '1'); // Ensure it's fully visible
            
            // If there was an error, show it
            if (status.error) {
                MLBConfig.showToast(`Error: ${status.error}`, "error");
                logger.log("Error in update process:", status.error);
            }
            
            // Update snapshot count if available
            if (status.snapshot_count) {
                state.snapshotCount = status.snapshot_count;
                elements.snapshotCountElem.text(state.snapshotCount);
                
                // If snapshot count changes from 0 to non-zero, force a UI refresh
                if (state.snapshotCount > 0 && elements.snapshotCountElem.text() === '0') {
                    elements.snapshotCountElem.text(state.snapshotCount);
                    logger.log("Forced snapshot count update from 0 to " + state.snapshotCount);
                }
            }
        }
    }
    
    /**
     * Initialize the user interface
     */
    function initialize() {
        logger.log("UI initialization started");
        
        // Cache DOM elements for better performance
        cacheElements();
        
        // Set up event listeners
        setupEventListeners();
        
        // Always show refresh button on initialization (key change)
        elements.refreshButton.addClass('visible');
        elements.refreshButton.prop('disabled', false); // Ensure it's enabled
        elements.refreshButton.css('opacity', '1'); // Ensure it's visible
        
        // Check snapshot count after a short delay
        setTimeout(function() {
            // If snapshot count is still 0, try to fetch it
            if (elements.snapshotCountElem.text() === '0') {
                fetch('/api/update-status')
                    .then(response => response.json())
                    .then(status => {
                        if (status.snapshot_count > 0) {
                            elements.snapshotCountElem.text(status.snapshot_count);
                            logger.log("Updated snapshot count to " + status.snapshot_count);
                        }
                    })
                    .catch(error => logger.error("Error fetching snapshot count:", error));
            }
        }, 2000);
        
        logger.log("UI initialization completed");
    }
    
    // Public API
    return {
        initialize: initialize,
        updateStatusBar: updateStatusBar
    };
})(window, document, jQuery, MLBConfig);