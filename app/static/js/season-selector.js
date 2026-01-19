// app/static/js/season-selector.js

/**
 * MLB ERA vs OPS Visualization - Season Selector Module
 * Handles season selection and filtering
 */

const MLBSeasonSelector = (function(window, document, $, MLBConfig) {
    "use strict";

    const logger = MLBConfig.logger;

    let currentSeason = null;
    let availableSeasons = [];

    /**
     * Initialize the season selector
     */
    function init() {
        logger.log("Initializing season selector...");

        // Fetch available seasons
        fetch('/api/seasons')
            .then(response => response.json())
            .then(data => {
                availableSeasons = data.seasons || [];
                currentSeason = data.current_season;

                logger.log(`Available seasons: ${availableSeasons.join(', ')}`);
                logger.log(`Current season: ${currentSeason}`);

                // Always create the season selector (even with just one season)
                createSeasonSelector();
            })
            .catch(err => {
                logger.error('Error fetching seasons:', err);
            });
    }

    /**
     * Create the season selector UI (pill-style dropdown)
     */
    function createSeasonSelector() {
        // Check if selector already exists
        if ($('.year-selector-pill .dropdown').length > 0) {
            return;
        }

        // Show current season or "All" if no season is selected
        const displayYear = currentSeason || 'All';

        // Build dropdown items: "All" first, then available seasons
        const allIsSelected = !currentSeason;
        const dropdownItems = [
            `<li><a class="dropdown-item ${allIsSelected ? 'active' : ''}" href="#" data-season="">All</a></li>`
        ].concat(
            availableSeasons.map(season => {
                const isSelected = season === currentSeason;
                return `<li><a class="dropdown-item ${isSelected ? 'active' : ''}" href="#" data-season="${season}">${season}</a></li>`;
            })
        ).join('');

        // Create pill-style dropdown HTML using Bootstrap
        const selectorHTML = `
            <div class="dropdown">
                <button class="btn btn-sm dropdown-toggle season-pill" type="button" id="seasonDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                    <span id="current-year-display">${displayYear}</span>
                </button>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="seasonDropdown">
                    ${dropdownItems}
                </ul>
            </div>
        `;

        // Insert into year-selector-pill container
        $('.year-selector-pill').html(selectorHTML);

        // Attach event handlers to dropdown items
        $('.year-selector-pill .dropdown-item').on('click', function(e) {
            e.preventDefault();
            if ($(this).hasClass('disabled')) return;

            const selectedSeason = $(this).data('season');
            // If season is empty string or null, show "All", otherwise show the year
            const displayText = selectedSeason ? selectedSeason.toString() : 'All';

            // Update button text
            $('#current-year-display').text(displayText);

            // Update active state
            $('.year-selector-pill .dropdown-item').removeClass('active');
            $(this).addClass('active');

            handleSeasonChange(selectedSeason);
        });

        logger.log("Season selector created");
    }

    /**
     * Handle season change event
     */
    function handleSeasonChange(season) {
        logger.log(`Season changed to: ${season || 'All'}`);

        // Update current season
        currentSeason = season ? parseInt(season) : null;

        // Clear history cache when changing seasons
        if (window.MLBHistory && typeof window.MLBHistory.clearHistoryCache === 'function') {
            window.MLBHistory.clearHistoryCache();
        }

        // Trigger data reload with season filter
        reloadDataForSeason(season);
    }

    /**
     * Reload data for selected season
     */
    function reloadDataForSeason(season) {
        logger.log(`Reloading data for season: ${season || 'All'}`);

        // For now, log that season filtering would happen here
        // In the future, this would filter the chart data by season
        // Currently all data shown is from current season only

        // TODO: Implement client-side season filtering when historical data is available
        logger.log('Season filtering not yet implemented - all data is current season');
    }

    /**
     * Get current selected season
     */
    function getCurrentSeason() {
        return currentSeason;
    }

    // Public API
    return {
        init: init,
        getCurrentSeason: getCurrentSeason,
        handleSeasonChange: handleSeasonChange
    };

})(window, document, jQuery, MLBConfig);

// Initialize when DOM is ready
$(document).ready(function() {
    MLBSeasonSelector.init();
});
