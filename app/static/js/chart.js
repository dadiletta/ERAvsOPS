// app/static/js/chart.js

// Configuration variables for easy future adjustments
const CONFIG = {
    logoWidth: 30, // Set logo width (height will be calculated to maintain aspect ratio)
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
            if (data) {
                console.info(`[INFO] ${message}`, data);
            } else {
                console.info(`[INFO] ${message}`);
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', function() {
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
    
    // Create cached image store to prevent reload issues
    const logoCache = {};
    
    // Preload all team logos to ensure consistent sizing
    teamPoints.forEach(point => {
        const logoPath = point.logo.startsWith('/') ? point.logo : `/${point.logo}`;
        const img = new Image();
        img.src = logoPath;
        
        // Set fixed dimensions to prevent resizing issues
        img.width = CONFIG.logoWidth;
        img.height = CONFIG.logoWidth;
        
        // Store in cache
        logoCache[logoPath] = img;
    });
    
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
                        if (logoCache[logoPath]) {
                            return logoCache[logoPath];
                        }
                        
                        // If not in cache (shouldn't happen due to preloading), create new image
                        const image = new Image();
                        image.src = logoPath;
                        image.width = CONFIG.logoWidth;
                        image.height = CONFIG.logoWidth;
                        logoCache[logoPath] = image;
                        
                        return image;
                    } catch (error) {
                        logger.error("Error in pointStyle function:", error);
                        return null;
                    }
                },
                // Use fixed pointRadius to prevent sizing issues
                pointRadius: CONFIG.logoWidth / 2,
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
                            return `${point.team}: ERA ${point.y}, OPS ${point.x}`;
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
});

// Function to update chart data with animation
function updateChartData(newData) {
    if (!window.mlbChart) {
        console.error("Chart not initialized");
        return false;
    }
    
    console.info("Updating chart with new data...");
    
    // Format data for chart
    const formattedData = newData.map(team => ({
        x: team.ops,
        y: team.era,
        team: team.name,
        fullName: team.full_name || team.name,
        abbreviation: team.abbreviation,
        logo: team.logo
    }));
    
    // Update chart data
    window.mlbChart.data.datasets[0].data = formattedData;
    
    // Update and animate
    window.mlbChart.update();
    console.info("Chart data updated with animation");
    
    return true;
}

// Function to position quadrant labels (defined globally so it can be called from HTML too)
function positionQuadrantLabels() {
    const chart = document.getElementById('mlbChart');
    if (!chart) {
        console.error("Chart element not found!");
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