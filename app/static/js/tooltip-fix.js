const tooltipHandler = {
    initialize: function(chart) {
      // Single event listener for mouse events
      chart.canvas.addEventListener('mousemove', this.handleMouseEvent.bind(this, chart));
      chart.canvas.addEventListener('mouseout', this.handleMouseOut.bind(this, chart));
      
      // Add filter to tooltip options
      chart.options.plugins.tooltip.filter = function(tooltipItem) {
        const meta = chart.getDatasetMeta(tooltipItem.datasetIndex);
        return !meta.data[tooltipItem.index].hidden;
      };
      
      // Override pointer-events for hidden points via CSS classes
      chart.options.plugins.tooltip.callbacks.beforeLabel = function(context) {
        const meta = chart.getDatasetMeta(context.datasetIndex);
        const element = meta.data[context.dataIndex];
        if (element && element.hidden) {
          element.element.style.pointerEvents = 'none';
        }
        return null;
      };
    },
    
    handleMouseEvent: function(chart, e) {
      const points = chart.getElementsAtEventForMode(e, 'nearest', {intersect: true}, false);
      if (points.length > 0) {
        const point = points[0];
        const meta = chart.getDatasetMeta(point.datasetIndex);
        if (meta.data[point.index].hidden) {
          // Clear active tooltip elements when hovering hidden points
          chart.tooltip._active = [];
          chart.update('none');
        }
      }
    },
    
    handleMouseOut: function(chart) {
      // Ensure tooltip is cleared on mouseout
      chart.tooltip._active = [];
      chart.update('none');
    }
  };