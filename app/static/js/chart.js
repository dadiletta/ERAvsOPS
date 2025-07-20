// app/static/js/chart.js

/**
 * MLB ERA vs OPS Visualization - Chart Module
 * Handles chart creation and team data visualization
 */

const MLBChart = (function(window, document, MLBConfig, MLBHistory) {
    "use strict";
    
    const logger = MLBConfig.logger;
    const CONFIG = MLBConfig.CHART;
    
    // Store the chart reference
    let mlbChart = null;
    
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
                    if (mlbChart) {
                        mlbChart.update();
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
    
    // Custom tooltip plugin with hidden point check
    const tooltipPlugin = {
        id: 'mlbTooltip',
        beforeTooltipDraw: (chart, args, options) => {
            const { tooltip } = args;
            
            if (tooltip.opacity === 0) return;
            
            // Check if the active point is hidden - ADDED THIS SECTION
            if (tooltip._active && tooltip._active.length > 0) {
                const activePoint = tooltip._active[0];
                const meta = chart.getDatasetMeta(activePoint.datasetIndex);
                // If the point is hidden, set tooltip opacity to 0
                if (meta.data[activePoint.index].hidden) {
                    tooltip.opacity = 0;
                    return;
                }
            }
            
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
            ctx.strokeStyle = MLBConfig.COLORS.blue;
            ctx.stroke();
            ctx.restore();
        }
    };
    
    /**
     * Initialize chart when DOM is fully loaded with division filter support
     */
    function initializeChart() {
        // Get team data passed from Flask
        const teamData = window.teamData || [];
        const ctx = document.getElementById('mlbChart').getContext('2d');
        
        // Log minimal but useful information
        logger.info("Chart initialization started");
        logger.log("Team data count:", teamData.length);
        
        // Create datasets for team positioning
        const teamPoints = teamData.map(team => ({
            x: parseFloat(team.ops),
            y: parseFloat(team.era),
            team: team.name,
            fullName: team.full_name || team.name,
            abbreviation: team.abbreviation,
            logo: team.logo,
            id: team.id,  // Important: Include team ID for history tracking
            division: team.division || 'Unknown',
            league: team.league || 'Unknown'
        }));
        
        // Preload all team logos before chart creation
        preloadTeamLogos(teamData);
        
        // Get font sizes
        const fontSizes = MLBConfig.getFontSizes();
        
        // Get the history line plugin
        const historyLinePlugin = MLBHistory.createHistoryLinePlugin();
        
        // Create the chart
        mlbChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'MLB Teams',
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
                            color: MLBConfig.COLORS.blueFaded
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
                            color: MLBConfig.COLORS.redFaded
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
                        titleColor: MLBConfig.COLORS.blue,
                        bodyColor: '#333',
                        borderColor: MLBConfig.COLORS.blue,
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
                        // Added custom filter function to skip hidden points
                        filter: function(tooltipItem) {
                            // We added a custom filter in the tooltipPlugin, so this is redundant
                            // but having both methods ensures it works in all scenarios
                            return true;
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
                                    // Display just the division name without the "Division: " prefix
                                    return [
                                        `ERA: ${point.y.toFixed(2)}`,
                                        `OPS: ${point.x.toFixed(3)}`,
                                        `${point.division}`
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
        
        // Position quadrant labels after chart is rendered
        positionQuadrantLabels();
        // Store chart in window for external access
        window.mlbChart = mlbChart;
        
        // Set up history tracking
        MLBHistory.setupHistoryTracking(mlbChart);
        
        // Apply division filtering if initialized
        if (typeof MLBDivisionFilter !== 'undefined' && 
            typeof MLBDivisionFilter.isInitialized === 'function' && 
            MLBDivisionFilter.isInitialized()) {
            setTimeout(() => {
                MLBDivisionFilter.applyDivisionFilter();
            }, 500);
        }
        
        // Force a redraw after a slight delay to ensure logos appear
        setTimeout(() => {
            if (mlbChart) {
                mlbChart.update();
                logger.log("Forced chart update after initialization");
            }
        }, 300);
        
        // Position the quadrant labels after chart is rendered
        setTimeout(positionQuadrantLabels, 500);
        
        logger.info("Chart initialization completed");

        $(document).trigger('chartUpdated');
    }
    
    /**
     * Get division information for a team
     * @param {number} teamId - Team ID
     * @returns {Object|null} Division information or null if team not found
     */
    function getTeamDivision(teamId) {
        // Check if MLBDivisionUtils is available
        if (window.MLBDivisionUtils) {
            // Find the team data point
            const dataPoint = findTeamById(teamId);
            if (dataPoint) {
                return MLBDivisionUtils.getDivisionInfo(dataPoint);
            }
        }
        
        // Fallback to simple lookup
        if (mlbChart && mlbChart.data && mlbChart.data.datasets && mlbChart.data.datasets[0]) {
            const points = mlbChart.data.datasets[0].data;
            const team = points.find(p => p.id == teamId);
            
            if (team) {
                return {
                    teamId: team.id,
                    teamName: team.fullName,
                    abbreviation: team.abbreviation,
                    division: team.division || 'Unknown',
                    league: team.league || 'Unknown'
                };
            }
        }
        
        return null;
    }
    
    /**
     * Find team data point by ID
     * @param {number} teamId - Team ID to find
     * @returns {Object|null} Team data point or null if not found
     */
    function findTeamById(teamId) {
        if (!mlbChart || !mlbChart.data || !mlbChart.data.datasets || !mlbChart.data.datasets[0]) {
            return null;
        }
        
        const points = mlbChart.data.datasets[0].data;
        return points.find(p => p.id == teamId) || null;
    }
    
    /**
     * Get all teams in a division
     * @param {string} division - Division name (e.g., "AL East")
     * @returns {Array} Array of team data points in the division
     */
    function getTeamsInDivision(division) {
        if (!mlbChart || !mlbChart.data || !mlbChart.data.datasets || !mlbChart.data.datasets[0]) {
            return [];
        }
        
        const points = mlbChart.data.datasets[0].data;
        return points.filter(p => p.division === division);
    }
    
    /**
     * Function to position quadrant labels
     */
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
        
        if (MLBConfig.isMobileDevice()) {
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
                // Simply set the position without any offset adjustments
                // The transform: translate(-50%, -50%) in CSS will handle centering
                label.style.left = (chartWidth * pos.x) + 'px';
                label.style.top = (chartHeight * pos.y) + 'px';
            }
        }
    }
    
    /**
     * Function to update chart data with fixed animation
     */
    function updateChartData(newData) {
        if (!mlbChart) {
            logger.error("Chart not initialized");
            return false;
        }
        
        logger.info("Updating chart with new data...");
        
        // Make sure we have non-empty data
        if (!newData || newData.length === 0) {
            logger.error("No data provided to update chart");
            return false;
        }
        
        // Format data for chart
        const formattedData = newData.map(team => ({
            x: parseFloat(team.ops),
            y: parseFloat(team.era),
            team: team.name,
            fullName: team.full_name || team.name,
            abbreviation: team.abbreviation,
            logo: team.logo,
            id: team.id,
            division: team.division || 'Unknown',
            league: team.league || 'Unknown'
        }));
        
        // Preload team logos
        preloadTeamLogos(newData);
        
        // Update chart data preserving team identity
        const chart = mlbChart;
        chart.data.datasets[0].data = formattedData;
        
        // Update with minimal animation
        chart.options.animation = {
            duration: 300,
            easing: 'easeOutQuad'
        };
        
        chart.update('none');
        
        // Reset animation settings
        chart.options.animation = {
            duration: CONFIG.animation.duration,
            easing: CONFIG.animation.easing
        };
        
        // Apply division filtering if initialized
        if (typeof MLBDivisionFilter !== 'undefined' && 
            typeof MLBDivisionFilter.isInitialized === 'function' && 
            MLBDivisionFilter.isInitialized()) {
            setTimeout(() => {
                MLBDivisionFilter.applyDivisionFilter();
            }, 100);
        }
        
        // Reposition quadrant labels
        setTimeout(positionQuadrantLabels, 500);
        
        logger.info("Chart data updated with minimal animation");

        $(document).trigger('chartUpdated');
        
        return true;
    }
     
    // Public API
    return {
        initialize: initializeChart,
        updateChartData: updateChartData,
        positionQuadrantLabels: positionQuadrantLabels,
        forceUpdate: function() {
            if (mlbChart) {
                mlbChart.update();
                logger.log("Manual chart update triggered");
            }
        },
        // Division-related functions
        getTeamDivision: getTeamDivision,
        findTeamById: findTeamById,
        getTeamsInDivision: getTeamsInDivision
    };
})(window, document, MLBConfig, MLBHistory);