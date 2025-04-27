// app/static/js/history.js

/**
 * MLB ERA vs OPS Visualization - History Module
 * Handles team history tracking and visualization
 */

const MLBHistory = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // Team history tracking and visualization
    const historyCache = {};
    
    // Track active team to prevent animation restarts 
    let activeTeamId = null;
    
    /**
     * Function to fetch historical data for a team with caching improvements
     * @param {number} teamId - The team ID
     * @param {number} days - Number of days of history to fetch
     * @returns {Promise} Promise that resolves with history data
     */
    function fetchTeamHistory(teamId, days = 90) {
        // If already in cache, return promise of cached data
        if (historyCache[teamId]) {
            return Promise.resolve(historyCache[teamId]);
        }
        
        logger.log(`Fetching history for team ID: ${teamId}`);
        
        // Add a cache timestamp to avoid browser caching
        const cacheParam = new Date().getTime();
        
        // Otherwise fetch from API with a timeout
        return new Promise((resolve, reject) => {
            // Create a timeout for the fetch
            const timeoutId = setTimeout(() => {
                logger.error(`History fetch timeout for team ${teamId}`);
                // Resolve with empty array to avoid blocking UI
                resolve([]);
            }, 5000); // 5 second timeout
            
            // Execute the fetch
            fetch(`/api/team-history/${teamId}?days=${days}&_=${cacheParam}`)
                .then(response => {
                    clearTimeout(timeoutId);
                    return response.json();
                })
                .then(history => {
                    logger.log(`Received ${history.length} historical points for team ${teamId}`);
                    // Store in cache
                    historyCache[teamId] = history;
                    return resolve(history);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    logger.error('Error fetching team history:', err);
                    // Resolve with empty array to avoid blocking UI
                    resolve([]);
                });
        });
    }
    
    /**
     * Set up hover listener to fetch team history with improved animation
     * @param {object} chart - The Chart.js chart instance
     */
    function setupHistoryTracking(chart) {
        if (!chart) return;
        
        // Clean up any existing event listeners
        const canvas = chart.canvas;
        if (canvas._historyListenerAdded) return;
        
        // Cache for recently viewed teams to reduce fetch calls
        const recentTeams = new Set();
        
        // Use a debounce function to prevent excessive API calls
        let debounceTimer = null;
        
        canvas.addEventListener('mousemove', (e) => {
            // Clear any pending debounce timer
            if (debounceTimer) clearTimeout(debounceTimer);
            
            // Set a new debounce timer (50ms)
            debounceTimer = setTimeout(() => {
                const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
                
                if (points.length > 0) {
                    const firstPoint = points[0];
                    const { datasetIndex, index } = firstPoint;
                    
                    // CHECK IF POINT IS HIDDEN - Don't show history for hidden teams
                    if (chart.getDatasetMeta(datasetIndex).data[index].hidden) {
                        // Reset active team if it was a hidden point
                        activeTeamId = null;
                        return;
                    }
                    
                    const dataPoint = chart.data.datasets[datasetIndex].data[index];
                    
                    // Get the team ID from the data point
                    const teamId = dataPoint.id;
                    
                    // Only set animation start time if this is a new team
                    if (teamId !== activeTeamId) {
                        // Reset animation start time for new team only
                        chart._historyAnimStart = Date.now();
                        activeTeamId = teamId;
                    }
                    
                    // Fetch history data if needed and not recently viewed
                    if (teamId && !historyCache[teamId] && !recentTeams.has(teamId)) {
                        // Add to recent teams set to prevent duplicate fetches
                        recentTeams.add(teamId);
                        
                        // Limit the size of recentTeams
                        if (recentTeams.size > 5) {
                            // Remove oldest entry (first item in set)
                            recentTeams.delete(recentTeams.values().next().value);
                        }
                        
                        fetchTeamHistory(teamId)
                            .then(() => {
                                // Only trigger update if component is still mounted and this is still the active team
                                if (chart.ctx && activeTeamId === teamId) {
                                    // Use requestAnimationFrame for smoother updates
                                    requestAnimationFrame(() => chart.draw());
                                }
                            });
                    }
                } else {
                    // Mouse is not over any team point, reset active team
                    activeTeamId = null;
                }
            }, 50);
        });
        
        // Add mouseout event to reset active team when mouse leaves chart
        canvas.addEventListener('mouseout', () => {
            activeTeamId = null;
        });
        
        canvas._historyListenerAdded = true;
        logger.log("History tracking event listeners set up with improved animation");
    }
    
    /**
     * Draw historical lines for a team on chart hover
     * @param {object} chart - The Chart.js chart instance
     * @param {object} tooltip - The active tooltip
     */
    function drawHistoryLine(chart, tooltip) {
        if (!tooltip._active || tooltip._active.length === 0) return;
        
        // Get the hovered point
        const activePoint = tooltip._active[0];
        const { datasetIndex, index } = activePoint;
        
        // CHECK IF POINT IS HIDDEN - Don't draw history for hidden teams
        if (chart.getDatasetMeta(datasetIndex).data[index].hidden) {
            return;
        }
        
        const dataPoint = chart.data.datasets[datasetIndex].data[index];
        
        // Skip if no team ID
        if (!dataPoint || !dataPoint.id) return;
        
        // Check if we have history data for this team
        if (historyCache[dataPoint.id]) {
            const history = historyCache[dataPoint.id];
            
            // Need at least 2 points to draw a line
            if (!history || history.length < 2) {
                logger.log(`Not enough history points for team ${dataPoint.id}: ${history ? history.length : 0}`);
                return;
            }
            
            // Get animation progress (0.0 to 1.0)
            const timestamp = Date.now();
            const animDuration = 1000; // Reduced from 1500ms to 1000ms for quicker animation
            
            // Only use stored animation start time if this is the active team
            // This prevents flashing the full line and restarting animation
            const animStartTime = (activeTeamId === dataPoint.id && chart._historyAnimStart) 
                ? chart._historyAnimStart 
                : timestamp;
            
            const progress = Math.min(1.0, (timestamp - animStartTime) / animDuration);
            
            // Draw the line
            const ctx = chart.ctx;
            ctx.save();
            
            // IMPORTANT FIX: Always draw all points when animation is complete or nearly complete
            // This ensures all data points are eventually shown
            const pointsToDraw = progress > 0.95 ? 
                history.length : // Show all points when animation is nearly complete
                Math.max(2, Math.ceil(history.length * progress));
                
            const animatedHistory = history.slice(0, pointsToDraw);
            
            // First draw the line
            ctx.beginPath();
            
            // Use chart scales to convert data to pixels
            let first = true;
            animatedHistory.forEach(point => {
                // Skip points with invalid data
                if (point.era === undefined || point.ops === undefined || 
                    isNaN(parseFloat(point.era)) || isNaN(parseFloat(point.ops))) {
                    return;
                }
                
                const x = chart.scales.x.getPixelForValue(parseFloat(point.ops));
                const y = chart.scales.y.getPixelForValue(parseFloat(point.era));
                
                if (first) {
                    ctx.moveTo(x, y);
                    first = false;
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            // Style the line
            ctx.strokeStyle = 'rgba(0, 45, 114, 0.7)';  // MLB blue with opacity
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Now add dots at each point
            animatedHistory.forEach((point, i) => {
                // Skip points with invalid data
                if (point.era === undefined || point.ops === undefined || 
                    isNaN(parseFloat(point.era)) || isNaN(parseFloat(point.ops))) {
                    return;
                }
                
                const x = chart.scales.x.getPixelForValue(parseFloat(point.ops));
                const y = chart.scales.y.getPixelForValue(parseFloat(point.era));
                
                // Highlight the most recent point
                const isLatest = i === animatedHistory.length - 1;
                
                ctx.beginPath();
                ctx.arc(x, y, isLatest ? 5 : 3, 0, Math.PI * 2);
                ctx.fillStyle = isLatest ? 
                    'rgba(227, 25, 55, 0.9)' :  // MLB red with higher opacity for latest
                    'rgba(227, 25, 55, 0.7)';   // MLB red with lower opacity for others
                ctx.fill();
                
                // Add date tooltip on hover for each point
                if (isLatest && point.timestamp) {
                    try {
                        const date = new Date(point.timestamp);
                        if (!isNaN(date.getTime())) {
                            const dateStr = date.toLocaleDateString();
                            
                            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                            ctx.font = '10px Roboto';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(dateStr, x, y - 10);
                        }
                    } catch (e) {
                        logger.error(`Error formatting date: ${e}`);
                    }
                }
            });
            
            ctx.restore();
            
            // Request animation frame if not complete and this is still the active team
            if (progress < 1.0 && dataPoint.id === activeTeamId) {
                chart._historyAnimRequest = window.requestAnimationFrame(() => {
                    chart.draw();
                });
            }
        } else {
            // If no history data in cache, try to fetch it
            fetchTeamHistory(dataPoint.id)
                .then(history => {
                    if (history && history.length > 0) {
                        logger.log(`Fetched ${history.length} history points for team ${dataPoint.id}`);
                        // Only redraw if this is still the active team
                        if (activeTeamId === dataPoint.id) {
                            chart.draw(); // Redraw to show history
                        }
                    } else {
                        logger.log(`No history found for team ${dataPoint.id}`);
                    }
                });
        }
    }
    
    // Update fetchTeamHistory to match the server-side limit parameter
    function fetchTeamHistory(teamId, days = 90) {
        // If already in cache, return promise of cached data
        if (historyCache[teamId]) {
            return Promise.resolve(historyCache[teamId]);
        }
        
        logger.log(`Fetching history for team ID: ${teamId}`);
        
        // Add a cache timestamp to avoid browser caching
        const cacheParam = new Date().getTime();
        
        // Otherwise fetch from API with a timeout
        return new Promise((resolve, reject) => {
            // Create a timeout for the fetch
            const timeoutId = setTimeout(() => {
                logger.error(`History fetch timeout for team ${teamId}`);
                // Resolve with empty array to avoid blocking UI
                resolve([]);
            }, 5000); // 5 second timeout
            
            // Execute the fetch
            fetch(`/api/team-history/${teamId}?days=${days}&_=${cacheParam}`)
                .then(response => {
                    clearTimeout(timeoutId);
                    return response.json();
                })
                .then(history => {
                    logger.log(`Received ${history.length} historical points for team ${teamId}`);
                    // Store in cache
                    historyCache[teamId] = history;
                    return resolve(history);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    logger.error('Error fetching team history:', err);
                    // Resolve with empty array to avoid blocking UI
                    resolve([]);
                });
        });
    }
    /**
     * Create a plugin to draw historical lines on hover
     */
    function createHistoryLinePlugin() {
        return {
            id: 'historyLine',
            afterDraw: (chart) => {
                drawHistoryLine(chart, chart.tooltip);
            }
        };
    }
    
    // Public API
    return {
        fetchTeamHistory: fetchTeamHistory,
        setupHistoryTracking: setupHistoryTracking,
        createHistoryLinePlugin: createHistoryLinePlugin
    };
})(window, document, jQuery, MLBConfig);