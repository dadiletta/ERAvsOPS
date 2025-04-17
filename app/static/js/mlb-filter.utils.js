// app/static/js/mlb-filter-utils.js

/**
 * MLB Filter Utilities
 * Helper functions for filtering MLB team data
 */

const MLBFilterUtils = (function(window, document, $, MLBConfig) {
    "use strict";
    
    const logger = MLBConfig.logger;
    
    // Store filter state
    const state = {
        activeDivision: null,
        activeLeague: null,
        customFilters: {}
    };
    
    /**
     * Get all available MLB divisions
     * @param {Array} teams - Array of team objects
     * @returns {Array} Array of division names
     */
    function getAvailableDivisions(teams) {
        if (!teams || !Array.isArray(teams)) {
            return [];
        }
        
        // Extract unique divisions
        const divisions = new Set();
        
        teams.forEach(team => {
            if (team.division) {
                divisions.add(team.division);
            }
        });
        
        return Array.from(divisions).sort();
    }
    
    /**
     * Get all available MLB leagues
     * @param {Array} teams - Array of team objects
     * @returns {Array} Array of league names
     */
    function getAvailableLeagues(teams) {
        if (!teams || !Array.isArray(teams)) {
            return [];
        }
        
        // Extract unique leagues
        const leagues = new Set();
        
        teams.forEach(team => {
            if (team.league) {
                leagues.add(team.league);
            }
        });
        
        return Array.from(leagues).sort();
    }
    
    /**
     * Filter teams by division
     * @param {Array} teams - Array of team objects
     * @param {string} division - Division name to filter by
     * @returns {Array} Filtered array of teams
     */
    function filterByDivision(teams, division) {
        if (!teams || !Array.isArray(teams) || !division) {
            return teams || [];
        }
        
        return teams.filter(team => team.division === division);
    }
    
    /**
     * Filter teams by league
     * @param {Array} teams - Array of team objects
     * @param {string} league - League name to filter by
     * @returns {Array} Filtered array of teams
     */
    function filterByLeague(teams, league) {
        if (!teams || !Array.isArray(teams) || !league) {
            return teams || [];
        }
        
        return teams.filter(team => team.league === league);
    }
    
    /**
     * Apply multiple filters to teams
     * @param {Array} teams - Array of team objects
     * @param {Object} filters - Filter criteria object
     * @returns {Array} Filtered array of teams
     */
    function applyFilters(teams, filters) {
        if (!teams || !Array.isArray(teams) || !filters) {
            return teams || [];
        }
        
        let filtered = [...teams];
        
        // Apply division filter
        if (filters.division) {
            filtered = filterByDivision(filtered, filters.division);
        }
        
        // Apply league filter
        if (filters.league) {
            filtered = filterByLeague(filtered, filters.league);
        }
        
        // Apply custom filters
        if (filters.custom && typeof filters.custom === 'function') {
            filtered = filtered.filter(filters.custom);
        }
        
        return filtered;
    }
    
    /**
     * Set active division filter
     * @param {string} division - Division name
     */
    function setActiveDivision(division) {
        state.activeDivision = division;
        logger.log(`Active division set to: ${division}`);
    }
    
    /**
     * Set active league filter
     * @param {string} league - League name
     */
    function setActiveLeague(league) {
        state.activeLeague = league;
        logger.log(`Active league set to: ${league}`);
    }
    
    /**
     * Get current active filters
     * @returns {Object} Current filter state
     */
    function getActiveFilters() {
        return {
            division: state.activeDivision,
            league: state.activeLeague,
            custom: state.customFilters
        };
    }
    
    /**
     * Clear all active filters
     */
    function clearFilters() {
        state.activeDivision = null;
        state.activeLeague = null;
        state.customFilters = {};
        logger.log("All filters cleared");
    }
    
    /**
     * Set a custom filter
     * @param {string} key - Filter key
     * @param {*} value - Filter value
     */
    function setCustomFilter(key, value) {
        state.customFilters[key] = value;
        logger.log(`Custom filter '${key}' set to:`, value);
    }
    
    /**
     * Get teams with stats above/below average
     * @param {Array} teams - Array of team objects
     * @param {string} stat - Stat name ('era' or 'ops')
     * @param {string} direction - 'above' or 'below'
     * @returns {Array} Filtered teams
     */
    function getTeamsRelativeToAverage(teams, stat, direction) {
        if (!teams || !Array.isArray(teams) || teams.length === 0) {
            return [];
        }
        
        // Calculate average
        let total = 0;
        let count = 0;
        
        teams.forEach(team => {
            if (team[stat] !== undefined) {
                total += parseFloat(team[stat]);
                count++;
            }
        });
        
        const average = total / count;
        logger.log(`Average ${stat}: ${average.toFixed(3)}`);
        
        // Filter teams
        if (direction === 'above') {
            return teams.filter(team => team[stat] > average);
        } else if (direction === 'below') {
            return teams.filter(team => team[stat] < average);
        }
        
        return teams;
    }
    
    // Public API
    return {
        getAvailableDivisions: getAvailableDivisions,
        getAvailableLeagues: getAvailableLeagues,
        filterByDivision: filterByDivision,
        filterByLeague: filterByLeague,
        applyFilters: applyFilters,
        setActiveDivision: setActiveDivision,
        setActiveLeague: setActiveLeague,
        getActiveFilters: getActiveFilters,
        clearFilters: clearFilters,
        setCustomFilter: setCustomFilter,
        getTeamsRelativeToAverage: getTeamsRelativeToAverage
    };
})(window, document, jQuery, MLBConfig);