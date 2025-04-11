// app/static/js/chart.js

// Configuration variables for easy future adjustments
const CONFIG = {
    logoWidth: 30, // Set logo width (height will be calculated to maintain aspect ratio)
    quadrantColors: {
        topLeft: 'rgba(255, 248, 225, 0.5)',    // Cream (Good Pitching, Bad Hitting)
        topRight: 'rgba(232, 245, 233, 0.5)',   // Light green (Good Pitching, Good Hitting)
        bottomLeft: 'rgba(255, 235, 238, 0.5)', // Light pink (Bad Pitching, Bad Hitting)
        bottomRight: 'rgba(255, 255, 224, 0.5)' // Light yellow (Bad Pitching, Good Hitting)
    },
    axisLines: {
        xValue: 0.7, // OPS dividing line
        yValue: 4.0  // ERA dividing line
    }
};

document.addEventListener('DOMContentLoaded', function() {
    // Check if Toastify is loaded
    console.log("Toastify loaded:", typeof Toastify);
    
    // Get team data passed from Flask (will be set in the template)
    const teamData = window.teamData || [];
    const ctx = document.getElementById('mlbChart').getContext('2d');
    
    // Log teams and their logo paths for debugging
    console.log("Team data loaded:", teamData.length, "teams");
    teamData.forEach(team => {
        console.log(`Team: ${team.name}, Logo: ${team.logo}`);
    });
    
    // Create datasets for team positioning
    const teamPoints = teamData.map(team => ({
        x: team.ops,
        y: team.era,
        team: team.name,
        logo: team.logo
    }));
    
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
    
    // Create the chart
    const mlbChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                data: teamPoints,
                pointStyle: function(context) {
                    const index = context.dataIndex;
                    const logo = teamPoints[index].logo;
                    const image = new Image();
                    
                    // Ensure the path starts with a slash if it doesn't already
                    const logoPath = logo.startsWith('/') ? logo : `/${logo}`;
                    
                    console.log(`Loading image from: ${logoPath}`);
                    
                    // This ensures images load with correct proportions
                    image.onload = function() {
                        const aspectRatio = this.naturalWidth / this.naturalHeight;
                        this.width = CONFIG.logoWidth;
                        this.height = CONFIG.logoWidth / aspectRatio;
                        console.log(`Loaded image: ${logoPath}, ${this.width}x${this.height}`);
                    };
                    
                    image.onerror = function() {
                        console.error(`Failed to load image: ${logoPath}`);
                    };
                    
                    image.src = logoPath;
                    
                    // Set initial width only - height will be calculated on load
                    image.width = CONFIG.logoWidth;
                    
                    return image;
                },
                pointRadius: CONFIG.logoWidth / 2, // Using half the logo width works better
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
    // Increase timeout to ensure chart is fully rendered
    setTimeout(positionQuadrantLabels, 1000);
    
    // Update the toast message when data is loaded
    if (typeof showToast === 'function') {
        showToast("Chart loaded successfully", "success");
    } else {
        console.error("showToast function not available");
    }
});