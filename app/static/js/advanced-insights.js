// app/static/js/advanced-insights.js

const MLBAdvancedInsights = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig ? MLBConfig.logger : console;
    
    // State management
    let isDataLoading = false;
    let dataLoadTime = null;
    
    /**
     * Fetch team movement data with caching
     */
    function fetchMovementData() {
        // Don't fetch if already loading or if data loaded in last 5 minutes
        const now = Date.now();
        if (isDataLoading || 
            (dataLoadTime && (now - dataLoadTime) < 300000)) {
            return;
        }
        
        isDataLoading = true;
        logger.log("Fetching recent movers data");
        
        // Set loading state for all cards
        $('.loading-indicator').show();
        
        // Only remove team rows within advanced content containers
        $('#movement-content .team-row, #consistency-content .team-row, #improvement-content .team-row').remove();
        
        // Fetch the data
        fetch('/api/team-movement')
            .then(response => response.json())
            .then(data => {
                isDataLoading = false;
                dataLoadTime = Date.now();
                
                if (data.error) {
                    logger.error("Error fetching movement data:", data.error);
                    showErrorMessage("Unable to analyze team movement.");
                    return;
                }
                
                // Hide loading indicators
                $('.loading-indicator').hide();
                
                // Update all cards with the data
                updateAllCards(data);
            })
            .catch(error => {
                isDataLoading = false;
                logger.error("Error fetching movement data:", error);
                showErrorMessage("Unable to analyze team movement.");
            });
    }
    
    /**
     * Show error message on all cards
     */
    function showErrorMessage(message) {
        $('.loading-indicator').hide();
        $('.error-message').text(message).show();
    }
    
    /**
     * Update all insight cards with movement data
     */
    function updateAllCards(data) {
        if (!data || !data.movement_data || data.movement_data.length === 0) {
            logger.warning("No movement data available");
            showErrorMessage("No movement data available for analysis.");
            return;
        }
        
        // Update recent movers card
        updateRecentMoversCard(data);
        
        // Update consistency card
        updateConsistencyCard(data);
        
        // Update improvement card
        updateImprovementCard(data);
    }
    
    /**
     * Update recent movers card
     * Shows teams with most erratic movement in last 2 weeks
     */
    function updateRecentMoversCard(data) {
        if (!data.recent_movers || data.recent_movers.length === 0) return;
        
        // Container for team rows
        const container = $('#movement-content');
        container.find('.team-row').remove();
        
        // Only show top 3 teams
        data.recent_movers.slice(0, 3).forEach((team, index) => {
            const teamRow = $(`
            <div class="team-row">
                <div class="rank-container">
                    <div class="rank">${index + 1}</div>
                </div>
                <div class="team-details">
                    <div class="team-name">${team.full_name}</div>
                    <div class="team-metrics">
                        <div class="metric">
                            <div class="metric-label">Volatility Score:</div>
                            <div class="metric-value">${formatNumber(team.avg_combined_volatility)}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Movement Profile:</div>
                            <div class="direction-details">
                                <div class="direction-component">
                                    ERA: ±${formatNumber(team.avg_era_volatility)}
                                </div>
                                <div class="direction-component">
                                    OPS: ±${formatNumber(team.avg_ops_volatility)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`);
            
            container.append(teamRow);
        });
    }
    
    /**
     * Update consistency card
     * Shows teams with stability percentiles for pitching and hitting
     */
    function updateConsistencyCard(data) {
        const teams = data.most_stable && data.most_stable.length > 0 ? 
                     data.most_stable : [];
        
        if (teams.length === 0) return;
        
        // Container for team rows
        const container = $('#consistency-content');
        container.find('.team-row').remove();
        
        // Only show top 3 teams
        teams.slice(0, 3).forEach((team, index) => {
            const teamRow = $(`
            <div class="team-row">
                <div class="rank-container">
                    <div class="rank">${index + 1}</div>
                </div>
                <div class="team-details">
                    <div class="team-name">${team.full_name}</div>
                    <div class="team-metrics">
                        <div class="metric">
                            <div class="metric-label">Pitching Stability:</div>
                            <div class="metric-value">${formatPercentile(100 - team.pitching_stability_percentile)}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Hitting Stability:</div>
                            <div class="metric-value">${formatPercentile(100 - team.hitting_stability_percentile)}</div>
                        </div>
                    </div>
                </div>
            </div>`);
            
            container.append(teamRow);
        });
    }
    
    /**
     * Update improvement card
     * Shows teams with the most positive change in both ERA and OPS
     */
    function updateImprovementCard(data) {
        // Get teams with best recent performance trend
        const improvingTeams = data.movement_data.filter(team => 
            team.current_era < (team.avg_era_volatility * 2) &&
            team.current_ops > (1 - team.avg_ops_volatility)
        );
        
        if (improvingTeams.length === 0) {
            // Fall back to all teams sorted by win percentage
            const allTeams = data.movement_data.sort((a, b) => b.win_pct - a.win_pct);
            
            if (allTeams.length === 0) return;
            
            // Container for team rows
            const container = $('#improvement-content');
            container.find('.team-row').remove();
            
            // Only show top 3 teams
            allTeams.slice(0, 3).forEach((team, index) => {
                const teamRow = $(`
                <div class="team-row">
                    <div class="rank-container">
                        <div class="rank">${index + 1}</div>
                    </div>
                    <div class="team-details">
                        <div class="team-name">${team.full_name}</div>
                        <div class="team-metrics">
                            <div class="metric">
                                <div class="metric-label">Win %:</div>
                                <div class="metric-value">${formatNumber(team.win_pct * 100)}%</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Current Stats:</div>
                                <div class="direction-details">
                                    <div class="direction-component">
                                        ERA: ${formatNumber(team.current_era)}
                                    </div>
                                    <div class="direction-component">
                                        OPS: ${formatNumber(team.current_ops)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`);
                
                container.append(teamRow);
            });
            
            return;
        }
        
        // Container for team rows
        const container = $('#improvement-content');
        container.find('.team-row').remove();
        
        // Only show top 3 teams
        improvingTeams.slice(0, 3).forEach((team, index) => {
            const teamRow = $(`
            <div class="team-row">
                <div class="rank-container">
                    <div class="rank">${index + 1}</div>
                </div>
                <div class="team-details">
                    <div class="team-name">${team.full_name}</div>
                    <div class="team-metrics">
                        <div class="metric">
                            <div class="metric-label">Performance Score:</div>
                            <div class="metric-value">${formatNumber(team.win_pct * 100)}%</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Current Stats:</div>
                            <div class="direction-details">
                                <div class="direction-component">
                                    ERA: ${formatNumber(team.current_era)}
                                </div>
                                <div class="direction-component">
                                    OPS: ${formatNumber(team.current_ops)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`);
            
            container.append(teamRow);
        });
    }
    
    /**
     * Format a number for display with appropriate precision
     */
    function formatNumber(num) {
        if (typeof num === 'number') {
            if (Math.abs(num) >= 10) {
                return num.toFixed(1);
            }
            return num.toFixed(2);
        }
        return '0.00';
    }
    
    /**
     * Format a percentile value
     */
    function formatPercentile(num) {
        if (typeof num === 'number') {
            return num.toFixed(0) + 'th';
        }
        return '0th';
    }
    
    /**
     * Initialize the module
     */
    function initialize() {
        logger.log("Initializing advanced insights module");
        
        // Fetch data with delay
        setTimeout(fetchMovementData, 2000);
        
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
    // Wait for other scripts to load
    setTimeout(function() {
        MLBAdvancedInsights.initialize();
    }, 2000);
});