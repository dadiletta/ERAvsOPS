// Division and League Insights with clever pattern detection
function calculateLeagueAverages(teams, league) {
    if (!teams || !Array.isArray(teams)) {
        return {
            avgERA: 'N/A',
            avgOPS: 'N/A',
            bestTeam: { name: 'N/A' },
            pattern: 'Insufficient data'
        };
    }

    const leagueMap = {
        'AL': 'American League',
        'NL': 'National League'
    };
    const leagueTeams = teams.filter(team => team.league === leagueMap[league]);

    if (leagueTeams.length === 0) {
        return {
            avgERA: 'N/A',
            avgOPS: 'N/A',
            bestTeam: { name: 'N/A' },
            pattern: 'No teams found'
        };
    }

    const totalERA = leagueTeams.reduce((sum, team) => sum + parseFloat(team.era), 0);
    const totalOPS = leagueTeams.reduce((sum, team) => sum + parseFloat(team.ops), 0);
    const avgERA = totalERA / leagueTeams.length;
    const avgOPS = totalOPS / leagueTeams.length;

    // WHIP average — only count teams that have the field (new snapshots only)
    const teamsWithWhip = leagueTeams.filter(t => t.whip != null);
    const avgWHIP = teamsWithWhip.length
        ? (teamsWithWhip.reduce((s, t) => s + parseFloat(t.whip), 0) / teamsWithWhip.length).toFixed(2)
        : 'N/A';

    // Batting average — only count teams that have the field
    const teamsWithAvg = leagueTeams.filter(t => t.batting_avg != null);
    const avgAVG = teamsWithAvg.length
        ? (teamsWithAvg.reduce((s, t) => s + parseFloat(t.batting_avg), 0) / teamsWithAvg.length).toFixed(3)
        : 'N/A';

    // Find the best team based on ERA and OPS
    const bestTeam = leagueTeams.reduce((best, current) => {
        const currentScore = (1/parseFloat(current.era)) * parseFloat(current.ops);
        const bestScore = (1/parseFloat(best.era)) * parseFloat(best.ops);
        return currentScore > bestScore ? current : best;
    });

    // Detect patterns
    let pattern = '';
    if (avgERA < 3.8 && avgOPS > 0.750) {
        pattern = 'Dominant: Elite pitching + hitting';
    } else if (avgERA < 3.8) {
        pattern = 'Pitching-focused league';
    } else if (avgOPS > 0.750) {
        pattern = 'Offense-heavy league';
    } else if (avgERA > 4.5 && avgOPS < 0.720) {
        pattern = 'Struggling overall';
    } else {
        pattern = 'Balanced competition';
    }

    return {
        avgERA: avgERA.toFixed(2),
        avgOPS: avgOPS.toFixed(3),
        avgWHIP: avgWHIP,
        avgAVG: avgAVG,
        bestTeam: bestTeam,
        pattern: pattern
    };
}

/**
 * Find the current season leader for each tracked stat across all teams.
 * Returns null for a stat when no team has data for it (e.g., old snapshots
 * that predate WHIP/HR extraction).
 *
 * @param {Array} teams - Full list of 30 team objects from the API
 * @returns {Object} bestERA, bestWHIP, bestOPS, mostHR — each a team object or null
 */
function findLeaders(teams) {
    if (!teams || teams.length === 0) return { bestERA: null, bestWHIP: null, bestOPS: null, mostHR: null };

    const valid = teams.filter(t => t.era && t.ops);
    if (valid.length === 0) return { bestERA: null, bestWHIP: null, bestOPS: null, mostHR: null };

    const bestERA  = valid.reduce((a, b) => parseFloat(a.era) < parseFloat(b.era) ? a : b);
    const bestOPS  = valid.reduce((a, b) => parseFloat(a.ops) > parseFloat(b.ops) ? a : b);

    const withWhip = valid.filter(t => t.whip != null);
    const bestWHIP = withWhip.length
        ? withWhip.reduce((a, b) => parseFloat(a.whip) < parseFloat(b.whip) ? a : b)
        : null;

    const withHR = valid.filter(t => t.home_runs != null);
    const mostHR = withHR.length
        ? withHR.reduce((a, b) => a.home_runs > b.home_runs ? a : b)
        : null;

    return { bestERA, bestWHIP, bestOPS, mostHR };
}

function analyzeDivisionPerformance(teams) {
    if (!teams || !Array.isArray(teams)) {
        return {
            bestPitchingDivision: { name: 'N/A', era: 'N/A' },
            bestHittingDivision: { name: 'N/A', ops: 'N/A' },
            mostCompetitive: { name: 'N/A', spread: 'N/A' },
            powerhouse: { name: 'N/A', quality: 'N/A' }
        };
    }

    const divisions = {
        'AL East': { teams: [], avgERA: 0, avgOPS: 0 },
        'AL Central': { teams: [], avgERA: 0, avgOPS: 0 },
        'AL West': { teams: [], avgERA: 0, avgOPS: 0 },
        'NL East': { teams: [], avgERA: 0, avgOPS: 0 },
        'NL Central': { teams: [], avgERA: 0, avgOPS: 0 },
        'NL West': { teams: [], avgERA: 0, avgOPS: 0 }
    };

    // Group teams by division and calculate stats
    teams.forEach(team => {
        if (divisions[team.division]) {
            divisions[team.division].teams.push(team);
        }
    });

    // Calculate averages and variance for each division
    for (const [division, data] of Object.entries(divisions)) {
        if (data.teams.length > 0) {
            data.avgERA = data.teams.reduce((sum, team) => sum + parseFloat(team.era), 0) / data.teams.length;
            data.avgOPS = data.teams.reduce((sum, team) => sum + parseFloat(team.ops), 0) / data.teams.length;

            // Calculate win% variance (competitiveness)
            const winPcts = data.teams.map(t => t.wins / (t.wins + t.losses));
            const avgWinPct = winPcts.reduce((sum, pct) => sum + pct, 0) / winPcts.length;
            data.competitiveness = Math.sqrt(
                winPcts.reduce((sum, pct) => sum + Math.pow(pct - avgWinPct, 2), 0) / winPcts.length
            );
        }
    }

    // Find best performing divisions
    let bestPitching = null;
    let bestHitting = null;
    let mostCompetitive = null;
    let powerhouse = null;

    for (const [division, data] of Object.entries(divisions)) {
        if (data.teams.length === 0) continue;

        if (!bestPitching || data.avgERA < bestPitching.avgERA) {
            bestPitching = { division, ...data };
        }
        if (!bestHitting || data.avgOPS > bestHitting.avgOPS) {
            bestHitting = { division, ...data };
        }
        if (!mostCompetitive || data.competitiveness < mostCompetitive.competitiveness) {
            mostCompetitive = { division, ...data };
        }

        // Powerhouse: low ERA + high OPS
        const quality = (1/data.avgERA) * data.avgOPS;
        if (!powerhouse || quality > powerhouse.quality) {
            powerhouse = { division, quality, ...data };
        }
    }

    return {
        bestPitchingDivision: bestPitching ? {
            name: bestPitching.division,
            era: bestPitching.avgERA.toFixed(2)
        } : { name: 'N/A', era: 'N/A' },
        bestHittingDivision: bestHitting ? {
            name: bestHitting.division,
            ops: bestHitting.avgOPS.toFixed(3)
        } : { name: 'N/A', ops: 'N/A' },
        mostCompetitive: mostCompetitive ? {
            name: mostCompetitive.division,
            spread: (mostCompetitive.competitiveness * 100).toFixed(1) + '% spread'
        } : { name: 'N/A', spread: 'N/A' },
        powerhouse: powerhouse ? {
            name: powerhouse.division,
            quality: 'ERA ' + powerhouse.avgERA.toFixed(2) + ' / OPS ' + powerhouse.avgOPS.toFixed(3)
        } : { name: 'N/A', quality: 'N/A' }
    };
}

function updateInsights(teams) {
    try {
        // Update league averages with patterns
        const alStats = calculateLeagueAverages(teams, 'AL');
        const nlStats = calculateLeagueAverages(teams, 'NL');

        document.getElementById('al-avg-era').textContent = alStats.avgERA;
        document.getElementById('al-avg-whip').textContent = alStats.avgWHIP;
        document.getElementById('al-avg-ops').textContent = alStats.avgOPS;
        document.getElementById('al-avg-avg').textContent = alStats.avgAVG;
        document.getElementById('al-best-team').textContent = alStats.bestTeam.name;
        document.getElementById('al-pattern').textContent = alStats.pattern;

        document.getElementById('nl-avg-era').textContent = nlStats.avgERA;
        document.getElementById('nl-avg-whip').textContent = nlStats.avgWHIP;
        document.getElementById('nl-avg-ops').textContent = nlStats.avgOPS;
        document.getElementById('nl-avg-avg').textContent = nlStats.avgAVG;
        document.getElementById('nl-best-team').textContent = nlStats.bestTeam.name;
        document.getElementById('nl-pattern').textContent = nlStats.pattern;

        // Update Season Leaders card
        const leaders = findLeaders(teams);
        document.getElementById('leader-best-era').textContent =
            leaders.bestERA ? `${leaders.bestERA.abbreviation} (${parseFloat(leaders.bestERA.era).toFixed(2)})` : '-';
        document.getElementById('leader-best-whip').textContent =
            leaders.bestWHIP ? `${leaders.bestWHIP.abbreviation} (${parseFloat(leaders.bestWHIP.whip).toFixed(2)})` : '-';
        document.getElementById('leader-best-ops').textContent =
            leaders.bestOPS ? `${leaders.bestOPS.abbreviation} (${parseFloat(leaders.bestOPS.ops).toFixed(3)})` : '-';
        document.getElementById('leader-most-hr').textContent =
            leaders.mostHR ? `${leaders.mostHR.abbreviation} (${leaders.mostHR.home_runs})` : '-';

        // Update performance trends with more insights
        const performanceTrends = analyzeDivisionPerformance(teams);
        document.getElementById('best-pitching-division').textContent = performanceTrends.bestPitchingDivision.name;
        document.getElementById('best-pitching-era').textContent = performanceTrends.bestPitchingDivision.era;

        document.getElementById('best-hitting-division').textContent = performanceTrends.bestHittingDivision.name;
        document.getElementById('best-hitting-ops').textContent = performanceTrends.bestHittingDivision.ops;

        document.getElementById('most-competitive-division').textContent = performanceTrends.mostCompetitive.name;
        document.getElementById('competitive-spread').textContent = performanceTrends.mostCompetitive.spread;

        document.getElementById('powerhouse-division').textContent = performanceTrends.powerhouse.name;
        document.getElementById('powerhouse-quality').textContent = performanceTrends.powerhouse.quality;
    } catch (error) {
        console.error('Error updating insights:', error);
    }
}

// Initialize insights when the page loads
document.addEventListener('DOMContentLoaded', () => {
    if (window.teamData) {
        updateInsights(window.teamData);
    }
});

// Update insights when team data changes
if (window.teamData) {
    let originalTeamData = window.teamData;
    Object.defineProperty(window, 'teamData', {
        get() {
            return originalTeamData;
        },
        set(newValue) {
            originalTeamData = newValue;
            updateInsights(newValue);
        },
        configurable: true
    });
}
