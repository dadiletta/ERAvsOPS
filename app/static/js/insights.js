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
        bestTeam: bestTeam,
        pattern: pattern
    };
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
        document.getElementById('al-avg-ops').textContent = alStats.avgOPS;
        document.getElementById('al-best-team').textContent = alStats.bestTeam.name;
        document.getElementById('al-pattern').textContent = alStats.pattern;

        document.getElementById('nl-avg-era').textContent = nlStats.avgERA;
        document.getElementById('nl-avg-ops').textContent = nlStats.avgOPS;
        document.getElementById('nl-best-team').textContent = nlStats.bestTeam.name;
        document.getElementById('nl-pattern').textContent = nlStats.pattern;

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
