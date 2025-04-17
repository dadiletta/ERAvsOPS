// app/static/js/mlb-division-utils.js

/**
 * MLB Division Utilities
 * Helper functions for working with MLB division data
 */

const MLBDivisionUtils = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // Division cache to minimize duplicate processing
    const divisionCache = {};
    
    // Color mapping for leagues and divisions
    const LEAGUE_COLORS = {
        'American League': MLBConfig.COLORS.blue,
        'National League': MLBConfig.COLORS.red
    };
    
    const DIVISION_COLORS = {
        'AL East': '#002A5C',
        'AL Central': '#0C2C56',
        'AL West': '#003366',
        'NL East': '#AB0003',
        'NL Central': '#C6011F',
        'NL West': '#D22630'
    };
    
    /**
     * Get division information from a team object
     * @param {Object} team - Team data object
     * @returns {Object} Division information
     */
    function getDivisionInfo(team) {
        if (!team) return null;
        
        const teamId = team.id || team.team_id;
        
        // Return from cache if available
        if (divisionCache[teamId]) {
            return divisionCache[teamId];
        }
        
        // Extract division info
        const divisionInfo = {
            teamId: teamId,
            teamName: team.full_name || team.fullName || team.name,
            abbreviation: team.abbreviation,
            division: team.division || 'Unknown',
            league: team.league || 'Unknown',
            divisionColor: DIVISION_COLORS[team.division] || '#666666',
            leagueColor: LEAGUE_COLORS[team.league] || '#666666'
        };
        
        // Cache the result
        divisionCache[teamId] = divisionInfo;
        
        return divisionInfo;
    }
    
    /**
     * Get all teams in a specific division
     * @param {Array} teams - Array of team objects
     * @param {string} division - Division name (e.g., "AL East")
     * @returns {Array} Teams in the specified division
     */
    function getTeamsInDivision(teams, division) {
        if (!teams || !Array.isArray(teams) || !division) {
            return [];
        }
        
        return teams.filter(team => team.division === division);
    }
    
    /**
     * Group teams by division
     * @param {Array} teams - Array of team objects
     * @returns {Object} Teams grouped by division
     */
    function groupTeamsByDivision(teams) {
        if (!teams || !Array.isArray(teams)) {
            return {};
        }
        
        const grouped = {};
        
        teams.forEach(team => {
            const division = team.division || 'Unknown';
            
            if (!grouped[division]) {
                grouped[division] = [];
            }
            
            grouped[division].push(team);
        });
        
        return grouped;
    }
    
    /**
     * Get league name from division name
     * @param {string} division - Division name (e.g., "AL East")
     * @returns {string} League name
     */
    function getLeagueFromDivision(division) {
        if (!division) return 'Unknown';
        
        if (division.startsWith('AL ')) {
            return 'American League';
        } else if (division.startsWith('NL ')) {
            return 'National League';
        }
        
        return 'Unknown';
    }
    
    /**
     * Get color for a division
     * @param {string} division - Division name
     * @returns {string} CSS color value
     */
    function getDivisionColor(division) {
        return DIVISION_COLORS[division] || '#666666';
    }
    
    /**
     * Get color for a league
     * @param {string} league - League name
     * @returns {string} CSS color value
     */
    function getLeagueColor(league) {
        return LEAGUE_COLORS[league] || '#666666';
    }
    
    /**
     * Format division information as a string
     * @param {Object} team - Team data object
     * @returns {string} Formatted division information
     */
    function formatDivisionInfo(team) {
        if (!team) return '';
        
        const divInfo = getDivisionInfo(team);
        return `${divInfo.teamName} (${divInfo.abbreviation}) - ${divInfo.division}, ${divInfo.league}`;
    }
    
    // Public API
    return {
        getDivisionInfo: getDivisionInfo,
        getTeamsInDivision: getTeamsInDivision,
        groupTeamsByDivision: groupTeamsByDivision,
        getLeagueFromDivision: getLeagueFromDivision,
        getDivisionColor: getDivisionColor,
        getLeagueColor: getLeagueColor,
        formatDivisionInfo: formatDivisionInfo,
        LEAGUE_COLORS: LEAGUE_COLORS,
        DIVISION_COLORS: DIVISION_COLORS
    };
})(window, document, jQuery, MLBConfig);