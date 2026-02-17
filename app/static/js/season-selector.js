// app/static/js/season-selector.js

/**
 * MLB ERA vs OPS Visualization - Season Selector Module
 *
 * Handles season selection, data fetching per season, and client-side
 * standings table rebuilding. When a user picks a season from the dropdown,
 * this module fetches that season's team data and standings from the API,
 * then updates the chart, standings DOM, and insights in place.
 *
 * Dependencies: MLBConfig, MLBChart, MLBHistory, jQuery, Bootstrap 5
 */

const MLBSeasonSelector = (function(window, document, $, MLBConfig) {
    "use strict";

    const logger = MLBConfig.logger;

    /** @type {number|null} Currently selected season year, or null for "All" */
    let currentSeason = null;

    /** @type {number[]} Seasons available in the database */
    let availableSeasons = [];

    /**
     * Initialize the season selector by fetching available seasons from the API
     * and building the dropdown UI.
     */
    function init() {
        logger.log("Initializing season selector...");

        fetch('/api/seasons')
            .then(response => response.json())
            .then(data => {
                availableSeasons = data.seasons || [];
                currentSeason = data.current_season;

                logger.log(`Available seasons: ${availableSeasons.join(', ')}`);
                logger.log(`Current season: ${currentSeason}`);

                createSeasonSelector();
            })
            .catch(err => {
                logger.error('Error fetching seasons:', err);
            });
    }

    /**
     * Build the pill-style Bootstrap dropdown for season selection.
     * Skips creation if the dropdown already exists in the DOM.
     */
    function createSeasonSelector() {
        if ($('.year-selector-pill .dropdown').length > 0) {
            return;
        }

        const displayYear = currentSeason || 'All';

        const allIsSelected = !currentSeason;
        const dropdownItems = [
            `<li><a class="dropdown-item ${allIsSelected ? 'active' : ''}" href="#" data-season="">All</a></li>`
        ].concat(
            availableSeasons.map(season => {
                const isSelected = season === currentSeason;
                return `<li><a class="dropdown-item ${isSelected ? 'active' : ''}" href="#" data-season="${season}">${season}</a></li>`;
            })
        ).join('');

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

        $('.year-selector-pill').html(selectorHTML);

        $('.year-selector-pill .dropdown-item').on('click', function(e) {
            e.preventDefault();
            if ($(this).hasClass('disabled')) return;

            const selectedSeason = $(this).data('season');
            const displayText = selectedSeason ? selectedSeason.toString() : 'All';

            $('#current-year-display').text(displayText);

            $('.year-selector-pill .dropdown-item').removeClass('active');
            $(this).addClass('active');

            handleSeasonChange(selectedSeason);
        });

        logger.log("Season selector created");
    }

    /**
     * Handle a season change from the dropdown.
     * Clears the history cache (so trend lines load for the new season)
     * and triggers a full data reload.
     *
     * @param {string|number} season - Season year or empty string for "All"
     */
    function handleSeasonChange(season) {
        logger.log(`Season changed to: ${season || 'All'}`);

        currentSeason = season ? parseInt(season) : null;

        // History lines are per-season, so clear the cache on switch
        if (window.MLBHistory && typeof window.MLBHistory.clearHistoryCache === 'function') {
            window.MLBHistory.clearHistoryCache();
        }

        reloadDataForSeason(season);
    }

    /**
     * Fetch team data and standings for the selected season from the API,
     * then update the chart, standings tables, and insights panel.
     *
     * @param {string|number} season - Season year, or empty/falsy for latest
     */
    function reloadDataForSeason(season) {
        logger.log(`Reloading data for season: ${season || 'All'}`);

        // Build API URLs with optional season query param
        const seasonParam = season ? `?season=${season}` : '';
        const teamUrl = `/api/team-data${seasonParam}`;
        const standingsUrl = `/api/division-standings${seasonParam}`;

        // Fetch both endpoints in parallel for speed
        Promise.all([
            fetch(teamUrl).then(r => r.json()),
            fetch(standingsUrl).then(r => r.json())
        ]).then(([teamResponse, standingsData]) => {
            if (teamResponse.teams && teamResponse.teams.length > 0) {
                // Update global team data — this also triggers insights via
                // the Object.defineProperty setter in insights.js
                window.teamData = teamResponse.teams;

                // Update the scatter chart with new positions
                if (window.MLBChart && typeof window.MLBChart.updateChartData === 'function') {
                    window.MLBChart.updateChartData(teamResponse.teams);
                }

                // Rebuild standings tables from JSON (replacing Jinja-rendered HTML)
                updateStandingsTables(standingsData);

                logger.log(`Season ${season || 'latest'} loaded: ${teamResponse.teams.length} teams`);
            } else {
                logger.error('No team data returned for season: ' + (season || 'latest'));
            }
        }).catch(err => {
            logger.error('Error loading season data:', err);
        });
    }

    // -----------------------------------------------------------------------
    // Client-side standings rendering
    // -----------------------------------------------------------------------

    /**
     * Rebuild the standings tables in the DOM from JSON data.
     *
     * This replaces the server-rendered Jinja HTML when switching seasons
     * client-side. The generated markup mirrors the Jinja template structure
     * exactly so that existing CSS applies without changes.
     *
     * @param {Array} cardsData - Array of division card objects from
     *   /api/division-standings, each with { division, league_abbr, teams }
     */
    function updateStandingsTables(cardsData) {
        if (!cardsData || !Array.isArray(cardsData)) return;

        ['AL', 'NL'].forEach(leagueAbbr => {
            const leagueCards = cardsData.filter(c => c.league_abbr === leagueAbbr);

            // Find the .divisions-row container for this league
            const headerClass = leagueAbbr.toLowerCase() + '-header';
            const container = $(`.league-standings:has(.${headerClass}) .divisions-row`);
            if (container.length === 0) return;

            let html = '';
            leagueCards.forEach(card => {
                html += buildDivisionCardHTML(card);
            });
            container.html(html);
        });
    }

    /**
     * Build HTML for a single division standings card.
     *
     * Mirrors the Jinja template in index.html (lines ~171-201) so that
     * CSS classes like .division-card, .standings-table, .team-row apply.
     * Includes playoff status class and WC GB column when data is available.
     *
     * @param {Object} card - { division, teams: [{ abbreviation, wins, losses, pct, gb, run_differential, logo, playoff_status, wc_gb, trend }] }
     * @returns {string} HTML string
     */
    function buildDivisionCardHTML(card) {
        const teamsHTML = card.teams.map(team => {
            // Color run differential
            let diffStyle = '';
            if (team.run_differential > 0) diffStyle = 'color:var(--excellent)';
            else if (team.run_differential < 0) diffStyle = 'color:var(--poor)';

            // Playoff status CSS class (defaults to empty for old data)
            const statusClass = team.playoff_status || '';

            // Trend arrow (▲ up, ▼ down, or nothing)
            let trendHTML = '';
            if (team.trend === 'up') {
                trendHTML = '<span class="trend-arrow trend-up">&#9650;</span>';
            } else if (team.trend === 'down') {
                trendHTML = '<span class="trend-arrow trend-down">&#9660;</span>';
            }

            // WC GB value — show dash for missing data
            const wcGb = (team.wc_gb !== undefined && team.wc_gb !== null && team.wc_gb !== '-')
                ? team.wc_gb
                : '-';

            return `
                <div class="team-row ${statusClass}">
                    <span class="team-col">
                        <img src="${team.logo}" alt="${team.name || team.abbreviation}" class="standings-logo">
                        <span class="team-name">${team.abbreviation}</span>
                        ${trendHTML}
                    </span>
                    <span class="record-col">${team.wins}</span>
                    <span class="record-col">${team.losses}</span>
                    <span class="record-col">${team.pct !== undefined ? team.pct.toFixed(3) : '.000'}</span>
                    <span class="record-col">${team.gb}</span>
                    <span class="record-col" style="${diffStyle}">
                        ${team.run_differential || '0'}
                    </span>
                    <span class="record-col wc-col">${wcGb}</span>
                </div>
            `;
        }).join('');

        return `
            <div class="division-card">
                <div class="division-header">
                    <h4>${card.division}</h4>
                </div>
                <div class="standings-table">
                    <div class="standings-header">
                        <span class="team-col">Team</span>
                        <span class="record-col">W</span>
                        <span class="record-col">L</span>
                        <span class="record-col">PCT</span>
                        <span class="record-col">GB</span>
                        <span class="record-col">DIFF</span>
                        <span class="record-col wc-col">WC</span>
                    </div>
                    <div class="standings-body">
                        ${teamsHTML}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Get the currently selected season.
     * @returns {number|null} Season year or null if "All" is selected
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
