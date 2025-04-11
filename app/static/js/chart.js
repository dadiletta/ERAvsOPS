// app/static/js/chart.js

// Configuration variables for easy future adjustments
const CONFIG = {
    logoWidth: 30, // Doubled from 15px to 30px
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
    // Get team data passed from Flask (will be set in the template)
    const teamData = window.teamData || [];
    const ctx = document.getElementById('mlbChart').getContext('2d');
    
    // Create datasets for team positioning
    const teamPoints = teamData.map(team => ({
        x: team.ops,
        y: team.era,
        team: team.name,
        logo: team.logo
    }));
    
    // Define quadrant labels with line breaks
    const quadrantLabels = [
        { 
            text: ['Good Pitching', 'Bad Hitting'], 
            position: { x: 0.65, y: 2.75 },
            align: 'center'
        },
        { 
            text: ['Good Pitching', 'Good Hitting'], 
            position: { x: 0.8, y: 2.75 },
            align: 'center'
        },
        { 
            text: ['Bad Pitching', 'Bad Hitting'], 
            position: { x: 0.65, y: 4.75 },
            align: 'center'
        },
        { 
            text: ['Bad Pitching', 'Good Hitting'], 
            position: { x: 0.8, y: 4.75 },
            align: 'center'
        }
    ];
    
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
                    image.src = logo;
                    // Set width and height to control image size
                    image.width = CONFIG.logoWidth;
                    image.height = CONFIG.logoWidth; // Initial setting, will be overridden by CSS
                    return image;
                },
                pointRadius: CONFIG.logoWidth,
                backgroundColor: 'rgba(0, 0, 0, 0.1)'
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
                    min: 0.58, // Adjusted to move axes more central
                    max: 0.87, // Adjusted to move axes more central
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
                    min: 2.0, // Adjusted to move axes more central
                    max: 5.75, // Adjusted to move axes more central
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
    
    // Add quadrant text labels with line breaks
    quadrantLabels.forEach(label => {
        const x = mlbChart.scales.x.getPixelForValue(label.position.x);
        const y = mlbChart.scales.y.getPixelForValue(label.position.y);
        
        // Draw multi-line text
        const lineHeight = 16;
        label.text.forEach((line, index) => {
            const yPosition = y + (index * lineHeight);
            const text = new Text(ctx, line, x, yPosition, {
                align: label.align,
                fontSize: 14,
                fontStyle: 'bold',
                color: 'rgba(80, 80, 80, 0.9)'
            });
            text.draw();
        });
    });
});

// Simple text drawing utility
class Text {
    constructor(ctx, text, x, y, options = {}) {
        this.ctx = ctx;
        this.text = text;
        this.x = x;
        this.y = y;
        this.options = Object.assign({
            align: 'center',
            fontSize: 12,
            fontStyle: 'normal',
            color: 'black'
        }, options);
    }
    
    draw() {
        const ctx = this.ctx;
        ctx.save();
        ctx.font = `${this.options.fontStyle} ${this.options.fontSize}px Arial`;
        ctx.fillStyle = this.options.color;
        ctx.textAlign = this.options.align;
        ctx.fillText(this.text, this.x, this.y);
        ctx.restore();
    }
}