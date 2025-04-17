// app/static/js/mlb-stats-analyzer.js

/**
 * MLB Stats Analyzer
 * Helper functions for analyzing MLB stats by division
 */

const MLBStatsAnalyzer = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    /**
     * Calculate average stats for a division
     * @param {Array} teams - Array of team objects
     * @param {string} division - Division name
     * @returns {Object} Average stats for the division
     */
    function calculateDivisionAverages(teams, division) {
        if (!teams || !Array.isArray(teams) || !division) {
            return null;
        }
        
        // Filter teams in the specified division
        const divisionTeams = teams.filter(team => team.division === division);
        
        if (divisionTeams.length === 0) {
            logger.warning(`No teams found in division: ${division}`);
            return null;
        }
        
        // Calculate average ERA and OPS
        let totalERA = 0;
        let totalOPS = 0;
        let validERACount = 0;
        let validOPSCount = 0;
        
        divisionTeams.forEach(team => {
            if (team.era !== undefined && !isNaN(team.era)) {
                totalERA += parseFloat(team.era);
                validERACount++;
            }
            
            if (team.ops !== undefined && !isNaN(team.ops)) {
                totalOPS += parseFloat(team.ops);
                validOPSCount++;
            }
        });
        
        const avgERA = validERACount > 0 ? totalERA / validERACount : 0;
        const avgOPS = validOPSCount > 0 ? totalOPS / validOPSCount : 0;
        
        return {
            division: division,
            teamCount: divisionTeams.length,
            avgERA: avgERA,
            avgOPS: avgOPS,
            teams: divisionTeams
        };
    }
    
    /**
     * Calculate average stats for all divisions
     * @param {Array} teams - Array of team objects
     * @returns {Object} Object with division averages
     */
    function calculateAllDivisionAverages(teams) {
        if (!teams || !Array.isArray(teams)) {
            return {};
        }
        
        // Get unique divisions
        const divisions = new Set();
        teams.forEach(team => {
            if (team.division) {
                divisions.add(team.division);
            }
        });
        
        // Calculate averages for each division
        const result = {};
        
        divisions.forEach(division => {
            result[division] = calculateDivisionAverages(teams, division);
        });
        
        return result;
    }
    
    /**
     * Rank divisions by a specific stat
     * @param {Array} teams - Array of team objects
     * @param {string} stat - Stat to rank by ('era' or 'ops')
     * @param {boolean} ascending - Sort in ascending order if true
     * @returns {Array} Ranked divisions with stats
     */
    function rankDivisionsByStat(teams, stat, ascending = true) {
        if (!teams || !Array.isArray(teams) || !stat) {
            return [];
        }
        
        // Calculate division averages
        const divisionAverages = calculateAllDivisionAverages(teams);
        
        // Convert to array for sorting
        const divisionsArray = Object.keys(divisionAverages).map(division => {
            return divisionAverages[division];
        });
        
        // Sort by the specified stat
        const statKey = stat === 'era' ? 'avgERA' : 'avgOPS';
        
        divisionsArray.sort((a, b) => {
            const valA = a[statKey];
            const valB = b[statKey];
            
            if (ascending) {
                return valA - valB;
            } else {
                return valB - valA;
            }
        });
        
        return divisionsArray;
    }
    
    /**
     * Find the best team in a division by a specific stat
     * @param {Array} teams - Array of team objects
     * @param {string} division - Division name
     * @param {string} stat - Stat to compare ('era' or 'ops')
     * @param {boolean} lowest - If true, find team with lowest value
     * @returns {Object} Best team
     */
    function findBestTeamInDivision(teams, division, stat, lowest = false) {
        if (!teams || !Array.isArray(teams) || !division || !stat) {
            return null;
        }
        
        // Filter teams in the specified division
        const divisionTeams = teams.filter(team => team.division === division);
        
        if (divisionTeams.length === 0) {
            return null;
        }
        
        // Sort teams by the specified stat
        divisionTeams.sort((a, b) => {
            const valA = parseFloat(a[stat]);
            const valB = parseFloat(b[stat]);
            
            if (lowest) {
                return valA - valB; // Ascending for stats where lower is better (ERA)
            } else {
                return valB - valA; // Descending for stats where higher is better (OPS)
            }
        });
        
        return divisionTeams[0];
    }
    
    /**
     * Calculate division strength index
     * @param {Array} teams - Array of team objects
     * @param {string} division - Division name
     * @returns {Object} Division strength metrics
     */
    function calculateDivisionStrength(teams, division) {
        if (!teams || !Array.isArray(teams) || !division) {
            return null;
        }
        
        const divisionAvg = calculateDivisionAverages(teams, division);
        
        if (!divisionAvg) {
            return null;
        }
        
        // Calculate overall average for comparison
        let totalERA = 0;
        let totalOPS = 0;
        let validERACount = 0;
        let validOPSCount = 0;
        
        teams.forEach(team => {
            if (team.era !== undefined && !isNaN(team.era)) {
                totalERA += parseFloat(team.era);
                validERACount++;
            }
            
            if (team.ops !== undefined && !isNaN(team.ops)) {
                totalOPS += parseFloat(team.ops);
                validOPSCount++;
            }
        });
        
        const overallAvgERA = validERACount > 0 ? totalERA / validERACount : 0;
        const overallAvgOPS = validOPSCount > 0 ? totalOPS / validOPSCount : 0;
        
        // Calculate indices (lower ERA is better, higher OPS is better)
        const eraIndex = overallAvgERA > 0 ? overallAvgERA / divisionAvg.avgERA : 1;
        const opsIndex = overallAvgOPS > 0 ? divisionAvg.avgOPS / overallAvgOPS : 1;
        
        // Combined strength index (average of ERA and OPS indices)
        const strengthIndex = (eraIndex + opsIndex) / 2;
        
        return {
            division: division,
            strengthIndex: strengthIndex,
            eraIndex: eraIndex,
            opsIndex: opsIndex,
            avgERA: divisionAvg.avgERA,
            avgOPS: divisionAvg.avgOPS,
            overallAvgERA: overallAvgERA,
            overallAvgOPS: overallAvgOPS
        };
    }
    
    /**
     * Compare two divisions and their stats
     * @param {Array} teams - Array of team objects
     * @param {string} division1 - First division name
     * @param {string} division2 - Second division name
     * @returns {Object} Comparison results
     */
    function compareDivisions(teams, division1, division2) {
        if (!teams || !Array.isArray(teams) || !division1 || !division2) {
            return null;
        }
        
        const div1Stats = calculateDivisionAverages(teams, division1);
        const div2Stats = calculateDivisionAverages(teams, division2);
        
        if (!div1Stats || !div2Stats) {
            return null;
        }
        
        const eraDiff = div1Stats.avgERA - div2Stats.avgERA;
        const opsDiff = div1Stats.avgOPS - div2Stats.avgOPS;
        
        return {
            division1: {
                name: division1,
                avgERA: div1Stats.avgERA,
                avgOPS: div1Stats.avgOPS,
                teamCount: div1Stats.teamCount
            },
            division2: {
                name: division2,
                avgERA: div2Stats.avgERA,
                avgOPS: div2Stats.avgOPS,
                teamCount: div2Stats.teamCount
            },
            differences: {
                era: eraDiff,
                ops: opsDiff
            },
            betterPitching: eraDiff < 0 ? division1 : division2,
            betterHitting: opsDiff > 0 ? division1 : division2
        };
    }
    
    // Public API
    return {
        calculateDivisionAverages: calculateDivisionAverages,
        calculateAllDivisionAverages: calculateAllDivisionAverages,
        rankDivisionsByStat: rankDivisionsByStat,
        findBestTeamInDivision: findBestTeamInDivision,
        calculateDivisionStrength: calculateDivisionStrength,
        compareDivisions: compareDivisions
    };
})(window, document, jQuery, MLBConfig);