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

                // Create UI if multiple seasons available
                if (availableSeasons.length > 1) {
                    createSeasonSelector();
                }
            })
            .catch(err => {
                logger.error('Error fetching seasons:', err);
            });
    }

    /**
     * Create the season selector UI
     */
    function createSeasonSelector() {
        // Check if selector already exists
        if ($('#season-selector-container').length > 0) {
            return;
        }

        // Create selector HTML
        const selectorHTML = `
            <div id="season-selector-container" class="season-selector">
                <label for="season-select">Season:</label>
                <select id="season-select" class="season-select-dropdown">
                    <option value="">All Seasons</option>
                    ${availableSeasons.map(season =>
                        `<option value="${season}" ${season === currentSeason ? 'selected' : ''}>${season}</option>`
                    ).join('')}
                </select>
            </div>
        `;

        // Insert before division toggles
        $('.division-toggles').prepend(selectorHTML);

        // Attach event handler
        $('#season-select').on('change', function() {
            const selectedSeason = $(this).val();
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
        // Show loading overlay
        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay();
        }

        // For now, just refresh the page with season parameter
        // In future, could update chart data dynamically
        const url = season ? `/?season=${season}` : '/';
        window.location.href = url;
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
