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
        lastUpdateTimestamp: null,
        lastStatus: null  // Track last status to minimize UI updates
    };
    
    /**
     * Check for updates with reduced UI impact
     */
    function checkUpdateStatus() {
        logger.log("Checking update status...");
        
        // Use fetch API instead of jQuery AJAX for better performance
        fetch('/api/update-status')
            .then(response => response.json())
            .then(status => {
                logger.log("Received update status", status);
                
                // Reset retry counter on successful response
                state.updateRetries = 0;
                
                // Update UI based on status - but with reduced UI updates
                // Only update UI elements if status has actually changed
                const statusChanged = 
                    !state.lastStatus || 
                    state.lastStatus.in_progress !== status.in_progress ||
                    state.lastStatus.teams_updated !== status.teams_updated ||
                    state.lastStatus.total_teams !== status.total_teams;
                    
                if (statusChanged) {
                    MLBUI.updateStatusBar(status);
                    // Store the last status to compare next time
                    state.lastStatus = JSON.parse(JSON.stringify(status));
                } else {
                    logger.log("Status unchanged, skipping UI update");
                }
                
                // If an update is in progress, continue polling
                if (status.in_progress) {
                    // Continue the update process if we're not at 100%
                    if (status.teams_updated < status.total_teams) {
                        logger.log(`Continuing update: ${status.teams_updated}/${status.total_teams}`);
                        continueUpdate();
                    } else {
                        logger.log("All teams updated, waiting for process to complete");
                    }
                    
                    // Schedule next status check with a longer interval if update is ongoing
                    // This reduces UI interference
                    state.updateTimer = setTimeout(checkUpdateStatus, 
                        status.teams_updated > 0 ? MLBConfig.APP.updateInterval * 1.5 : MLBConfig.APP.updateInterval);
                } else {
                    // If update just completed, fetch fresh data
                    if (state.isUpdating) {
                        logger.log("Update process completed, fetching fresh data");
                        state.isUpdating = false;
                        fetchFreshData();
                    }
                }
            })
            .catch(error => {
                console.error("Error checking update status:", error);
                logger.log("Fetch error details:", error);
                
                // Show error toast with more details
                showToast(`Error checking updates: ${error.message || 'Network error'}`, "error");
                
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
                
                // Store the last status
                state.lastStatus = JSON.parse(JSON.stringify(status));
                
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
     * Continue the update process with improved performance
     */
    function continueUpdate() {
        logger.log("Continuing update process");
        
        // Use fetch API for better performance
        fetch('/api/continue-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ batch_size: MLBConfig.APP.batchSize })
        })
        .then(response => response.json())
        .then(status => {
            logger.log("Update continued successfully", status);
            
            // Update UI based on status - but only if percentage changes significantly
            const previousPercent = state.lastStatus ? 
                Math.floor((state.lastStatus.teams_updated / state.lastStatus.total_teams) * 100) : 0;
                
            const currentPercent = Math.floor((status.teams_updated / status.total_teams) * 100);
            
            // Only update UI and show toast if percentage changed by at least 10%
            if (Math.abs(currentPercent - previousPercent) >= 10) {
                MLBUI.updateStatusBar(status);
                showToast(`Update progress: ${currentPercent}% complete`, "update");
                state.lastStatus = JSON.parse(JSON.stringify(status));
            }
        })
        .catch(error => {
            console.error("Error continuing update:", error);
            logger.log("Fetch error details:", error);
            
            // Show detailed error message
            showToast(`Error continuing update: ${error.message || 'Network error'}`, "error");
            
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
                
                // Update chart with all data
                // Division filter will be applied automatically by the chart
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
    /**
     * Helper function to update the chart
     * @param {Array} data - Team data to update the chart with
     */
    function updateChart(data) {
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
    }
    
    /**
     * Initialize data from the server
     */
    function initializeData() {
        // Set initial state from window data (provided by Flask)
        state.lastUpdateTimestamp = window.dataStatus ? window.dataStatus.last_updated : null;
        
        logger.log("Initial data status:", window.dataStatus);
        logger.log("Initial team data count:", window.teamData ? window.teamData.length : 0);
        
        // No automatic update start for stale data - this is now manual only
        if (window.dataStatus && window.dataStatus.update_in_progress) {
            // If update already in progress, check status
            logger.log("Update already in progress, will check status shortly");
            state.isUpdating = true;
            setTimeout(checkUpdateStatus, 2000);
        }
    }
    
    /**
     * Fetch division information for a specific team
     * @param {number} teamId - The team ID
     * @returns {Promise} Promise that resolves with division data
     */
    function fetchTeamDivision(teamId) {
        logger.log(`Fetching division info for team ID: ${teamId}`);
        
        return $.ajax({
            url: `/api/team-division/${teamId}`,
            method: 'GET',
            dataType: 'json',
            cache: true,  // Enable caching for this request
            success: function(data) {
                logger.log(`Received division info for ${data.team_name}`, data);
                // Add to local cache
                if (!window.divisionCache) {
                    window.divisionCache = {};
                }
                window.divisionCache[teamId] = data;
                return data;
            },
            error: function(xhr, status, error) {
                console.error(`Error fetching division info for team ${teamId}:`, error);
                logger.error("AJAX error details:", {xhr: xhr, status: status, error: error});
                return null;
            }
        });
    }
    
    // Public API
    return {
        initialize: initializeData,
        startUpdate: startUpdate,
        checkUpdateStatus: checkUpdateStatus,
        fetchFreshData: fetchFreshData,
        isUpdating: function() { return state.isUpdating; },
        fetchTeamDivision: fetchTeamDivision
    };
})(window, document, jQuery, MLBConfig);