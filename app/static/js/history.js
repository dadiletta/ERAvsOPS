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
    
    /**
     * Function to fetch historical data for a team
     * @param {number} teamId - The team ID
     * @param {number} days - Number of days of history to fetch
     * @returns {Promise} Promise that resolves with history data
     */
    function fetchTeamHistory(teamId, days = 30) {
        // If already in cache, return promise of cached data
        if (historyCache[teamId]) {
            return Promise.resolve(historyCache[teamId]);
        }
        
        logger.log(`Fetching history for team ID: ${teamId}`);
        
        // Otherwise fetch from API
        return fetch(`/api/team-history/${teamId}?days=${days}`)
            .then(response => response.json())
            .then(history => {
                logger.log(`Received ${history.length} historical points for team ${teamId}`);
                // Store in cache
                historyCache[teamId] = history;
                return history;
            })
            .catch(err => {
                logger.error('Error fetching team history:', err);
                return [];
            });
    }
    
    /**
     * Set up hover listener to fetch team history
     * @param {object} chart - The Chart.js chart instance
     */
    function setupHistoryTracking(chart) {
        if (!chart) return;
        
        // Clean up any existing event listeners
        const canvas = chart.canvas;
        if (canvas._historyListenerAdded) return;
        
        canvas.addEventListener('mousemove', (e) => {
            const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            
            if (points.length > 0) {
                const firstPoint = points[0];
                const { datasetIndex, index } = firstPoint;
                const dataPoint = chart.data.datasets[datasetIndex].data[index];
                
                // Reset animation start time
                chart._historyAnimStart = Date.now();
                
                // Get the team ID from the data point
                const teamId = dataPoint.id;
                
                // Fetch history data if needed
                if (teamId && !historyCache[teamId]) {
                    fetchTeamHistory(teamId)
                        .then(() => {
                            // Trigger a redraw to show the history line
                            chart.update();
                        });
                }
            }
        });
        
        canvas._historyListenerAdded = true;
        logger.log("History tracking event listeners set up");
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
            const animDuration = 1500; // 1.5 seconds for full animation
            const animStartTime = chart._historyAnimStart || timestamp;
            chart._historyAnimStart = animStartTime;
            
            const progress = Math.min(1.0, (timestamp - animStartTime) / animDuration);
            
            // Draw the line
            const ctx = chart.ctx;
            ctx.save();
            
            // Calculate how many points to draw based on animation progress
            const pointsToDraw = Math.max(2, Math.ceil(history.length * progress));
            const animatedHistory = history.slice(0, pointsToDraw);
            
            // First draw the line
            ctx.beginPath();
            
            // Use chart scales to convert data to pixels
            let first = true;
            animatedHistory.forEach(point => {
                // Skip points with invalid data
                if (point.era === undefined || point.ops === undefined) return;
                
                const x = chart.scales.x.getPixelForValue(point.ops);
                const y = chart.scales.y.getPixelForValue(point.era);
                
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
                if (point.era === undefined || point.ops === undefined) return;
                
                const x = chart.scales.x.getPixelForValue(point.ops);
                const y = chart.scales.y.getPixelForValue(point.era);
                
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
            
            // Request animation frame if not complete
            if (progress < 1.0) {
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
                        chart.draw(); // Redraw to show history
                    } else {
                        logger.log(`No history found for team ${dataPoint.id}`);
                    }
                });
        }
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