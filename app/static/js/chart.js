// app/static/js/chart.js

// Chart and visualization module
(function(window, document) {
    "use strict";
    
    // Configuration variables for easy future adjustments
    const CONFIG = {
        logoSize: 30,          // Base logo size in pixels
        aspectRatio: 1,        // Default aspect ratio for logos (1:1)
        logoCache: {},         // Cache for preloaded logo images
        quadrantColors: {
            topLeft: 'rgba(255, 248, 225, 0.3)',    // Cream (Good Pitching, Bad Hitting)
            topRight: 'rgba(232, 245, 233, 0.3)',   // Light green (Good Pitching, Good Hitting)
            bottomLeft: 'rgba(255, 235, 238, 0.3)', // Light pink (Bad Pitching, Bad Hitting)
            bottomRight: 'rgba(255, 255, 224, 0.3)' // Light yellow (Bad Pitching, Good Hitting)
        },
        axisLines: {
            xValue: 0.7, // OPS dividing line
            yValue: 4.0  // ERA dividing line
        },
        mlbColors: {
            blue: '#002D72',
            red: '#E31937'
        },
        animation: {
            duration: 800,
            easing: 'easeOutQuad'
        }
    };

    // Smart logger that only logs important information
    const logger = {
        debugMode: false,
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
        info: function(message, data) {
            if (console && console.info) {
                console.info(`[INFO] ${message}`);
            }
        }
    };

    /**
     * Preload and standardize team logos
     * - Ensures consistent dimensions
     * - Maintains proper aspect ratios
     * - Prevents logo jumping during resizing
     */
    function preloadTeamLogos(teams) {
        teams.forEach(team => {
            const logoPath = team.logo.startsWith('/') ? team.logo : `/${team.logo}`;
            
            // Skip if already in cache
            if (CONFIG.logoCache[logoPath]) return;
            
            const img = new Image();
            
            // Set up onload handler before setting src
            img.onload = function() {
                // Calculate aspect ratio of the original image
                const originalAspectRatio = img.naturalWidth / img.naturalHeight;
                
                // Create a canvas for standardizing the logo
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Set canvas dimensions to our desired logo size
                canvas.width = CONFIG.logoSize;
                canvas.height = CONFIG.logoSize;
                
                // Clear canvas with transparent background
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Calculate dimensions that preserve aspect ratio
                let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
                
                if (originalAspectRatio > 1) {
                    // Wider than tall
                    drawWidth = CONFIG.logoSize;
                    drawHeight = CONFIG.logoSize / originalAspectRatio;
                    offsetY = (CONFIG.logoSize - drawHeight) / 2;
                } else {
                    // Taller than wide or square
                    drawHeight = CONFIG.logoSize;
                    drawWidth = CONFIG.logoSize * originalAspectRatio;
                    offsetX = (CONFIG.logoSize - drawWidth) / 2;
                }
                
                // Draw the image centered and maintaining aspect ratio
                ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
                
                // Create a new image from the canvas
                const standardizedLogo = new Image();
                standardizedLogo.src = canvas.toDataURL('image/png');
                
                // Store the standardized logo in cache
                CONFIG.logoCache[logoPath] = standardizedLogo;
            };
            
            // Set image source to trigger loading
            img.src = logoPath;
            
            // Create a placeholder while the image loads
            const placeholder = new Image();
            placeholder.width = CONFIG.logoSize;
            placeholder.height = CONFIG.logoSize;
            
            // Store placeholder in cache until the real image loads
            CONFIG.logoCache[logoPath] = placeholder;
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

    // Initialize chart when DOM is fully loaded
    function initializeChart() {
        // Get team data passed from Flask
        const teamData = window.teamData || [];
        const dataStatus = window.dataStatus || {};
        const ctx = document.getElementById('mlbChart').getContext('2d');
        
        // Log minimal but useful information
        logger.info("Chart initialization started");
        
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
            logo: team.logo
        }));
        
        // Preload all team logos to ensure consistent sizing
        preloadTeamLogos(teamData);
        
        // Store chart reference globally for updates
        window.mlbChart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    data: teamPoints,
                    pointStyle: function(context) {
                        try {
                            const index = context.dataIndex;
                            if (index === undefined || !teamPoints[index]) {
                                logger.error(`Invalid data index: ${index}`);
                                return null;
                            }
                            
                            const point = teamPoints[index];
                            const logoPath = point.logo.startsWith('/') ? point.logo : `/${point.logo}`;
                            
                            // Use cached image if available
                            if (CONFIG.logoCache[logoPath]) {
                                return CONFIG.logoCache[logoPath];
                            }
                            
                            // If not in cache (shouldn't happen due to preloading), return placeholder
                            const placeholder = new Image();
                            placeholder.width = CONFIG.logoSize;
                            placeholder.height = CONFIG.logoSize;
                            return placeholder;
                        } catch (error) {
                            logger.error("Error in pointStyle function:", error);
                            return null;
                        }
                    },
                    // Use a consistent pointRadius based on logoSize
                    pointRadius: CONFIG.logoSize / 2,
                    // Higher z-index to ensure logos appear above quadrant labels
                    z: 20,
                    backgroundColor: 'rgba(0, 0, 0, 0)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                // Add animations for smoother transitions when data updates
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
                            text: 'OPS',
                            font: {
                                size: 18,
                                weight: 'bold'
                            }
                        },
                        min: 0.53, // Adjusted to make axis symmetric around 0.7
                        max: 0.87,
                        ticks: {
                            stepSize: 0.05
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'ERA',
                            font: {
                                size: 18,
                                weight: 'bold'
                            }
                        },
                        min: 1.9, // Adjusted to move axes more central
                        max: 6.0, // Adjusted to move axes more central
                        reverse: true,
                        ticks: {
                            stepSize: 0.5
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false // Remove the legend/key
                    },
                    title: {
                        display: false // Remove title from chart (will use HTML title)
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const point = context.raw;
                                return `${point.fullName}: ERA ${point.y.toFixed(2)}, OPS ${point.x.toFixed(3)}`;
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
                                borderDash: [5, 5],
                                label: {
                                    content: 'AVG',
                                    position: 'bottom'
                                }
                            },
                            horizontalLine: {
                                type: 'line',
                                yMin: CONFIG.axisLines.yValue,
                                yMax: CONFIG.axisLines.yValue,
                                borderColor: 'rgba(0, 0, 0, 0.3)',
                                borderWidth: 2,
                                borderDash: [5, 5],
                                label: {
                                    content: 'AVG',
                                    position: 'left'
                                }
                            }
                        }
                    }
                }
            },
            plugins: [quadrantPlugin]
        });
        
        // Position the quadrant labels after chart is rendered
        setTimeout(positionQuadrantLabels, 1000);
        
        logger.info("Chart initialization completed");
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
            logo: team.logo
        }));
        
        // Update chart data with animation for smoother transition
        const chart = window.mlbChart;
        
        // First update the data
        chart.data.datasets[0].data = formattedData;
        
        // Then apply a longer animation duration for this update
        chart.options.animation = {
            duration: 1200,  // Longer duration for better visualization
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
        }, 1500);
        
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
        const labels = {
            'top-left': { x: 0.15, y: 0.15 },
            'top-right': { x: 0.85, y: 0.15 },
            'bottom-left': { x: 0.15, y: 0.85 },
            'bottom-right': { x: 0.85, y: 0.85 }
        };
        
        for (const [id, pos] of Object.entries(labels)) {
            const label = document.getElementById(id);
            if (label) {
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

})(window, document);