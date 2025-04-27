// app/static/js/advanced-insights.js

/**
 * MLB ERA vs OPS Visualization - Advanced Insights Module
 * Handles advanced statistical analysis and movement tracking
 */

const MLBAdvancedInsights = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // Cache for movement data
    let movementData = null;
    let isDataLoading = false;
    let dataLoadTime = null;
    
    // DOM elements
    const elements = {
        mostMovementTeam: null,
        mostMovementValue: null,
        leastMovementTeam: null,
        leastMovementValue: null,
        biggestDiscrepancyTeam: null,
        biggestDiscrepancyValue: null,
        movementContent: null,
        consistencyContent: null,
        discrepancyContent: null
    };
    
    /**
     * Initialize DOM elements
     */
    function cacheElements() {
        elements.mostMovementTeam = $('#most-movement-team');
        elements.mostMovementValue = $('#most-movement-value');
        elements.leastMovementTeam = $('#least-movement-team');
        elements.leastMovementValue = $('#least-movement-value');
        elements.biggestDiscrepancyTeam = $('#biggest-discrepancy-team');
        elements.biggestDiscrepancyValue = $('#biggest-discrepancy-value');
        elements.movementContent = $('#movement-card-content');
        elements.consistencyContent = $('#consistency-card-content');
        elements.discrepancyContent = $('#discrepancy-card-content');
    }
    
    /**
     * Fetch team movement data with a delayed loading mechanism
     */
    function fetchMovementData() {
        // Don't fetch if already loading or if data was loaded in the last 5 minutes
        const now = Date.now();
        if (isDataLoading || 
            (dataLoadTime && (now - dataLoadTime) < 300000)) {
            return;
        }
        
        isDataLoading = true;
        logger.log("Fetching advanced team movement data");
        
        // Add a small delay to avoid blocking initial page load
        setTimeout(() => {
            fetch('/api/team-movement')
                .then(response => response.json())
                .then(data => {
                    isDataLoading = false;
                    dataLoadTime = Date.now();
                    
                    if (data.error) {
                        logger.error("Error fetching movement data:", data.error);
                        return;
                    }
                    
                    movementData = data;
                    logger.log("Received movement data for analysis:", data);
                    
                    // Update the UI with the new data
                    updateMovementInsights(data);
                })
                .catch(error => {
                    isDataLoading = false;
                    logger.error("Error in movement data fetch:", error);
                });
        }, 3000); // 3 second delay after page load
    }
    
    /**
     * Update the movement insights UI
     */
    function updateMovementInsights(data) {
        if (!data || !data.movement_data || data.movement_data.length === 0) {
            logger.warning("No movement data available");
            return;
        }
        
        try {
            // Update most movement team
            if (data.most_movement && data.most_movement.length > 0) {
                const team = data.most_movement[0];
                elements.mostMovementTeam.text(team.full_name);
                elements.mostMovementValue.text(formatNumber(team.movement_magnitude));
                
                // Update movement content
                updateMovementContent(data.most_movement);
            }
            
            // Update least movement team
            if (data.least_movement && data.least_movement.length > 0) {
                const team = data.least_movement[0];
                elements.leastMovementTeam.text(team.full_name);
                elements.leastMovementValue.text(formatNumber(team.movement_magnitude));
                
                // Update consistency content
                updateConsistencyContent(data.least_movement);
            }
            
            // Update biggest discrepancy team
            if (data.biggest_discrepancy && data.biggest_discrepancy.length > 0) {
                const team = data.biggest_discrepancy[0];
                elements.biggestDiscrepancyTeam.text(team.full_name);
                elements.biggestDiscrepancyValue.text(`${(team.win_pct_discrepancy * 100).toFixed(1)}%`);
                
                // Update discrepancy content
                updateDiscrepancyContent(data.biggest_discrepancy);
            }
            
            logger.log("Movement insights updated successfully");
        } catch (error) {
            logger.error("Error updating movement insights:", error);
        }
    }
    
    /**
     * Update movement content with detailed analysis
     */
    function updateMovementContent(teams) {
        if (!elements.movementContent || !teams || teams.length === 0) return;
        
        let html = '';
        
        teams.forEach((team, index) => {
            const eraChange = team.era_change;
            const opsChange = team.ops_change;
            
            // Determine direction of movement (improved in both, worse in both, or mixed)
            let movementClass = '';
            let movementText = '';
            
            if (eraChange < 0 && opsChange > 0) {
                // Improved in both (lower ERA, higher OPS)
                movementClass = 'movement-improved';
                movementText = 'improved in both pitching and hitting';
            } else if (eraChange > 0 && opsChange < 0) {
                // Worse in both (higher ERA, lower OPS)
                movementClass = 'movement-worse';
                movementText = 'declined in both pitching and hitting';
            } else if (eraChange < 0) {
                // Better pitching, worse hitting
                movementClass = 'movement-mixed';
                movementText = 'improved pitching but declined in hitting';
            } else {
                // Worse pitching, better hitting
                movementClass = 'movement-mixed';
                movementText = 'improved hitting but declined in pitching';
            }
            
            html += `
                <div class="movement-item ${movementClass}">
                    <div class="movement-team">${index + 1}. ${team.full_name}</div>
                    <div class="movement-details">
                        <div class="movement-stat">
                            <span class="movement-label">ERA Change:</span>
                            <span class="movement-value ${eraChange < 0 ? 'positive' : 'negative'}">${formatNumber(eraChange)}</span>
                        </div>
                        <div class="movement-stat">
                            <span class="movement-label">OPS Change:</span>
                            <span class="movement-value ${opsChange > 0 ? 'positive' : 'negative'}">${formatNumber(opsChange)}</span>
                        </div>
                        <div class="movement-summary">
                            ${team.full_name} has ${movementText}.
                        </div>
                    </div>
                </div>
            `;
        });
        
        elements.movementContent.html(html);
    }
    
    /**
     * Update consistency content with detailed analysis
     */
    function updateConsistencyContent(teams) {
        if (!elements.consistencyContent || !teams || teams.length === 0) return;
        
        let html = '';
        
        teams.forEach((team, index) => {
            const eraChange = Math.abs(team.era_change);
            const opsChange = Math.abs(team.ops_change);
            
            html += `
                <div class="consistency-item">
                    <div class="consistency-team">${index + 1}. ${team.full_name}</div>
                    <div class="consistency-details">
                        <div class="consistency-stat">
                            <span class="consistency-label">ERA Stability:</span>
                            <span class="consistency-value">${formatNumber(eraChange)}</span>
                        </div>
                        <div class="consistency-stat">
                            <span class="consistency-label">OPS Stability:</span>
                            <span class="consistency-value">${formatNumber(opsChange)}</span>
                        </div>
                        <div class="consistency-current">
                            Currently: ERA ${formatNumber(team.current_era)}, OPS ${formatNumber(team.current_ops)}
                        </div>
                    </div>
                </div>
            `;
        });
        
        elements.consistencyContent.html(html);
    }
    
    /**
     * Update discrepancy content with detailed analysis
     */
    function updateDiscrepancyContent(teams) {
        if (!elements.discrepancyContent || !teams || teams.length === 0) return;
        
        let html = '';
        
        teams.forEach((team, index) => {
            const discrepancy = team.win_pct_discrepancy;
            const discrepancyLabel = discrepancy > 0 ? 
                'outperforming their stats' : 
                'underperforming their stats';
                
            const winPct = (team.win_pct * 100).toFixed(1);
            const expectedWinPct = (team.expected_win_pct * 100).toFixed(1);
            
            html += `
                <div class="discrepancy-item">
                    <div class="discrepancy-team">${index + 1}. ${team.full_name}</div>
                    <div class="discrepancy-details">
                        <div class="discrepancy-stat">
                            <span class="discrepancy-label">Actual Win %:</span>
                            <span class="discrepancy-value">${winPct}%</span>
                        </div>
                        <div class="discrepancy-stat">
                            <span class="discrepancy-label">Expected Win %:</span>
                            <span class="discrepancy-value">${expectedWinPct}%</span>
                        </div>
                        <div class="discrepancy-summary">
                            ${team.full_name} is ${discrepancyLabel} by ${Math.abs((discrepancy * 100).toFixed(1))}%.
                        </div>
                    </div>
                </div>
            `;
        });
        
        elements.discrepancyContent.html(html);
    }
    
    /**
     * Format a number for display
     */
    function formatNumber(num) {
        if (typeof num === 'number') {
            return num.toFixed(3);
        }
        return '0.000';
    }
    
    /**
     * Initialize the module
     */
    function initialize() {
        logger.log("Initializing advanced insights module");
        
        // Cache DOM elements
        cacheElements();
        
        // Fetch data with delay
        fetchMovementData();
        
        logger.log("Advanced insights module initialized");
    }
    
    // Public API
    return {
        initialize: initialize,
        refreshData: fetchMovementData
    };
})(window, document, jQuery, MLBConfig);

// Initialize when document is ready
$(document).ready(function() {
    // Wait a short time to ensure other scripts are loaded
    setTimeout(function() {
        MLBAdvancedInsights.initialize();
    }, 1000);
});