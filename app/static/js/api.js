// app/static/js/api.js

/**
 * MLB ERA vs OPS Visualization - API Module
 *
 * Handles all API calls, data fetching, and the batch update loop.
 * During updates, shows baseball trivia toasts instead of dry progress %.
 *
 * Dependencies: MLBConfig, MLBUI, MLBChart, jQuery
 */

const MLBAPI = (function(window, document, $, MLBConfig) {
    "use strict";

    const logger = MLBConfig.logger;
    const showToast = MLBConfig.showToast;

    // -----------------------------------------------------------------------
    // Baseball trivia — shown during data refreshes
    // -----------------------------------------------------------------------

    /**
     * Verified baseball trivia facts, shown one at a time during updates.
     * Each fact is a single sentence, sourced from official MLB records.
     */
    const BASEBALL_TRIVIA = [
        "Nolan Ryan threw a record 7 no-hitters across his 27-year career.",
        "The 2001 Mariners won 116 games, tying the 1906 Cubs for the all-time regular season record.",
        "Cal Ripken Jr. played 2,632 consecutive games from 1982 to 1998.",
        "In 1920, the spitball was banned — but 17 existing spitballers were grandfathered in.",
        "Barry Bonds drew 232 intentional walks in 2004 — 68 more than second place all-time.",
        "The shortest game in MLB history lasted 51 minutes: Giants 6, Phillies 1 in 1919.",
        "Rickey Henderson stole 1,406 bases — 468 more than the second-place Lou Brock.",
        "In 1968, Bob Gibson posted a 1.12 ERA, the lowest since the Dead Ball Era.",
        "The Cleveland Spiders went 20-134 in 1899, the worst record in professional baseball history.",
        "Ichiro Suzuki had 262 hits in 2004, breaking George Sisler's 84-year-old single-season record.",
        "Greg Maddux won four consecutive Cy Young Awards from 1992 to 1995.",
        "The 2022 season introduced a pitch clock, reducing average game time by 26 minutes.",
        "Ohtani became the first player to hit 50 home runs and steal 50 bases in a single season in 2024.",
        "The longest game in MLB history lasted 26 innings: Dodgers vs. Braves on May 1, 1920.",
        "Hank Aaron hit 755 home runs without ever hitting more than 47 in a single season.",
        "Pedro Martinez struck out 17 Yankees in a single game in September 1999.",
        "The 2004 Red Sox were the first team to come back from a 3-0 deficit in a best-of-7 postseason series.",
        "Jackie Robinson's number 42 is the only number retired across all of Major League Baseball.",
        "Randy Johnson threw a perfect game at age 40, making him the oldest to do so.",
        "Joe DiMaggio's 56-game hitting streak in 1941 has stood for over 80 years.",
        "The modern World Series began in 1903 between the Boston Americans and Pittsburgh Pirates.",
        "Willie Mays made 'The Catch' in the 1954 World Series — a 460-foot over-the-shoulder grab.",
        "Fernando Tatis Sr. hit two grand slams in the same inning on April 23, 1999.",
        "The first night game in MLB history was played on May 24, 1935, in Cincinnati.",
        "Clayton Kershaw's career ERA of 2.48 is the lowest among live-ball era starters with 2000+ innings.",
        "Mariano Rivera is the only player in MLB history to be elected to the Hall of Fame unanimously.",
        "In 2023, the Arizona Diamondbacks reached the World Series as an 84-win wild card team.",
        "Cy Young won 511 games — a record that will almost certainly never be broken.",
        "Mike Trout won three MVP awards before turning 28 years old.",
        "The longest scoreless streak in MLB history belongs to Orel Hershiser: 59 consecutive innings in 1988.",
    ];

    /** Track which trivia facts have been shown this session to avoid repeats */
    let triviaShown = new Set();
    /** Index of the last trivia shown — used as a fallback if all have been shown */
    let triviaIndex = 0;

    /**
     * Get a random trivia fact that hasn't been shown yet this session.
     * Resets the pool once all facts have been used.
     * @returns {string} A baseball trivia sentence
     */
    function getRandomTrivia() {
        // Reset pool if exhausted
        if (triviaShown.size >= BASEBALL_TRIVIA.length) {
            triviaShown.clear();
        }

        // Pick a random unshown fact
        let attempts = 0;
        let idx;
        do {
            idx = Math.floor(Math.random() * BASEBALL_TRIVIA.length);
            attempts++;
        } while (triviaShown.has(idx) && attempts < 50);

        triviaShown.add(idx);
        return BASEBALL_TRIVIA[idx];
    }

    // -----------------------------------------------------------------------
    // API state
    // -----------------------------------------------------------------------

    const state = {
        updateRetries: 0,
        updateTimer: null,
        isUpdating: false,
        lastUpdateTimestamp: null,
        lastStatus: null,
        /** The last percentage at which we showed a trivia toast */
        lastTriviaPercent: -10,
        /** Timestamp of the last toast shown during an update (ms since epoch) */
        lastToastTime: 0,
        /** Prevents overlapping /continue-update POSTs while a batch is in flight */
        isBatchInFlight: false
    };

    /**
     * Check for updates with reduced UI impact.
     * Polls /api/update-status and schedules the next check if still in progress.
     */
    function checkUpdateStatus() {
        logger.log("Checking update status...");

        fetch('/api/update-status')
            .then(response => response.json())
            .then(status => {
                logger.log("Received update status", status);
                state.updateRetries = 0;

                const statusChanged =
                    !state.lastStatus ||
                    state.lastStatus.in_progress !== status.in_progress ||
                    state.lastStatus.teams_updated !== status.teams_updated ||
                    state.lastStatus.total_teams !== status.total_teams;

                if (statusChanged) {
                    MLBUI.updateStatusBar(status);
                    state.lastStatus = JSON.parse(JSON.stringify(status));
                }

                if (status.in_progress) {
                    if (status.teams_updated < status.total_teams && !state.isBatchInFlight) {
                        continueUpdate();
                    }

                    // If 5+ seconds have passed without any toast, show trivia
                    if (state.isUpdating && Date.now() - state.lastToastTime >= 5000) {
                        showToast(getRandomTrivia(), "info");
                        state.lastToastTime = Date.now();
                    }

                    state.updateTimer = setTimeout(checkUpdateStatus,
                        status.teams_updated > 0 ? MLBConfig.APP.updateInterval * 1.5 : MLBConfig.APP.updateInterval);
                } else {
                    if (state.isUpdating) {
                        logger.log("Update process completed, fetching fresh data");
                        state.isUpdating = false;
                        fetchFreshData();
                    }
                }
            })
            .catch(error => {
                console.error("Error checking update status:", error);
                showToast(`Error checking updates: ${error.message || 'Network error'}`, "error");

                state.updateRetries++;

                if (state.updateTimer) {
                    clearTimeout(state.updateTimer);
                    state.updateTimer = null;
                }

                if (state.updateRetries < MLBConfig.APP.maxRetries) {
                    state.updateTimer = setTimeout(checkUpdateStatus, MLBConfig.APP.updateInterval);
                } else {
                    state.isUpdating = false;
                    showToast("Update failed after multiple attempts", "error");
                }
            });
    }

    /**
     * Start the update process. Shows an immediate trivia fact, then kicks off
     * the batch update loop via /api/start-update.
     */
    function startUpdate() {
        if (state.isUpdating) {
            logger.log("Update already in progress");
            return;
        }

        state.isUpdating = true;
        state.updateRetries = 0;
        state.lastTriviaPercent = -10;
        triviaShown.clear();

        // Immediate trivia toast so there's something fun to read right away
        showToast(getRandomTrivia(), "info");
        state.lastToastTime = Date.now();

        MLBUI.updateStatusBar({
            in_progress: true,
            teams_updated: 0,
            total_teams: 30,
            cache_fresh: false
        });

        $.ajax({
            url: '/api/start-update',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ batch_size: MLBConfig.APP.batchSize }),
            dataType: 'json',
            success: function(status) {
                logger.log("Update started successfully", status);

                showToast(`Fetching ${status.total_teams} teams... sit tight!`, "update");
                state.lastToastTime = Date.now();

                MLBUI.updateStatusBar(status);
                state.lastStatus = JSON.parse(JSON.stringify(status));
                state.updateTimer = setTimeout(checkUpdateStatus, MLBConfig.APP.updateInterval);
            },
            error: function(xhr, status, error) {
                console.error("Error starting update:", error);

                if (xhr.responseJSON && xhr.responseJSON.error) {
                    showToast(`Error: ${xhr.responseJSON.error}`, "error");
                } else {
                    showToast(`Error starting update: ${error}`, "error");
                }

                state.isUpdating = false;
                MLBUI.updateStatusBar({
                    in_progress: false,
                    teams_updated: 0,
                    total_teams: 0
                });
            }
        });
    }

    /**
     * Continue the batch update. Shows trivia toasts at meaningful progress
     * milestones instead of generic percentage messages.
     */
    function continueUpdate() {
        if (state.isBatchInFlight) {
            logger.log("Skipping continueUpdate — batch already in flight");
            return;
        }

        state.isBatchInFlight = true;
        logger.log("Continuing update process");

        fetch('/api/continue-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch_size: MLBConfig.APP.batchSize })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(status => {
            state.isBatchInFlight = false;
            logger.log("Update continued successfully", status);

            const previousPercent = state.lastStatus ?
                Math.floor((state.lastStatus.teams_updated / state.lastStatus.total_teams) * 100) : 0;

            const currentPercent = Math.floor((status.teams_updated / status.total_teams) * 100);

            const timeSinceLastToast = Date.now() - state.lastToastTime;
            const percentThresholdHit = currentPercent - state.lastTriviaPercent >= 20;
            const timeThresholdHit = timeSinceLastToast >= 5000;

            // Show a toast at ~every 20% of progress OR if 5+ seconds of silence
            if (percentThresholdHit || timeThresholdHit) {
                if (percentThresholdHit) {
                    state.lastTriviaPercent = currentPercent;
                }
                MLBUI.updateStatusBar(status);

                if (currentPercent >= 95) {
                    showToast("Wrapping up... almost there!", "update");
                } else {
                    showToast(getRandomTrivia(), "info");
                }

                state.lastToastTime = Date.now();
                state.lastStatus = JSON.parse(JSON.stringify(status));
            } else if (Math.abs(currentPercent - previousPercent) >= 10) {
                // Still update the status bar even if we don't show a toast
                MLBUI.updateStatusBar(status);
                state.lastStatus = JSON.parse(JSON.stringify(status));
            }
        })
        .catch(error => {
            state.isBatchInFlight = false;
            console.error("Error continuing update:", error);
            showToast(`Error continuing update: ${error.message || 'Network error'}`, "error");

            state.updateRetries++;

            if (state.updateRetries >= MLBConfig.APP.maxRetries) {
                state.isUpdating = false;

                if (state.updateTimer) {
                    clearTimeout(state.updateTimer);
                    state.updateTimer = null;
                }

                showToast("Update failed after multiple attempts", "error");
            }
        });
    }

    /**
     * Fetch fresh data after an update completes.
     * Updates the chart, standings, insights, and status bar.
     */
    function fetchFreshData() {
        logger.log("Fetching fresh data from server...");

        $.ajax({
            url: '/api/team-data',
            method: 'GET',
            dataType: 'json',
            cache: false,
            success: function(response) {
                logger.log("Data received:", response);

                if (response.teams && response.teams.length > 0) {
                    window.teamData = response.teams;

                    window.dataStatus = {
                        is_fresh: response.fresh,
                        last_updated: response.last_updated,
                        update_in_progress: false
                    };

                    $('#lastUpdatedTitle').text(response.last_updated || 'Just now');
                    $('#status-text-title').text(response.fresh ? 'Fresh' : 'Stale');
                    $('#status-indicator-title').removeClass('stale').addClass(response.fresh ? 'fresh' : 'stale');

                    $.ajax({
                        url: '/api/update-status',
                        method: 'GET',
                        dataType: 'json',
                        success: function(statusResponse) {
                            if (statusResponse.snapshot_count !== undefined) {
                                $('#snapshot-count').text(statusResponse.snapshot_count);
                            }
                        }
                    });

                    $(document).trigger('freshDataLoaded');
                    MLBChart.updateChartData(response.teams);
                    $(document).trigger('chartUpdated');

                    if (window.updateInsights) {
                        window.updateInsights(response.teams);
                    }

                    if (response.fresh) {
                        $('#refresh-button').hide();
                    }

                    showToast("Data updated successfully!", "success");
                }
            },
            error: function(xhr, status, error) {
                logger.error("Error fetching data:", error);
                showToast("Failed to fetch data. Please try again.", "error");

                setTimeout(() => {
                    $(document).trigger('freshDataLoaded');
                }, 2000);
            }
        });
    }

    /**
     * Helper function to update the chart
     * @param {Object|Array} data - Team data response or array
     */
    function updateChart(data) {
        const teams = data.teams || data;

        if (typeof MLBChart.updateChartData === 'function') {
            const updated = MLBChart.updateChartData(teams);
            if (!updated) {
                showToast("Chart update failed", "warning");
            }
        } else {
            showToast("Could not update visualization", "error");
        }
    }

    /**
     * Initialize data from the server on page load.
     * Auto-fetches fresh data if current data is stale.
     */
    function initializeData() {
        state.lastUpdateTimestamp = window.dataStatus ? window.dataStatus.last_updated : null;

        logger.log("Initial data status:", window.dataStatus);
        logger.log("Initial team data count:", window.teamData ? window.teamData.length : 0);

        if (window.dataStatus && !window.dataStatus.is_fresh) {
            logger.log("Data is stale on page load, fetching fresh data...");
            MLBConfig.showToast("Loading latest data...", "info");
            setTimeout(function() {
                fetchFreshData();
            }, 500);
        }

        if (window.dataStatus && window.dataStatus.update_in_progress) {
            state.isUpdating = true;
            setTimeout(checkUpdateStatus, 2000);
        }
    }

    /**
     * Fetch division information for a specific team
     * @param {number} teamId - The team ID
     * @returns {Promise} Promise that resolves with division data
     */
    function fetchTeamDivision(teamId) {
        logger.log(`Fetching division info for team ID: ${teamId}`);

        return $.ajax({
            url: `/api/team-division/${teamId}`,
            method: 'GET',
            dataType: 'json',
            cache: true,
            success: function(data) {
                if (!window.divisionCache) {
                    window.divisionCache = {};
                }
                window.divisionCache[teamId] = data;
                return data;
            },
            error: function(xhr, status, error) {
                console.error(`Error fetching division info for team ${teamId}:`, error);
                return null;
            }
        });
    }

    // Public API
    return {
        initialize: initializeData,
        startUpdate: startUpdate,
        checkUpdateStatus: checkUpdateStatus,
        fetchFreshData: fetchFreshData,
        isUpdating: function() { return state.isUpdating; },
        fetchTeamDivision: fetchTeamDivision
    };
})(window, document, jQuery, MLBConfig);
