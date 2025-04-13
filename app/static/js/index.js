// app/static/js/index.js

/**
 * MLB ERA vs OPS Visualization - Main Initialization
 * Initializes all modules and starts the application
 */

(function(window, document, $) {
    "use strict";
    
    /**
     * Initialize the entire application
     */
    function initializeApp() {
        // Initialize modules in the correct order
        MLBConfig.logger.info("Application initialization started");
        
        // First initialize UI
        MLBUI.initialize();
        
        // Then initialize chart
        MLBChart.initialize();
        
        // Finally initialize data and API
        MLBAPI.initialize();
        
        MLBConfig.logger.info("Application fully initialized");
    }
    
    // Initialize the app when the document is ready
    $(document).ready(initializeApp);
    
    // Export public methods to the window object for debugging
    window.mlbApp = {
        startUpdate: MLBAPI.startUpdate,
        checkStatus: MLBAPI.checkUpdateStatus,
        refresh: MLBAPI.fetchFreshData,
        reloadChart: MLBChart.forceUpdate,
        repositionLabels: MLBChart.positionQuadrantLabels
    };
    
})(window, document, jQuery);