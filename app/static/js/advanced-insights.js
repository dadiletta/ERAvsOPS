// app/static/js/advanced-insights.js

/**
 * MLB ERA vs OPS Visualization - Advanced Insights Module
 * Clean implementation of team movement analysis
 */

const MLBAdvancedInsights = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig ? MLBConfig.logger : console;
    
    // State management
    let isDataLoading = false;
    let dataLoadTime = null;
    
    // DOM elements
    const elements = {
        // Card containers
        movementCard: $('#movement-card'),
        consistencyCard: $('#consistency-card'),
        improvementCard: $('#improvement-card'),
        
        // Movement leaders
        movementLeader: $('#movement-leader'),
        movementValue: $('#movement-value'),
        
        // Consistency leaders
        consistencyLeader: $('#consistency-leader'),
        consistencyValue: $('#consistency-value'),
        
        // Most improved leaders
        improvementLeader: $('#improvement-leader'),
        improvementValue: $('#improvement-value')
    };
    
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
        logger.log("Fetching team movement analysis data");
        
        // Set loading state for all cards
        $('.analysis-leaders').addClass('loading');
        $('.team-row').remove(); // Clear existing rows
        $('.loading-indicator').show();
        
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
                $('.analysis-leaders').removeClass('loading');
                
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
        $('.analysis-leaders').removeClass('loading');
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
        
        // Update movement card
        updateMovementCard(data);
        
        // Update consistency card
        updateConsistencyCard(data);
        
        // Update improvement card
        updateImprovementCard(data);
    }
    
    /**
     * Update movement analysis card
     * Shows teams with the most total movement in ERA-OPS space
     */
    function updateMovementCard(data) {
        if (!data.most_movement || data.most_movement.length === 0) return;
        
        // Get leader team
        const leader = data.most_movement[0];
        
        // Update leader stats
        elements.movementLeader.text(leader.full_name);
        elements.movementValue.text(formatNumber(leader.total_path_length));
        
        // Container for team rows
        const container = $('#movement-content');
        container.find('.team-row').remove();
        
        // Only show top 3 teams
        data.most_movement.slice(0, 3).forEach((team, index) => {
            // Get detailed direction information
            const eraChange = team.era_net_change;
            const opsChange = team.ops_net_change;
            
            // Determine direction classes for pitching and hitting
            const pitchingClass = eraChange < 0 ? 'improving' : 'declining';
            const hittingClass = opsChange > 0 ? 'improving' : 'declining';
            
            const teamRow = $(`
            <div class="team-row">
                <div class="rank-container">
                    <div class="rank">${index + 1}</div>
                </div>
                <div class="team-details">
                    <div class="team-name">${team.full_name}</div>
                    <div class="team-metrics">
                        <div class="metric">
                            <div class="metric-label">Total Movement:</div>
                            <div class="metric-value">${formatNumber(team.total_path_length)}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Direction:</div>
                            <div class="direction-details">
                                <div class="direction-component ${pitchingClass}">
                                    Pitching (${formatChange(eraChange)})
                                </div>
                                <div class="direction-component ${hittingClass}">
                                    Hitting (${formatChange(opsChange)})
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
     * Shows teams with the most stable, predictable performance
     */
    function updateConsistencyCard(data) {
        // Prioritize most_consistent if available, fall back to least_movement
        const teams = data.most_consistent && data.most_consistent.length > 0 ? 
                     data.most_consistent : 
                     data.least_movement && data.least_movement.length > 0 ?
                     data.least_movement : [];
        
        if (teams.length === 0) return;
        
        // Get leader team
        const leader = teams[0];
        
        // Update leader stats
        elements.consistencyLeader.text(leader.full_name);
        
        // Use path efficiency if available, otherwise movement magnitude
        const hasPathEfficiency = typeof leader.path_efficiency !== 'undefined';
        if (hasPathEfficiency) {
            elements.consistencyValue.text(`${(leader.path_efficiency * 100).toFixed(0)}%`);
        } else {
            elements.consistencyValue.text(formatNumber(leader.movement_magnitude));
        }
        
        // Container for team rows
        const container = $('#consistency-content');
        container.find('.team-row').remove();
        
        // Only show top 3 teams
        teams.slice(0, 3).forEach((team, index) => {
            const hasEnhancedData = typeof team.path_efficiency !== 'undefined';
            
            // Create metrics HTML based on available data
            let metricsHtml;
            if (hasEnhancedData) {
                metricsHtml = `
                <div class="metric">
                    <div class="metric-label">Efficiency:</div>
                    <div class="metric-value">${(team.path_efficiency * 100).toFixed(0)}%</div>
                </div>
                <div class="metric">
                    <div class="metric-label">ERA Stability:</div>
                    <div class="metric-value">${(team.era_consistency * 100).toFixed(0)}%</div>
                </div>`;
            } else {
                metricsHtml = `
                <div class="metric">
                    <div class="metric-label">Movement:</div>
                    <div class="metric-value">${formatNumber(team.movement_magnitude)}</div>
                </div>
                <div class="metric">
                    <div class="metric-label">Current ERA:</div>
                    <div class="metric-value">${formatNumber(team.current_era)}</div>
                </div>`;
            }
            
            const teamRow = $(`
            <div class="team-row">
                <div class="rank-container">
                    <div class="rank">${index + 1}</div>
                </div>
                <div class="team-details">
                    <div class="team-name">${team.full_name}</div>
                    <div class="team-metrics">
                        ${metricsHtml}
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
        // Get teams improving in both ERA and OPS
        const improvingTeams = data.movement_data.filter(team => 
            team.era_net_change < 0 && team.ops_net_change > 0
        );
        
        // Sort by combined improvement (ERA decrease + OPS increase)
        const sortedTeams = improvingTeams.sort((a, b) => 
            (Math.abs(b.era_net_change) + b.ops_net_change) - 
            (Math.abs(a.era_net_change) + a.ops_net_change)
        );
        
        if (sortedTeams.length === 0) {
            // Fall back to most improved in at least one stat
            const alternateTeams = data.movement_data.sort((a, b) => {
                const scoreA = Math.abs(a.era_net_change < 0 ? a.era_net_change : 0) + 
                              (a.ops_net_change > 0 ? a.ops_net_change : 0);
                const scoreB = Math.abs(b.era_net_change < 0 ? b.era_net_change : 0) + 
                              (b.ops_net_change > 0 ? b.ops_net_change : 0);
                return scoreB - scoreA;
            });
            
            if (alternateTeams.length === 0) return;
            
            // Get leader team
            const leader = alternateTeams[0];
            
            // Update leader stats
            elements.improvementLeader.text(leader.full_name);
            
            // Show the combined improvement score
            const improvementScore = Math.abs(leader.era_net_change < 0 ? leader.era_net_change : 0) + 
                                    (leader.ops_net_change > 0 ? leader.ops_net_change : 0);
            elements.improvementValue.text(formatNumber(improvementScore));
            
            // Container for team rows
            const container = $('#improvement-content');
            container.find('.team-row').remove();
            
            // Only show top 3 teams
            alternateTeams.slice(0, 3).forEach((team, index) => {
                const teamRow = $(`
                <div class="team-row">
                    <div class="rank-container">
                        <div class="rank">${index + 1}</div>
                    </div>
                    <div class="team-details">
                        <div class="team-name">${team.full_name}</div>
                        <div class="team-metrics">
                            <div class="metric">
                                <div class="metric-label">ERA Change:</div>
                                <div class="metric-value era-change ${team.era_net_change < 0 ? 'improving' : 'declining'}">${formatChange(team.era_net_change)}</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">OPS Change:</div>
                                <div class="metric-value ops-change ${team.ops_net_change > 0 ? 'improving' : 'declining'}">${formatChange(team.ops_net_change)}</div>
                            </div>
                        </div>
                    </div>
                </div>`);
                
                container.append(teamRow);
            });
            
            return;
        }
        
        // Get leader team
        const leader = sortedTeams[0];
        
        // Update leader stats
        elements.improvementLeader.text(leader.full_name);
        
        // Show the combined improvement score
        const improvementScore = Math.abs(leader.era_net_change) + leader.ops_net_change;
        elements.improvementValue.text(formatNumber(improvementScore));
        
        // Container for team rows
        const container = $('#improvement-content');
        container.find('.team-row').remove();
        
        // Only show top 3 teams
        sortedTeams.slice(0, 3).forEach((team, index) => {
            const teamRow = $(`
            <div class="team-row">
                <div class="rank-container">
                    <div class="rank">${index + 1}</div>
                </div>
                <div class="team-details">
                    <div class="team-name">${team.full_name}</div>
                    <div class="team-metrics">
                        <div class="metric">
                            <div class="metric-label">ERA Change:</div>
                            <div class="metric-value era-change improving">${formatChange(team.era_net_change)}</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">OPS Change:</div>
                            <div class="metric-value ops-change improving">${formatChange(team.ops_net_change)}</div>
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
            return num.toFixed(2);
        }
        return '0.00';
    }
    
    /**
     * Format a change value with sign
     */
    function formatChange(num) {
        if (typeof num === 'number') {
            return (num > 0 ? '+' : '') + num.toFixed(3);
        }
        return '0.000';
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