// app/static/js/chart.js

// Chart and visualization module
(function(window, document) {
    "use strict";
    
    // Configuration variables for easy future adjustments
    const CONFIG = {
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
        mlbColors: {
            blue: '#002D72',
            red: '#E31937',
            blueFaded: 'rgba(0, 45, 114, 0.8)',
            redFaded: 'rgba(227, 25, 55, 0.8)'
        },
        animation: {
            duration: 800,
            easing: 'easeOutQuad'
        },
        fontFamily: "'Roboto', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        debugMode: true // Enable for troubleshooting logo issues
    };

    // Logger for debugging
    const logger = {
        debugMode: CONFIG.debugMode,
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

    /**
     * Create a properly sized image from the original
     * Force visibility with explicit attributes
     */
    function createImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            
            // Set critical attributes for visibility
            img.crossOrigin = "anonymous";
            img.width = CONFIG.logoSize;
            img.height = CONFIG.logoSize;
            
            // Add inline styling to force visibility
            img.style.maxWidth = `${CONFIG.logoSize}px`;
            img.style.maxHeight = `${CONFIG.logoSize}px`;
            img.style.width = `${CONFIG.logoSize}px`;
            img.style.height = `${CONFIG.logoSize}px`;
            img.style.objectFit = 'contain';
            img.style.display = 'block';
            img.style.visibility = 'visible';
            img.style.opacity = '1';
            img.style.zIndex = '15';
            
            // Handle load event
            img.onload = function() {
                resolve(img);
            };
            
            // Handle error event
            img.onerror = function(e) {
                logger.error(`Failed to load image: ${src}`, e);
                reject(e);
            };
            
            // Set source last
            img.src = src;
        });
    }

    /**
     * Preload team logos at the right size
     * Improved with proper Promise handling
     */
    function preloadTeamLogos(teams) {
        logger.log(`Preloading logos for ${teams.length} teams`);
        
        teams.forEach(team => {
            // Ensure logo path has leading slash
            const logoPath = team.logo.startsWith('/') ? team.logo : `/${team.logo}`;
            
            // Skip if already in cache
            if (CONFIG.logoCache[logoPath]) {
                logger.log(`Logo already in cache: ${logoPath}`);
                return;
            }
            
            logger.log(`Loading logo: ${logoPath} for team ${team.name}`);
            
            // Create placeholder while loading
            const placeholder = document.createElement('canvas');
            placeholder.width = CONFIG.logoSize;
            placeholder.height = CONFIG.logoSize;
            const ctx = placeholder.getContext('2d');
            
            // Draw team abbreviation on placeholder
            ctx.beginPath();
            ctx.arc(CONFIG.logoSize/2, CONFIG.logoSize/2, CONFIG.logoSize/2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f0f0f0';
            ctx.fill();
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(team.abbreviation || team.name.substring(0, 3).toUpperCase(), CONFIG.logoSize/2, CONFIG.logoSize/2);
            
            // Store the placeholder in cache
            CONFIG.logoCache[logoPath] = placeholder;
            
            // Load the actual image
            createImage(logoPath)
                .then(img => {
                    logger.log(`Successfully loaded logo: ${logoPath}`);
                    CONFIG.logoCache[logoPath] = img;
                    
                    // Force chart update if it exists
                    if (window.mlbChart) {
                        window.mlbChart.update();
                    }
                })
                .catch(error => {
                    logger.error(`Error loading logo for ${team.name}: ${error}`);
                    // Keep using placeholder if image fails to load
                });
        });
    }

    // Create quadrant background plugin
    const quadrantPlugin = {
        id: 'quadrantBackgrounds',
        beforeDraw: (chart) => {
            const { ctx, chartArea, scales } = chart;
            const { left, top, right, bottom } = chartArea;
            const midX = scales.x.getPixelForValue(CONFIG.axisLines.xValue);
            const midY = scales.y.getPixelForValue(CONFIG.axisLines.yValue);
            
            // Draw quadrant backgrounds
            // Top-left: Good Pitching, Bad Hitting (cream)
            ctx.fillStyle = CONFIG.quadrantColors.topLeft;
            ctx.fillRect(left, top, midX - left, midY - top);
            
            // Top-right: Good Pitching, Good Hitting (light green)
            ctx.fillStyle = CONFIG.quadrantColors.topRight;
            ctx.fillRect(midX, top, right - midX, midY - top);
            
            // Bottom-left: Bad Pitching, Bad Hitting (light pink)
            ctx.fillStyle = CONFIG.quadrantColors.bottomLeft;
            ctx.fillRect(left, midY, midX - left, bottom - midY);
            
            // Bottom-right: Bad Pitching, Good Hitting (light yellow)
            ctx.fillStyle = CONFIG.quadrantColors.bottomRight;
            ctx.fillRect(midX, midY, right - midX, bottom - midY);
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

    // Team history tracking and visualization
    const historyCache = {};

    // Function to fetch historical data for a team
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

    // Create a plugin to draw historical lines on hover
    const historyLinePlugin = {
        id: 'historyLine',
        afterDraw: (chart) => {
            if (!chart.tooltip._active || chart.tooltip._active.length === 0) return;
            
            // Get the hovered point
            const activePoint = chart.tooltip._active[0];
            const { datasetIndex, index } = activePoint;
            const dataPoint = chart.data.datasets[datasetIndex].data[index];
            
            // Skip if no team ID
            if (!dataPoint.id) return;
            
            // Check if we have history data for this team
            if (historyCache[dataPoint.id]) {
                const history = historyCache[dataPoint.id];
                
                // Need at least 2 points to draw a line
                if (history.length < 2) return;
                
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
                        const date = new Date(point.timestamp);
                        const dateStr = date.toLocaleDateString();
                        
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.font = '10px Roboto';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(dateStr, x, y - 10);
                    }
                });
                
                ctx.restore();
                
                // Request animation frame if not complete
                if (progress < 1.0) {
                    chart._historyAnimRequest = window.requestAnimationFrame(() => {
                        chart.draw();
                    });
                }
            }
        }
    };

    // Initialize chart when DOM is fully loaded
    function initializeChart() {
        // Get team data passed from Flask
        const teamData = window.teamData || [];
        const dataStatus = window.dataStatus || {};
        const ctx = document.getElementById('mlbChart').getContext('2d');
        
        // Log minimal but useful information
        logger.info("Chart initialization started");
        logger.log("Team data count:", teamData.length);
        
        if (dataStatus.update_in_progress) {
            logger.info(`Background update in progress: ${dataStatus.teams_updated}/${dataStatus.total_teams} teams`);
        }
        
        // Create datasets for team positioning
        const teamPoints = teamData.map(team => ({
            x: team.ops,
            y: team.era,
            team: team.name,
            fullName: team.full_name || team.name,
            abbreviation: team.abbreviation,
            logo: team.logo,
            id: team.id  // Important: Include team ID for history tracking
        }));
        
        // Preload all team logos before chart creation
        preloadTeamLogos(teamData);
        
        // Get font sizes
        const fontSizes = getFontSizes();
        
        // Add the responsive tooltip plugin
        const tooltipPlugin = {
            id: 'mlbTooltip',
            beforeTooltipDraw: (chart, args, options) => {
                const { tooltip } = args;
                const { chartArea } = chart;
                
                if (tooltip.opacity === 0) return;
                
                // Draw an MLB-colored border around the tooltip
                const ctx = chart.ctx;
                ctx.save();
                ctx.globalAlpha = 0.8;
                ctx.beginPath();
                ctx.moveTo(tooltip.x, tooltip.y);
                ctx.lineTo(tooltip.x + tooltip.width + 2, tooltip.y);
                ctx.lineTo(tooltip.x + tooltip.width + 2, tooltip.y + tooltip.height + 2);
                ctx.lineTo(tooltip.x, tooltip.y + tooltip.height + 2);
                ctx.closePath();
                ctx.lineWidth = 3;
                ctx.strokeStyle = CONFIG.mlbColors.blue;
                ctx.stroke();
                ctx.restore();
            }
        };
        
        // Store chart reference globally for updates
        window.mlbChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: teamPoints,
                    pointStyle: function(context) {
                        const index = context.dataIndex;
                        if (index === undefined || !teamPoints[index]) return null;
                        
                        const point = teamPoints[index];
                        // Make sure logo path has leading slash
                        const logoPath = point.logo.startsWith('/') ? point.logo : `/${point.logo}`;
                        
                        // Return the cached image or placeholder
                        const image = CONFIG.logoCache[logoPath];
                        if (!image) {
                            logger.error(`No image in cache for ${logoPath}`);
                        }
                        return image || null;
                    },
                    // Match pointRadius to half the logo size for proper scaling
                    pointRadius: CONFIG.logoSize / 2,
                    z: 20,
                    backgroundColor: 'rgba(0, 0, 0, 0)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Set events to include all (not just hover)
                events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'],
                animation: {
                    duration: CONFIG.animation.duration,
                    easing: CONFIG.animation.easing,
                },
                transitions: {
                    active: {
                        animation: {
                            duration: CONFIG.animation.duration
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'OPS (On-base Plus Slugging)',
                            font: {
                                size: fontSizes.axisLabel,
                                weight: 'bold',
                                family: CONFIG.fontFamily
                            },
                            color: CONFIG.mlbColors.blueFaded
                        },
                        min: 0.53,
                        max: 0.87,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            lineWidth: 1
                        },
                        ticks: {
                            stepSize: 0.05,
                            font: {
                                size: fontSizes.tickLabel,
                                family: CONFIG.fontFamily
                            },
                            color: '#666'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'ERA (Earned Run Average)',
                            font: {
                                size: fontSizes.axisLabel,
                                weight: 'bold',
                                family: CONFIG.fontFamily
                            },
                            color: CONFIG.mlbColors.redFaded
                        },
                        min: 1.9,
                        max: 6.0,
                        reverse: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)',
                            lineWidth: 1
                        },
                        ticks: {
                            stepSize: 0.5,
                            font: {
                                size: fontSizes.tickLabel,
                                family: CONFIG.fontFamily
                            },
                            color: '#666'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        titleColor: CONFIG.mlbColors.blue,
                        bodyColor: '#333',
                        borderColor: CONFIG.mlbColors.blue,
                        borderWidth: 1,
                        cornerRadius: 6,
                        padding: 10,
                        displayColors: false,
                        titleFont: {
                            size: fontSizes.tooltip + 2,
                            weight: 'bold',
                            family: CONFIG.fontFamily
                        },
                        bodyFont: {
                            size: fontSizes.tooltip,
                            family: CONFIG.fontFamily
                        },
                        callbacks: {
                            // Fix for multiple teams at the same position
                            title: function(tooltipItems) {
                                // Get unique team names (in case some are duplicated)
                                const teamNames = [...new Set(tooltipItems.map(item => item.raw.fullName))];
                                
                                // Join team names with " & " if there are multiple
                                if (teamNames.length > 1) {
                                    return teamNames.join(' & ');
                                }
                                
                                // Single team case
                                return tooltipItems[0].raw.fullName;
                            },
                            // Fix for duplicate stats when teams overlap
                            label: function(tooltipItem) {
                                const point = tooltipItem.raw;
                                
                                // Find index of first item with same coordinates
                                const firstIndex = tooltipItem.dataset.data.findIndex(
                                    p => p.x === point.x && p.y === point.y
                                );
                                
                                // Only show stats for the first occurrence of this point
                                if (tooltipItem.dataIndex === firstIndex) {
                                    return [
                                        `ERA: ${point.y.toFixed(2)}`,
                                        `OPS: ${point.x.toFixed(3)}`,
                                        `[Hover to see history]`
                                    ];
                                }
                                return [];
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            verticalLine: {
                                type: 'line',
                                xMin: CONFIG.axisLines.xValue,
                                xMax: CONFIG.axisLines.xValue,
                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                borderWidth: 2,
                                borderDash: [6, 6],
                                label: {
                                    display: true,
                                    content: 'AVG OPS',
                                    position: 'bottom',
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                    color: '#666',
                                    font: {
                                        family: CONFIG.fontFamily
                                    },
                                    padding: 4
                                }
                            },
                            horizontalLine: {
                                type: 'line',
                                yMin: CONFIG.axisLines.yValue,
                                yMax: CONFIG.axisLines.yValue,
                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                borderWidth: 2,
                                borderDash: [6, 6],
                                label: {
                                    display: true,
                                    content: 'AVG ERA',
                                    position: 'left',
                                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                    color: '#666',
                                    font: {
                                        family: CONFIG.fontFamily
                                    },
                                    padding: 4
                                }
                            }
                        }
                    }
                }
            },
            plugins: [quadrantPlugin, tooltipPlugin, historyLinePlugin]
        });

        // Set up history tracking
        setupHistoryTracking();

        // Force a redraw after a slight delay to ensure logos appear
        setTimeout(() => {
            if (window.mlbChart) {
                window.mlbChart.update();
                logger.log("Forced chart update after initialization");
            }
        }, 300);
        
        // Position the quadrant labels after chart is rendered
        setTimeout(positionQuadrantLabels, 500);
        
        // Add window resize listener to reposition labels
        window.addEventListener('resize', function() {
            // Update font sizes when screen size changes
            if (window.mlbChart) {
                const newSizes = getFontSizes();
                
                // Update font sizes in chart options
                window.mlbChart.options.scales.x.title.font.size = newSizes.axisLabel;
                window.mlbChart.options.scales.y.title.font.size = newSizes.axisLabel;
                window.mlbChart.options.scales.x.ticks.font.size = newSizes.tickLabel;
                window.mlbChart.options.scales.y.ticks.font.size = newSizes.tickLabel;
                window.mlbChart.options.plugins.tooltip.titleFont.size = newSizes.tooltip + 2;
                window.mlbChart.options.plugins.tooltip.bodyFont.size = newSizes.tooltip;
                
                // Update the chart
                window.mlbChart.update();
            }
            
            // Reposition quadrant labels
            positionQuadrantLabels();
        });
        
        logger.info("Chart initialization completed");
    }

    // Set up hover listener to fetch team history
    function setupHistoryTracking() {
        if (!window.mlbChart) return;
        
        // Clean up any existing event listeners
        const canvas = window.mlbChart.canvas;
        if (canvas._historyListenerAdded) return;
        
        canvas.addEventListener('mousemove', (e) => {
            const points = window.mlbChart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, false);
            
            if (points.length > 0) {
                const firstPoint = points[0];
                const { datasetIndex, index } = firstPoint;
                const dataPoint = window.mlbChart.data.datasets[datasetIndex].data[index];
                
                // Reset animation start time
                window.mlbChart._historyAnimStart = Date.now();
                
                // Get the team ID from the data point
                const teamId = dataPoint.id;
                
                // Fetch history data if needed
                if (teamId && !historyCache[teamId]) {
                    fetchTeamHistory(teamId)
                        .then(() => {
                            // Trigger a redraw to show the history line
                            window.mlbChart.update();
                        });
                }
            }
        });
        
        canvas._historyListenerAdded = true;
        logger.log("History tracking event listeners set up");
    }

    // Function to update chart data with animation
    function updateChartData(newData) {
        if (!window.mlbChart) {
            logger.error("Chart not initialized");
            return false;
        }
        
        logger.info("Updating chart with new data...");
        
        // Preload new team logos
        preloadTeamLogos(newData);
        
        // Format data for chart
        const formattedData = newData.map(team => ({
            x: team.ops,
            y: team.era,
            team: team.name,
            fullName: team.full_name || team.name,
            abbreviation: team.abbreviation,
            logo: team.logo,
            id: team.id  // Important: Include team ID for history tracking
        }));
        
        // Update chart data with animation for smoother transition
        const chart = window.mlbChart;
        
        // First update the data
        chart.data.datasets[0].data = formattedData;
        
        // Then apply a longer animation duration for this update
        chart.options.animation = {
            duration: 1200,
            easing: 'easeOutQuad'
        };
        
        // Update and animate
        chart.update();
        
        // Return to normal animation duration after this update
        setTimeout(() => {
            chart.options.animation = {
                duration: CONFIG.animation.duration,
                easing: CONFIG.animation.easing
            };
            
            // Force another update to ensure all logos are visible
            chart.update();
        }, 1500);
        
        // Reposition quadrant labels
        setTimeout(positionQuadrantLabels, 1600);
        
        logger.info("Chart data updated with animation");
        
        return true;
    }

    // Function to position quadrant labels
    function positionQuadrantLabels() {
        const chart = document.getElementById('mlbChart');
        if (!chart) {
            logger.error("Chart element not found!");
            return;
        }
        
        const chartRect = chart.getBoundingClientRect();
        
        // Get chart dimensions
        const chartWidth = chartRect.width;
        const chartHeight = chartRect.height;
        
        // Position labels - moved further into corners (15% and 85% instead of 25% and 75%)
        // Adjust positioning for better visibility on mobile
        let positions;
        
        if (isMobileDevice()) {
            positions = {
                'top-left': { x: 0.20, y: 0.20 },
                'top-right': { x: 0.80, y: 0.20 },
                'bottom-left': { x: 0.20, y: 0.80 },
                'bottom-right': { x: 0.80, y: 0.80 }
            };
        } else {
            positions = {
                'top-left': { x: 0.15, y: 0.15 },
                'top-right': { x: 0.85, y: 0.15 },
                'bottom-left': { x: 0.15, y: 0.85 },
                'bottom-right': { x: 0.85, y: 0.85 }
            };
        }
        
        for (const id in positions) {
            const label = document.getElementById(id);
            if (label) {
                const pos = positions[id];
                label.style.left = (chartWidth * pos.x) + 'px';
                label.style.top = (chartHeight * pos.y) + 'px';
            }
        }
    }

    // Make sure the DOM is fully loaded before initializing
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeChart);
    } else {
        initializeChart();
    }

    // Expose public functions to the window object
    window.updateChartData = updateChartData;
    window.positionQuadrantLabels = positionQuadrantLabels;
    // Function to manually force an update (for debugging)
    window.forceChartUpdate = function() {
        if (window.mlbChart) {
            window.mlbChart.update();
            logger.log("Manual chart update triggered");
        }
    };

})(window, document);