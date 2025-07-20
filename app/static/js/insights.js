// Division and League Insights
function calculateLeagueAverages(teams, league) {
    console.log('Calculating averages for league:', league);
    console.log('Teams data:', teams);
    
    if (!teams || !Array.isArray(teams)) {
        console.error('Invalid teams data:', teams);
        return {
            avgERA: 'N/A',
            avgOPS: 'N/A',
            bestTeam: { name: 'N/A' }
        };
    }

    const leagueTeams = teams.filter(team => {
        console.log('Checking team:', team.name, 'League:', team.league);
        // Map the league parameter to the full league name
        const leagueMap = {
            'AL': 'American League',
            'NL': 'National League'
        };
        return team.league === leagueMap[league];
    });
    
    console.log('Filtered teams for league:', league, leagueTeams);

    if (leagueTeams.length === 0) {
        console.error('No teams found for league:', league);
        return {
            avgERA: 'N/A',
            avgOPS: 'N/A',
            bestTeam: { name: 'N/A' }
        };
    }

    const totalERA = leagueTeams.reduce((sum, team) => {
        console.log('Team ERA:', team.name, team.era);
        return sum + parseFloat(team.era);
    }, 0);
    
    const totalOPS = leagueTeams.reduce((sum, team) => {
        console.log('Team OPS:', team.name, team.ops);
        return sum + parseFloat(team.ops);
    }, 0);
    
    console.log('Total ERA:', totalERA, 'Total OPS:', totalOPS);
    
    // Find the best team based on ERA and OPS
    const bestTeam = leagueTeams.reduce((best, current) => {
        const currentERA = parseFloat(current.era);
        const currentOPS = parseFloat(current.ops);
        const bestERA = parseFloat(best.era);
        const bestOPS = parseFloat(best.ops);
        
        // A team is better if it has a lower ERA and higher OPS
        // We'll use a simple scoring system: (1/ERA) * OPS
        const currentScore = (1/currentERA) * currentOPS;
        const bestScore = (1/bestERA) * bestOPS;
        
        console.log('Comparing teams:', current.name, currentScore, 'vs', best.name, bestScore);
        return currentScore > bestScore ? current : best;
    });
    
    return {
        avgERA: (totalERA / leagueTeams.length).toFixed(2),
        avgOPS: (totalOPS / leagueTeams.length).toFixed(3),
        bestTeam: bestTeam
    };
}

function analyzeDivisionPerformance(teams) {
    if (!teams || !Array.isArray(teams)) {
        console.error('Invalid teams data');
        return {
            bestPitchingDivision: 'N/A',
            bestHittingDivision: 'N/A',
            mostBalancedDivision: 'N/A'
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
    
    // Group teams by division and calculate averages
    teams.forEach(team => {
        if (divisions[team.division]) {
            divisions[team.division].teams.push(team);
        }
    });
    
    // Calculate averages for each division
    for (const [division, data] of Object.entries(divisions)) {
        if (data.teams.length > 0) {
            data.avgERA = data.teams.reduce((sum, team) => sum + parseFloat(team.era), 0) / data.teams.length;
            data.avgOPS = data.teams.reduce((sum, team) => sum + parseFloat(team.ops), 0) / data.teams.length;
            console.log(`Division ${division}: ERA=${data.avgERA.toFixed(2)}, OPS=${data.avgOPS.toFixed(3)}`);
        }
    }
    
    // Find best performing divisions
    const initialDivision = Object.entries(divisions)[0];
    const bestPitchingDivision = Object.entries(divisions)
        .reduce((best, [division, data]) => {
            if (data.teams.length === 0) return best;
            return data.avgERA < best.avgERA ? { division, ...data } : best;
        }, { division: initialDivision[0], avgERA: initialDivision[1].avgERA });
    
    const bestHittingDivision = Object.entries(divisions)
        .reduce((best, [division, data]) => {
            if (data.teams.length === 0) return best;
            return data.avgOPS > best.avgOPS ? { division, ...data } : best;
        }, { division: initialDivision[0], avgOPS: initialDivision[1].avgOPS });
    
    const mostBalancedDivision = Object.entries(divisions)
        .reduce((best, [division, data]) => {
            if (data.teams.length === 0) return best;
            const currentBalance = Math.abs(data.avgERA - 4.00) + Math.abs(data.avgOPS - 0.750);
            const bestBalance = Math.abs(best.avgERA - 4.00) + Math.abs(best.avgOPS - 0.750);
            return currentBalance < bestBalance ? { division, ...data } : best;
        }, { division: initialDivision[0], avgERA: initialDivision[1].avgERA, avgOPS: initialDivision[1].avgOPS });
    
    console.log('Best pitching division:', bestPitchingDivision.division);
    console.log('Best hitting division:', bestHittingDivision.division);
    console.log('Most balanced division:', mostBalancedDivision.division);
    
    return {
        bestPitchingDivision: bestPitchingDivision.division,
        bestHittingDivision: bestHittingDivision.division,
        mostBalancedDivision: mostBalancedDivision.division
    };
}

function updateInsights(teams) {
    try {
        // Update league averages
        const alStats = calculateLeagueAverages(teams, 'AL');
        const nlStats = calculateLeagueAverages(teams, 'NL');
        
        document.getElementById('al-avg-era').textContent = alStats.avgERA;
        document.getElementById('al-avg-ops').textContent = alStats.avgOPS;
        document.getElementById('al-best-team').textContent = alStats.bestTeam.name;
        
        document.getElementById('nl-avg-era').textContent = nlStats.avgERA;
        document.getElementById('nl-avg-ops').textContent = nlStats.avgOPS;
        document.getElementById('nl-best-team').textContent = nlStats.bestTeam.name;
        
        // Update performance trends
        const performanceTrends = analyzeDivisionPerformance(teams);
        document.getElementById('best-pitching-division').textContent = performanceTrends.bestPitchingDivision;
        document.getElementById('best-hitting-division').textContent = performanceTrends.bestHittingDivision;
        document.getElementById('most-balanced-division').textContent = performanceTrends.mostBalancedDivision;
    } catch (error) {
        console.error('Error updating insights:', error);
    }
}

// Initialize insights when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM Content Loaded');
    console.log('Window teamData:', window.teamData);
    if (window.teamData) {
        updateInsights(window.teamData);
    } else {
        console.error('No team data available');
    }
});

// Update insights when team data changes
if (window.teamData) {
    // Use let instead of const to allow reassignment
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