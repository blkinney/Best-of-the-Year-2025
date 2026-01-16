// ==========================================
// Best of 2025 - Voting Application
// Ranked Choice Edition (Top 3)
// ==========================================

const MAX_PICKS = 3;

// State - now stores arrays of ranked items
const state = {
  selections: {
    movie: [],
    tv: [],
    game: []
  },
  authenticated: false
};

// Debounce timers
const debounceTimers = {
  movie: null,
  tv: null,
  game: null
};

// ==========================================
// Rate Limiting Utilities
// ==========================================

// Process async tasks in batches with delays to avoid API rate limits
async function batchedFetch(items, fetchFn, batchSize = 5, delayMs = 100) {
  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fetchFn));
    results.push(...batchResults);
    
    // Add delay between batches (but not after the last batch)
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  return results;
}

// ==========================================
// Password Gate
// ==========================================

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function checkPassword(inputPassword) {
  const inputHash = await hashPassword(inputPassword);
  const correctHash = await hashPassword(CONFIG.SITE_PASSWORD);
  return inputHash === correctHash;
}

function showApp() {
  document.getElementById('password-modal').style.display = 'none';
  document.getElementById('app').classList.remove('hidden');
  state.authenticated = true;
  localStorage.setItem('bestof2025_auth', 'true');
  localStorage.setItem('bestof2025_session', Date.now().toString());
}

function checkExistingSession() {
  const auth = localStorage.getItem('bestof2025_auth');
  const sessionTime = localStorage.getItem('bestof2025_session');
  
  if (auth === 'true' && sessionTime) {
    // Session expires after 24 hours
    const elapsed = Date.now() - parseInt(sessionTime);
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if (elapsed < twentyFourHours) {
      showApp();
      return true;
    }
  }
  return false;
}

// ==========================================
// API Functions
// ==========================================

async function searchMovies(query) {
  if (!query.trim()) return [];
  
  // Search without strict year filter to catch limited/wide release edge cases
  const url = `${CONFIG.TMDB_BASE_URL}/search/movie?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Fetch release dates for each movie to check for any 2025 release (batched to avoid rate limits)
    const moviesWithDates = await batchedFetch(
      data.results.slice(0, 12),
      async (movie) => {
        try {
          const releasesUrl = `${CONFIG.TMDB_BASE_URL}/movie/${movie.id}/release_dates?api_key=${CONFIG.TMDB_API_KEY}`;
          const releasesRes = await fetch(releasesUrl);
          const releasesData = await releasesRes.json();
          
          // Check if any release date is in 2025 (any country, any type)
          const has2025Release = releasesData.results?.some(country => 
            country.release_dates?.some(release => 
              release.release_date && release.release_date.startsWith('2025')
            )
          );
          
          return { ...movie, has2025Release };
        } catch {
          // Fallback to checking primary release date
          return { 
            ...movie, 
            has2025Release: movie.release_date && movie.release_date.startsWith('2025')
          };
        }
      },
      5, 150 // 5 requests per batch, 150ms delay between batches
    );
    
    // Filter to movies with any 2025 release
    return moviesWithDates
      .filter(movie => movie.has2025Release)
      .slice(0, 8)
      .map(movie => ({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.release_date,
        poster: movie.poster_path 
          ? `${CONFIG.TMDB_IMAGE_BASE}${movie.poster_path}`
          : null,
        year: movie.release_date ? movie.release_date.split('-')[0] : '2025'
      }));
  } catch (error) {
    console.error('Error searching movies:', error);
    return [];
  }
}

async function searchTVShows(query) {
  if (!query.trim()) return [];
  
  const url = `${CONFIG.TMDB_BASE_URL}/search/tv?api_key=${CONFIG.TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Fetch details for each show to check if it had episodes in 2025 (batched to avoid rate limits)
    const showsWithDetails = await batchedFetch(
      data.results.slice(0, 15),
      async (show) => {
        try {
          const detailUrl = `${CONFIG.TMDB_BASE_URL}/tv/${show.id}?api_key=${CONFIG.TMDB_API_KEY}`;
          const detailRes = await fetch(detailUrl);
          const details = await detailRes.json();
          return { 
            ...show, 
            firstAirDate: details.first_air_date,
            lastAirDate: details.last_air_date 
          };
        } catch {
          return { ...show, firstAirDate: null, lastAirDate: null };
        }
      },
      5, 150 // 5 requests per batch, 150ms delay between batches
    );
    
    // Filter to shows that were active during 2025
    // (started on or before Dec 31, 2025 AND last aired on or after Jan 1, 2025)
    return showsWithDetails
      .filter(show => {
        if (!show.firstAirDate || !show.lastAirDate) return false;
        const startedBefore2026 = show.firstAirDate <= '2025-12-31';
        const airedInOrAfter2025 = show.lastAirDate >= '2025-01-01';
        return startedBefore2026 && airedInOrAfter2025;
      })
      .slice(0, 8)
      .map(show => ({
        id: show.id,
        title: show.name,
        releaseDate: show.first_air_date,
        poster: show.poster_path 
          ? `${CONFIG.TMDB_IMAGE_BASE}${show.poster_path}`
          : null,
        year: show.first_air_date ? show.first_air_date.split('-')[0] : ''
      }));
  } catch (error) {
    console.error('Error searching TV shows:', error);
    return [];
  }
}

async function searchGames(query) {
  if (!query.trim()) return [];
  
  // Search without strict date filter to find DLC, expansions, and early access games
  // that may have had significant 2025 releases
  const url = `${CONFIG.RAWG_BASE_URL}/games?key=${CONFIG.RAWG_API_KEY}&search=${encodeURIComponent(query)}&page_size=15`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    // Fetch details for each game to check for 2025 releases or updates (batched to avoid rate limits)
    const gamesWithDetails = await batchedFetch(
      (data.results || []).slice(0, 12),
      async (game) => {
        try {
          const detailUrl = `${CONFIG.RAWG_BASE_URL}/games/${game.id}?key=${CONFIG.RAWG_API_KEY}`;
          const detailRes = await fetch(detailUrl);
          const details = await detailRes.json();
          
          // Check if game was released in 2024-2025 (catches early access → full release)
          // or if it's been updated in 2025 (catches DLC/expansion releases)
          const releasedIn2024Or2025 = details.released && 
            (details.released.startsWith('2024') || details.released.startsWith('2025'));
          const updatedIn2025 = details.updated && details.updated.startsWith('2025');
          
          return { 
            ...game, 
            released: details.released,
            isRelevant: releasedIn2024Or2025 || updatedIn2025
          };
        } catch {
          // Fallback: accept if released in 2024-2025
          return { 
            ...game, 
            isRelevant: game.released && 
              (game.released.startsWith('2024') || game.released.startsWith('2025'))
          };
        }
      },
      5, 150 // 5 requests per batch, 150ms delay between batches
    );
    
    // Filter to relevant games and return
    return gamesWithDetails
      .filter(game => game.isRelevant)
      .slice(0, 8)
      .map(game => ({
        id: game.id,
        title: game.name,
        releaseDate: game.released,
        poster: game.background_image || null,
        year: game.released ? game.released.split('-')[0] : '2025'
      }));
  } catch (error) {
    console.error('Error searching games:', error);
    return [];
  }
}

// ==========================================
// UI Functions
// ==========================================

function getItemRank(category, itemId) {
  const index = state.selections[category].findIndex(item => item.id === itemId);
  return index === -1 ? null : index + 1;
}

function renderResults(category, results) {
  const container = document.getElementById(`${category}-results`);
  
  if (results.length === 0) {
    const message = category === 'tv' 
      ? 'No shows with 2025 episodes found. Try a different search.'
      : 'No 2025 releases found. Try a different search.';
    container.innerHTML = `<p class="no-results">${message}</p>`;
    return;
  }
  
  container.innerHTML = results.map(item => {
    const rank = getItemRank(category, item.id);
    const isSelected = rank !== null;
    const isFull = state.selections[category].length >= MAX_PICKS;
    
    return `
      <div class="result-card ${isSelected ? 'selected' : ''} ${isFull && !isSelected ? 'disabled' : ''}" 
           onclick="${!isSelected && !isFull ? `selectItem('${category}', ${JSON.stringify(item).replace(/"/g, '&quot;')})` : ''}">
        ${isSelected ? `<div class="rank-badge rank-${rank}">${rank}</div>` : ''}
        <div class="result-poster">
          ${item.poster 
            ? `<img src="${item.poster}" alt="${item.title}" loading="lazy">`
            : `<div class="no-poster">No Image</div>`
          }
        </div>
        <div class="result-info">
          <h3 class="result-title">${item.title}</h3>
          <span class="result-year">${item.year}</span>
        </div>
      </div>
    `;
  }).join('');
}

function selectItem(category, item) {
  // Check if already selected
  if (state.selections[category].some(i => i.id === item.id)) {
    return;
  }
  
  // Check if we have room
  if (state.selections[category].length >= MAX_PICKS) {
    return;
  }
  
  // Add to selections
  state.selections[category].push(item);
  
  // Clear search results and input
  document.getElementById(`${category}-results`).innerHTML = '';
  document.getElementById(`${category}-search`).value = '';
  
  // Update the ranked list display
  renderRankedList(category);
  updateSubmitButton();
}

function removeItem(category, index) {
  state.selections[category].splice(index, 1);
  renderRankedList(category);
  updateSubmitButton();
}

function moveUp(category, index) {
  if (index === 0) return;
  const items = state.selections[category];
  [items[index - 1], items[index]] = [items[index], items[index - 1]];
  renderRankedList(category);
}

function moveDown(category, index) {
  const items = state.selections[category];
  if (index >= items.length - 1) return;
  [items[index], items[index + 1]] = [items[index + 1], items[index]];
  renderRankedList(category);
}

function renderRankedList(category) {
  const container = document.getElementById(`${category}-ranked`);
  const items = state.selections[category];
  
  if (items.length === 0) {
    container.innerHTML = `
      <div class="ranked-empty">
        <p>Search and select up to ${MAX_PICKS} picks (optional)</p>
      </div>
    `;
    container.classList.remove('has-items');
    return;
  }
  
  container.classList.add('has-items');
  
  const rankLabels = ['1st', '2nd', '3rd'];
  
  container.innerHTML = items.map((item, index) => `
    <div class="ranked-item rank-${index + 1}-item">
      <div class="rank-position rank-${index + 1}">
        <span class="rank-number">${rankLabels[index]}</span>
      </div>
      <div class="ranked-poster">
        ${item.poster 
          ? `<img src="${item.poster}" alt="${item.title}">`
          : `<div class="ranked-no-poster">No Image</div>`
        }
      </div>
      <div class="ranked-info">
        <span class="ranked-title">${item.title}</span>
        <span class="ranked-year">${item.year}</span>
      </div>
      <div class="ranked-controls">
        <button class="rank-btn move-up" onclick="moveUp('${category}', ${index})" ${index === 0 ? 'disabled' : ''} title="Move up">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="rank-btn move-down" onclick="moveDown('${category}', ${index})" ${index === items.length - 1 ? 'disabled' : ''} title="Move down">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <button class="rank-btn remove" onclick="removeItem('${category}', ${index})" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
  
  // Show slots remaining (optional)
  if (items.length < MAX_PICKS) {
    container.innerHTML += `
      <div class="ranked-slots-remaining">
        ${MAX_PICKS - items.length} more slot${MAX_PICKS - items.length > 1 ? 's' : ''} available
      </div>
    `;
  }
}

function clearAllSelections(category) {
  state.selections[category] = [];
  renderRankedList(category);
  updateSubmitButton();
}

function updateSubmitButton() {
  const btn = document.getElementById('submit-btn');
  const voterName = document.getElementById('voter-name').value.trim();
  
  // Count total selections across all categories
  const totalPicks = 
    state.selections.movie.length +
    state.selections.tv.length +
    state.selections.game.length;
  
  // Only require name and at least 1 pick total
  const canSubmit = voterName && totalPicks > 0;
  btn.disabled = !canSubmit;
  
  // Update the hint text
  const hint = document.querySelector('.submit-hint');
  if (totalPicks === 0) {
    hint.textContent = 'Select at least one pick from any category';
  } else if (!voterName) {
    hint.textContent = 'Enter your name to submit';
  } else {
    const pickSummary = [];
    if (state.selections.movie.length > 0) pickSummary.push(`${state.selections.movie.length} movie${state.selections.movie.length > 1 ? 's' : ''}`);
    if (state.selections.tv.length > 0) pickSummary.push(`${state.selections.tv.length} TV show${state.selections.tv.length > 1 ? 's' : ''}`);
    if (state.selections.game.length > 0) pickSummary.push(`${state.selections.game.length} game${state.selections.game.length > 1 ? 's' : ''}`);
    hint.textContent = `Ready to submit: ${pickSummary.join(', ')}`;
  }
}

function showLoading(category, show) {
  const loader = document.getElementById(`${category}-loading`);
  loader.classList.toggle('active', show);
}

// ==========================================
// Search Handlers with Debounce
// ==========================================

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

async function handleSearch(category, query) {
  if (!query.trim()) {
    document.getElementById(`${category}-results`).innerHTML = '';
    return;
  }
  
  showLoading(category, true);
  
  let results;
  switch (category) {
    case 'movie':
      results = await searchMovies(query);
      break;
    case 'tv':
      results = await searchTVShows(query);
      break;
    case 'game':
      results = await searchGames(query);
      break;
  }
  
  showLoading(category, false);
  renderResults(category, results);
}

const debouncedMovieSearch = debounce((q) => handleSearch('movie', q), 400);
const debouncedTVSearch = debounce((q) => handleSearch('tv', q), 400);
const debouncedGameSearch = debounce((q) => handleSearch('game', q), 400);

// ==========================================
// Form Submission
// ==========================================

function formatPick(item) {
  return item ? `${item.title} (${item.year})` : '';
}

async function submitVotes() {
  const voterName = document.getElementById('voter-name').value.trim();
  
  if (!voterName) {
    alert('Please enter your name');
    return;
  }
  
  const totalPicks = 
    state.selections.movie.length +
    state.selections.tv.length +
    state.selections.game.length;
    
  if (totalPicks === 0) {
    alert('Please select at least one pick from any category');
    return;
  }
  
  const btn = document.getElementById('submit-btn');
  btn.classList.add('loading');
  btn.disabled = true;
  
  // Build payload with separate columns for each rank
  const payload = {
    voterName: voterName,
    movie1st: formatPick(state.selections.movie[0]),
    movie2nd: formatPick(state.selections.movie[1]),
    movie3rd: formatPick(state.selections.movie[2]),
    tv1st: formatPick(state.selections.tv[0]),
    tv2nd: formatPick(state.selections.tv[1]),
    tv3rd: formatPick(state.selections.tv[2]),
    game1st: formatPick(state.selections.game[0]),
    game2nd: formatPick(state.selections.game[1]),
    game3rd: formatPick(state.selections.game[2])
  };
  
  try {
    const response = await fetch(CONFIG.GOOGLE_SHEETS_URL, {
      method: 'POST',
      mode: 'no-cors', // Required for Apps Script
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    // With no-cors, we can't read the response, but if no error thrown, assume success
    showSuccessModal();
    
  } catch (error) {
    console.error('Error submitting vote:', error);
    alert('There was an error submitting your vote. Please try again.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showSuccessModal() {
  document.getElementById('success-modal').style.display = 'flex';
}

function closeSuccessModal() {
  document.getElementById('success-modal').style.display = 'none';
  
  // Reset form
  state.selections = { movie: [], tv: [], game: [] };
  document.getElementById('voter-name').value = '';
  
  ['movie', 'tv', 'game'].forEach(category => {
    renderRankedList(category);
    document.getElementById(`${category}-results`).innerHTML = '';
    document.getElementById(`${category}-search`).value = '';
  });
  
  updateSubmitButton();
}

// ==========================================
// Event Listeners
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  // Check for existing session
  if (!checkExistingSession()) {
    document.getElementById('password-modal').style.display = 'flex';
  }
  
  // Initialize ranked lists
  ['movie', 'tv', 'game'].forEach(category => {
    renderRankedList(category);
  });
  
  // Password form
  document.getElementById('password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('password-input').value;
    const errorEl = document.getElementById('password-error');
    
    if (await checkPassword(password)) {
      showApp();
    } else {
      errorEl.textContent = 'Incorrect password. Please try again.';
      document.getElementById('password-input').value = '';
    }
  });
  
  // Search inputs
  document.getElementById('movie-search').addEventListener('input', (e) => {
    debouncedMovieSearch(e.target.value);
  });
  
  document.getElementById('tv-search').addEventListener('input', (e) => {
    debouncedTVSearch(e.target.value);
  });
  
  document.getElementById('game-search').addEventListener('input', (e) => {
    debouncedGameSearch(e.target.value);
  });
  
  // Voter name input
  document.getElementById('voter-name').addEventListener('input', updateSubmitButton);
  
  // Submit button
  document.getElementById('submit-btn').addEventListener('click', submitVotes);
  
  // Initial button state
  updateSubmitButton();
});
