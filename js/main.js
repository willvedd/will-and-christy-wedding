// ===================================
// Configuration
// ===================================
const HERO_IMAGE_COUNT = 5;
const CAROUSEL_INTERVAL_MS = 5000;
const FADE_DURATION_MS = 500;

function getOrientation() {
    return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

function getHeroImageUrl(index) {
    const orientation = getOrientation();
    return `images/hero-${index + 1}-${orientation}.jpeg`;
} 

// ===================================
// Smooth Scroll
// ===================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// ===================================
// Hero Image Carousel
// ===================================
(function() {
    const hero = document.querySelector('.hero');
    const dots = document.querySelectorAll('.carousel-dot');
    let currentSlide = 0;
    let autoPlayInterval;
    let autoPlayEnabled = true;
    let isTransitioning = false;

    function updateSlide(index, forceUpdate = false) {
        if (isTransitioning) return;
        if (index === currentSlide && !forceUpdate) return;

        isTransitioning = true;
        const newImageUrl = `url('${getHeroImageUrl(index)}')`;

        const style = document.createElement('style');
        style.textContent = `.hero::before { background-image: ${newImageUrl}; opacity: 1; }`;
        document.head.appendChild(style);

        setTimeout(() => {
            currentSlide = index;
            hero.style.backgroundImage = newImageUrl;

            document.head.removeChild(style);

            dots.forEach((dot, i) => {
                if (i === currentSlide) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });

            isTransitioning = false;
        }, FADE_DURATION_MS);
    }

    function nextSlide() {
        const next = (currentSlide + 1) % HERO_IMAGE_COUNT;
        updateSlide(next);
    }

    function startAutoPlay() {
        if (autoPlayEnabled) {
            autoPlayInterval = setInterval(nextSlide, CAROUSEL_INTERVAL_MS);
        }
    }

    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
        autoPlayEnabled = false;
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            stopAutoPlay();
            updateSlide(index);
        });
    });

    window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
        updateSlide(currentSlide, true);
    });

    startAutoPlay();
})();

// ===================================
// Mike Wazowski Scroll Animation
// ===================================
(function() {
    const mike = document.querySelector('.mike-easter-egg');
    const card = document.querySelector('.halloween-card');
    if (!mike || !card) return;

    const startTop = 0;
    const startLeft = 10;
    const endTop = -46;
    const endLeft = -38;

    function updateMikePosition() {
        const rect = card.getBoundingClientRect();
        const windowHeight = window.innerHeight;

        const triggerY = rect.top;

        const zoneTop = windowHeight * 0.1;
        const zonePeakStart = windowHeight * 0.45;
        const zonePeakEnd = windowHeight * 0.55;
        const zoneBottom = windowHeight * 0.9;

        let progress = 0;

        if (triggerY >= zoneBottom || triggerY <= zoneTop) {
            progress = 0;
        } else if (triggerY < zoneBottom && triggerY > zonePeakEnd) {
            progress = (zoneBottom - triggerY) / (zoneBottom - zonePeakEnd);
        } else if (triggerY <= zonePeakEnd && triggerY >= zonePeakStart) {
            progress = 1;
        } else if (triggerY < zonePeakStart && triggerY > zoneTop) {
            progress = (triggerY - zoneTop) / (zonePeakStart - zoneTop);
        }

        const currentTop = startTop + (endTop - startTop) * progress;
        const currentLeft = startLeft + (endLeft - startLeft) * progress;

        mike.style.top = currentTop + 'px';
        mike.style.left = currentLeft + 'px';
    }

    window.addEventListener('scroll', updateMikePosition);
    updateMikePosition();
})();
