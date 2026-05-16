const API_URL = '/api/cartelera';
const POSTER_FALLBACK = 'https://placehold.co/400x600/1a1a2e/71717a?text=Sin+poster';
const FETCH_TIMEOUT_MS = 12000;

const state = {
  movies: [],
  filters: {
    search: '',
    type: '',
    location: '',
    year: '',
    status: '',
    sort: 'date-desc',
  },
  view: 'grid',
  heroMovie: null,
};

let els = {};
let modalInstance = null;

function cacheElements() {
  els = {
    heroSkeleton: document.getElementById('hero-skeleton'),
    heroInner: document.getElementById('hero-inner'),
    heroPoster: document.getElementById('hero-poster'),
    heroBadge: document.getElementById('hero-badge'),
    heroTitle: document.getElementById('hero-title'),
    heroMeta: document.getElementById('hero-meta'),
    heroDesc: document.getElementById('hero-desc'),
    heroLocation: document.getElementById('hero-location'),
    heroDetailBtn: document.getElementById('hero-detail-btn'),
    statTotal: document.getElementById('stat-total'),
    statActive: document.getElementById('stat-active'),
    statGenres: document.getElementById('stat-genres'),
    statLocations: document.getElementById('stat-locations'),
    filterSearch: document.getElementById('filter-search'),
    filterType: document.getElementById('filter-type'),
    filterLocation: document.getElementById('filter-location'),
    filterYear: document.getElementById('filter-year'),
    filterStatus: document.getElementById('filter-status'),
    filterSort: document.getElementById('filter-sort'),
    resultsCount: document.getElementById('results-count'),
    btnClearFilters: document.getElementById('btn-clear-filters'),
    emptyClearBtn: document.getElementById('empty-clear-btn'),
    loadingGrid: document.getElementById('loading-grid'),
    moviesGrid: document.getElementById('movies-grid'),
    emptyState: document.getElementById('empty-state'),
    apiAlert: document.getElementById('api-alert'),
    apiAlertText: document.getElementById('api-alert-text'),
    btnRefresh: document.getElementById('btn-refresh'),
    iconRefresh: document.getElementById('icon-refresh'),
    modalEl: document.getElementById('movie-modal'),
    modalClose: document.getElementById('modal-close'),
    yearFooter: document.getElementById('year-footer'),
  };
}

function normalize(str) {
  return (str ?? '').toString().trim().toLowerCase();
}

function estadoKey(estado) {
  if (estado === true) return 'true';
  if (estado === false) return 'false';
  return 'null';
}

function estadoLabel(estado) {
  if (estado === true) return 'En cartelera';
  if (estado === false) return 'No disponible';
  return 'Sin definir';
}

function estadoBadgeBootstrap(estado) {
  if (estado === true) return 'bg-success';
  if (estado === false) return 'bg-secondary';
  return 'bg-warning text-dark';
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-GT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function debounce(fn, ms = 280) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, '&#39;');
}

function uniqueSorted(values, formatter = (v) => v) {
  const map = new Map();
  for (const v of values) {
    const key = normalize(v);
    if (!key) continue;
    if (!map.has(key)) map.set(key, formatter(v));
  }
  return [...map.values()].sort((a, b) =>
    a.localeCompare(b, 'es', { sensitivity: 'base' })
  );
}

function populateSelect(select, options, placeholder) {
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  for (const opt of options) {
    const el = document.createElement('option');
    el.value = opt.value;
    el.textContent = opt.label;
    select.appendChild(el);
  }
  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function buildFilterOptions() {
  const types = uniqueSorted(state.movies.map((m) => m.Type));
  const locations = uniqueSorted(state.movies.map((m) => m.Ubication));
  const years = uniqueSorted(state.movies.map((m) => m.Year), (y) => y).sort(
    (a, b) => Number(b) - Number(a)
  );

  populateSelect(
    els.filterType,
    types.map((t) => ({ value: normalize(t), label: t.trim() })),
    'Todos los géneros'
  );
  populateSelect(
    els.filterLocation,
    locations.map((l) => ({ value: normalize(l), label: l.trim() })),
    'Todas las ubicaciones'
  );
  populateSelect(
    els.filterYear,
    years.map((y) => ({ value: y, label: y })),
    'Todos los años'
  );
}

function sortMovies(list, sort) {
  const copy = [...list];
  const byTitle = (a, b) =>
    (a.Title ?? '').localeCompare(b.Title ?? '', 'es', { sensitivity: 'base' });
  const byYear = (a, b) => Number(b.Year) - Number(a.Year);
  const byDate = (a, b) =>
    new Date(b.Fec_Registro || 0) - new Date(a.Fec_Registro || 0);

  switch (sort) {
    case 'title-asc':
      return copy.sort(byTitle);
    case 'title-desc':
      return copy.sort((a, b) => -byTitle(a, b));
    case 'year-asc':
      return copy.sort((a, b) => -byYear(a, b));
    case 'year-desc':
      return copy.sort(byYear);
    case 'date-asc':
      return copy.sort((a, b) => -byDate(a, b));
    default:
      return copy.sort(byDate);
  }
}

function applyFilters() {
  const { search, type, location, year, status, sort } = state.filters;
  const q = normalize(search);

  let list = state.movies.filter((m) => {
    if (q) {
      const haystack = [m.Title, m.description, m.Type, m.Ubication, m.Year, m.imdbID]
        .map(normalize)
        .join(' ');
      if (!haystack.includes(q)) return false;
    }
    if (type && normalize(m.Type) !== type) return false;
    if (location && normalize(m.Ubication) !== location) return false;
    if (year && String(m.Year) !== year) return false;
    if (status && estadoKey(m.Estado) !== status) return false;
    return true;
  });

  return sortMovies(list, sort);
}

function updateStats() {
  const active = state.movies.filter((m) => m.Estado === true).length;
  const genres = new Set(state.movies.map((m) => normalize(m.Type)).filter(Boolean));
  const locs = new Set(state.movies.map((m) => normalize(m.Ubication)).filter(Boolean));

  els.statTotal.textContent = state.movies.length;
  els.statActive.textContent = active;
  els.statGenres.textContent = genres.size;
  els.statLocations.textContent = locs.size;
}

function pickHeroMovie(movies) {
  const active = movies.filter((m) => m.Estado === true);
  const pool = active.length ? active : movies;
  return pool.sort(
    (a, b) => new Date(b.Fec_Registro || 0) - new Date(a.Fec_Registro || 0)
  )[0] ?? null;
}

function renderHero(movie) {
  if (!movie) {
    els.heroSkeleton.classList.remove('d-none');
    els.heroInner.classList.add('d-none');
    els.heroInner.classList.remove('d-flex');
    return;
  }

  state.heroMovie = movie;
  els.heroSkeleton.classList.add('d-none');
  els.heroInner.classList.remove('d-none');
  els.heroInner.classList.add('d-flex');

  els.heroPoster.src = movie.Poster || POSTER_FALLBACK;
  els.heroPoster.alt = `Póster de ${movie.Title}`;
  els.heroPoster.onerror = function () {
    this.onerror = null;
    this.src = POSTER_FALLBACK;
  };

  els.heroBadge.textContent = movie.Type?.trim() || 'Película';
  els.heroTitle.textContent = movie.Title?.trim() || 'Sin título';
  els.heroMeta.textContent = `${movie.Year || '—'} · ${estadoLabel(movie.Estado)}`;
  els.heroDesc.textContent =
    movie.description?.trim() || 'Sin descripción disponible.';
  els.heroLocation.innerHTML = `<i class="bi bi-geo-alt me-1"></i>${escapeHtml(movie.Ubication?.trim() || 'Ubicación N/D')}`;
  els.heroLocation.classList.remove('disabled');
}

function renderSkeletons(count = 10) {
  els.loadingGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const col = document.createElement('div');
    col.className = 'col';
    col.innerHTML = '<div class="card cinema-skeleton h-100"><div class="card-body placeholder-glow"><span class="placeholder col-12 bg-secondary rounded" style="aspect-ratio:2/3;"></span></div></div>';
    col.querySelector('.card-body')?.replaceWith(
      Object.assign(document.createElement('div'), {
        className: 'card-body placeholder-glow',
        innerHTML:
          '<span class="placeholder col-12 bg-secondary rounded" style="aspect-ratio:2/3;display:block;"></span>',
      })
    );
    const card = document.createElement('div');
    card.className = 'card cinema-skeleton h-100';
    const body = document.createElement('div');
    body.className = 'card-body placeholder-glow';
    body.innerHTML =
      '<span class="placeholder col-12 bg-secondary rounded d-block" style="aspect-ratio:2/3;"></span>';
    card.appendChild(body);
    col.innerHTML = '';
    col.appendChild(card);
    els.loadingGrid.appendChild(col);
  }
  els.loadingGrid.classList.remove('d-none');
}

function createMovieCard(movie, index) {
  const col = document.createElement('div');
  col.className = state.view === 'list' ? 'col-12' : 'col';
  col.setAttribute('role', 'listitem');
  col.style.animationDelay = `${index * 40}ms`;

  const poster = movie.Poster || POSTER_FALLBACK;
  const title = (movie.Title ?? 'Sin título').trim();
  const loc = (movie.Ubication ?? 'N/D').trim();
  const badgeClass = estadoBadgeBootstrap(movie.Estado);

  if (state.view === 'list') {
    col.innerHTML = `
      <article class="card cinema-movie-card cinema-movie-card--list h-100" tabindex="0" data-id="${escapeAttr(movie.imdbID)}">
        <div class="row g-0">
          <div class="col-4 col-sm-3 col-md-2">
            <img src="${escapeAttr(poster)}" class="img-fluid rounded-start h-100 object-fit-cover" alt="Póster de ${escapeHtml(title)}" loading="lazy" style="min-height:140px;" />
          </div>
          <div class="col-8 col-sm-9 col-md-10">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <h3 class="h5 card-title mb-1">${escapeHtml(title)}</h3>
                <span class="badge ${badgeClass} flex-shrink-0">${estadoLabel(movie.Estado)}</span>
              </div>
              <p class="card-text small text-secondary mb-1">${escapeHtml(movie.Year || '—')} · ${escapeHtml(movie.Type?.trim() || '—')}</p>
              <p class="card-text small mb-0"><i class="bi bi-geo-alt"></i> ${escapeHtml(loc)}</p>
            </div>
          </div>
        </div>
      </article>`;
  } else {
    col.innerHTML = `
      <article class="card cinema-movie-card h-100 border-0" tabindex="0" data-id="${escapeAttr(movie.imdbID)}">
        <div class="position-relative">
          <span class="badge ${badgeClass} position-absolute top-0 end-0 m-2 z-1">${estadoLabel(movie.Estado)}</span>
          <img src="${escapeAttr(poster)}" class="card-img-top cinema-poster" alt="Póster de ${escapeHtml(title)}" loading="lazy" />
        </div>
        <div class="card-body p-2 p-sm-3">
          <h3 class="card-title h6 mb-1 text-truncate-2">${escapeHtml(title)}</h3>
          <p class="card-text small text-secondary mb-0">${escapeHtml(movie.Year || '—')} · ${escapeHtml(movie.Type?.trim() || '—')}</p>
          <p class="card-text small text-secondary text-truncate mb-0"><i class="bi bi-geo-alt"></i> ${escapeHtml(loc)}</p>
        </div>
      </article>`;
  }

  const article = col.querySelector('article');
  const img = col.querySelector('img');
  if (img) {
    img.onerror = function () {
      this.onerror = null;
      this.src = POSTER_FALLBACK;
    };
  }

  const open = () => openModal(movie);
  article.addEventListener('click', open);
  article.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  return col;
}

function renderGrid() {
  const list = applyFilters();
  const hasFilters = Object.entries(state.filters).some(
    ([k, v]) => k !== 'sort' && v !== ''
  );

  els.btnClearFilters.classList.toggle('d-none', !hasFilters);
  els.resultsCount.textContent =
    list.length === 1 ? '1 película' : `${list.length} películas`;

  els.loadingGrid.classList.add('d-none');

  if (list.length === 0) {
    els.moviesGrid.classList.add('d-none');
    els.emptyState.classList.remove('d-none');
    els.emptyState.classList.add('d-block');
    return;
  }

  els.emptyState.classList.add('d-none');
  els.emptyState.classList.remove('d-block');
  els.moviesGrid.classList.remove('d-none');
  els.moviesGrid.innerHTML = '';

  const frag = document.createDocumentFragment();
  list.forEach((movie, i) => frag.appendChild(createMovieCard(movie, i)));
  els.moviesGrid.appendChild(frag);
}

function openModal(movie) {
  document.getElementById('modal-title').textContent =
    (movie.Title ?? '').trim() || 'Sin título';

  const modalPoster = document.getElementById('modal-poster');
  modalPoster.src = movie.Poster || POSTER_FALLBACK;
  modalPoster.alt = `Póster de ${movie.Title}`;
  modalPoster.onerror = function () {
    this.onerror = null;
    this.src = POSTER_FALLBACK;
  };

  document.getElementById('modal-meta').textContent = `${movie.Year || '—'} · ${(movie.Type ?? '').trim() || '—'} · ${estadoLabel(movie.Estado)}`;
  document.getElementById('modal-description').textContent =
    movie.description?.trim() || 'Sin descripción disponible.';
  document.getElementById('modal-location').textContent =
    (movie.Ubication ?? '').trim() || '—';
  document.getElementById('modal-date').textContent = formatDate(movie.Fec_Registro);
  document.getElementById('modal-id').textContent = movie.imdbID ?? '—';

  document.getElementById('modal-badges').innerHTML = `
    <span class="badge ${estadoBadgeBootstrap(movie.Estado)}">${estadoLabel(movie.Estado)}</span>
    <span class="badge bg-dark border border-secondary">${escapeHtml((movie.Type ?? '').trim())}</span>
  `;

  if (!modalInstance) {
    modalInstance = new bootstrap.Modal(els.modalEl);
  }
  modalInstance.show();
}

function clearFilters() {
  state.filters = {
    search: '',
    type: '',
    location: '',
    year: '',
    status: '',
    sort: state.filters.sort,
  };
  els.filterSearch.value = '';
  els.filterType.value = '';
  els.filterLocation.value = '';
  els.filterYear.value = '';
  els.filterStatus.value = '';
  renderGrid();
}

function setView(view) {
  state.view = view;
  els.moviesGrid.classList.toggle('view-list', view === 'list');
  if (view === 'list') {
    els.moviesGrid.className = 'row g-3 view-list';
  } else {
    els.moviesGrid.className =
      'row row-cols-2 row-cols-sm-3 row-cols-lg-4 row-cols-xl-5 g-3 view-grid';
  }

  document.querySelectorAll('.view-btn').forEach((btn) => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  renderGrid();
}

function showApiAlert(message) {
  els.apiAlertText.textContent = message;
  els.apiAlert.classList.remove('d-none');
  els.apiAlert.classList.add('d-flex');
}

function hideApiAlert() {
  els.apiAlert.classList.add('d-none');
  els.apiAlert.classList.remove('d-flex');
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);
    return res;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function fetchMovies() {
  els.iconRefresh?.classList.add('spin');
  renderSkeletons();
  els.resultsCount.textContent = 'Cargando...';

  try {
    const res = await fetchWithTimeout(API_URL, FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Respuesta inválida');
    state.movies = data;
    hideApiAlert();
  } catch (err) {
    console.error('Error al cargar la cartelera:', err);
    state.movies = [];
    const reason =
      err.name === 'AbortError'
        ? 'tiempo de espera agotado'
        : err.message || 'error de conexión';
    showApiAlert(
      `No se pudo cargar la cartelera (${reason}). Comprueba la API e intenta actualizar.`
    );
  } finally {
    els.iconRefresh?.classList.remove('spin');
  }

  buildFilterOptions();
  updateStats();
  renderHero(pickHeroMovie(state.movies));
  renderGrid();
}

function bindEvents() {
  const onFilterChange = debounce(() => {
    state.filters.search = els.filterSearch.value;
    state.filters.type = els.filterType.value;
    state.filters.location = els.filterLocation.value;
    state.filters.year = els.filterYear.value;
    state.filters.status = els.filterStatus.value;
    renderGrid();
  });

  els.filterSearch.addEventListener('input', onFilterChange);
  [els.filterType, els.filterLocation, els.filterYear, els.filterStatus].forEach(
    (el) => el?.addEventListener('change', onFilterChange)
  );

  els.filterSort.addEventListener('change', () => {
    state.filters.sort = els.filterSort.value;
    renderGrid();
  });

  els.btnClearFilters.addEventListener('click', clearFilters);
  els.emptyClearBtn.addEventListener('click', clearFilters);
  els.btnRefresh.addEventListener('click', fetchMovies);
  els.heroDetailBtn.addEventListener('click', () => {
    if (state.heroMovie) openModal(state.heroMovie);
  });

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
}

function init() {
  cacheElements();
  if (!els.moviesGrid) {
    console.error('No se encontraron elementos del DOM');
    return;
  }

  modalInstance = els.modalEl ? new bootstrap.Modal(els.modalEl) : null;
  els.yearFooter.textContent = new Date().getFullYear();

  bindEvents();
  fetchMovies();
}

document.addEventListener('DOMContentLoaded', init);
