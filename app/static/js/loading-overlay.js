// Loading overlay management
(function(window, document, $) {
    "use strict";
    
    // Get loading overlay element
    const loadingOverlay = document.getElementById('loading-overlay');
    
    // Track loading state
    const state = {
        dataLoaded: false,
        chartLoaded: false,
        imagesLoaded: 0,
        totalImages: 0
    };
    
    // Function to hide the loading overlay
    function hideLoadingOverlay() {
        if (loadingOverlay) {
            // Add hidden class (for transition)
            loadingOverlay.classList.add('hidden');
            
            // Remove from DOM after transition completes
            setTimeout(() => {
                if (loadingOverlay.parentNode) {
                    loadingOverlay.parentNode.removeChild(loadingOverlay);
                }
            }, 500); // Match transition duration
            
            console.log("Loading overlay hidden");
        }
    }
    
    // Function to check if everything is loaded
    function checkIfLoaded() {
        if (state.dataLoaded && state.chartLoaded && 
            (state.imagesLoaded >= state.totalImages || state.totalImages === 0)) {
            
            // Add a slight delay for smoother transition
            setTimeout(hideLoadingOverlay, 500);
            console.log("All content loaded, hiding overlay");
        }
    }
    
    // Initialize loading detection
    function initialize() {
        console.log("Initializing loading overlay");
        
        // Count team logos to load
        if (window.teamData) {
            // Set initial count of images to load
            state.totalImages = window.teamData.length;
            console.log(`Found ${state.totalImages} team logos to load`);
            
            // Preload team logos
            window.teamData.forEach(team => {
                if (team.logo) {
                    const img = new Image();
                    img.onload = () => {
                        state.imagesLoaded++;
                        console.log(`Loaded image ${state.imagesLoaded}/${state.totalImages}`);
                        checkIfLoaded();
                    };
                    img.onerror = () => {
                        state.imagesLoaded++;
                        console.log(`Failed to load image ${state.imagesLoaded}/${state.totalImages}`);
                        checkIfLoaded();
                    };
                    img.src = team.logo;
                }
            });
        } else {
            // No team data available, just wait for it to be loaded
            console.log("No team data available yet");
        }
        
        // Wait for chart initialization
        const checkChartInterval = setInterval(() => {
            if (window.mlbChart) {
                state.chartLoaded = true;
                console.log("Chart loaded");
                clearInterval(checkChartInterval);
                checkIfLoaded();
            }
        }, 100);
        
        // Wait for data to be loaded
        if (window.teamData && window.teamData.length > 0) {
            state.dataLoaded = true;
            console.log("Team data loaded");
        } else {
            // Wait for team data to be populated
            const checkDataInterval = setInterval(() => {
                if (window.teamData && window.teamData.length > 0) {
                    state.dataLoaded = true;
                    console.log("Team data loaded");
                    clearInterval(checkDataInterval);
                    checkIfLoaded();
                }
            }, 100);
        }
        
        // Failsafe: Hide loading overlay after 10 seconds even if not everything is loaded
        setTimeout(() => {
            if (!loadingOverlay.classList.contains('hidden')) {
                console.log("Failsafe: Hiding loading overlay after timeout");
                hideLoadingOverlay();
            }
        }, 10000);
    }
    
    // Initialize when document is ready
    $(document).ready(initialize);
    
})(window, document, jQuery);