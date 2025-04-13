// app/static/js/app.js

/**
 * MLB ERA vs OPS Visualization
 * Main application logic for handling data updates and UI interactions
 */

(function(window, document, $) {
    "use strict";
    
    // MLB color theme
    const MLB_COLORS = {
        blue: "#002D72",
        red: "#E31937"
    };
    
    // App configuration
    const CONFIG = {
        updateInterval: 2000,     // How often to poll for updates (ms)
        batchSize: 3,             // How many teams to update in each batch
        animation: {
            duration: 800,
            easing: 'easeOutQuad'
        }
    };
    
    // App state
    const state = {
        updateTimer: null,
        isUpdating: false,
        lastUpdateTimestamp: null,
        updateRetries: 0,
        maxRetries: 3,
        debugMode: true,         // Set to true to enable verbose logging
        snapshotCount: 0,
        currentSnapshot: 0
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
        snapshotCountElem: null,
        snapshotSelector: null
    };
    
    /**
     * Initialize the application
     */
    function init() {
        // Enable debug mode based on URL parameter
        state.debugMode = window.location.search.includes('debug=true') || state.debugMode;
        debugLog("App initialization started");
        
        // Cache DOM elements for better performance
        cacheElements();
        
        // Set up event listeners
        setupEventListeners();
        
        // Initialize data from server
        initializeData();
        
        // Fetch snapshot count
        fetchSnapshotInfo();
    }
    
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
        elements.snapshotSelector = $('#snapshot-selector');
        
        debugLog("DOM elements cached");
    }
    
    /**
     * Set up event listeners
     */
    function setupEventListeners() {
        // Refresh button click handler
        elements.refreshButton.on('click', function() {
            debugLog("Refresh button clicked");
            // Only start update if not already updating
            if (!state.isUpdating) {
                startUpdate();
            } else {
                showToast("Update already in progress", "info");
            }
        });
        
        // Snapshot selector change handler
        elements.snapshotSelector.on('change', function() {
            const snapshotId = $(this).val();
            debugLog(`Snapshot changed to: ${snapshotId}`);
            loadSnapshotData(snapshotId);
        });
        
        // Window resize handler
        $(window).on('resize', function() {
            // Debounce the resize event
            clearTimeout(state.resizeTimer);
            state.resizeTimer = setTimeout(function() {
                window.positionQuadrantLabels();
            }, 250);
        });
        
        debugLog("Event listeners initialized");
    }
    
    /**
     * Initialize data from the server
     */
    function initializeData() {
        // Set initial state from window data (provided by Flask)
        state.lastUpdateTimestamp = window.dataStatus ? window.dataStatus.last_updated : null;
        
        debugLog("Initial data status:", window.dataStatus);
        debugLog("Initial team data count:", window.teamData ? window.teamData.length : 0);
        
        // Check initial status and take appropriate action
        if (window.dataStatus && !window.dataStatus.is_fresh && !window.dataStatus.update_in_progress) {
            // If data is stale, start automatic update
            debugLog("Initial data is stale, will start update shortly");
            setTimeout(function() {
                startUpdate();
            }, 2000);
        } else if (window.dataStatus && window.dataStatus.update_in_progress) {
            // If update already in progress, check status
            debugLog("Update already in progress, will check status shortly");
            state.isUpdating = true;
            setTimeout(checkUpdateStatus, 2000);
        } else {
            // Otherwise, just periodically check for staleness
            debugLog("Data is fresh, will check for staleness periodically");
            setTimeout(checkUpdateStatus, 5000);
        }
    }
    
    /**
     * Fetch information about available snapshots
     */
    function fetchSnapshotInfo() {
        debugLog("Fetching snapshot information");
        
        $.ajax({
            url: '/api/snapshots',
            method: 'GET',
            dataType: 'json',
            success: function(data) {
                debugLog("Received snapshot info", data);
                
                if (data && data.length > 0) {
                    // Update count
                    state.snapshotCount = data.length;
                    elements.snapshotCountElem.text(state.snapshotCount);
                    
                    // Update selector
                    updateSnapshotSelector(data);
                }
            },
            error: function(xhr, status, error) {
                console.error("Error fetching snapshot info:", error);
            }
        });
    }
    
    /**
     * Update the snapshot selector dropdown
     */
    function updateSnapshotSelector(snapshots) {
        // Clear existing options
        elements.snapshotSelector.empty();
        
        // Add option for latest
        elements.snapshotSelector.append($('<option>', {
            value: 'latest',
            text: 'Latest Data'
        }));
        
        // Add options for each snapshot, newest first
        snapshots.forEach(function(snapshot) {
            const date = new Date(snapshot.timestamp);
            const formattedDate = date.toLocaleString();
            
            elements.snapshotSelector.append($('<option>', {
                value: snapshot.id,
                text: `Snapshot ${snapshot.id} (${formattedDate})`
            }));
        });
        
        // Show the selector if we have multiple snapshots
        if (snapshots.length > 1) {
            elements.snapshotSelector.closest('.snapshot-selection').show();
        }
    }
    
    /**
     * Load data from a specific snapshot
     */
    function loadSnapshotData(snapshotId) {
        debugLog(`Loading data from snapshot ID: ${snapshotId}`);
        
        $.ajax({
            url: `/api/snapshot/${snapshotId}`,
            method: 'GET',
            dataType: 'json',
            success: function(data) {
                debugLog(`Loaded data from snapshot ${snapshotId} with ${data.length} teams`);
                
                // Update chart with the snapshot data
                if (typeof window.updateChartData === 'function') {
                    window.updateChartData(data);
                    showToast(`Loaded snapshot from ${new Date(data[0].timestamp).toLocaleString()}`, "info");
                }
            },
            error: function(xhr, status, error) {
                console.error(`Error loading snapshot ${snapshotId}:`, error);
                showToast(`Error loading snapshot: ${error}`, "error");
            }
        });
    }
    
    /**
     * Improved logging with debug mode toggle
     */
    function debugLog(message, data) {
        if (state.debugMode && console && console.log) {
            if (data) {
                console.log(`[DEBUG] ${message}`, data);
            } else {
                console.log(`[DEBUG] ${message}`);
            }
        }
    }
    
    /**
     * Show toast notifications with MLB colors
     */
    function showToast(message, type = "info") {
        const bgColors = {
            success: `linear-gradient(to right, ${MLB_COLORS.blue}, #4682B4)`,
            error: `linear-gradient(to right, ${MLB_COLORS.red}, #FF6347)`,
            warning: "linear-gradient(to right, #f6d365, #fda085)",
            info: `linear-gradient(to right, ${MLB_COLORS.blue}, #4FC3F7)`,
            update: `linear-gradient(to right, ${MLB_COLORS.red}, ${MLB_COLORS.blue})`
        };
        
        // Check if Toastify is loaded
        if (typeof Toastify !== 'function') {
            console.error("Toastify is not loaded!");
            return;
        }
        
        Toastify({
            text: message,
            duration: 3000,
            close: true,
            gravity: "top",
            position: "right",
            style: {
                background: bgColors[type] || bgColors.info
            }
        }).showToast();
    }
    
    /**
     * Update the UI based on status
     */
    function updateUI(status) {
        debugLog("Updating UI with status", status);
        
        // Update progress display
        if (status.in_progress) {
            elements.statusIndicatorTitle.addClass('active');
            elements.statusTextTitle.text('Updating');
            elements.updateProgress.addClass('visible');
            
            // Calculate percentage
            const percent = status.total_teams > 0 
                ? (status.teams_updated / status.total_teams) * 100 
                : 0;
            
            debugLog(`Update progress: ${status.teams_updated}/${status.total_teams} (${percent.toFixed(1)}%)`);
            
            // Update progress bar
            elements.progressBar.css('width', `${percent}%`);
            elements.progressCount.text(`${status.teams_updated}/${status.total_teams}`);
            
            // Hide refresh button during update
            elements.refreshButton.removeClass('visible');
        } else {
            elements.statusIndicatorTitle.removeClass('active');
            elements.updateProgress.removeClass('visible');
            
            // Update last updated timestamp if available
            if (status.last_updated) {
                elements.lastUpdatedTitleElem.text(status.last_updated);
                state.lastUpdateTimestamp = status.last_updated;
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
                showToast(`Error: ${status.error}`, "error");
                debugLog("Error in update process:", status.error);
            }
            
            // Update snapshot count if available
            if (status.snapshot_count) {
                state.snapshotCount = status.snapshot_count;
                elements.snapshotCountElem.text(state.snapshotCount);
            }
        }
    }
    
    /**
     * Check for updates with improved error handling
     */
    function checkUpdateStatus() {
        debugLog("Checking update status...");
        
        $.ajax({
            url: '/api/update-status',
            method: 'GET',
            dataType: 'json',
            success: function(status) {
                debugLog("Received update status", status);
                
                // Reset retry counter on successful response
                state.updateRetries = 0;
                
                // Update UI based on status
                updateUI(status);
                
                // If an update is in progress, continue polling
                if (status.in_progress) {
                    // Continue the update process if we're not at 100%
                    if (status.teams_updated < status.total_teams) {
                        debugLog(`Continuing update: ${status.teams_updated}/${status.total_teams}`);
                        continueUpdate();
                    } else {
                        debugLog("All teams updated, waiting for process to complete");
                    }
                    
                    // Schedule next status check
                    state.updateTimer = setTimeout(checkUpdateStatus, CONFIG.updateInterval);
                } else {
                    // If update just completed, fetch fresh data
                    if (state.isUpdating) {
                        debugLog("Update process completed, fetching fresh data");
                        state.isUpdating = false;
                        fetchFreshData();
                        
                        // Refresh snapshot info after update
                        fetchSnapshotInfo();
                    }
                    
                    // If data is stale, start automatic update
                    if (!status.cache_fresh && !state.isUpdating) {
                        debugLog("Data is stale, starting automatic update");
                        startUpdate();
                    }
                }
            },
            error: function(xhr, status, error) {
                console.error("Error checking update status:", error);
                debugLog("AJAX error details:", {xhr: xhr, status: status, error: error});
                
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
                if (state.updateRetries < state.maxRetries) {
                    debugLog(`Retrying update status check (${state.updateRetries}/${state.maxRetries})`);
                    state.updateTimer = setTimeout(checkUpdateStatus, CONFIG.updateInterval);
                } else {
                    debugLog("Maximum retries reached, stopping update process");
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
            debugLog("Update already in progress, not starting a new one");
            return;
        }
        
        debugLog("Starting data update process");
        state.isUpdating = true;
        state.updateRetries = 0;
        showToast("Starting data update...", "info");
        
        $.ajax({
            url: '/api/start-update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ batch_size: CONFIG.batchSize }),
            dataType: 'json',
            success: function(status) {
                debugLog("Update started successfully", status);
                
                // Update UI based on status
                updateUI(status);
                
                // Schedule status check
                state.updateTimer = setTimeout(checkUpdateStatus, CONFIG.updateInterval);
            },
            error: function(xhr, status, error) {
                console.error("Error starting update:", error);
                debugLog("AJAX error details:", {xhr: xhr, status: status, error: error});
                
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
        debugLog("Continuing update process");
        
        $.ajax({
            url: '/api/continue-update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ batch_size: CONFIG.batchSize }),
            dataType: 'json',
            success: function(status) {
                debugLog("Update continued successfully", status);
                
                // Update UI based on status
                updateUI(status);
                
                // If we've made progress, show a toast
                if (status.teams_updated > 0) {
                    const percent = ((status.teams_updated / status.total_teams) * 100).toFixed(0);
                    showToast(`Update progress: ${percent}% complete`, "update");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error continuing update:", error);
                debugLog("AJAX error details:", {xhr: xhr, status: status, error: error});
                
                // Show detailed error message
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    showToast(`Error: ${xhr.responseJSON.error}`, "error");
                } else {
                    showToast(`Error continuing update: ${error}`, "error");
                }
                
                // Increment retry counter
                state.updateRetries++;
                
                // If we've reached max retries, abort the update
                if (state.updateRetries >= state.maxRetries) {
                    debugLog("Maximum retries reached, stopping update process");
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
        debugLog("Fetching fresh data");
        showToast("Loading fresh data...", "info");
        
        $.ajax({
            url: '/api/team-data',
            method: 'GET',
            dataType: 'json',
            success: function(data) {
                debugLog(`Received fresh data with ${data.length} teams`);
                showToast("Data update complete!", "success");
                
                // Update chart with animation
                if (typeof window.updateChartData === 'function') {
                    const updated = window.updateChartData(data);
                    if (updated) {
                        debugLog("Chart updated successfully");
                    } else {
                        debugLog("Chart update failed");
                        showToast("Chart update failed", "warning");
                    }
                } else {
                    console.error("updateChartData function not available");
                    debugLog("updateChartData function not found");
                    showToast("Could not update visualization", "error");
                }
            },
            error: function(xhr, status, error) {
                console.error("Error fetching fresh data:", error);
                debugLog("AJAX error details:", {xhr: xhr, status: status, error: error});
                showToast(`Error loading updated data: ${error}`, "error");
            }
        });
    }
    
    // Initialize the app when the document is ready
    $(document).ready(init);
    
    // Export public methods to the window object
    window.mlbApp = {
        startUpdate: startUpdate,
        checkStatus: checkUpdateStatus,
        refresh: fetchFreshData,
        fetchSnapshotInfo: fetchSnapshotInfo,
        loadSnapshotData: loadSnapshotData
    };
    
})(window, document, jQuery);