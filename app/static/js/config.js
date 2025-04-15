// app/static/js/config.js

/**
 * MLB ERA vs OPS Visualization - Configuration
 * Global configuration variables and utility functions
 */

const MLBConfig = (function() {
    "use strict";
    
    // MLB color theme
    const MLB_COLORS = {
        blue: "#002D72",
        red: "#E31937",
        blueFaded: "rgba(0, 45, 114, 0.8)",
        redFaded: "rgba(227, 25, 55, 0.8)"
    };
    
    // Chart configuration
    const CHART_CONFIG = {
        logoSize: 34,          // Base logo size in pixels (aligned with CSS var)
        logoCache: {},         // Simple cache for preloaded logo images
        quadrantColors: {
            topLeft: 'rgba(255, 248, 225, 0.5)',    // Cream (Good Pitching, Bad Hitting)
            topRight: 'rgba(232, 245, 233, 0.5)',   // Light green (Good Pitching, Good Hitting)
            bottomLeft: 'rgba(255, 235, 238, 0.5)', // Light pink (Bad Pitching, Bad Hitting)
            bottomRight: 'rgba(255, 255, 224, 0.5)' // Light yellow (Bad Pitching, Good Hitting)
        },
        axisLines: {
            xValue: 0.7, // OPS dividing line
            yValue: 4.0  // ERA dividing line
        },
        animation: {
            duration: 800,
            easing: 'easeOutQuad'
        },
        fontFamily: "'Roboto', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    };
    
    // App configuration
    const APP_CONFIG = {
        updateInterval: 2000,     // How often to poll for updates (ms)
        batchSize: 10,            // Increased from 3 to 10 teams per batch
        animation: {
            duration: 800,
            easing: 'easeOutQuad'
        },
        maxRetries: 3,            // Maximum number of retry attempts
        debugMode: false          // Set to true to enable verbose logging
    };
    
    // Enable debug mode based on URL parameter
    if (window.location.search.includes('debug=true')) {
        APP_CONFIG.debugMode = true;
    }
    
    // Logger for debugging
    const logger = {
        debugMode: APP_CONFIG.debugMode,
        log: function(message, data) {
            if (this.debugMode && console && console.log) {
                if (data) {
                    console.log(`[DEBUG] ${message}`, data);
                } else {
                    console.log(`[DEBUG] ${message}`);
                }
            }
        },
        error: function(message, error) {
            if (console && console.error) {
                if (error) {
                    console.error(`[ERROR] ${message}`, error);
                } else {
                    console.error(`[ERROR] ${message}`);
                }
            }
        },
        info: function(message) {
            if (console && console.info) {
                console.info(`[INFO] ${message}`);
            }
        }
    };
    
    // Helper to determine if the device is mobile
    function isMobileDevice() {
        return window.innerWidth <= 768;
    }
    
    // Calculate font sizes based on device
    function getFontSizes() {
        const base = isMobileDevice() ? 10 : 14;
        return {
            title: base * 1.4,
            axisLabel: base * 1.2,
            tickLabel: base * 0.9,
            tooltip: base * 1.1
        };
    }
    
    // Show toast notifications with MLB colors
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
    
    // Public API
    return {
        COLORS: MLB_COLORS,
        CHART: CHART_CONFIG,
        APP: APP_CONFIG,
        logger: logger,
        showToast: showToast,
        isMobileDevice: isMobileDevice,
        getFontSizes: getFontSizes
    };
})();