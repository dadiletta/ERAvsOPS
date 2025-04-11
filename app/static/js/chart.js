// app/static/js/chart.js

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
    
    // Define quadrant labels
    const quadrantLabels = [
        { 
            text: 'Good Pitching, Bad Hitting', 
            position: { x: 0.65, y: 2.75 },
            align: 'center'
        },
        { 
            text: 'Good Pitching, Good Hitting', 
            position: { x: 0.8, y: 2.75 },
            align: 'center'
        },
        { 
            text: 'Bad Pitching, Bad Hitting', 
            position: { x: 0.65, y: 4.75 },
            align: 'center'
        },
        { 
            text: 'Bad Pitching, Good Hitting', 
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
            const midX = scales.x.getPixelForValue(0.7); // Middle X value (OPS)
            const midY = scales.y.getPixelForValue(4.0); // Middle Y value (ERA)
            
            // Draw quadrant backgrounds
            // Top-left: Good Pitching, Bad Hitting (cream)
            ctx.fillStyle = 'rgba(255, 248, 225, 0.5)';
            ctx.fillRect(left, top, midX - left, midY - top);
            
            // Top-right: Good Pitching, Good Hitting (light green)
            ctx.fillStyle = 'rgba(232, 245, 233, 0.5)';
            ctx.fillRect(midX, top, right - midX, midY - top);
            
            // Bottom-left: Bad Pitching, Bad Hitting (light pink)
            ctx.fillStyle = 'rgba(255, 235, 238, 0.5)';
            ctx.fillRect(left, midY, midX - left, bottom - midY);
            
            // Bottom-right: Bad Pitching, Good Hitting (light pink)
            ctx.fillStyle = 'rgba(255, 235, 238, 0.5)';
            ctx.fillRect(midX, midY, right - midX, bottom - midY);
        }
    };
    
    // Create the chart
    const mlbChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'MLB Teams',
                data: teamPoints,
                pointStyle: function(context) {
                    const index = context.dataIndex;
                    const logo = teamPoints[index].logo;
                    const image = new Image();
                    image.src = logo;
                    // Set width and height to control image size
                    image.width = 15;
                    image.height = 15;
                    return image;
                },
                pointRadius: 15,
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
                    min: 0.55,
                    max: 0.90,
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
                    min: 1.75,
                    max: 6.0,
                    reverse: true,
                    ticks: {
                        stepSize: 0.5
                    }
                }
            },
            plugins: {
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
                            xMin: 0.7,
                            xMax: 0.7,
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
                            yMin: 4.0,
                            yMax: 4.0,
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
    
    // Add quadrant text labels
    quadrantLabels.forEach(label => {
        const x = mlbChart.scales.x.getPixelForValue(label.position.x);
        const y = mlbChart.scales.y.getPixelForValue(label.position.y);
        
        const text = new Text(ctx, label.text, x, y, {
            align: label.align,
            fontSize: 14,
            fontStyle: 'bold',
            color: 'rgba(80, 80, 80, 0.9)'
        });
        text.draw();
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