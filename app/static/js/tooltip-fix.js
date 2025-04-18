// Add this code to a new file named tooltip-fix.js and include it after all other chart scripts

(function() {
    // Wait for chart initialization
    function initTooltipFix() {
        if (!window.mlbChart) {
            console.log("Waiting for chart initialization...");
            setTimeout(initTooltipFix, 500);
            return;
        }
        
        console.log("Applying aggressive tooltip fix");
        const chart = window.mlbChart;
        const canvas = chart.canvas;
        
        // Function to check if a point is hidden
        function isPointHidden(x, y) {
            if (!chart || !chart.getElementsAtEventForMode) return true;
            
            const elements = chart.getElementsAtEventForMode({x, y}, 'nearest', {intersect: true}, false);
            if (!elements || elements.length === 0) return true;
            
            // Check if the point is hidden
            const element = elements[0];
            const meta = chart.getDatasetMeta(element.datasetIndex);
            return meta.data[element.index].hidden;
        }
        
        // Function to force hide all tooltips
        function forceHideTooltips() {
            if (!chart || !chart.tooltip) return;
            
            // Clear tooltip active elements if they're hidden
            if (chart.tooltip._active && chart.tooltip._active.length > 0) {
                const activeElements = chart.tooltip._active;
                const validElements = activeElements.filter(element => {
                    const meta = chart.getDatasetMeta(element.datasetIndex);
                    return !meta.data[element.index].hidden;
                });
                
                if (validElements.length !== activeElements.length) {
                    chart.tooltip._active = validElements;
                    if (validElements.length === 0) {
                        // Force hide tooltip
                        chart.tooltip.opacity = 0;
                        chart.tooltip._lastActive = [];
                        chart.tooltip._active = [];
                        chart.draw();
                    }
                }
            }
        }
        
        // Capture all mouse events on the canvas
        canvas.addEventListener('mousemove', function(e) {
            // Get mouse position relative to canvas
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // If hovering over a hidden point, disable tooltip
            if (isPointHidden(x, y)) {
                forceHideTooltips();
                
                // Create invisible overlay to capture events
                const overlay = document.createElement('div');
                overlay.style.position = 'fixed';
                overlay.style.left = '0';
                overlay.style.top = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.zIndex = '1000';
                overlay.style.backgroundColor = 'transparent';
                overlay.style.pointerEvents = 'none';
                document.body.appendChild(overlay);
                
                // Remove after a short delay
                setTimeout(() => {
                    document.body.removeChild(overlay);
                }, 100);
            }
        });
        
        // On mouseout, ensure tooltips are cleared
        canvas.addEventListener('mouseout', forceHideTooltips);
        
        // Regular interval check (as a fallback)
        setInterval(forceHideTooltips, 100);
        
        // Hook into Chart.js update cycle
        const originalUpdate = chart.draw;
        chart.draw = function() {
            forceHideTooltips();
            return originalUpdate.apply(this, arguments);
        };
        
        // Directly modify tooltip options
        chart.options.plugins.tooltip.enabled = true;
        chart.options.plugins.tooltip.events = ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'];
        chart.options.plugins.tooltip.filter = function(tooltipItem) {
            const meta = chart.getDatasetMeta(tooltipItem.datasetIndex);
            return !meta.data[tooltipItem.index].hidden;
        };
        
        // Update all division elements to have specific pointerEvents CSS
        function updateDivisionStyles() {
            if (!chart.getDatasetMeta || !chart.getDatasetMeta(0) || !chart.getDatasetMeta(0).data) {
                return;
            }
            
            const points = chart.getDatasetMeta(0).data;
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                if (point.hidden) {
                    if (point.element) {
                        point.element.style.pointerEvents = 'none';
                    }
                }
            }
        }
        
        // Apply styles on every update
        const originalDivisionFilter = window.MLBDivisionFilter.applyDivisionFilter;
        window.MLBDivisionFilter.applyDivisionFilter = function() {
            const result = originalDivisionFilter.apply(this, arguments);
            updateDivisionStyles();
            forceHideTooltips();
            return result;
        };
        
        // Initial application
        updateDivisionStyles();
        forceHideTooltips();
        console.log("Tooltip fix applied successfully");
    }
    
    // Start the initialization
    initTooltipFix();
})();