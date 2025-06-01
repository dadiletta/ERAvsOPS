// app/static/js/history.js

/**
 * MLB ERA vs OPS Visualization - History Module
 * Handles team history tracking and visualization
 */

const MLBHistory = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // Team history tracking and visualization
    let historyCache = {};
    
    // Track active team and pending requests to prevent race conditions
    let activeTeamId = null;
    let pendingRequests = {};
    
    /**
     * Function to fetch historical data for a team with improved reliability
     * @param {number} teamId - The team ID
     * @param {number} days - Number of days of history to fetch
     * @returns {Promise} Promise that resolves with history data
     */
    function fetchTeamHistory(teamId, days = 90) {
        // If already in cache, return promise of cached data
        if (historyCache[teamId]) {
            return Promise.resolve(historyCache[teamId]);
        }
        
        // If request already pending for this team, return that promise
        if (pendingRequests[teamId]) {
            logger.log(`Request already pending for team ID: ${teamId}`);
            return pendingRequests[teamId];
        }
        
        logger.log(`Fetching history for team ID: ${teamId}`);
        
        // Create the promise and store it
        pendingRequests[teamId] = new Promise((resolve, reject) => {
            // Use a shorter timeout for better responsiveness
            const timeoutId = setTimeout(() => {
                logger.error(`History fetch timeout for team ${teamId}`);
                delete pendingRequests[teamId];
                // Resolve with empty array to avoid blocking UI
                resolve([]);
            }, 3000); // Reduced from 5 seconds
            
            // Execute the fetch with cache busting
            const cacheParam = new Date().getTime();
            fetch(`/api/team-history/${teamId}?days=${days}&_=${cacheParam}`)
                .then(response => {
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(history => {
                    logger.log(`Received ${history.length} historical points for team ${teamId}`);
                    if (history.length > 0) {
                        logger.log(`First point: era=${history[0].era}, ops=${history[0].ops}`);
                        logger.log(`Last point: era=${history[history.length-1].era}, ops=${history[history.length-1].ops}`);
                    }
                    
                    // Store in cache
                    historyCache[teamId] = history;
                    
                    // Remove from pending
                    delete pendingRequests[teamId];
                    
                    resolve(history);
                })
                .catch(err => {
                    clearTimeout(timeoutId);
                    logger.error('Error fetching team history:', err);
                    
                    // Remove from pending
                    delete pendingRequests[teamId];
                    
                    // Resolve with empty array to avoid blocking UI
                    resolve([]);
                });
        });
        
        return pendingRequests[teamId];
    }
    
    /**
     * Set up hover listener to fetch team history with improved reliability
     * @param {object} chart - The Chart.js chart instance
     */
    function setupHistoryTracking(chart) {
        if (!chart) return;
        
        // Clean up any existing event listeners
        const canvas = chart.canvas;
        if (canvas._historyListenerAdded) return;
        
        // Cache for recently viewed teams to reduce fetch calls
        const recentTeams = new Set();
        
        // Prefetch function for nearby teams
        const prefetchNearbyTeams = (currentTeamId) => {
            if (!chart.data || !chart.data.datasets || !chart.data.datasets[0]) return;
            
            const allTeams = chart.data.datasets[0].data;
            
            // Find current team
            const currentTeam = allTeams.find(t => t.id === currentTeamId);
            if (!currentTeam) return;
            
            // Find teams close to this one on the chart
            const nearbyTeams = allTeams.filter(team => {
                if (team.id === currentTeamId || historyCache[team.id]) return false;
                
                const eraDiff = Math.abs(team.y - currentTeam.y);
                const opsDiff = Math.abs(team.x - currentTeam.x);
                
                // Teams within 0.5 ERA and 0.05 OPS are considered "nearby"
                return eraDiff < 0.5 && opsDiff < 0.05;
            });
            
            // Prefetch up to 3 nearby teams
            nearbyTeams.slice(0, 3).forEach(team => {
                if (!pendingRequests[team.id] && !historyCache[team.id]) {
                    logger.log(`Prefetching history for nearby team ${team.id}`);
                    fetchTeamHistory(team.id);
                }
            });
        };
        
        // Use a debounce function with shorter delay for better responsiveness
        let debounceTimer = null;
        let lastHoveredTeamId = null;
        
        canvas.addEventListener('mousemove', (e) => {
            // Clear any pending debounce timer
            if (debounceTimer) clearTimeout(debounceTimer);
            
            // Set a new debounce timer (reduced to 25ms for better responsiveness)
            debounceTimer = setTimeout(() => {
                const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
                
                if (points.length > 0) {
                    const firstPoint = points[0];
                    const { datasetIndex, index } = firstPoint;
                    
                    // CHECK IF POINT IS HIDDEN - Don't show history for hidden teams
                    if (chart.getDatasetMeta(datasetIndex).data[index].hidden) {
                        // Reset active team if it was a hidden point
                        activeTeamId = null;
                        lastHoveredTeamId = null;
                        return;
                    }
                    
                    const dataPoint = chart.data.datasets[datasetIndex].data[index];
                    
                    // Get the team ID from the data point
                    const teamId = dataPoint.id;
                    
                    // Only process if this is a different team than last hover
                    if (teamId && teamId !== lastHoveredTeamId) {
                        lastHoveredTeamId = teamId;
                        
                        // Only set animation start time if this is a new team
                        if (teamId !== activeTeamId) {
                            // Reset animation start time for new team only
                            chart._historyAnimStart = Date.now();
                            activeTeamId = teamId;
                        }
                        
                        // Prefetch nearby teams
                        prefetchNearbyTeams(teamId);
                        
                        // Fetch history data if needed
                        if (!historyCache[teamId] && !pendingRequests[teamId]) {
                            // Add to recent teams set to prevent duplicate fetches
                            recentTeams.add(teamId);
                            
                            // Limit the size of recentTeams
                            if (recentTeams.size > 10) {
                                // Remove oldest entry (first item in set)
                                recentTeams.delete(recentTeams.values().next().value);
                            }
                            
                            fetchTeamHistory(teamId)
                                .then(() => {
                                    // Only trigger update if component is still mounted and this is still the active team
                                    if (chart.ctx && activeTeamId === teamId) {
                                        // Use requestAnimationFrame for smoother updates
                                        requestAnimationFrame(() => {
                                            if (chart && chart.draw) {
                                                chart.draw();
                                            }
                                        });
                                    }
                                });
                        } else if (historyCache[teamId]) {
                            // If we have cached data, still trigger a redraw
                            requestAnimationFrame(() => {
                                if (chart && chart.draw) {
                                    chart.draw();
                                }
                            });
                        }
                    }
                } else {
                    // Mouse is not over any team point, reset active team
                    activeTeamId = null;
                    lastHoveredTeamId = null;
                }
            }, 25); // Reduced from 50ms
        });
        
        // Add mouseout event to reset active team when mouse leaves chart
        canvas.addEventListener('mouseout', () => {
            activeTeamId = null;
            lastHoveredTeamId = null;
            if (debounceTimer) {
                clearTimeout(debounceTimer);
                debounceTimer = null;
            }
        });
        
        canvas._historyListenerAdded = true;
        logger.log("History tracking event listeners set up with improved reliability");
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
            const animDuration = 800; // Reduced animation duration for faster completion
            
            // Only use stored animation start time if this is the active team
            // This prevents flashing the full line and restarting animation
            const animStartTime = (activeTeamId === dataPoint.id && chart._historyAnimStart) 
                ? chart._historyAnimStart 
                : timestamp;
            
            const progress = Math.min(1.0, (timestamp - animStartTime) / animDuration);
            
            // Draw the line
            const ctx = chart.ctx;
            ctx.save();
            
            // Modified logic to show all points faster while keeping animation
            // Show all points after 70% progress (easier to see full history)
            const pointsToDraw = progress > 0.4 ? 
                history.length : // Show all points sooner in the animation
                Math.max(2, Math.ceil(history.length * (progress * 2.5))); // Speed up initial point display
                
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
            
            // Style the line with opacity based on progress
            const opacity = Math.min(0.7, progress + 0.2); // Start at 0.2 opacity and increase to 0.7
            ctx.strokeStyle = `rgba(0, 45, 114, ${opacity})`;
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
                    `rgba(227, 25, 55, ${opacity + 0.2})` :  // MLB red with higher opacity for latest
                    `rgba(227, 25, 55, ${opacity})`;   // MLB red with lower opacity for others
                ctx.fill();
                
                // Add date tooltip on hover for each point
                if (isLatest && point.timestamp) {
                    try {
                        const date = new Date(point.timestamp);
                        if (!isNaN(date.getTime())) {
                            const dateStr = date.toLocaleDateString();
                            
                            ctx.fillStyle = `rgba(0, 0, 0, ${opacity + 0.3})`;
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
    
    /**
     * Clear the history cache
     */
    function clearHistoryCache() {
        historyCache = {};
        pendingRequests = {};
        activeTeamId = null;
        logger.log("History cache cleared");
    }
    
    // Public API
    return {
        fetchTeamHistory: fetchTeamHistory,
        setupHistoryTracking: setupHistoryTracking,
        createHistoryLinePlugin: createHistoryLinePlugin,
        clearHistoryCache: clearHistoryCache
    };
})(window, document, jQuery, MLBConfig);