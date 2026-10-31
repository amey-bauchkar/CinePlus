/**
 * main.js
 * Frontend controller for CinePlus - Movie Ticket Price & Show Finder Automation
 * Integrates Multi-Platform Live Booking (BookMyShow, PVR INOX, District, Cinépolis),
 * HD Trailer Popups, Upcoming Releases, and Price Matrix Comparisons.
 */

let currentMovies = [];
let currentUpcomingMovies = [];
let currentCity = 'Mumbai';
let activeCategory = 'all';
let currentMovieForCompare = null;
let currentActiveTab = 'now_showing'; // 'now_showing' | 'upcoming'
let currentPage = 1;
const MOVIES_PER_PAGE = 16;
let showAllMovies = false;

// Synchronize landing hero viewport height so Announcement Bar + Navbar + Hero + Orange Marquee = 100vh
function syncHeroViewportHeight() {
  const annBar = document.querySelector('.announcement-bar');
  const navBar = document.querySelector('.navbar');
  if (annBar || navBar) {
    const annHeight = annBar ? annBar.offsetHeight : 0;
    const navHeight = navBar ? navBar.offsetHeight : 0;
    const totalTop = annHeight + navHeight;
    if (totalTop > 0) {
      document.documentElement.style.setProperty('--landing-top-offset', totalTop + 'px');
    }
  }
}

function scrollToShows(e) {
  if (e) e.preventDefault();
  const target = document.getElementById('category-bar');
  if (target) {
    target.scrollIntoView({ behavior: 'smooth' });
  } else {
    window.location.href = '/movies';
  }
}

window.addEventListener('resize', syncHeroViewportHeight);
window.addEventListener('load', syncHeroViewportHeight);

document.addEventListener('DOMContentLoaded', () => {
  syncHeroViewportHeight();
  // Ensure Hero background video autoplays smoothly
  const heroVid = document.getElementById('hero-bg-video');
  if (heroVid) {
    heroVid.muted = true;
    const playPromise = heroVid.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        window.addEventListener('click', () => heroVid.play(), { once: true });
        window.addEventListener('scroll', () => heroVid.play(), { once: true });
      });
    }
  }

  const searchInput = document.getElementById('nav-search-input');
  if (searchInput && !document.getElementById('movie-grid')) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        window.location.href = `/movies?search=${encodeURIComponent(searchInput.value.trim())}`;
      }
    });
  }

  // Only load movies if on movies page (/movies)
  if (document.getElementById('movie-grid')) {
    parseUrlParameters();
    loadMovies();

    // Auto-refresh showtimes every 5 minutes if tab is active
    setInterval(() => {
      if (currentActiveTab === 'now_showing' && !document.hidden) {
        loadMovies();
      }
    }, 300000);

    // Auto-refresh when user switches back to this tab
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && currentActiveTab === 'now_showing') {
        loadMovies();
      }
    });
  }
  
  loadAlerts();
  // Poll notifications every 15 seconds
  setInterval(loadAlerts, 15000);
});

// Switch between 'Now Showing' and 'Upcoming Movies'
function switchMainTab(tab) {
  currentActiveTab = tab;
  
  const navNowShowing = document.getElementById('nav-now-showing');
  const navUpcoming = document.getElementById('nav-upcoming');
  const categoryBar = document.getElementById('category-bar');
  const rankByBox = document.getElementById('rank-by-box');
  const sidebar = document.getElementById('main-sidebar');

  if (tab === 'now_showing') {
    navNowShowing.classList.add('active');
    navUpcoming.classList.remove('active');
    categoryBar.style.display = 'block';
    rankByBox.style.display = 'flex';
    sidebar.style.display = 'block';
    loadMovies();
  } else {
    navUpcoming.classList.add('active');
    navNowShowing.classList.remove('active');
    categoryBar.style.display = 'none';
    rankByBox.style.display = 'none';
    loadUpcomingMovies();
  }
}

// Load movies from REST API
async function loadMovies() {
  const city = document.getElementById('city-select').value;
  currentCity = city;
  const searchQuery = document.getElementById('nav-search-input').value;
  const sortBy = document.getElementById('sort-select').value;

  // Gather selected formats
  const formatCheckboxes = document.querySelectorAll('input[name="format_filter"]:checked');
  const formats = Array.from(formatCheckboxes).map(cb => cb.value);

  // Category pill override
  if (activeCategory !== 'all' && activeCategory !== 'budget') {
    if (!formats.includes(activeCategory)) {
      formats.push(activeCategory);
    }
  }

  // Price filter
  let maxPrice = null;
  const priceRadio = document.querySelector('input[name="price_filter"]:checked');
  if (priceRadio && priceRadio.value !== '1000') {
    maxPrice = parseInt(priceRadio.value);
  }
  if (activeCategory === 'budget') {
    maxPrice = 200;
  }

  // Chain filter
  const chainRadio = document.querySelector('input[name="chain_filter"]:checked');
  const chain = chainRadio ? chainRadio.value : 'All';

  const langRadio = document.querySelector('input[name="lang_filter"]:checked');
  const lang = langRadio ? langRadio.value : 'All';

  let url = `/api/movies?city=${encodeURIComponent(city)}&sort_by=${sortBy}&chain=${encodeURIComponent(chain)}`;
  if (lang && lang !== 'All') url += `&language=${encodeURIComponent(lang)}`;
  if (searchQuery) url += `&search=${encodeURIComponent(searchQuery)}`;
  if (maxPrice) url += `&max_price=${maxPrice}`;
  formats.forEach(f => { url += `&format=${encodeURIComponent(f)}`; });

  try {
    const res = await fetch(url);
    const data = await res.json();
    currentMovies = data.movies || [];
    renderMovieGrid(currentMovies);
    updateResultsCount(currentMovies.length, city, 'now_showing');
    populateAlertMovieDropdown(currentMovies);
  } catch (err) {
    console.error('Error fetching movies:', err);
  }
}

// Load Upcoming Tentpoles
async function loadUpcomingMovies() {
  const searchQuery = document.getElementById('nav-search-input').value;
  let url = '/api/upcoming';
  if (searchQuery) url += `?search=${encodeURIComponent(searchQuery)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    currentUpcomingMovies = data.upcoming_movies || [];
    renderUpcomingGrid(currentUpcomingMovies);
    updateResultsCount(currentUpcomingMovies.length, currentCity, 'upcoming');
  } catch (err) {
    console.error('Error loading upcoming movies:', err);
  }
}

// Render Now Showing movie cards
function renderMovieGrid(movies) {
  const grid = document.getElementById('movie-grid');
  grid.innerHTML = '';

  if (movies.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <h3 style="font-size: 18px; margin-bottom: 8px;">No movie shows match your filters</h3>
        <p style="color: var(--color-olive-muted); margin-bottom: 20px;">Try adjusting your format or price filters.</p>
        <button class="action-btn secondary" onclick="resetAllFilters()">Reset All Filters</button>
      </div>
    `;
    const pag = document.getElementById('pagination-controls');
    if (pag) pag.style.display = 'none';
    return;
  }

  const total = movies.length;
  const totalPages = Math.ceil(total / MOVIES_PER_PAGE) || 1;
  if (currentPage > totalPages) currentPage = 1;

  const displayMovies = showAllMovies 
    ? movies 
    : movies.slice((currentPage - 1) * MOVIES_PER_PAGE, currentPage * MOVIES_PER_PAGE);

  displayMovies.forEach(mov => {
    const card = document.createElement('div');
    card.className = 'movie-card';

    // Show previews for first 2 theatres
    let showtimesHtml = '';
    if (mov.theatre_shows && mov.theatre_shows.length > 0) {
      const firstTheatre = mov.theatre_shows[0];
      showtimesHtml = `
        <div class="theatres-showtimes">
          <div class="theatre-row-preview">
            <strong>${escapeHtml(firstTheatre.theatre_name.split(':')[0])}</strong> (${firstTheatre.chain})
          </div>
          <div class="timing-chips">
            ${firstTheatre.shows.slice(0, 3).map(s => `
              <button class="timing-chip" onclick="openBookingPortalModal('${mov.id}', '${escapeHtml(firstTheatre.theatre_name)}', '${s.time}', '${s.format}', '${s.booking_url || ''}')" title="Click to book: ${s.format} - Silver ₹${s.silver}">
                <span>${s.time}</span>
                <span class="chip-price">₹${s.silver}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-badge">${escapeHtml(mov.badge || 'New')}</div>
      <div class="card-poster-container">
        <img src="${mov.poster}" alt="${escapeHtml(mov.title)}" class="card-poster" loading="lazy">
      </div>
      <div class="card-info">
        <div class="card-meta">
          <span class="meta-rating">Rating: ${mov.rating}/10</span>
          <span>•</span>
          <span>${escapeHtml(mov.genre)}</span>
          <span>•</span>
          <span>${escapeHtml(mov.duration)}</span>
        </div>

        <h3 class="card-title">${escapeHtml(mov.title)}</h3>
        <div class="card-discount-tag">${escapeHtml(mov.discount_tag)}</div>

        <div class="card-price-row">
          <span class="price-label">Starts at</span>
          <span class="price-val">₹${mov.min_price}</span>
          <span style="font-size: 11px; color: var(--color-olive-muted); margin-left: 4px;">in ${escapeHtml(mov.theatre_count)} multiplexes</span>
        </div>

        ${showtimesHtml}

        <div class="card-actions">
          <button class="action-btn secondary" onclick="openCompareModal('${mov.id}')">
            Compare Prices
          </button>
          <button class="action-btn primary" onclick="openBookingPortalModal('${mov.id}')">
            Book Now &rarr;
          </button>
          ${mov.trailer_id ? `
            <button class="action-btn trailer-btn" onclick="openTrailerModal('${mov.trailer_id}', '${escapeHtml(mov.title)}')">
              Watch Trailer
            </button>
          ` : ''}
          <button class="action-btn track-btn" onclick="openAlertForMovie('${mov.id}', '${escapeHtml(mov.title)}', ${mov.min_price})">
            Set Price Drop Watcher
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
  renderPagination(total, totalPages);
}

// Render Upcoming Movies Grid
function renderUpcomingGrid(upcoming) {
  const grid = document.getElementById('movie-grid');
  grid.innerHTML = '';

  if (upcoming.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;">
        <h3 style="font-size: 18px;">No upcoming movies found</h3>
        <p style="color: var(--color-olive-muted);">Try clearing your search keyword.</p>
      </div>
    `;
    return;
  }

  upcoming.forEach(mov => {
    const card = document.createElement('div');
    card.className = 'movie-card';

    card.innerHTML = `
      <div class="upcoming-release-badge">Release: ${escapeHtml(mov.release_date)}</div>
      <div class="card-badge" style="background-color: var(--color-deep-olive);">${escapeHtml(mov.badge)}</div>
      <div class="card-poster-container">
        <img src="${mov.poster}" alt="${escapeHtml(mov.title)}" class="card-poster" loading="lazy">
      </div>
      <div class="card-info">
        <div class="hype-badge">${escapeHtml(mov.hype_score)}</div>
        <div class="card-meta">
          <span>${escapeHtml(mov.certificate)}</span>
          <span>•</span>
          <span>${escapeHtml(mov.genre)}</span>
        </div>

        <h3 class="card-title">${escapeHtml(mov.title)}</h3>
        <p style="font-size: 12px; color: var(--color-olive-muted); line-height: 1.4; margin-bottom: 12px;">
          ${escapeHtml(mov.synopsis)}
        </p>

        <div style="font-size: 11px; color: var(--color-olive-muted); margin-bottom: 12px;">
          <strong>Starring:</strong> ${mov.cast ? mov.cast.join(', ') : 'All-Star Cast'}<br>
          <strong>Director:</strong> ${escapeHtml(mov.director)}
        </div>

        <div class="card-actions">
          <button class="action-btn trailer-btn" style="width: 100%; margin-bottom: 6px;" onclick="openTrailerModal('${mov.trailer_id}', '${escapeHtml(mov.title)}')">
            Watch Official Trailer
          </button>
          <button class="action-btn primary" style="width: 100%;" onclick="openAlertForMovie('${mov.id}', '${escapeHtml(mov.title)}', 250)">
            Notify on Ticket Opening
          </button>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
  renderPagination(total, totalPages);
}

function updateResultsCount(count, city, type) {
  const el = document.getElementById('results-count-text');
  if (type === 'upcoming') {
    el.textContent = `Showing ${count} Upcoming Blockbusters & Tentpoles`;
  } else {
    el.textContent = `Showing ${count} live movies in ${city}`;
  }
}

// Multi-Platform Live Booking Modal Launcher
async function openBookingPortalModal(movieId, theatreName = null, showTime = null, format = null, directBookingUrl = null) {
  const modal = document.getElementById('booking-portal-modal');
  const modalBody = document.getElementById('booking-modal-body');
  
  modalBody.innerHTML = '<div style="text-align: center; padding: 40px;">Fetching live booking portals and offers...</div>';
  modal.style.display = 'flex';

  try {
    const params = new URLSearchParams({
      movie_id: movieId,
      city: currentCity
    });
    if (theatreName) params.set('theatre', theatreName);
    if (showTime) params.set('show_time', showTime);
    if (format) params.set('format', format);

    const res = await fetch(`/api/booking-details?${params.toString()}`);
    const data = await res.json();
    if (data.status === 'success') {
      const d = data.data;
      const movie = d.movie;
      const links = d.platform_links;
      if (directBookingUrl) {
        links.bookmyshow = directBookingUrl;
        links.BookMyShow = directBookingUrl;
        links.default = directBookingUrl;
      }
      const selectedTheatre = theatreName || d.theatre_name;
      const selectedTime = showTime || d.show_time;
      const selectedFormat = format || d.format;

      modalBody.innerHTML = `
        <div style="display: flex; gap: 16px; align-items: center; border-bottom: 1px solid var(--color-border-grid); padding-bottom: 16px;">
          <img src="${movie.poster}" alt="${escapeHtml(movie.title)}" style="width: 70px; height: 100px; object-fit: cover; border-radius: var(--radius-sm);">
          <div>
            <h3 style="font-size: 18px; font-weight: 700;">${escapeHtml(movie.title)}</h3>
            <p style="font-size: 13px; color: var(--color-olive-muted); margin: 3px 0;">
              ${escapeHtml(movie.genre)} • Rating: ${movie.rating}/10 (${movie.votes || 'Popular'})
            </p>
            <p style="font-size: 12px; color: var(--color-deep-olive); font-weight: 600;">
              ${escapeHtml(selectedTheatre)} ${showTime ? `• ${showTime} (${format})` : ''}
            </p>
          </div>
        </div>

        <div class="platform-choices-grid">
          <!-- BookMyShow -->
          <div class="platform-choice-card">
            <div class="platform-card-header">
              <span class="platform-name" style="color: #eb0028;">BookMyShow</span>
              <span class="platform-tag" style="background: #fff0f2; color: #eb0028;">Official API</span>
            </div>
            <p class="platform-desc">Instant seat reservation, M-Ticket on WhatsApp & food pre-orders.</p>
            <a href="${links.bookmyshow}" target="_blank" class="platform-launch-btn btn-bms" onclick="trackBookingClick('BookMyShow', '${escapeHtml(movie.title)}')">
              Launch BookMyShow &rarr;
            </a>
          </div>

          <!-- PVR INOX -->
          <div class="platform-choice-card">
            <div class="platform-card-header">
              <span class="platform-name" style="color: #d97706;">PVR INOX Cinemas</span>
              <span class="platform-tag" style="background: #fffbf0; color: #d97706;">Direct Multiplex</span>
            </div>
            <p class="platform-desc">Zero convenience fee on Passport subscribers & luxury recliner deals.</p>
            <a href="${links.pvr_inox}" target="_blank" class="platform-launch-btn btn-pvr" onclick="trackBookingClick('PVR INOX', '${escapeHtml(movie.title)}')">
              Launch PVR INOX &rarr;
            </a>
          </div>

          <!-- District by Zomato -->
          <div class="platform-choice-card">
            <div class="platform-card-header">
              <span class="platform-name" style="color: #7c3aed;">District (by Zomato)</span>
              <span class="platform-tag" style="background: #f3f0ff; color: #7c3aed;">Fast Checkout</span>
            </div>
            <p class="platform-desc">Zomato Gold dining combos & instant cashback on movie tickets.</p>
            <a href="${links.district}" target="_blank" class="platform-launch-btn btn-district" onclick="trackBookingClick('District', '${escapeHtml(movie.title)}')">
              Launch District &rarr;
            </a>
          </div>

          <!-- Cinépolis India -->
          <div class="platform-choice-card">
            <div class="platform-card-header">
              <span class="platform-name" style="color: #0284c7;">Cinépolis India</span>
              <span class="platform-tag" style="background: #f0f7ff; color: #0284c7;">Club Cinépolis</span>
            </div>
            <p class="platform-desc">Earn Club Cinepolis points & exclusive Wednesday saver discounts.</p>
            <a href="${links.cinepolis}" target="_blank" class="platform-launch-btn btn-cinepolis" onclick="trackBookingClick('Cinépolis', '${escapeHtml(movie.title)}')">
              Launch Cinépolis &rarr;
            </a>
          </div>
        </div>

        <!-- Promo Section -->
        <div class="promo-section-box">
          <strong style="font-size: 13px;">Verified Discount Coupons (Click to Copy):</strong>
          <div class="promo-grid">
            ${d.promos.map(p => `
              <div class="promo-chip" onclick="copyPromoCode('${p.code}')" title="Click to copy coupon code">
                <div>
                  <span class="promo-code-text">${p.code}</span>
                  <div style="font-size: 10px; color: var(--color-olive-muted);">${p.desc}</div>
                </div>
                <span style="font-size: 10px; color: var(--color-deep-olive); font-weight: 700;">COPY</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }
  } catch (err) {
    modalBody.innerHTML = '<p style="color: red; text-align: center;">Error loading platform booking links.</p>';
  }
}

function closeBookingPortalModal() {
  document.getElementById('booking-portal-modal').style.display = 'none';
}

function trackBookingClick(platform, movieTitle) {
  showToast(`Opening ${platform} for ${movieTitle}...`);
}

function copyPromoCode(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast(`Coupon code ${code} copied to clipboard!`);
  }).catch(() => {
    showToast(`Coupon: ${code}`);
  });
}

// Trailer Modal Player (Universal HD YouTube Resolver)
function openTrailerModal(trailerId, movieTitle) {
  const modal = document.getElementById('trailer-modal');
  const titleEl = document.getElementById('trailer-modal-title');
  const wrapper = document.getElementById('trailer-video-wrapper');
  const externalLink = document.getElementById('trailer-external-link');

  if (titleEl) titleEl.textContent = `${movieTitle}`;
  if (modal) modal.style.display = 'flex';

  // Check if trailerId is an authentic 11-char YouTube ID
  const isValidId = trailerId && 
                    trailerId !== 'auto' && 
                    !trailerId.startsWith('search:') && 
                    /^[a-zA-Z0-9_-]{11}$/.test(trailerId);

  if (isValidId) {
    mountTrailerIframe(trailerId, movieTitle);
  } else {
    // Show Two26 animated radar loading state while dynamically resolving
    wrapper.innerHTML = `
      <div class="trailer-loader-container">
        <div class="trailer-pulse-spinner"></div>
        <div class="trailer-loader-text">
          <strong>FETCHING OFFICIAL 4K / HD TRAILER</strong>
          <span>Connecting to Studio Radar for "${escapeHtml(movieTitle)}"...</span>
        </div>
      </div>
    `;

    const fallbackSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(movieTitle + ' official trailer')}`;
    if (externalLink) {
      externalLink.href = fallbackSearchUrl;
    }

    // Call dynamic backend resolver
    fetch(`/api/trailer?title=${encodeURIComponent(movieTitle)}`)
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success' && data.trailer_id) {
          // Cache on movie object in memory for instantaneous subsequent clicks
          const m = (currentMovies || []).find(x => x.title === movieTitle) || 
                    (currentUpcomingMovies || []).find(x => x.title === movieTitle);
          if (m) m.trailer_id = data.trailer_id;

          mountTrailerIframe(data.trailer_id, movieTitle);
        } else {
          showTrailerFallback(movieTitle, fallbackSearchUrl);
        }
      })
      .catch(err => {
        console.error('Trailer lookup error:', err);
        showTrailerFallback(movieTitle, fallbackSearchUrl);
      });
  }
}

function mountTrailerIframe(id, movieTitle) {
  const wrapper = document.getElementById('trailer-video-wrapper');
  const externalLink = document.getElementById('trailer-external-link');
  if (externalLink) {
    externalLink.href = `https://www.youtube.com/watch?v=${id}`;
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;
  wrapper.innerHTML = `
    <iframe src="${embedUrl}" 
            title="${escapeHtml(movieTitle)} Official Trailer" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            allowfullscreen>
    </iframe>
  `;
}

function showTrailerFallback(movieTitle, searchUrl) {
  const wrapper = document.getElementById('trailer-video-wrapper');
  wrapper.innerHTML = `
    <div class="trailer-fallback-container">
      <div class="trailer-fallback-box">
        <div class="trailer-fallback-badge">OFFICIAL CINEMA RELEASE</div>
        <h3 class="trailer-fallback-title">${escapeHtml(movieTitle)}</h3>
        <p class="trailer-fallback-subtitle">Studio policies require viewing this trailer directly on YouTube.</p>
        <a href="${searchUrl}" target="_blank" rel="noopener" class="trailer-fallback-btn">
          ▶ Watch Official Trailer on YouTube
        </a>
      </div>
    </div>
  `;
}

function closeTrailerModal() {
  const modal = document.getElementById('trailer-modal');
  const wrapper = document.getElementById('trailer-video-wrapper');
  if (wrapper) wrapper.innerHTML = '';
  if (modal) modal.style.display = 'none';
}

// Category Pill Bar
function selectCategoryPill(btn, cat) {
  if (!document.getElementById('movie-grid')) {
    // We are on landing page: navigate to /movies with the filter selected
    if (cat === 'all') {
      window.location.href = '/movies';
    } else if (cat === 'budget') {
      window.location.href = '/movies?category=budget';
    } else {
      window.location.href = `/movies?format=${encodeURIComponent(cat)}`;
    }
    return;
  }
  document.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeCategory = cat;

  // Sync sidebar controls with selected category pill
  if (cat === 'all') {
    document.querySelectorAll('input[name="format_filter"]').forEach(cb => cb.checked = false);
    const allPriceRadio = document.querySelector('input[name="price_filter"][value="1000"]');
    if (allPriceRadio) allPriceRadio.checked = true;
  } else if (cat === 'budget') {
    document.querySelectorAll('input[name="format_filter"]').forEach(cb => cb.checked = false);
  } else {
    document.querySelectorAll('input[name="format_filter"]').forEach(cb => {
      cb.checked = (cb.value === cat);
    });
  }

  currentPage = 1;
  loadMovies();
}

function filterCategory(cat) {
  activeCategory = cat;
  document.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
  document.querySelector('.cat-item').classList.add('active');
  loadMovies();
}

function onCityChange() {
  if (currentActiveTab === 'now_showing') {
    loadMovies();
  }
}

let searchTimer;
function onSearchInput(val) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (currentActiveTab === 'upcoming') {
      loadUpcomingMovies();
    } else {
      loadMovies();
    }
  }, 300);
}

function applyFilters() {
  const formatCheckboxes = document.querySelectorAll('input[name="format_filter"]:checked');
  if (formatCheckboxes.length === 1) {
    const val = formatCheckboxes[0].value;
    activeCategory = val;
    document.querySelectorAll('.cat-item').forEach(b => {
      const oc = b.getAttribute('onclick') || '';
      if (oc.includes(`'${val}'`)) b.classList.add('active');
      else b.classList.remove('active');
    });
  } else if (formatCheckboxes.length === 0) {
    if (activeCategory !== 'budget') {
      activeCategory = 'all';
      document.querySelectorAll('.cat-item').forEach(b => {
        const oc = b.getAttribute('onclick') || '';
        if (oc.includes("'all'")) b.classList.add('active');
        else b.classList.remove('active');
      });
    }
  } else {
    document.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
  }
  loadMovies();
}

function resetAllFilters() {
  const defaultLang = document.querySelector('input[name="lang_filter"][value="All"]');
  if (defaultLang) defaultLang.checked = true;
  document.querySelectorAll('input[name="format_filter"]').forEach(cb => cb.checked = false);
  document.querySelector('input[name="price_filter"][value="1000"]').checked = true;
  document.querySelector('input[name="chain_filter"][value="All"]').checked = true;
  document.getElementById('nav-search-input').value = '';
  document.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
  document.querySelector('.cat-item').classList.add('active');
  activeCategory = 'all';
  loadMovies();
}

// Price Comparison & Proximity Finder State
let currentComparisonData = null;
let currentCompareSort = 'cheapest';
let currentCompareRadius = 'all';
let currentCompareUserCoords = { lat: null, lng: null, name: '' };

function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  try {
    const R = 6371.0;
    const dLat = (lat2 - lat1) * Math.PI / 180.0;
    const dLon = (lon2 - lon1) * Math.PI / 180.0;
    const a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
              Math.cos(lat1 * Math.PI / 180.0) * Math.cos(lat2 * Math.PI / 180.0) *
              Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);
    const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
    return Math.round(R * c * 10) / 10;
  } catch (e) {
    return 5.0;
  }
}

// Price Comparison Modal
async function openCompareModal(movieId) {
  currentMovieForCompare = movieId;
  const modal = document.getElementById('compare-modal');
  const modalBody = document.getElementById('compare-modal-body');
  modalBody.innerHTML = '<div style="text-align: center; padding: 40px; font-family: var(--font-secondary); font-weight: 700;">Calculating price comparison & distance matrix across multiplexes...</div>';
  modal.style.display = 'flex';

  try {
    let url = `/api/comparison?movie_id=${movieId}&city=${encodeURIComponent(currentCity)}&sort=${currentCompareSort || 'cheapest'}`;
    if (currentCompareUserCoords.lat && currentCompareUserCoords.lng) {
      url += `&user_lat=${currentCompareUserCoords.lat}&user_lng=${currentCompareUserCoords.lng}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === 'success') {
      renderComparisonModal(data.comparison);
    }
  } catch (err) {
    modalBody.innerHTML = '<p style="color: red; text-align: center; padding: 20px;">Error loading comparison matrix.</p>';
  }
}

function renderComparisonModal(comp) {
  currentComparisonData = comp;
  if (!currentCompareUserCoords.lat || !currentCompareUserCoords.lng) {
    currentCompareUserCoords = {
      lat: comp.user_location.lat,
      lng: comp.user_location.lng,
      name: comp.user_location.name
    };
  }
  if (!currentCompareSort) {
    currentCompareSort = comp.sort_by || 'cheapest';
  }

  document.getElementById('compare-movie-title').textContent = `${comp.movie_title} - Price Comparison`;
  document.getElementById('compare-movie-city').textContent = `Aggregating ${comp.total_shows} showtimes across ${currentCity}`;

  const hubs = comp.city_hubs || [];
  const hubOptionsHtml = hubs.map(h => {
    const isSel = Math.abs(h.lat - currentCompareUserCoords.lat) < 0.02 && Math.abs(h.lng - currentCompareUserCoords.lng) < 0.02;
    return `<option value="${h.lat}|${h.lng}|${h.name}" ${isSel ? 'selected' : ''}>📍 ${h.name}</option>`;
  }).join('');

  const modalBody = document.getElementById('compare-modal-body');

  modalBody.innerHTML = `
    <!-- Location & Proximity Filter Toolbar -->
    <div class="compare-filter-toolbar">
      <div class="compare-toolbar-row">
        <div class="compare-loc-group">
          <span class="compare-loc-label">Your Location:</span>
          <select id="compare-hub-select" class="compare-hub-select" onchange="onCompareHubSelected(this.value)">
            ${hubOptionsHtml}
          </select>
          <button class="compare-gps-btn" id="compare-gps-btn" onclick="detectUserGpsForCompare()" title="Detect my current location">
            <span>🎯</span> Use My GPS
          </button>
        </div>
        <div class="compare-loc-status">
          <span>📍</span> Distances calculated from <strong id="compare-active-loc-name">${escapeHtml(currentCompareUserCoords.name)}</strong>
        </div>
      </div>

      <div class="compare-toolbar-row compare-filter-row">
        <div class="compare-sort-group">
          <span class="compare-filter-label">Sort By:</span>
          <div class="compare-pill-tabs">
            <button class="compare-pill-btn ${currentCompareSort === 'cheapest' ? 'active' : ''}" id="tab-sort-cheapest" onclick="setCompareSort('cheapest')">
              🏷️ Lowest Price
            </button>
            <button class="compare-pill-btn ${currentCompareSort === 'best_value' ? 'active' : ''}" id="tab-sort-best_value" onclick="setCompareSort('best_value')">
              ⭐ Best Value (Low Rate + Near)
            </button>
            <button class="compare-pill-btn ${currentCompareSort === 'nearest' ? 'active' : ''}" id="tab-sort-nearest" onclick="setCompareSort('nearest')">
              📍 Nearest First
            </button>
          </div>
        </div>

        <div class="compare-dist-group">
          <span class="compare-filter-label">Max Distance:</span>
          <div class="compare-pill-tabs">
            <button class="compare-pill-btn dist-pill ${currentCompareRadius === 'all' ? 'active' : ''}" onclick="setCompareRadius('all')">All</button>
            <button class="compare-pill-btn dist-pill ${currentCompareRadius === '5' ? 'active' : ''}" onclick="setCompareRadius('5')">&lt; 5 km</button>
            <button class="compare-pill-btn dist-pill ${currentCompareRadius === '10' ? 'active' : ''}" onclick="setCompareRadius('10')">&lt; 10 km</button>
            <button class="compare-pill-btn dist-pill ${currentCompareRadius === '20' ? 'active' : ''}" onclick="setCompareRadius('20')">&lt; 20 km</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Dynamic Deal Banner -->
    <div id="compare-dynamic-banner"></div>

    <!-- Comparison Table -->
    <div class="comparison-table-wrapper">
      <table class="compare-table">
        <thead>
          <tr>
            <th>Theatre & Location</th>
            <th>Distance</th>
            <th>Showtime</th>
            <th>Format</th>
            <th>Silver Tier</th>
            <th>Gold Tier</th>
            <th>VIP Recliner</th>
            <th>Seats Left</th>
            <th>1-Click Booking</th>
          </tr>
        </thead>
        <tbody id="compare-table-tbody">
        </tbody>
      </table>
    </div>
  `;

  renderComparisonTableBody();
}

function renderComparisonTableBody() {
  if (!currentComparisonData || !currentComparisonData.comparison_table) return;

  const tbody = document.getElementById('compare-table-tbody');
  const banner = document.getElementById('compare-dynamic-banner');
  if (!tbody || !banner) return;

  let rows = [...currentComparisonData.comparison_table];
  if (currentCompareRadius !== 'all') {
    const maxR = parseFloat(currentCompareRadius);
    rows = rows.filter(r => r.distance_km <= maxR);
  }

  if (currentCompareSort === 'nearest') {
    rows.sort((a, b) => a.distance_km - b.distance_km || a.silver_price - b.silver_price);
  } else if (currentCompareSort === 'best_value') {
    rows.sort((a, b) => a.smart_score - b.smart_score || a.silver_price - b.silver_price);
  } else {
    rows.sort((a, b) => a.silver_price - b.silver_price || a.distance_km - b.distance_km);
  }

  if (rows.length === 0) {
    banner.innerHTML = `
      <div class="compare-banner cheapest-banner">
        <div>
          <strong>No showtimes found within ${currentCompareRadius} km of ${escapeHtml(currentCompareUserCoords.name)}.</strong>
          <span class="banner-subtext">Try expanding the distance filter to &lt; 10 km, &lt; 20 km or All.</span>
        </div>
        <button class="action-btn primary" style="font-size: 12px; padding: 6px 12px;" onclick="setCompareRadius('all')">
          Show All Distances
        </button>
      </div>
    `;
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 32px; font-family: var(--font-secondary); color: var(--color-olive-muted);">
          No theatres within ${currentCompareRadius} km radius. Switch your location hub or select "All" above to view all ${currentComparisonData.total_shows} available showtimes.
        </td>
      </tr>
    `;
    return;
  }

  const minPrice = Math.min(...rows.map(r => r.silver_price));
  const minDist = Math.min(...rows.map(r => r.distance_km));
  const minScore = Math.min(...rows.map(r => r.smart_score));

  const topRow = rows[0];

  if (currentCompareSort === 'best_value') {
    banner.innerHTML = `
      <div class="compare-banner best-value-banner">
        <div>
          <strong>⭐ Best Value Deal:</strong> ${escapeHtml(topRow.theatre)} (${topRow.format}) at <strong>₹${topRow.silver_price}</strong>
          <span class="banner-subtext">• 📍 ${topRow.distance_km} km away (Optimal balance of low ticket price & shortest commute)</span>
        </div>
        <button class="action-btn primary" style="font-size: 12px; padding: 6px 12px;" onclick="openBookingPortalModal('${currentMovieForCompare}', '${escapeHtml(topRow.theatre)}', '${topRow.time}', '${topRow.format}', '${topRow.booking_url || ''}')">
          Book Best Value Show &rarr;
        </button>
      </div>
    `;
  } else if (currentCompareSort === 'nearest') {
    banner.innerHTML = `
      <div class="compare-banner nearest-banner">
        <div>
          <strong>📍 Nearest Multiplex:</strong> ${escapeHtml(topRow.theatre)} (${topRow.format}) at <strong>₹${topRow.silver_price}</strong>
          <span class="banner-subtext">• Only ${topRow.distance_km} km from you</span>
        </div>
        <button class="action-btn primary" style="font-size: 12px; padding: 6px 12px;" onclick="openBookingPortalModal('${currentMovieForCompare}', '${escapeHtml(topRow.theatre)}', '${topRow.time}', '${topRow.format}', '${topRow.booking_url || ''}')">
          Book Nearest Show &rarr;
        </button>
      </div>
    `;
  } else {
    banner.innerHTML = `
      <div class="compare-banner cheapest-banner">
        <div>
          <strong>🏷️ Lowest Price Found:</strong> ${escapeHtml(topRow.theatre)} (${topRow.format}) at <strong>₹${topRow.silver_price}</strong>
          <span class="banner-subtext">• 📍 ${topRow.distance_km} km away</span>
        </div>
        <button class="action-btn primary" style="font-size: 12px; padding: 6px 12px;" onclick="openBookingPortalModal('${currentMovieForCompare}', '${escapeHtml(topRow.theatre)}', '${topRow.time}', '${topRow.format}', '${topRow.booking_url || ''}')">
          Book Lowest Price Show &rarr;
        </button>
      </div>
    `;
  }

  tbody.innerHTML = rows.map((row, idx) => {
    const isTop = idx === 0;
    const isCheapest = row.silver_price === minPrice;
    const isNearest = row.distance_km === minDist;
    const isBestValue = row.smart_score === minScore;

    let badgeHtml = '';
    if (isBestValue && (currentCompareSort === 'best_value' || isTop)) {
      badgeHtml += '<span class="badge-best-value">⭐ Best Value</span>';
    } else if (isCheapest) {
      badgeHtml += '<span class="badge-cheapest">Lowest Price</span>';
    }
    if (isNearest && !badgeHtml.includes('Best Value')) {
      badgeHtml += '<span class="badge-nearest">📍 Nearest</span>';
    }

    const distPillClass = row.distance_km <= 5 ? 'close' : (row.distance_km <= 15 ? 'mid' : 'far');

    return `
      <tr class="${isTop ? 'cheapest-row' : ''}">
        <td>
          <strong>${escapeHtml(row.theatre)}</strong>
          ${badgeHtml}
          <div style="font-size: 11px; color: var(--color-olive-muted); margin-top: 2px;">
            ${row.chain} • Rating: ${row.theatre_rating} • <span class="theatre-dist-badge">📍 ${row.location}</span>
          </div>
        </td>
        <td class="compare-dist-cell">
          <strong>${row.distance_km} km</strong>
          <span class="compare-dist-pill ${distPillClass}">${row.distance_km <= 5 ? 'Nearby' : (row.distance_km <= 15 ? 'Moderate' : 'Far')}</span>
        </td>
        <td><strong>${row.time}</strong></td>
        <td><span style="font-weight: 600;">${row.format}</span></td>
        <td><strong>₹${row.silver_price}</strong></td>
        <td>₹${row.gold_price}</td>
        <td>₹${row.recliner_price}</td>
        <td>
          <span class="seats-badge ${row.seats_left <= 0 ? 'sold-out' : (row.seats_left < 10 ? 'almost-full' : (row.seats_left < 30 ? 'filling-fast' : 'available'))}">
            ${row.seats_left > 0 ? `${row.seats_left} seats • ${row.availability || (row.seats_left < 10 ? 'Almost Full' : (row.seats_left < 30 ? 'Filling Fast' : 'Available'))}` : 'Sold Out'}
          </span>
        </td>
        <td>
          <button class="action-btn primary" style="padding: 4px 10px; font-size: 11px;" onclick="openBookingPortalModal('${currentMovieForCompare}', '${escapeHtml(row.theatre)}', '${row.time}', '${row.format}', '${row.booking_url || ''}')">
            Book &rarr;
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function setCompareSort(sortKey) {
  currentCompareSort = sortKey;
  document.querySelectorAll('.compare-sort-group .compare-pill-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`tab-sort-${sortKey}`);
  if (activeBtn) activeBtn.classList.add('active');
  renderComparisonTableBody();
}

function setCompareRadius(rad) {
  currentCompareRadius = rad;
  document.querySelectorAll('.compare-dist-group .compare-pill-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim().includes(rad) || (rad === 'all' && b.textContent.trim() === 'All'));
  });
  renderComparisonTableBody();
}

function onCompareHubSelected(val) {
  if (val.startsWith('gps:')) {
    const parts = val.replace('gps:', '').split(',');
    recalculateCompareDistances(parseFloat(parts[0]), parseFloat(parts[1]), 'Live GPS Location');
    return;
  }
  const parts = val.split('|');
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  const name = parts[2];
  recalculateCompareDistances(lat, lng, name);
}

function recalculateCompareDistances(userLat, userLng, locName) {
  if (!currentComparisonData || !currentComparisonData.comparison_table) return;
  currentCompareUserCoords = { lat: userLat, lng: userLng, name: locName };
  
  const statusEl = document.getElementById('compare-active-loc-name');
  if (statusEl) statusEl.textContent = locName;

  currentComparisonData.comparison_table.forEach(r => {
    r.distance_km = calculateHaversineDistanceKm(userLat, userLng, r.theatre_lat, r.theatre_lng);
    r.smart_score = Math.round((r.silver_price + (r.distance_km * 3.5)) * 10) / 10;
  });

  renderComparisonTableBody();
}

function detectUserGpsForCompare() {
  const btn = document.getElementById('compare-gps-btn');
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  btn.classList.add('loading');
  btn.innerHTML = '<span>⏳</span> Locating...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove('loading');
      btn.classList.add('gps-active');
      btn.innerHTML = '<span>✅</span> GPS Active';
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const locLabel = `My Location (${userLat.toFixed(2)}°, ${userLng.toFixed(2)}°)`;

      const sel = document.getElementById('compare-hub-select');
      if (sel) {
        let gpsOpt = document.getElementById('hub-opt-gps');
        if (!gpsOpt) {
          gpsOpt = document.createElement('option');
          gpsOpt.id = 'hub-opt-gps';
          sel.prepend(gpsOpt);
        }
        gpsOpt.value = `gps:${userLat},${userLng}`;
        gpsOpt.textContent = `🎯 ${locLabel}`;
        sel.value = gpsOpt.value;
      }

      recalculateCompareDistances(userLat, userLng, locLabel);
    },
    (err) => {
      btn.classList.remove('loading');
      btn.innerHTML = '<span>🎯</span> Use My GPS';
      alert("Unable to fetch location: " + (err.message || "Permission denied"));
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function closeCompareModal() {
  document.getElementById('compare-modal').style.display = 'none';
}

function openQuickCompare() {
  openPriceMatrixModal();
}

// Price Alert & Notification Manager
async function loadAlerts() {
  try {
    const res = await fetch('/api/alerts');
    const data = await res.json();
    if (data.status === 'success') {
      renderAlertsList(data.alerts);
      renderNotificationsList(data.notifications);

      const alertBadge = document.getElementById('alert-badge-count');
      if (alertBadge) alertBadge.textContent = data.alerts.length;
      const activeCount = document.getElementById('active-alerts-count');
      if (activeCount) activeCount.textContent = data.alerts.length;
      const notifCount = document.getElementById('notif-count');
      if (notifCount) notifCount.textContent = data.notifications.length;

      const dot = document.getElementById('notif-dot');
      if (dot) {
        dot.style.display = data.notifications.length > 0 ? 'block' : 'none';
      }
    }
  } catch (err) {
    console.error('Error loading alerts:', err);
  }
}

function renderAlertsList(alerts) {
  const container = document.getElementById('active-alerts-list');
  if (!alerts || alerts.length === 0) {
    container.innerHTML = '<p style="color: var(--color-olive-muted); font-size: 12px;">No active price alerts. Add one above or trigger via Examiner Demo!</p>';
    return;
  }

  container.innerHTML = alerts.map(a => {
    const isTriggered = a.status === 'TRIGGERED';
    return `
      <div class="alert-item-card ${isTriggered ? 'alert-triggered' : ''}">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <strong>${escapeHtml(a.movie_title)}</strong>
            ${isTriggered ? '<span class="badge-alert-triggered">🔥 TRIGGERED</span>' : '<span class="badge-alert-active">ACTIVE WATCHER</span>'}
          </div>
          <div style="font-size: 11px; color: var(--color-olive-muted); margin-top: 3px;">
            Target: <strong>₹${a.target_price}</strong> | Current: <strong style="${isTriggered ? 'color: #16a34a;' : ''}">₹${a.last_price_found || 'Scanning...'}</strong> | ${escapeHtml(a.city)} • ${a.format_type}
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${isTriggered ? `<button class="action-btn primary" style="font-size: 11px; padding: 4px 10px;" onclick="closeAlertsModal(); openPriceMatrixModal('${a.movie_id}');">View Deal &rarr;</button>` : ''}
          <button class="reset-link" style="color: var(--brand-black); font-size: 11px; font-weight: 700;" onclick="deleteAlert('${a.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderNotificationsList(notifs) {
  const container = document.getElementById('notif-history-list');
  if (!notifs || notifs.length === 0) {
    container.innerHTML = '<p style="color: var(--color-olive-muted); font-size: 12px;">No price drop triggers yet. Use Examiner Demo above to test live triggering.</p>';
    return;
  }

  container.innerHTML = notifs.map(n => {
    const isDrop = n.type === 'drop' || (n.title && (n.title.includes('DROP') || n.title.includes('Drop')));
    return `
      <div class="notif-item-card ${isDrop ? 'notif-drop' : 'notif-surge'}">
        <div style="flex: 1;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <strong style="color: ${isDrop ? '#ff5400' : '#0284c7'}; font-size: 13px;">${escapeHtml(n.title)}</strong>
            <span style="font-size: 10px; color: var(--color-olive-muted); font-weight: 600;">${n.timestamp}</span>
          </div>
          <div style="font-size: 12px; color: var(--brand-black); margin-top: 4px; font-weight: 500;">
            ${escapeHtml(n.message)}
          </div>
        </div>
        ${n.booking_url ? `
          <a href="${n.booking_url}" target="_blank" rel="noopener noreferrer" class="action-btn primary" style="padding: 4px 10px; font-size: 11px; white-space: nowrap; margin-left: 10px; text-decoration: none;">
            Book &rarr;
          </a>
        ` : ''}
      </div>
    `;
  }).join('');
}

function populateAlertMovieDropdown(movies) {
  const select = document.getElementById('alert-movie-select');
  const simSelect = document.getElementById('sim-movie-select');
  if (select && movies) {
    select.innerHTML = movies.map(m => `
      <option value="${m.id}" data-title="${escapeHtml(m.title)}">${escapeHtml(m.title)} (from ₹${m.min_price})</option>
    `).join('');
  }
  if (simSelect && movies) {
    simSelect.innerHTML = movies.map(m => `
      <option value="${m.id}">${escapeHtml(m.title)} (Current: ₹${m.min_price})</option>
    `).join('');
  }
}

function openAlertForMovie(movieId, title, currentMin) {
  openAlertsModal();
  const select = document.getElementById('alert-movie-select');
  if (select) select.value = movieId;
  const priceInput = document.getElementById('alert-target-price');
  if (priceInput) priceInput.value = Math.max(50, currentMin - 40);
}

function openAlertsModal() {
  const am = document.getElementById('alerts-modal') || document.getElementById('alert-modal'); 
  if (am) am.style.display = 'flex';
  const simSelect = document.getElementById('sim-movie-select');
  if (simSelect && (!simSelect.options || simSelect.options.length === 0) && currentMovies && currentMovies.length > 0) {
    populateAlertMovieDropdown(currentMovies);
  }
  loadAlerts();
}

function showRichToast(msg, type = 'drop') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'drop' ? 'toast-drop' : 'toast-surge'}`;
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 16px;">${type === 'drop' ? '🔥' : '📈'}</span>
      <span>${escapeHtml(msg)}</span>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function triggerBellRingAnimation() {
  const bells = document.querySelectorAll('.nav-link[onclick="openAlertsModal()"], .nav-icon-btn[onclick="openAlertsModal()"]');
  bells.forEach(b => {
    b.classList.remove('bell-ring-active');
    void b.offsetWidth;
    b.classList.add('bell-ring-active');
    setTimeout(() => b.classList.remove('bell-ring-active'), 1000);
  });
  const dot = document.getElementById('notif-dot');
  if (dot) dot.style.display = 'block';
}

async function triggerExaminerDemo(action) {
  const simMovieSelect = document.getElementById('sim-movie-select');
  const movieId = simMovieSelect ? simMovieSelect.value : null;

  try {
    const res = await fetch('/api/alerts/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: action,
        movie_id: movieId,
        city: currentCity
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      const r = data.result;
      if (action === 'drop') {
        showRichToast(`EXAMINER DEMO: Price Drop Triggered! ${r.movie_title} fell to ₹${r.new_price} (Target: ₹${r.target_price}) at ${r.theatre_name}!`, 'drop');
        triggerBellRingAnimation();
      } else if (action === 'surge') {
        showRichToast(`EXAMINER DEMO: Prime-Time Surge Detected for ${r.movie_title} (₹${r.new_price})!`, 'surge');
        triggerBellRingAnimation();
      } else {
        showToast('Simulation state reset to live feeds.');
      }
      loadAlerts();
    }
  } catch (err) {
    console.error('Simulation error:', err);
    showToast('Simulation request failed');
  }
}

function closeAlertsModal() {
  const am = document.getElementById('alerts-modal') || document.getElementById('alert-modal'); if (am) am.style.display = 'none';
}

async function submitNewAlert(e) {
  e.preventDefault();
  const movieSelect = document.getElementById('alert-movie-select');
  const movieId = movieSelect.value;
  const movieTitle = movieSelect.options[movieSelect.selectedIndex]?.getAttribute('data-title') || movieSelect.options[movieSelect.selectedIndex]?.text.split('(')[0].trim() || 'Movie';
  const city = document.getElementById('alert-city-select').value;
  const targetPrice = document.getElementById('alert-target-price').value;
  const formatType = document.getElementById('alert-format-select').value;

  try {
    const res = await fetch('/api/alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movie_id: movieId,
        movie_title: movieTitle,
        city: city,
        target_price: targetPrice,
        format_type: formatType
      })
    });
    const data = await res.json();
    if (data.status === 'success') {
      showToast(`Price alert activated for ${movieTitle} under ₹${targetPrice}!`);
      loadAlerts();
    }
  } catch (err) {
    showToast('Failed to create alert');
  }
}

async function deleteAlert(alertId) {
  try {
    await fetch(`/api/alerts?alert_id=${alertId}`, { method: 'DELETE' });
    showToast('Alert removed');
    loadAlerts();
  } catch (err) {
    console.error(err);
  }
}

// Pandas Data Exports
function exportDataCSV() {
  const city = document.getElementById('city-select').value;
  const search = document.getElementById('nav-search-input').value;
  window.location.href = `/api/export/shows?city=${encodeURIComponent(city)}&search=${encodeURIComponent(search)}`;
  showToast('Exporting movie shows dataset via Pandas (CSV)...');
}

function exportComparisonCSV() {
  if (currentMovieForCompare) {
    window.location.href = `/api/export/comparison?movie_id=${currentMovieForCompare}&city=${encodeURIComponent(currentCity)}`;
    showToast('Exporting price comparison report (CSV)...');
  }
}

// Toast notification helper
function showToast(msg) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


// Parse query parameters when loading /movies directly from landing links
function parseUrlParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  
  const tab = urlParams.get('tab');
  if (tab === 'upcoming') {
    switchMainTab('upcoming');
    return;
  }

  const format = urlParams.get('format');
  if (format) {
    const cb = document.querySelector(`input[name="format_filter"][value="${format}"]`);
    if (cb) cb.checked = true;
    activeCategory = format;
    document.querySelectorAll('.cat-item').forEach(b => {
      const oc = b.getAttribute('onclick') || '';
      if (oc.includes(`'${format}'`)) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  const category = urlParams.get('category');
  if (category === 'budget') {
    activeCategory = 'budget';
    const priceRadio = document.querySelector('input[name="price_filter"][value="150"]') || document.querySelector('input[name="price_filter"][value="250"]');
    if (priceRadio) priceRadio.checked = true;
    const budgetBtn = document.querySelector('.cat-item[onclick*="budget"]');
    if (budgetBtn) {
      document.querySelectorAll('.cat-item').forEach(b => b.classList.remove('active'));
      budgetBtn.classList.add('active');
    }
  }

  const lang = urlParams.get('language');
  if (lang) {
    const langRadio = document.querySelector(`input[name="lang_filter"][value="${lang}"]`);
    if (langRadio) langRadio.checked = true;
  }

  const search = urlParams.get('search');
  if (search) {
    const searchInput = document.getElementById('nav-search-input');
    if (searchInput) searchInput.value = search;
  }
}

function renderPagination(total, totalPages) {
  const pag = document.getElementById('pagination-controls');
  if (!pag) return;
  if (total <= MOVIES_PER_PAGE) {
    pag.style.display = 'none';
    return;
  }

  pag.style.display = 'flex';
  let html = '';

  html += `<button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">&larr; Prev</button>`;

  for (let p = 1; p <= totalPages; p++) {
    html += `<button class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage(${p})">${p}</button>`;
  }

  html += `<button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">Next &rarr;</button>`;

  if (showAllMovies) {
    html += `<button class="page-btn" onclick="toggleShowAll(false)">Show Pages</button>`;
  } else {
    html += `<button class="page-btn" onclick="toggleShowAll(true)">View All (${total})</button>`;
  }

  pag.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  showAllMovies = false;
  renderMovieGrid(currentMovies);
  const topAnchor = document.getElementById('results-count-text');
  if (topAnchor) topAnchor.scrollIntoView({ behavior: 'smooth' });
}

function toggleShowAll(flag) {
  showAllMovies = flag;
  renderMovieGrid(currentMovies);
}


// ==========================================================================
// CINEPLUS LIVE PRICE MATRIX & GOLDEN-HOUR SHOWTIME ARBITER CONTROLLER
// 100% Real-time dynamic aggregation & arbitrage engine (BookMyShow feed)
// ==========================================================================

let currentMatrixData = null;

async function openPriceMatrixModal(movieId = null) {
  const modal = document.getElementById('price-matrix-modal');
  if (!modal) return;

  const cityBadge = document.getElementById('matrix-active-city');
  if (cityBadge) cityBadge.textContent = (currentCity || 'Mumbai').toUpperCase();

  const body = document.getElementById('price-matrix-body');
  if (body) {
    body.innerHTML = `
      <div class="matrix-loading-state">
        <div class="matrix-spinner"></div>
        <p>Analyzing live multiplex schedules & computing real-time fare spreads for ${currentCity}...</p>
      </div>
    `;
  }

  modal.style.display = 'flex';

  try {
    let url = `/api/price-matrix?city=${encodeURIComponent(currentCity)}${movieId ? `&movie_id=${movieId}` : ''}`;
    if (currentCompareUserCoords.lat && currentCompareUserCoords.lng) {
      url += `&user_lat=${currentCompareUserCoords.lat}&user_lng=${currentCompareUserCoords.lng}`;
    }
    const res = await fetch(url);
    const json = await res.json();

    if (json.status === 'success' && json.data) {
      currentMatrixData = json.data;
      populateMatrixMovieDropdown(currentMatrixData.available_movies, currentMatrixData.selected_movie.id);
      populateMatrixHubDropdown(currentMatrixData.city_hubs, currentMatrixData.user_location);
      renderPriceMatrixContent(currentMatrixData);
    } else {
      if (body) {
        body.innerHTML = `
          <div class="matrix-loading-state">
            <p style="color: #ff3333; font-weight: bold;">Unable to load price matrix for ${currentCity}. Please try again.</p>
          </div>
        `;
      }
    }
  } catch (err) {
    console.error('Error fetching price matrix:', err);
    if (body) {
      body.innerHTML = `
        <div class="matrix-loading-state">
          <p style="color: #ff3333;">Network error while analyzing live schedules. Please check connection.</p>
        </div>
      `;
    }
  }
}

function closePriceMatrixModal() {
  const modal = document.getElementById('price-matrix-modal');
  if (modal) modal.style.display = 'none';
}

function populateMatrixMovieDropdown(movies, selectedId) {
  const select = document.getElementById('matrix-movie-select');
  if (!select || !movies) return;

  let optionsHtml = '';
  movies.forEach(m => {
    const isSelected = m.id === selectedId ? 'selected' : '';
    optionsHtml += `<option value="${m.id}" ${isSelected}>${m.title} (${m.show_count} live shows)</option>`;
  });
  select.innerHTML = optionsHtml;
}

async function onMatrixMovieChange(movieId) {
  const body = document.getElementById('price-matrix-body');
  if (body) {
    body.innerHTML = `
      <div class="matrix-loading-state">
        <div class="matrix-spinner"></div>
        <p>Recalculating arbitrage windows for selected screening...</p>
      </div>
    `;
  }

  try {
    let url = `/api/price-matrix?city=${encodeURIComponent(currentCity)}&movie_id=${movieId}`;
    if (currentCompareUserCoords.lat && currentCompareUserCoords.lng) {
      url += `&user_lat=${currentCompareUserCoords.lat}&user_lng=${currentCompareUserCoords.lng}`;
    }
    const res = await fetch(url);
    const json = await res.json();
    if (json.status === 'success' && json.data) {
      currentMatrixData = json.data;
      renderPriceMatrixContent(currentMatrixData);
    }
  } catch (err) {
    console.error('Error reloading movie matrix:', err);
  }
}


function populateMatrixHubDropdown(hubs, userLoc) {
  const sel = document.getElementById('matrix-hub-select');
  if (!sel || !hubs) return;

  const activeLat = currentCompareUserCoords.lat || (userLoc ? userLoc.lat : null);
  const activeLng = currentCompareUserCoords.lng || (userLoc ? userLoc.lng : null);
  const activeName = currentCompareUserCoords.name || (userLoc ? userLoc.name : 'Central Hub');

  let opts = hubs.map(h => {
    const isSel = activeLat && Math.abs(h.lat - activeLat) < 0.02 && Math.abs(h.lng - activeLng) < 0.02;
    return `<option value="${h.lat}|${h.lng}|${h.name}" ${isSel ? 'selected' : ''}>📍 ${h.name}</option>`;
  }).join('');

  if (currentCompareUserCoords.name && currentCompareUserCoords.name.includes('GPS')) {
    opts = `<option value="gps:${currentCompareUserCoords.lat},${currentCompareUserCoords.lng}" selected>🎯 ${currentCompareUserCoords.name}</option>` + opts;
  }

  sel.innerHTML = opts;
  const statusEl = document.getElementById('matrix-active-loc-name');
  if (statusEl) statusEl.textContent = activeName;
}

function onMatrixHubSelected(val) {
  if (val.startsWith('gps:')) {
    const parts = val.replace('gps:', '').split(',');
    currentCompareUserCoords = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]), name: 'Live GPS Location' };
  } else {
    const [lat, lng, name] = val.split('|');
    currentCompareUserCoords = { lat: parseFloat(lat), lng: parseFloat(lng), name: name };
  }
  const statusEl = document.getElementById('matrix-active-loc-name');
  if (statusEl) statusEl.textContent = currentCompareUserCoords.name;
  recalculateMatrixDistances(currentCompareUserCoords.lat, currentCompareUserCoords.lng);
}

function detectUserGpsForMatrix() {
  const btn = document.getElementById('matrix-gps-btn');
  if (!navigator.geolocation) {
    alert("Geolocation is not supported by your browser.");
    return;
  }
  btn.classList.add('loading');
  btn.innerHTML = '<span>⏳</span> Locating...';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      btn.classList.remove('loading');
      btn.classList.add('gps-active');
      btn.innerHTML = '<span>✅</span> GPS Active';
      const userLat = pos.coords.latitude;
      const userLng = pos.coords.longitude;
      const locLabel = `My Location (${userLat.toFixed(2)}°, ${userLng.toFixed(2)}°)`;

      currentCompareUserCoords = { lat: userLat, lng: userLng, name: locLabel };

      const sel = document.getElementById('matrix-hub-select');
      if (sel) {
        let gpsOpt = document.getElementById('matrix-hub-opt-gps');
        if (!gpsOpt) {
          gpsOpt = document.createElement('option');
          gpsOpt.id = 'matrix-hub-opt-gps';
          sel.prepend(gpsOpt);
        }
        gpsOpt.value = `gps:${userLat},${userLng}`;
        gpsOpt.textContent = `🎯 ${locLabel}`;
        sel.value = gpsOpt.value;
      }

      const statusEl = document.getElementById('matrix-active-loc-name');
      if (statusEl) statusEl.textContent = locLabel;

      recalculateMatrixDistances(userLat, userLng);
    },
    (err) => {
      btn.classList.remove('loading');
      btn.innerHTML = '<span>🎯</span> Use My GPS';
      alert("Unable to fetch location: " + (err.message || "Permission denied"));
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function recalculateMatrixDistances(lat, lng) {
  if (!currentMatrixData || !currentMatrixData.all_shows) return;

  currentMatrixData.all_shows.forEach(s => {
    s.distance_km = calculateHaversineDistanceKm(lat, lng, s.theatre_lat, s.theatre_lng);
  });

  ['morning', 'matinee', 'evening', 'night'].forEach(wKey => {
    const w = currentMatrixData.time_windows[wKey];
    if (w && w.cheapest_show) {
      w.cheapest_show.distance_km = calculateHaversineDistanceKm(lat, lng, w.cheapest_show.theatre_lat, w.cheapest_show.theatre_lng);
    }
  });

  if (currentMatrixData.golden_deal) {
    const match = currentMatrixData.all_shows.find(s => s.theatre_name === currentMatrixData.golden_deal.theatre_name);
    if (match) {
      currentMatrixData.golden_deal.distance_km = match.distance_km;
    }
  }

  renderPriceMatrixContent(currentMatrixData);
}

function openCompareModalFromMatrix() {
  const sel = document.getElementById('matrix-movie-select');
  const movieId = sel ? sel.value : (currentMatrixData ? currentMatrixData.selected_movie.id : null);
  closePriceMatrixModal();
  if (movieId) {
    openCompareModal(movieId);
  } else {
    window.location.href = '/movies';
  }
}

function renderPriceMatrixContent(data) {
  const body = document.getElementById('price-matrix-body');
  if (!body || !data) return;

  // 1. Golden Hour Deal Banner
  const deal = data.golden_deal;
  let dealHtml = '';
  if (deal && deal.deal_found && deal.savings_amount > 0) {
    dealHtml = `
      <div class="golden-deal-card">
        <div class="golden-deal-badge">
          <span>⚡ GOLDEN-HOUR ARBITRAGE OPPORTUNITY</span>
        </div>
        <div class="golden-deal-content">
          <div class="golden-deal-main">
            <div class="golden-deal-savings">
              <span class="savings-val">SAVE ₹${deal.savings_amount}</span>
              <span class="savings-pct">(${deal.savings_pct}% OFF PEAK EVENING)</span>
            </div>
            <p class="golden-deal-desc">
              Book <strong>${escapeHtml(deal.movie_title)}</strong> at <strong>${escapeHtml(deal.theatre_name)}</strong> ${deal.distance_km != null ? `<span class="theatre-dist-badge">📍 ${deal.distance_km} km away</span>` : ''} during the <strong>${deal.time_window} (${deal.show_time})</strong> for only <strong>₹${deal.deal_price}</strong> instead of the ₹${deal.peak_avg_price} prime evening average.
            </p>
          </div>
          <div class="golden-deal-action">
            <a href="${deal.booking_url}" target="_blank" rel="noopener noreferrer" class="btn-golden-book">
              BOOK NOW @ ₹${deal.deal_price} ↗
            </a>
            <span class="golden-seats-left">${deal.seats_left} seats remaining</span>
          </div>
        </div>
      </div>
    `;
  } else if (deal && deal.deal_found) {
    dealHtml = `
      <div class="golden-deal-card">
        <div class="golden-deal-badge">
          <span>⚡ BEST VALUE SCREENING</span>
        </div>
        <div class="golden-deal-content">
          <div class="golden-deal-main">
            <div class="golden-deal-savings">
              <span class="savings-val">₹${deal.deal_price}</span>
              <span class="savings-pct">(LOWEST PRICE GUARANTEED)</span>
            </div>
            <p class="golden-deal-desc">
              Cheapest verified ticket today for <strong>${escapeHtml(deal.movie_title)}</strong> is at <strong>${escapeHtml(deal.theatre_name)}</strong> at <strong>${deal.show_time}</strong>.
            </p>
          </div>
          <div class="golden-deal-action">
            <a href="${deal.booking_url}" target="_blank" rel="noopener noreferrer" class="btn-golden-book">
              BOOK NOW @ ₹${deal.deal_price} ↗
            </a>
            <span class="golden-seats-left">${deal.seats_left} seats remaining</span>
          </div>
        </div>
      </div>
    `;
  }

  // 2. 4 Time-Window Cards
  const windowsOrder = ['morning', 'matinee', 'evening', 'night'];
  let cardsHtml = '<div class="matrix-windows-grid">';

  windowsOrder.forEach(wKey => {
    const w = data.time_windows[wKey];
    if (!w) return;

    const cheapest = w.cheapest_show;
    const cheapestBox = cheapest ? `
      <div class="window-cheapest-box">
        <div class="cheapest-label">Cheapest in Slot:</div>
        <div class="cheapest-theatre" title="${escapeHtml(cheapest.theatre_name)}">${escapeHtml(cheapest.theatre_name)}</div>
        <div class="cheapest-meta">${cheapest.time} • ${cheapest.format}</div>
        ${cheapest.distance_km != null ? `<div class="slot-dist-sub">📍 ${cheapest.distance_km} km away</div>` : ''}
        <a href="${cheapest.booking_url}" target="_blank" rel="noopener noreferrer" class="btn-book-slot">
          Book ₹${cheapest.silver} Show ↗
        </a>
      </div>
    ` : `
      <div class="window-cheapest-box">
        <div class="cheapest-meta" style="color: #999;">No active shows in slot</div>
      </div>
    `;

    cardsHtml += `
      <div class="matrix-window-card">
        <div class="matrix-window-header">
          <div class="window-badge-row">
            <h3 class="window-name">${w.label}</h3>
            <span class="window-count-pill">${w.total_shows} shows</span>
          </div>
          <div class="window-time-range">${w.hours}</div>
        </div>

        <div class="window-fares-row">
          <div class="fare-col">
            <span class="fare-lbl">MIN</span>
            <span class="fare-val min-fare">${w.min_price > 0 ? `₹${w.min_price}` : '—'}</span>
          </div>
          <div class="fare-col">
            <span class="fare-lbl">AVG</span>
            <span class="fare-val avg-fare">${w.avg_price > 0 ? `₹${w.avg_price}` : '—'}</span>
          </div>
          <div class="fare-col">
            <span class="fare-lbl">MAX</span>
            <span class="fare-val">${w.max_price > 0 ? `₹${w.max_price}` : '—'}</span>
          </div>
        </div>

        ${cheapestBox}
      </div>
    `;
  });
  cardsHtml += '</div>';

  // 3. Cinema Chain Comparison Section
  let chainsHtml = '';
  if (data.chain_comparison && data.chain_comparison.length > 0) {
    let rowsHtml = '';
    data.chain_comparison.forEach(c => {
      rowsHtml += `
        <tr>
          <td><span class="chain-badge">${escapeHtml(c.chain_name)}</span></td>
          <td><strong>₹${c.avg_price}</strong></td>
          <td style="color: #00873a; font-weight: bold;">₹${c.min_price}</td>
          <td>${c.shows_count} shows</td>
          <td style="color: #555;">${escapeHtml(c.cheapest_theatre)} (${c.cheapest_time})</td>
        </tr>
      `;
    });

    chainsHtml = `
      <div class="matrix-chains-section">
        <div class="matrix-chains-title">
          <span>MULTIPLEX CHAIN PRICE ARBITRAGE</span>
          <span style="font-size: 0.78rem; font-family: var(--font-secondary); color: #777; font-weight: normal;">Ranked from most affordable to premium</span>
        </div>
        <table class="matrix-chains-table">
          <thead>
            <tr>
              <th>CHAIN</th>
              <th>AVG TICKET</th>
              <th>STARTING FARE</th>
              <th>ACTIVE SHOWS</th>
              <th>BEST VALUE VENUE</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }

  body.innerHTML = dealHtml + cardsHtml + chainsHtml;
}

function exportPriceMatrixCSV() {
  const select = document.getElementById('matrix-movie-select');
  const movieId = select ? select.value : '';
  const url = `/api/export/price-matrix?city=${encodeURIComponent(currentCity)}${movieId ? `&movie_id=${movieId}` : ''}`;
  window.location.href = url;
}

