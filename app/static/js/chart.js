// app/static/js/chart.js

// Configuration variables for easy future adjustments
const CONFIG = {
    logoWidth: 30, // Set logo width (height will be calculated to maintain aspect ratio)
    quadrantColors: {
        topLeft: 'rgba(255, 248, 225, 0.3)',    // Cream (Good Pitching, Bad Hitting) - more transparent
        topRight: 'rgba(232, 245, 233, 0.3)',   // Light green (Good Pitching, Good Hitting) - more transparent
        bottomLeft: 'rgba(255, 235, 238, 0.3)', // Light pink (Bad Pitching, Bad Hitting) - more transparent
        bottomRight: 'rgba(255, 255, 224, 0.3)' // Light yellow (Bad Pitching, Good Hitting) - more transparent
    },
    axisLines: {
        xValue: 0.7, // OPS dividing line
        yValue: 4.0  // ERA dividing line
    },
    mlbColors: {
        blue: '#002D72',
        red: '#E31937'
    }
};

document.addEventListener('DOMContentLoaded', function() {
    // Check if Toastify is loaded
    console.log("==========================================");
    console.log("Chart.js script loaded and initialized");
    console.log("==========================================");
    
    // Get team data passed from Flask (will be set in the template)
    const teamData = window.teamData || [];
    const dataStatus = window.dataStatus || {};
    const ctx = document.getElementById('mlbChart').getContext('2d');
    
    // VERBOSE: Log data status for debugging
    console.log("DATA STATUS:", JSON.stringify(dataStatus, null, 2));
    
    // Log teams and their logo paths for debugging
    console.log(`Team data loaded: ${teamData.length} teams`);
    console.log("SAMPLE TEAM DATA:", JSON.stringify(teamData.slice(0, 3), null, 2));
    
    // Log whether data is from cache and if update is in progress
    if (dataStatus.from_cache) {
        console.log(`Using ${dataStatus.is_fresh ? 'FRESH' : 'STALE'} cached data`);
    }
    
    if (dataStatus.update_in_progress) {
        console.log("Background update is in progress");
        console.log(`Teams updated so far: ${dataStatus.teams_updated}/${dataStatus.total_teams}`);
    }
    
    // Create datasets for team positioning
    console.log("Creating team points dataset");
    const teamPoints = teamData.map(team => ({
        x: team.ops,
        y: team.era,
        team: team.name,
        fullName: team.full_name || team.name,
        abbreviation: team.abbreviation,
        logo: team.logo
    }));
    
    // Create cached image store to prevent reload issues
    console.log("Creating image cache for team logos");
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
        
        console.log(`Preloaded logo: ${logoPath}`);
    });
    
    // Create quadrant background plugin
    console.log("Creating quadrant background plugin");
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
    
    console.log("Creating chart instance");
    // Create the chart
    const mlbChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                data: teamPoints,
                pointStyle: function(context) {
                    try {
                        const index = context.dataIndex;
                        if (index === undefined || !teamPoints[index]) {
                            console.error(`Invalid data index: ${index}`);
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
                        
                        // IMPORTANT: Set fixed dimensions to prevent resizing issues
                        // This is a key fix for the "freaking out" issue
                        image.width = CONFIG.logoWidth;
                        image.height = CONFIG.logoWidth;
                        
                        // Cache the image
                        logoCache[logoPath] = image;
                        
                        return image;
                    } catch (error) {
                        console.error("Error in pointStyle function:", error);
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
    
    // Update the toast message when data is loaded
    if (typeof showToast === 'function') {
        showToast("Chart loaded successfully", "success");
    } else {
        console.error("showToast function not available");
    }
});

// Function to position quadrant labels (defined globally so it can be called from HTML too)
function positionQuadrantLabels() {
    console.log("Positioning quadrant labels in corners");
    const chart = document.getElementById('mlbChart');
    if (!chart) {
        console.error("Chart element not found!");
        return;
    }
    
    const container = chart.parentElement;
    const chartRect = chart.getBoundingClientRect();
    
    // Get chart dimensions
    const chartWidth = chartRect.width;
    const chartHeight = chartRect.height;
    
    console.log(`Chart dimensions: ${chartWidth}x${chartHeight}`);
    
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
            console.log(`Positioned ${id} at ${chartWidth * pos.x}px, ${chartHeight * pos.y}px`);
        } else {
            console.error(`Label with id ${id} not found`);
        }
    }
}