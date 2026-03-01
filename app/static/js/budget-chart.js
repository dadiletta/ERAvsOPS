// app/static/js/budget-chart.js

/**
 * Budget vs Wins / Total Runs Chart
 *
 * X-axis: Regular Season Wins (or Total Runs Scored, toggleable)
 * Y-axis: Opening Day Payroll ($M) — inverted so LOW payroll = TOP of chart
 *
 * Top-right = most efficient teams. Teams below the regression line get
 * more production per dollar.
 *
 * Hover ghost:
 *   A dashed line connects the hovered team's current position to where they
 *   would land in the *other* mode, projected onto the current axis via
 *   percentile ranking. Line length encodes the divergence between the two
 *   metrics; color encodes the direction:
 *
 *   Blue  → wins rank > runs rank  (pitching-driven success)
 *   Gray  → balanced
 *   Red   → runs rank > wins rank  (offense-heavy / pitching concern)
 */

const BudgetChart = (function () {
    "use strict";

    const LOGO_SIZE   = window.innerWidth <= 768 ? 24 : 34;
    const FONT_FAMILY = "'Roboto', sans-serif";

    let chart       = null;
    let initialized = false;
    let xMode       = 'wins'; // 'wins' | 'runs'
    let seasonData  = null;
    let logoCache   = {};
    let hoverIndex  = null;
    let normCache   = null;

    // ── Logo loading ──────────────────────────────────────────────────────────

    function createLogoImage(src) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.width  = LOGO_SIZE;
            img.height = LOGO_SIZE;
            img.onload  = function () { resolve(img); };
            img.onerror = function () { reject(new Error('Failed: ' + src)); };
            img.src = src;
        });
    }

    function preloadLogos(teams, onComplete) {
        var pending = teams.length;
        if (pending === 0) { onComplete(); return; }

        teams.forEach(function (team) {
            var path = team.logo.startsWith('/') ? team.logo : '/' + team.logo;

            // Placeholder canvas while image loads
            var cv = document.createElement('canvas');
            cv.width = cv.height = LOGO_SIZE;
            var cx = cv.getContext('2d');
            cx.beginPath();
            cx.arc(LOGO_SIZE / 2, LOGO_SIZE / 2, LOGO_SIZE / 2.5, 0, Math.PI * 2);
            cx.fillStyle = '#e8eaf0';
            cx.fill();
            cx.fillStyle    = '#002D72';
            cx.font         = 'bold 10px Arial';
            cx.textAlign    = 'center';
            cx.textBaseline = 'middle';
            cx.fillText(
                (team.abbreviation || team.name.substring(0, 3)).toUpperCase(),
                LOGO_SIZE / 2, LOGO_SIZE / 2
            );
            logoCache[path] = cv;

            createLogoImage(path)
                .then(function (img) {
                    logoCache[path] = img;
                    if (chart) chart.update('none');
                })
                .catch(function () { /* keep placeholder */ })
                .finally(function () {
                    if (--pending === 0) onComplete();
                });
        });
    }

    // ── Data helpers ──────────────────────────────────────────────────────────

    function buildPoints() {
        return seasonData.teams.map(function (t) {
            return {
                x:         xMode === 'wins' ? t.wins : t.runs,
                y:         t.payroll_m,
                fullName:  t.full_name,
                logo:      t.logo,
                division:  t.division,
                payroll_m: t.payroll_m,
                wins:      t.wins,
                runs:      t.runs
            };
        });
    }

    function getLogoForPoint(point) {
        var path = point.logo.startsWith('/') ? point.logo : '/' + point.logo;
        return logoCache[path] || null;
    }

    function isDarkMode() {
        return document.body.classList.contains('dark-mode');
    }

    function getColors() {
        return isDarkMode() ? {
            grid:            'rgba(255,255,255,0.08)',
            tick:            '#bdbdbd',
            axisBlue:        'rgba(100,160,255,0.8)',
            axisRed:         'rgba(255,100,120,0.8)',
            tooltipBg:       'rgba(45,45,45,0.95)',
            tooltipTitle:    '#66B2FF',
            tooltipBody:     '#f0f0f0',
            trendLine:       'rgba(180,180,180,0.5)',
            trendLabelBg:    'rgba(45,45,45,0.85)',
            trendLabelColor: '#bdbdbd'
        } : {
            grid:            'rgba(0,0,0,0.05)',
            tick:            '#666',
            axisBlue:        'rgba(0,45,114,0.7)',
            axisRed:         'rgba(227,25,55,0.7)',
            tooltipBg:       'rgba(255,255,255,0.95)',
            tooltipTitle:    '#002D72',
            tooltipBody:     '#333',
            trendLine:       'rgba(100,100,100,0.4)',
            trendLabelBg:    'rgba(255,255,255,0.85)',
            trendLabelColor: '#555'
        };
    }

    function xAxisLabel() {
        return xMode === 'wins' ? 'Regular Season Wins' : 'Total Runs Scored';
    }

    function efficiencyLabel(point) {
        var stat   = xMode === 'wins' ? point.wins : point.runs;
        var metric = xMode === 'wins' ? 'Wins' : 'Runs';
        return metric + '/$M: ' + (stat / point.payroll_m).toFixed(xMode === 'wins' ? 2 : 1);
    }

    function buildAxisX(points) {
        var vals = points.map(function (p) { return p.x; });
        var step = xMode === 'wins' ? 5 : 10;
        return {
            min:      Math.floor(Math.min.apply(null, vals) * 0.92 / step) * step,
            max:      Math.ceil(Math.max.apply(null, vals)  * 1.05 / step) * step,
            stepSize: xMode === 'wins' ? 5 : 50
        };
    }

    // ── Linear regression ─────────────────────────────────────────────────────

    function linearRegression(points) {
        var n = points.length, sX = 0, sY = 0, sXY = 0, sXX = 0;
        points.forEach(function (p) { sX += p.x; sY += p.y; sXY += p.x * p.y; sXX += p.x * p.x; });
        var slope = (n * sXY - sX * sY) / (n * sXX - sX * sX);
        return { slope: slope, intercept: (sY - slope * sX) / n };
    }

    function buildTrendAnnotation(points, colors) {
        var r    = linearRegression(points);
        var vals = points.map(function (p) { return p.x; });
        var x0   = Math.min.apply(null, vals);
        var x1   = Math.max.apply(null, vals);
        return {
            trendLine: {
                type:        'line',
                xMin:        x0, xMax: x1,
                yMin:        r.slope * x0 + r.intercept,
                yMax:        r.slope * x1 + r.intercept,
                borderColor: colors.trendLine,
                borderWidth: 2,
                borderDash:  [6, 4],
                label: {
                    display:         true,
                    content:         'Below line = better value',
                    position:        'end',
                    backgroundColor: colors.trendLabelBg,
                    color:           colors.trendLabelColor,
                    font:            { size: 10, family: FONT_FAMILY },
                    padding:         4
                }
            }
        };
    }

    // ── Hover ghost ───────────────────────────────────────────────────────────

    // Precompute min/max for wins and runs across all 30 teams (called once).
    function getNorm() {
        if (!normCache && seasonData) {
            var w = seasonData.teams.map(function (t) { return t.wins; });
            var r = seasonData.teams.map(function (t) { return t.runs; });
            normCache = {
                minW: Math.min.apply(null, w), maxW: Math.max.apply(null, w),
                minR: Math.min.apply(null, r), maxR: Math.max.apply(null, r)
            };
        }
        return normCache;
    }

    /**
     * Maps divergence (winsPercentile − runsPercentile) to a color.
     *
     *  > 0  →  team wins MORE than their runs would predict  →  pitching-driven  →  blue
     *  ≈ 0  →  balanced                                                          →  gray
     *  < 0  →  team scores MORE than their wins reflect      →  offense-heavy    →  red
     *
     * Magnitude controls intensity; thresholds chosen so ~⅓ of teams fall in
     * each region of the spectrum.
     */
    function divergenceColor(d) {
        if (d >  0.25) return '#1565C0'; // deep blue  — strong pitching edge
        if (d >  0.10) return '#5B9BD5'; // cornflower — moderate pitching
        if (d > -0.10) return '#888888'; // gray       — balanced
        if (d > -0.25) return '#E8865A'; // salmon     — offense-leaning
        return             '#C0392B';    // crimson    — runs-heavy / pitching concern
    }

    /**
     * Ghost plugin — draws on afterDraw (over datasets, under tooltips*).
     *
     * For the hovered team:
     *  - Projects the OTHER metric's percentile rank onto the CURRENT axis
     *    so both modes share a common visual reference frame.
     *  - Draws a dashed line + arrowhead from current to ghost position.
     *  - Draws a semi-transparent ghost logo + dashed ring at ghost position.
     *  - Colors everything by divergence (blue ↔ gray ↔ red spectrum).
     *
     * Ghost X formula (wins mode example):
     *   ghostX = axisMin + runsPercentile × (axisMax − axisMin)
     * This answers: "if this team's runs rank were plotted on the wins axis,
     * where would they land?" — making line length directly comparable.
     */
    var ghostPlugin = {
        id: 'budgetGhostPlugin',
        afterDraw: function (c) {
            if (hoverIndex === null) return;
            var data = c.data.datasets[0] && c.data.datasets[0].data;
            if (!data || !data[hoverIndex]) return;

            var pt   = data[hoverIndex];
            var norm = getNorm();
            if (!norm) return;

            var wN = (pt.wins - norm.minW) / (norm.maxW - norm.minW); // [0,1] wins percentile
            var rN = (pt.runs - norm.minR) / (norm.maxR - norm.minR); // [0,1] runs percentile
            var d  = wN - rN;                                          // divergence

            var xs  = c.scales.x;
            var ys  = c.scales.y;
            var lo  = xs.min;
            var hi  = xs.max;

            // Project the OTHER metric's percentile onto the current axis range
            var ghostX = xMode === 'wins'
                ? lo + rN * (hi - lo)   // wins mode: where would this team's runs rank land?
                : lo + wN * (hi - lo);  // runs mode: where would this team's wins rank land?

            var cx0 = xs.getPixelForValue(pt.x);
            var cy0 = ys.getPixelForValue(pt.y);
            var cx1 = xs.getPixelForValue(ghostX);
            var cy1 = cy0; // Y (payroll) doesn't change between modes

            if (Math.abs(cx1 - cx0) < 3) return; // no meaningful divergence

            var color = divergenceColor(d);
            var ctx   = c.ctx;
            ctx.save();

            // Dashed connecting line
            ctx.beginPath();
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 2;
            ctx.moveTo(cx0, cy0);
            ctx.lineTo(cx1, cy1);
            ctx.stroke();
            ctx.setLineDash([]);

            // Filled arrowhead at ghost end
            var ang = Math.atan2(cy1 - cy0, cx1 - cx0);
            var al  = 8;
            ctx.beginPath();
            ctx.moveTo(cx1, cy1);
            ctx.lineTo(cx1 - al * Math.cos(ang - Math.PI / 6), cy1 - al * Math.sin(ang - Math.PI / 6));
            ctx.lineTo(cx1 - al * Math.cos(ang + Math.PI / 6), cy1 - al * Math.sin(ang + Math.PI / 6));
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            // Ghost logo (faded)
            var logo = getLogoForPoint(pt);
            if (logo) {
                ctx.globalAlpha = 0.28;
                ctx.drawImage(logo, cx1 - LOGO_SIZE / 2, cy1 - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE);
                ctx.globalAlpha = 1.0;
            }

            // Dashed ghost ring
            ctx.beginPath();
            ctx.arc(cx1, cy1, LOGO_SIZE / 2 + 3, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.restore();
        }
    };

    // ── Chart creation / update ───────────────────────────────────────────────

    function createChart() {
        var canvas = document.getElementById('budgetChart');
        if (!canvas) return;
        if (chart) { chart.destroy(); chart = null; }

        var ctx    = canvas.getContext('2d');
        var points = buildPoints();
        var colors = getColors();
        var season = seasonData.season;
        var ax     = buildAxisX(points);
        var yVals  = points.map(function (p) { return p.y; });
        var yMin   = Math.floor(Math.min.apply(null, yVals) * 0.9  / 25) * 25;
        var yMax   = Math.ceil(Math.max.apply(null, yVals)  * 1.08 / 25) * 25;

        var watermarkPlugin = {
            id: 'budgetWatermark',
            afterDraw: function (c) {
                var a = c.chartArea;
                c.ctx.save();
                c.ctx.font      = 'bold 13px ' + FONT_FAMILY;
                c.ctx.fillStyle = isDarkMode() ? 'rgba(255,255,255,0.12)' : 'rgba(0,45,114,0.12)';
                c.ctx.textAlign    = 'right';
                c.ctx.textBaseline = 'bottom';
                c.ctx.fillText(season + ' Season', a.right - 6, a.bottom - 6);
                c.ctx.restore();
            }
        };

        chart = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label:           'MLB Teams ' + season,
                    data:            points,
                    // Read from live chart data so updateChart() doesn't need to
                    // replace this closure when the dataset is swapped.
                    pointStyle: function (context) {
                        var d = context.chart.data.datasets[0].data;
                        var i = context.dataIndex;
                        return (i !== undefined && d && d[i]) ? getLogoForPoint(d[i]) : null;
                    },
                    pointRadius:     LOGO_SIZE / 2,
                    backgroundColor: 'rgba(0,0,0,0)'
                }]
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                // Smooth slide animation when toggling modes
                animation: { duration: 500, easing: 'easeInOutQuart' },
                onHover: function (event, activeElements) {
                    hoverIndex = activeElements.length > 0 ? activeElements[0].index : null;
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text:    xAxisLabel(),
                            font:    { size: 13, weight: 'bold', family: FONT_FAMILY },
                            color:   colors.axisRed
                        },
                        min:  ax.min,
                        max:  ax.max,
                        grid: { color: colors.grid, lineWidth: 1 },
                        ticks: {
                            stepSize: ax.stepSize,
                            font:     { size: 11, family: FONT_FAMILY },
                            color:    colors.tick
                        }
                    },
                    y: {
                        reverse: true, // low payroll floats to top
                        title: {
                            display: true,
                            text:    'Opening Day Payroll ($M)',
                            font:    { size: 13, weight: 'bold', family: FONT_FAMILY },
                            color:   colors.axisBlue
                        },
                        min:  yMin,
                        max:  yMax,
                        grid: { color: colors.grid, lineWidth: 1 },
                        ticks: {
                            stepSize: 25,
                            font:     { size: 11, family: FONT_FAMILY },
                            color:    colors.tick,
                            callback: function (v) { return '$' + v + 'M'; }
                        }
                    }
                },
                plugins: {
                    legend:  { display: false },
                    title:   { display: false },
                    tooltip: {
                        backgroundColor: colors.tooltipBg,
                        titleColor:      colors.tooltipTitle,
                        bodyColor:       colors.tooltipBody,
                        borderColor:     '#002D72',
                        borderWidth:     1,
                        cornerRadius:    6,
                        padding:         10,
                        displayColors:   false,
                        titleFont: { size: 13, weight: 'bold', family: FONT_FAMILY },
                        bodyFont:  { size: 12, family: FONT_FAMILY },
                        callbacks: {
                            title: function (items) { return items[0].raw.fullName; },
                            label: function (item) {
                                var p = item.raw;
                                return [
                                    'Payroll: $' + p.payroll_m.toFixed(1) + 'M',
                                    'Wins: '     + p.wins,
                                    'Runs: '     + p.runs,
                                    efficiencyLabel(p),
                                    p.division
                                ];
                            }
                        }
                    },
                    annotation: { annotations: buildTrendAnnotation(points, colors) }
                }
            },
            plugins: [ghostPlugin, watermarkPlugin]
        });
    }

    /**
     * Lightweight update for mode toggle — mutates the live chart and calls
     * chart.update() so Chart.js animates logos sliding to their new positions.
     * Much smoother than destroy+recreate.
     */
    function updateChart() {
        if (!chart) { createChart(); return; }

        hoverIndex = null; // clear ghost during transition

        var points = buildPoints();
        var colors = getColors();
        var ax     = buildAxisX(points);

        chart.data.datasets[0].data          = points;
        chart.options.scales.x.min           = ax.min;
        chart.options.scales.x.max           = ax.max;
        chart.options.scales.x.ticks.stepSize = ax.stepSize;
        chart.options.scales.x.title.text    = xAxisLabel();
        chart.options.plugins.annotation.annotations = buildTrendAnnotation(points, colors);

        chart.update();
    }

    // ── X-axis toggle ─────────────────────────────────────────────────────────

    function setXMode(mode) {
        if (mode === xMode) return;
        xMode = mode;
        var wb = document.getElementById('budget-wins-btn');
        var rb = document.getElementById('budget-runs-btn');
        if (wb) wb.classList.toggle('active', mode === 'wins');
        if (rb) rb.classList.toggle('active', mode === 'runs');
        updateChart();
    }

    // ── Public init ───────────────────────────────────────────────────────────

    function initialize() {
        if (initialized) return;
        initialized = true;

        fetch('/static/data/season_analysis.json')
            .then(function (r) { return r.json(); })
            .then(function (data) {
                seasonData = data;
                normCache  = null; // ensure getNorm() recomputes

                var label = document.getElementById('budget-season-label');
                if (label) label.textContent = data.season;

                preloadLogos(data.teams, function () {
                    createChart();
                    var wb = document.getElementById('budget-wins-btn');
                    var rb = document.getElementById('budget-runs-btn');
                    if (wb) wb.addEventListener('click', function () { setXMode('wins'); });
                    if (rb) rb.addEventListener('click', function () { setXMode('runs'); });
                });
            })
            .catch(function (err) {
                console.error('BudgetChart: failed to load season_analysis.json', err);
                initialized = false;
            });
    }

    return { initialize: initialize };

})();
