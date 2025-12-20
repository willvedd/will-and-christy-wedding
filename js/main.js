// ===================================
// Configuration
// ===================================
const HERO_IMAGES = ['hero-1.jpeg', 'hero-2.jpeg', 'hero-3.jpeg', 'hero-4.jpeg'];
const CAROUSEL_INTERVAL_MS = 5000; 
const FADE_DURATION_MS = 500; 

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

    // Function to update the hero background image with crossfade effect
    function updateSlide(index) {
        if (isTransitioning) return;
        if (index === currentSlide) return;

        isTransitioning = true;
        const newImageUrl = `url('images/${HERO_IMAGES[index]}')`;

        // Set the new image on the ::before pseudo-element
        const style = document.createElement('style');
        style.textContent = `.hero::before { background-image: ${newImageUrl}; opacity: 1; }`;
        document.head.appendChild(style);

        // After the fade completes, swap images
        setTimeout(() => {
            currentSlide = index;
            hero.style.backgroundImage = newImageUrl;

            // Remove the style to reset ::before
            document.head.removeChild(style);

            // Update active dot
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

    // Function to go to next slide
    function nextSlide() {
        const next = (currentSlide + 1) % HERO_IMAGES.length;
        updateSlide(next);
    }

    // Start auto-play
    function startAutoPlay() {
        if (autoPlayEnabled) {
            autoPlayInterval = setInterval(nextSlide, CAROUSEL_INTERVAL_MS);
        }
    }

    // Stop auto-play
    function stopAutoPlay() {
        clearInterval(autoPlayInterval);
        autoPlayEnabled = false;
    }

    // Add click handlers to dots
    dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            stopAutoPlay();
            updateSlide(index);
        });
    });

    // Start the carousel
    startAutoPlay();
})();
