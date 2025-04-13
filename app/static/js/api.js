// app/static/js/api.js

/**
 * MLB ERA vs OPS Visualization - API Module
 * Handles all API calls and data fetching
 */

const MLBAPI = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    const showToast = MLBConfig.showToast;
    
    // API state
    const state = {
        updateRetries: 0,
        updateTimer: null,
        isUpdating: false,
        lastUpdateTimestamp: null
    };
    
    /**
     * Check for updates with improved error handling
     */
    function checkUpdateStatus() {
        logger.log("Checking update status...");
        
        $.ajax({
            url: '/api/update-status',
            method: 'GET',
            dataType: 'json',
            success: function(status) {
                logger.log("Received update status", status);
                
                // Reset retry counter on successful response
                state.updateRetries = 0;
                
                // Update UI based on status
                MLBUI.updateStatusBar(status);
                
                // If an update is in progress, continue polling
                if (status.in_progress) {
                    // Continue the update process if we're not at 100%
                    if (status.teams_updated < status.total_teams) {
                        logger.log(`Continuing update: ${status.teams_updated}/${status.total_teams}`);
                        continueUpdate();
                    } else {
                        logger.log("All teams updated, waiting for process to complete");
                    }
                    
                    // Schedule next status check
                    state.updateTimer = setTimeout(checkUpdateStatus, MLBConfig.APP.updateInterval);
                } else {
                    // If update just completed, fetch fresh data
                    if (state.isUpdating) {
                        logger.log("Update process completed, fetching fresh data");
                        state.isUpdating = false;
                        fetchFreshData();
                    }
                    
                    // If data is stale, start automatic update
                    if (!status.cache_fresh && !state.isUpdating) {
                        logger.log("Data is stale, starting automatic update");
                        startUpdate();
                    }
                }
            },
            error: function(xhr, status, error) {
                console.error("Error checking update status:", error);
                logger.log("AJAX error details:", {xhr: xhr, status: status, error: error});
                
                // Show error toast with more details
                showToast(`Error checking updates: ${error}`, "error");
                
                // Increment retry counter
                state.updateRetries++;
                
                // Clear any existing timer
                if (state.updateTimer) {
                    clearTimeout(state.updateTimer);
                    state.updateTimer = null;
                }
                
                // Retry a few times before giving up
                if (state.updateRetries < MLBConfig.APP.maxRetries) {
                    logger.log(`Retrying update status check (${state.updateRetries}/${MLBConfig.APP.maxRetries})`);
                    state.updateTimer = setTimeout(checkUpdateStatus, MLBConfig.APP.updateInterval);
                } else {
                    logger.log("Maximum retries reached, stopping update process");
                    state.isUpdating = false;
                    showToast("Update failed after multiple attempts", "error");
                }
            }
        });
    }
    
    /**
     * Start the update process with improved error handling
     */
    function startUpdate() {
        // Don't start if already updating
        if (state.isUpdating) {
            logger.log("Update already in progress, not starting a new one");
            return;
        }
        
        logger.log("Starting data update process");
        state.isUpdating = true;
        state.updateRetries = 0;
        showToast("Starting data update...", "info");
        
        $.ajax({
            url: '/api/start-update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ batch_size: MLBConfig.APP.batchSize }),
            dataType: 'json',
            success: function(status) {
                logger.log("Update started successfully", status);
                
                // Update UI based on status
                MLBUI.updateStatusBar(status);
                
                // Schedule status check
                state.updateTimer = setTimeout(checkUpdateStatus, MLBConfig.APP.updateInterval);
            },
            error: function(xhr, status, error) {
                console.error("Error starting update:", error);
                logger.log("AJAX error details:", {xhr: xhr, status: status, error: error});
                
                // Show detailed error message
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    showToast(`Error: ${xhr.responseJSON.error}`, "error");
                } else {
                    showToast(`Error starting update: ${error}`, "error");
                }
                
                state.isUpdating = false;
            }
        });
    }
    
    /**
     * Continue the update process with improved error handling
     */
    function continueUpdate() {
        logger.log("Continuing update process");
        
        $.ajax({
            url: '/api/continue-update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ batch_size: MLBConfig.APP.batchSize }),
            dataType: 'json',
            success: function(status) {
                logger.log("Update continued successfully", status);
                
                // Update UI based on status
                MLBUI.updateStatusBar(status);
                
                // If we've made progress, show a toast
                if (status.teams_updated > 0) {
                    const percent = ((status.teams_updated / status.total_teams) * 100).toFixed(0);
                    showToast(`Update progress: ${percent}% complete`, "update");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error continuing update:", error);
                logger.log("AJAX error details:", {xhr: xhr, status: status, error: error});
                
                // Show detailed error message
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    showToast(`Error: ${xhr.responseJSON.error}`, "error");
                } else {
                    showToast(`Error continuing update: ${error}`, "error");
                }
                
                // Increment retry counter
                state.updateRetries++;
                
                // If we've reached max retries, abort the update
                if (state.updateRetries >= MLBConfig.APP.maxRetries) {
                    logger.log("Maximum retries reached, stopping update process");
                    state.isUpdating = false;
                    
                    if (state.updateTimer) {
                        clearTimeout(state.updateTimer);
                        state.updateTimer = null;
                    }
                    
                    showToast("Update failed after multiple attempts", "error");
                }
            }
        });
    }
    
    /**
     * Fetch fresh data with improved error handling
     */
    function fetchFreshData() {
        logger.log("Fetching fresh data");
        showToast("Loading fresh data...", "info");
        
        $.ajax({
            url: '/api/team-data',
            method: 'GET',
            dataType: 'json',
            success: function(data) {
                logger.log(`Received fresh data with ${data.length} teams`);
                showToast("Data update complete!", "success");
                
                // Update chart with animation
                if (typeof MLBChart.updateChartData === 'function') {
                    const updated = MLBChart.updateChartData(data);
                    if (updated) {
                        logger.log("Chart updated successfully");
                    } else {
                        logger.log("Chart update failed");
                        showToast("Chart update failed", "warning");
                    }
                } else {
                    console.error("updateChartData function not available");
                    logger.log("updateChartData function not found");
                    showToast("Could not update visualization", "error");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error fetching fresh data:", error);
                logger.log("AJAX error details:", {xhr: xhr, status: status, error: error});
                showToast(`Error loading updated data: ${error}`, "error");
            }
        });
    }
    
    // Removed fetchSnapshotInfo function
    
    // Removed loadSnapshotData function
    
    /**
     * Initialize data from the server
     */
    function initializeData() {
        // Set initial state from window data (provided by Flask)
        state.lastUpdateTimestamp = window.dataStatus ? window.dataStatus.last_updated : null;
        
        logger.log("Initial data status:", window.dataStatus);
        logger.log("Initial team data count:", window.teamData ? window.teamData.length : 0);
        
        // Check initial status and take appropriate action
        if (window.dataStatus && !window.dataStatus.is_fresh && !window.dataStatus.update_in_progress) {
            // If data is stale, start automatic update
            logger.log("Initial data is stale, will start update shortly");
            setTimeout(function() {
                startUpdate();
            }, 2000);
        } else if (window.dataStatus && window.dataStatus.update_in_progress) {
            // If update already in progress, check status
            logger.log("Update already in progress, will check status shortly");
            state.isUpdating = true;
            setTimeout(checkUpdateStatus, 2000);
        } else {
            // Otherwise, just periodically check for staleness
            logger.log("Data is fresh, will check for staleness periodically");
            setTimeout(checkUpdateStatus, 5000);
        }
    }
    
    // Public API
    return {
        initialize: initializeData,
        startUpdate: startUpdate,
        checkUpdateStatus: checkUpdateStatus,
        fetchFreshData: fetchFreshData,
        // Removed fetchSnapshotInfo
        // Removed loadSnapshotData
        isUpdating: function() { return state.isUpdating; }
    };
})(window, document, jQuery, MLBConfig);