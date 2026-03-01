// app/static/js/carousel.js

/**
 * Hero Carousel - slides between ERA/OPS chart and Budget analysis chart.
 * Supports arrow buttons, dot indicators, and touch/swipe navigation.
 */

const HeroCarousel = (function() {
    "use strict";

    let currentSlide = 0;
    const TOTAL_SLIDES = 2;
    const SWIPE_THRESHOLD = 50; // px

    let track, dots, prevBtn, nextBtn;
    let touchStartX = 0;
    let touchStartY = 0;
    let isSwiping = false;

    function applySlide(index, animate) {
        if (!track) return;
        if (!animate) {
            track.style.transition = 'none';
        }
        track.style.transform = `translateX(-${index * 100}%)`;
        if (!animate) {
            // Re-enable transition after a frame
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    track.style.transition = '';
                });
            });
        }
        updateDots(index);
    }

    function updateDots(index) {
        if (!dots) return;
        dots.forEach(function(dot, i) {
            dot.classList.toggle('active', i === index);
        });
    }

    function goToSlide(index) {
        currentSlide = ((index % TOTAL_SLIDES) + TOTAL_SLIDES) % TOTAL_SLIDES;
        applySlide(currentSlide, true);

        // Lazy-initialize budget chart when slide 2 first appears
        if (currentSlide === 1 && typeof BudgetChart !== 'undefined') {
            BudgetChart.initialize();
        }
    }

    function onPrev() {
        goToSlide(currentSlide - 1);
    }

    function onNext() {
        goToSlide(currentSlide + 1);
    }

    // Touch/swipe support
    function onTouchStart(e) {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
        isSwiping = false;
    }

    function onTouchMove(e) {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        // Only treat as horizontal swipe if horizontal delta dominates
        if (Math.abs(dx) > Math.abs(dy)) {
            isSwiping = true;
        }
    }

    function onTouchEnd(e) {
        if (!isSwiping) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(dx) >= SWIPE_THRESHOLD) {
            if (dx < 0) {
                onNext();
            } else {
                onPrev();
            }
        }
        isSwiping = false;
    }

    function initialize() {
        track   = document.getElementById('carousel-track');
        prevBtn = document.getElementById('carousel-prev');
        nextBtn = document.getElementById('carousel-next');
        dots    = Array.from(document.querySelectorAll('.carousel-dot'));

        if (!track) return;

        // Arrow buttons
        if (prevBtn) prevBtn.addEventListener('click', onPrev);
        if (nextBtn) nextBtn.addEventListener('click', onNext);

        // Dot buttons
        dots.forEach(function(dot) {
            dot.addEventListener('click', function() {
                var idx = parseInt(dot.getAttribute('data-slide'), 10);
                if (!isNaN(idx)) goToSlide(idx);
            });
        });

        // Touch/swipe
        track.addEventListener('touchstart', onTouchStart, { passive: true });
        track.addEventListener('touchmove',  onTouchMove,  { passive: true });
        track.addEventListener('touchend',   onTouchEnd,   { passive: true });

        // Set initial position without animation
        applySlide(0, false);
    }

    return { initialize: initialize, goToSlide: goToSlide };

})();
