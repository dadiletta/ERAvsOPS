// app/static/js/loading-overlay.js

(function(window, document, $) {
    "use strict";
    
    // Get loading overlay element
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Track loading state
    const state = {
        dataLoaded: false,
        chartLoaded: false,
        snapshotCountLoaded: false,
        imagesLoaded: 0,
        totalImages: 0,
        fetchAttempts: 0,
        maxFetchAttempts: 3,
        initialLoadComplete: false,
        freshDataLoaded: false // New flag to track fresh data
    };
    
    // Utility function to log loading status
    function logLoadingStatus() {
        console.log("Loading status:", {
            dataLoaded: state.dataLoaded,
            chartLoaded: state.chartLoaded,
            snapshotCountLoaded: state.snapshotCountLoaded,
            imagesLoaded: `${state.imagesLoaded}/${state.totalImages}`,
            freshDataLoaded: state.freshDataLoaded,
            initialLoadComplete: state.initialLoadComplete
        });
    }
    
    // Function to hide the loading overlay
    function hideLoadingOverlay() {
        if (loadingOverlay && !state.initialLoadComplete) {
            // Add hidden class (for transition)
            loadingOverlay.classList.add('hidden');
            
            // Remove from DOM after transition completes
            setTimeout(() => {
                if (loadingOverlay.parentNode) {
                    loadingOverlay.parentNode.removeChild(loadingOverlay);
                }
            }, 500); // Match transition duration
            
            console.log("Loading overlay hidden");
            
            // Mark initial load as complete
            state.initialLoadComplete = true;
        }
    }
    
    // Function to check if everything is loaded
    function checkIfLoaded() {
        logLoadingStatus();
        
        // Wait for fresh data flag if data is stale
        const dataRequirementMet = state.freshDataLoaded || 
            (window.dataStatus && window.dataStatus.is_fresh);
        
        if (state.chartLoaded && state.snapshotCountLoaded &&
            (state.imagesLoaded >= state.totalImages || state.totalImages === 0) &&
            dataRequirementMet) {
            
            // Add a slight delay for smoother transition
            setTimeout(hideLoadingOverlay, 500);
            console.log("All content loaded, hiding overlay");
        }
    }
    
    // Function to fetch snapshot count with improved retry logic
    function fetchSnapshotCount() {
        if (state.snapshotCountLoaded || state.fetchAttempts >= state.maxFetchAttempts) {
            return;
        }
        
        state.fetchAttempts++;
        console.log(`Fetching snapshot count (attempt ${state.fetchAttempts}/${state.maxFetchAttempts})...`);
        
        // Make API call to get update status, which includes snapshot count
        fetch('/api/update-status')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(status => {
                if (status && typeof status.snapshot_count !== 'undefined') {
                    // Update the snapshot count in the DOM
                    const snapshotCountElem = document.getElementById('snapshot-count');
                    if (snapshotCountElem) {
                        snapshotCountElem.textContent = status.snapshot_count;
                    }
                    
                    // Mark as loaded if we have a valid count
                    if (status.snapshot_count > 0) {
                        state.snapshotCountLoaded = true;
                        console.log(`Snapshot count loaded: ${status.snapshot_count}`);
                        checkIfLoaded();
                    } else if (state.fetchAttempts < state.maxFetchAttempts) {
                        // Try again after a delay if count is 0
                        setTimeout(fetchSnapshotCount, 1000);
                    } else {
                        // Max attempts reached, consider it loaded anyway
                        state.snapshotCountLoaded = true;
                        console.log("Max snapshot count fetch attempts reached");
                        checkIfLoaded();
                    }
                }
            })
            .catch(error => {
                console.error("Error fetching snapshot count:", error);
                if (state.fetchAttempts < state.maxFetchAttempts) {
                    // Try again after a delay with exponential backoff
                    setTimeout(fetchSnapshotCount, 1000 * state.fetchAttempts);
                } else {
                    // Max attempts reached, consider it loaded anyway
                    state.snapshotCountLoaded = true;
                    console.log("Max snapshot count fetch attempts reached after errors");
                    checkIfLoaded();
                }
            });
    }
    
    // Enhanced function to check if chart is properly loaded with data
    function checkChartLoading() {
        if (window.mlbChart) {
            // Verify the chart actually has team data loaded
            if (window.mlbChart.data && 
                window.mlbChart.data.datasets && 
                window.mlbChart.data.datasets[0] &&
                window.mlbChart.data.datasets[0].data &&
                window.mlbChart.data.datasets[0].data.length > 0) {
                
                state.chartLoaded = true;
                console.log(`Chart loaded with ${window.mlbChart.data.datasets[0].data.length} teams`);
                clearInterval(window.chartCheckInterval);
                checkIfLoaded();
            } else {
                console.log("Chart object exists but has no data yet");
            }
        }
    }
    
    // Listen for fresh data loaded event
    function listenForFreshData() {
        // Listen for custom event that indicates fresh data is loaded
        $(document).on('freshDataLoaded', function() {
            console.log("Fresh data loaded event received");
            state.freshDataLoaded = true;
            checkIfLoaded();
        });
        
        // Also listen for chart update event
        $(document).on('chartUpdated', function() {
            console.log("Chart updated event received");
            state.chartLoaded = true;
            checkIfLoaded();
        });
    }
    
    // Initialize loading detection with improved checks
    function initialize() {
        console.log("Initializing loading overlay");
        
        // Check if data is stale
        if (window.dataStatus && !window.dataStatus.is_fresh) {
            console.log("Initial data is stale, waiting for fresh data...");
            // Don't mark data as loaded yet
        } else if (window.teamData && window.teamData.length > 0) {
            // Data is fresh, proceed normally
            state.dataLoaded = true;
            state.freshDataLoaded = true;
            state.totalImages = window.teamData.length;
            console.log(`Found ${state.totalImages} team logos to load`);
            
            // Preload team logos
            window.teamData.forEach(team => {
                if (team.logo) {
                    const img = new Image();
                    img.onload = () => {
                        state.imagesLoaded++;
                        checkIfLoaded();
                    };
                    img.onerror = () => {
                        state.imagesLoaded++;
                        checkIfLoaded();
                    };
                    img.src = team.logo;
                }
            });
        }
        
        // Start fetching snapshot count immediately
        fetchSnapshotCount();
        
        // Listen for fresh data events
        listenForFreshData();
        
        // Wait for chart initialization with proper data
        window.chartCheckInterval = setInterval(checkChartLoading, 100);
        
        // Failsafe: Hide loading overlay after 30 seconds even if not everything is loaded
        setTimeout(() => {
            if (loadingOverlay && !state.initialLoadComplete) {
                console.log("Failsafe: Hiding loading overlay after timeout");
                logLoadingStatus(); // Log final state for debugging
                hideLoadingOverlay();
            }
        }, 30000); // Increased to 30 seconds for fresh data loading
    }
    
    // Initialize when document is ready
    $(document).ready(initialize);
    
    // Export state for debugging
    window.loadingOverlayState = state;
    
})(window, document, jQuery);