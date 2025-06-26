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
        
        // Show immediate feedback
        showToast("Starting data update...", "info");
        
        // Show progress bar immediately
        MLBUI.updateStatusBar({
            in_progress: true,
            teams_updated: 0,
            total_teams: 30,
            cache_fresh: false
        });
        
        $.ajax({
            url: '/api/start-update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ batch_size: MLBConfig.APP.batchSize }),
            dataType: 'json',
            success: function(status) {
                logger.log("Update started successfully", status);
                
                // Show progress notification
                showToast(`Update started: Processing ${status.total_teams} teams...`, "update");
                
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
                
                // Hide progress bar on error
                MLBUI.updateStatusBar({
                    in_progress: false,
                    teams_updated: 0,
                    total_teams: 0
                });
            }
        });
    }
    
    /**
     * Continue the update process with improved performance
     */
    function continueUpdate() {
        logger.log("Continuing update process");
        
        // Use fetch API for better performance
        // FIXED: Changed from '/api/update-continue' to '/api/continue-update'
        fetch('/api/continue-update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ batch_size: MLBConfig.APP.batchSize })
        })
        .then(response => {
            // Check if response is ok before parsing JSON
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(status => {
            logger.log("Update continued successfully", status);
            
            // Update UI based on status - but only if percentage changes significantly
            const previousPercent = state.lastStatus ? 
                Math.floor((state.lastStatus.teams_updated / state.lastStatus.total_teams) * 100) : 0;
                
            const currentPercent = Math.floor((status.teams_updated / status.total_teams) * 100);
            
            // Only update UI and show toast if percentage changed by at least 10%
            if (Math.abs(currentPercent - previousPercent) >= 10) {
                MLBUI.updateStatusBar(status);
                
                // Show different messages based on progress
                if (currentPercent >= 90) {
                    showToast(`Almost done! ${currentPercent}% complete`, "update");
                } else if (currentPercent >= 50) {
                    showToast(`Halfway there! ${currentPercent}% complete`, "update");
                } else {
                    showToast(`Update progress: ${currentPercent}% complete`, "update");
                }
                
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
            success: function(response) {
                // Extract teams array from response object
                const teams = response.teams || [];
                
                logger.log(`Received fresh data with ${teams.length} teams`);
                
                // Validate that we have an array
                if (!Array.isArray(teams)) {
                    logger.error("Invalid data format: teams is not an array");
                    showToast("Error: Invalid data format received", "error");
                    return;
                }
                
                showToast("Data update complete!", "success");
                
                // Clear history cache when data is refreshed
                if (typeof MLBHistory !== 'undefined' && MLBHistory.clearHistoryCache) {
                    MLBHistory.clearHistoryCache();
                }
                
                // Update chart with all data
                // Division filter will be applied automatically by the chart
                if (typeof MLBChart.updateChartData === 'function') {
                    const updated = MLBChart.updateChartData(teams);
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
     * @param {Object|Array} data - Team data response or array to update the chart with
     */
    function updateChart(data) {
        // Handle both response object and direct array
        const teams = data.teams || data;
        
        if (typeof MLBChart.updateChartData === 'function') {
            const updated = MLBChart.updateChartData(teams);
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
        
        // Check if data is stale on page load and refresh automatically
        if (window.dataStatus && !window.dataStatus.is_fresh) {
            logger.log("Data is stale on page load, fetching fresh data...");
            MLBConfig.showToast("Loading latest data...", "info");
            
            // Fetch fresh data immediately
            setTimeout(function() {
                fetchFreshData();
            }, 500);
        }
        
        // If update already in progress, check status  
        if (window.dataStatus && window.dataStatus.update_in_progress) {
            logger.log("Update already in progress, will check status shortly");
            state.isUpdating = true;
            setTimeout(checkUpdateStatus, 2000);
        }
        
        // Also handle the case where window.teamData might need updating
        if (window.teamData && Array.isArray(window.teamData)) {
            logger.log("Initial team data is available");
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