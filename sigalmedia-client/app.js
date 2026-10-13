// ════════════════════════════════════════════════════════════════════════════════
// SigalMedia — İstemci Uygulama Mantığı (app.js)
// Firebase Auth + Firestore + Audio Service API
// ════════════════════════════════════════════════════════════════════════════════

import { initializeApp }           from 'firebase/app';
import { getAnalytics }            from 'firebase/analytics';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
}                                  from 'firebase/auth';
import {
  getFirestore,
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs
}                                  from 'firebase/firestore';

// ── Firebase Yapılandırması ───────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyDfwnapg02PdVVPugCPTDXEez8cEl3JVcY",
  authDomain:        "music-c39c2.firebaseapp.com",
  projectId:         "music-c39c2",
  storageBucket:     "music-c39c2.firebasestorage.app",
  messagingSenderId: "1094072552952",
  appId:             "1:1094072552952:web:1f079da5daeba77de25a0d",
  measurementId:     "G-GJ1QKMDZ44"
};

const firebaseApp = initializeApp(firebaseConfig);
try {
  getAnalytics(firebaseApp);
} catch (e) {
  console.warn('Analytics başlatılamadı:', e);
}

const auth      = getAuth(firebaseApp);
const db        = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

// ── Audio Servisi Yapılandırması ─────────────────────────────────────────────
// Umut servisi deploy ettiğinde bu URL'yi gerçek adrese çevir.
const AUDIO_SERVICE_BASE = 'http://localhost:4000';
const AUDIO_SERVICE_KEY  = 'sigalmedia_super_secret_key_2024';

async function audioFetch(path, options = {}) {
  const res = await fetch(`${AUDIO_SERVICE_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AUDIO_SERVICE_KEY,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Sunucu hatası' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── DOM Referansları ─────────────────────────────────────────────────────────
const searchInput      = document.getElementById('searchInput');
const searchDropdown   = document.getElementById('searchDropdown');
const searchResults    = document.getElementById('searchResults');
const searchSpinner    = document.getElementById('searchSpinner');
const searchClear      = document.getElementById('searchClear');

const audioEl          = document.getElementById('audioPlayer');
const playPauseBtn     = document.getElementById('playPauseBtn');
const playIcon         = document.getElementById('playIcon');
const pauseIcon        = document.getElementById('pauseIcon');
const prevBtn          = document.getElementById('prevBtn');
const nextBtn          = document.getElementById('nextBtn');
const shuffleBtn       = document.getElementById('shuffleBtn');
const repeatBtn        = document.getElementById('repeatBtn');
const muteBtn          = document.getElementById('muteBtn');
const volumeSlider     = document.getElementById('volumeSlider');
const progressBar      = document.getElementById('progressBar');
const progressFill     = document.getElementById('progressFill');
const timeCurrent      = document.getElementById('timeCurrent');
const timeTotal        = document.getElementById('timeTotal');
const playerThumb      = document.getElementById('playerThumb');
const playerTitle      = document.getElementById('playerTitle');
const playerArtist     = document.getElementById('playerArtist');
const playerFavBtn     = document.getElementById('playerFavBtn');
const playerLoading    = document.getElementById('playerLoading');

const npsThumbnail     = document.getElementById('npsThumbnail');
const npsTitle         = document.getElementById('npsTitle');
const npsArtist        = document.getElementById('npsArtist');
const nowPlayingSection= document.getElementById('nowPlayingSection');
const heroSection      = document.getElementById('heroSection');
const vinylRecord      = document.getElementById('vinylRecord');

const authModal        = document.getElementById('authModal');
const authBtn          = document.getElementById('authBtn');
const modalClose       = document.getElementById('modalClose');
const loginBtn         = document.getElementById('loginBtn');
const registerBtn      = document.getElementById('registerBtn');
const googleBtn        = document.getElementById('googleBtn');
const authEmail        = document.getElementById('authEmail');
const authPassword     = document.getElementById('authPassword');
const authError        = document.getElementById('authError');
const userAvatar       = document.getElementById('userAvatar');
const userName         = document.getElementById('userName');
const sidebarToggle    = document.getElementById('sidebarToggle');
const sidebar          = document.getElementById('sidebar');
const toast            = document.getElementById('toast');
const chipsRow         = document.getElementById('chipsRow');
const quickSection      = document.getElementById('quickSection');

const searchMainSection = document.getElementById('searchMainSection');
const searchQueryTitle  = document.getElementById('searchQueryTitle');
const searchQueryCount  = document.getElementById('searchQueryCount');
const songsGrid         = document.getElementById('songsGrid');
const viewGridBtn       = document.getElementById('viewGridBtn');
const viewListBtn       = document.getElementById('viewListBtn');

const librarySection    = document.getElementById('librarySection');
const libraryBadge      = document.getElementById('libraryBadge');
const libraryTitle      = document.getElementById('libraryTitle');
const libraryCount      = document.getElementById('libraryCount');
const libraryGrid       = document.getElementById('libraryGrid');

// ── Uygulama Durumu ──────────────────────────────────────────────────────────
let state = {
  currentUser: null,
  queue:       [],    // { id, title, artist, thumbnail, duration }
  queueIndex:  -1,
  isPlaying:   false,
  isShuffle:   false,
  isRepeat:    false,
  isMuted:     false,
  volume:      0.8,
  favorites:   new Map(), // id -> track
  history:     [],
  debounceTimer: null,
  lastQuery:   '',
};

// ════════════════════════════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ════════════════════════════════════════════════════════════════════════════════

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function setPlayerLoading(on) {
  playerLoading.style.display = on ? 'flex' : 'none';
  playPauseBtn.style.opacity  = on ? '0.4' : '1';
  playPauseBtn.disabled       = on;
}

// ── Yerel Depolama (LocalStorage Fallback) ──────────────────────────────────
function loadLocalFavorites() {
  try {
    const raw = localStorage.getItem('sigal_favorites');
    if (raw) {
      const arr = JSON.parse(raw);
      arr.forEach(t => state.favorites.set(t.id, t));
    }
  } catch (e) {
    console.warn('Yerel favoriler okunamadı:', e);
  }
}

function saveLocalFavorites() {
  try {
    const arr = Array.from(state.favorites.values());
    localStorage.setItem('sigal_favorites', JSON.stringify(arr));
  } catch (e) {
    console.warn('Yerel favoriler kaydedilemedi:', e);
  }
}

function loadLocalHistory() {
  try {
    const raw = localStorage.getItem('sigal_history');
    if (raw) state.history = JSON.parse(raw);
  } catch (e) {
    console.warn('Yerel geçmiş okunamadı:', e);
  }
}

function saveLocalHistory(track) {
  try {
    state.history = [track, ...state.history.filter(t => t.id !== track.id)].slice(0, 30);
    localStorage.setItem('sigal_history', JSON.stringify(state.history));
  } catch (e) {
    console.warn('Yerel geçmiş kaydedilemedi:', e);
  }
}

// Başlangıçta yerel verileri yükle
loadLocalFavorites();
loadLocalHistory();

// ── Kartları Güncelle ────────────────────────────────────────────────────────
function updateActiveCards() {
  const currentId = state.queue[state.queueIndex]?.id;
  document.querySelectorAll('.song-card').forEach(card => {
    const isCurrent = card.dataset.id === currentId;
    card.classList.toggle('playing', isCurrent);
  });
}

// ── Şarkı Kartları Izgarası Oluşturucu ───────────────────────────────────────
function renderSongsGrid(container, songs, isSearch = true) {
  if (!songs || songs.length === 0) {
    container.innerHTML = '<div class="results-empty">Hiç şarkı bulunamadı 🎵</div>';
    return;
  }

  const currentId = state.queue[state.queueIndex]?.id;

  container.innerHTML = songs.map((item, i) => {
    const isPlaying = item.id === currentId;
    const isFav = state.favorites.has(item.id);

    return `
      <div class="song-card ${isPlaying ? 'playing' : ''}" data-index="${i}" data-id="${item.id}" role="button" tabindex="0">
        <span class="card-index">${i + 1}</span>
        <div class="song-card-thumb-wrap">
          <img class="song-card-thumb" src="${item.thumbnail}" alt="${escapeHtml(item.title)}" loading="lazy" />
          <div class="song-card-overlay">
            <button class="card-play-btn" title="Oynat">
              <svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            </button>
          </div>
          <span class="song-card-duration">${item.durationFormatted || '0:00'}</span>
          <div class="card-equalizer">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="song-card-info">
          <div class="song-card-text">
            <div class="song-card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            <div class="song-card-artist" title="${escapeHtml(item.artist)}">${escapeHtml(item.artist)}</div>
          </div>
          <button class="song-card-fav ${isFav ? 'active' : ''}" data-fav-id="${item.id}" title="Favori">
            ${isFav ? '♥' : '♡'}
          </button>
          <span class="card-duration-badge">${item.durationFormatted || ''}</span>
        </div>
      </div>
    `;
  }).join('');

  // Tıklama Olayları
  container.querySelectorAll('.song-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Favori butonuna tıklandıysa
      const favBtn = e.target.closest('.song-card-fav');
      if (favBtn) {
        e.stopPropagation();
        const id = favBtn.dataset.favId;
        const track = songs.find(s => s.id === id);
        if (track) toggleFavorite(track, favBtn);
        return;
      }

      // Parça çal
      const index = parseInt(card.dataset.index, 10);
      if (isSearch) {
        state.queue = songs;
        playTrack(index);
      } else {
        state.queue = songs;
        playTrack(index);
      }
    });
  });
}

// ════════════════════════════════════════════════════════════════════════════════
// GELİŞMİŞ ARAMA MOTORU
// ════════════════════════════════════════════════════════════════════════════════

async function doSearch(query, isInstant = false) {
  if (!query || query.length < 2) {
    if (!isInstant) searchDropdown.classList.remove('open');
    return;
  }

  state.lastQuery = query;
  searchSpinner.classList.add('active');
  searchClear.classList.add('visible');

  if (isInstant) {
    searchDropdown.classList.add('open');
    searchResults.innerHTML = '<div class="results-loading">🔍 Canlı aranıyor...</div>';
  } else {
    searchDropdown.classList.remove('open');
    searchMainSection.style.display = 'block';
    searchQueryTitle.textContent = `"${query}" için Arama Sonuçları`;
    searchQueryCount.textContent = 'YouTube taranıyor...';
    songsGrid.innerHTML = '<div class="results-loading">🔍 YouTube arşivinde aranıyor...</div>';
    heroSection.style.display = 'none';
    if (librarySection) librarySection.style.display = 'none';
  }

  try {
    const data = await audioFetch(`/api/audio/search?q=${encodeURIComponent(query)}&limit=20`);

    if (!data.success || data.data.length === 0) {
      if (isInstant) {
        searchResults.innerHTML = '<div class="results-empty">Sonuç bulunamadı 🎵</div>';
      }
      searchQueryCount.textContent = 'Sonuç bulunamadı';
      songsGrid.innerHTML = '<div class="results-empty">Aradığınız kriterlere uygun parça bulunamadı. Lütfen başka bir kelime deneyin 🎵</div>';
      return;
    }

    state.queue = data.data;

    // 1. Ana sayfadaki arama sonuçları ızgarasını güncelle
    searchMainSection.style.display = 'block';
    searchQueryTitle.textContent = `"${query}" için Arama Sonuçları`;
    searchQueryCount.textContent = `${data.data.length} şarkı bulundu`;
    heroSection.style.display = 'none';
    if (librarySection) librarySection.style.display = 'none';
    renderSongsGrid(songsGrid, state.queue, true);

    // 2. Açılır paneldeki (autocomplete) sonuçları güncelle (ilk 6 parça)
    const quickItems = data.data.slice(0, 6);
    searchResults.innerHTML = quickItems.map((item, i) => `
      <div class="result-item" data-index="${i}" role="button" tabindex="0">
        <img class="result-thumb" src="${item.thumbnail}" alt="${escapeHtml(item.title)}" loading="lazy" />
        <div class="result-info">
          <div class="result-title">${escapeHtml(item.title)}</div>
          <div class="result-artist">${escapeHtml(item.artist)}</div>
        </div>
        <span class="result-duration">${item.durationFormatted}</span>
      </div>
    `).join('') + `
      <div class="dropdown-footer" id="dropdownSeeAll">
        <span>Tüm ${data.data.length} sonucu ana sayfada göster ➔</span>
      </div>
    `;

    // Dropdown içindeki parçalara tıklama
    searchResults.querySelectorAll('.result-item').forEach(el => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index, 10);
        playTrack(index);
        searchDropdown.classList.remove('open');
      });
    });

    const seeAllBtn = document.getElementById('dropdownSeeAll');
    if (seeAllBtn) {
      seeAllBtn.addEventListener('click', () => {
        searchDropdown.classList.remove('open');
        searchMainSection.scrollIntoView({ behavior: 'smooth' });
      });
    }

  } catch (err) {
    if (isInstant) {
      searchResults.innerHTML = `<div class="results-empty">⚠️ ${err.message}</div>`;
    }
    songsGrid.innerHTML = `<div class="results-empty">⚠️ ${err.message}</div>`;
    showToast(err.message, 'error');
  } finally {
    searchSpinner.classList.remove('active');
  }
}

// ── Arama Girdisi Olayları ──────────────────────────────────────────────────
searchInput.addEventListener('input', (e) => {
  clearTimeout(state.debounceTimer);
  const q = e.target.value.trim();
  if (!q) {
    searchClear.classList.remove('visible');
    searchDropdown.classList.remove('open');
    return;
  }
  searchClear.classList.add('visible');
  state.debounceTimer = setTimeout(() => doSearch(q, true), 250);
});

// Enter tuşuna basıldığında beklemeden ana sayfada ara
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(state.debounceTimer);
    const q = searchInput.value.trim();
    if (q) {
      searchDropdown.classList.remove('open');
      doSearch(q, false);
    }
  }
});

// Arama kutusuna tıklanınca dropdown'ı tekrar aç
searchInput.addEventListener('focus', () => {
  if (searchInput.value.trim().length >= 2 && state.queue.length > 0) {
    searchDropdown.classList.add('open');
  }
});

// Arama temizleme
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.classList.remove('visible');
  searchDropdown.classList.remove('open');
  searchInput.focus();
  // Hero bölümünü geri getir
  heroSection.style.display = 'flex';
  searchMainSection.style.display = 'none';
});

// Dışarı tıklayınca açılır paneli kapat
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    searchDropdown.classList.remove('open');
  }
});

// Popüler Aramalar Çipleri
chipsRow.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q;
    searchInput.value = q;
    searchClear.classList.add('visible');
    doSearch(q, false);
    searchInput.focus();
  });
});

// Görünüm Değiştiriciler (Grid / List)
viewGridBtn.addEventListener('click', () => {
  songsGrid.classList.remove('list-view');
  viewGridBtn.classList.add('active');
  viewListBtn.classList.remove('active');
});

viewListBtn.addEventListener('click', () => {
  songsGrid.classList.add('list-view');
  viewListBtn.classList.add('active');
  viewGridBtn.classList.remove('active');
});

// ════════════════════════════════════════════════════════════════════════════════
// ÇALMA (PLAYBACK)
// ════════════════════════════════════════════════════════════════════════════════

async function playTrack(index) {
  if (index < 0 || index >= state.queue.length) return;
  state.queueIndex = index;
  const track = state.queue[index];

  // UI'ı hemen güncelle
  playerTitle.textContent  = track.title;
  playerArtist.textContent = track.artist;
  playerThumb.src          = track.thumbnail;
  npsTitle.textContent     = track.title;
  npsArtist.textContent    = track.artist;
  npsThumbnail.src         = track.thumbnail;

  nowPlayingSection.style.display = 'flex';

  // Favori durumu
  playerFavBtn.textContent = state.favorites.has(track.id) ? '♥' : '♡';
  playerFavBtn.classList.toggle('active', state.favorites.has(track.id));

  // Kartlardaki aktif parça işaretini güncelle
  updateActiveCards();

  // Plak animasyonu
  vinylRecord.classList.remove('playing');

  setPlayerLoading(true);
  audioEl.pause();

  try {
    const data = await audioFetch('/api/audio/resolve', {
      method: 'POST',
      body: JSON.stringify({ videoId: track.id, title: track.title }),
    });

    if (!data.success) throw new Error(data.error || 'Çözümlenemedi');

    audioEl.src    = data.audioUrl;
    audioEl.volume = state.volume;
    await audioEl.play();

    state.isPlaying = true;
    vinylRecord.classList.add('playing');
    updatePlayPauseUI();
    updateActiveCards();

    showToast(`🎵 ${track.title}`, 'success');

    // Geçmişe kaydet (hem localStorage hem Firestore)
    saveLocalHistory(track);
    if (state.currentUser) {
      savePlayHistory(track);
    }

  } catch (err) {
    showToast(`❌ ${err.message}`, 'error');
  } finally {
    setPlayerLoading(false);
  }
}

function updatePlayPauseUI() {
  playIcon.style.display  = state.isPlaying ? 'none' : 'block';
  pauseIcon.style.display = state.isPlaying ? 'block' : 'none';
}

// ── Player Kontrolleri ───────────────────────────────────────────────────────

playPauseBtn.addEventListener('click', async () => {
  if (!audioEl.src) return;

  if (state.isPlaying) {
    audioEl.pause();
    state.isPlaying = false;
    vinylRecord.classList.remove('playing');
  } else {
    await audioEl.play();
    state.isPlaying = true;
    vinylRecord.classList.add('playing');
  }
  updatePlayPauseUI();
  updateActiveCards();
});

prevBtn.addEventListener('click', () => {
  if (state.queueIndex > 0) playTrack(state.queueIndex - 1);
});

nextBtn.addEventListener('click', () => {
  const next = state.isShuffle
    ? Math.floor(Math.random() * state.queue.length)
    : state.queueIndex + 1;
  if (next < state.queue.length) playTrack(next);
});

shuffleBtn.addEventListener('click', () => {
  state.isShuffle = !state.isShuffle;
  shuffleBtn.classList.toggle('active', state.isShuffle);
  showToast(state.isShuffle ? '🔀 Karıştırma açık' : 'Karıştırma kapalı');
});

repeatBtn.addEventListener('click', () => {
  state.isRepeat = !state.isRepeat;
  repeatBtn.classList.toggle('active', state.isRepeat);
  audioEl.loop = state.isRepeat;
  showToast(state.isRepeat ? '🔁 Tekrar açık' : 'Tekrar kapalı');
});

muteBtn.addEventListener('click', () => {
  state.isMuted    = !state.isMuted;
  audioEl.muted    = state.isMuted;
  volumeSlider.value = state.isMuted ? 0 : state.volume;
});

volumeSlider.addEventListener('input', (e) => {
  state.volume     = parseFloat(e.target.value);
  audioEl.volume   = state.volume;
  state.isMuted    = state.volume === 0;
  audioEl.muted    = state.isMuted;
});

// Progress bar
audioEl.addEventListener('timeupdate', () => {
  if (!audioEl.duration) return;
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  progressFill.style.width = `${pct}%`;
  timeCurrent.textContent  = formatTime(audioEl.currentTime);
  timeTotal.textContent    = formatTime(audioEl.duration);
});

progressBar.addEventListener('click', (e) => {
  if (!audioEl.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const pct  = (e.clientX - rect.left) / rect.width;
  audioEl.currentTime = pct * audioEl.duration;
});

audioEl.addEventListener('ended', () => {
  if (state.isRepeat) return;
  const next = state.isShuffle
    ? Math.floor(Math.random() * state.queue.length)
    : state.queueIndex + 1;
  if (next < state.queue.length) {
    playTrack(next);
  } else {
    state.isPlaying = false;
    vinylRecord.classList.remove('playing');
    updatePlayPauseUI();
    updateActiveCards();
  }
});

audioEl.addEventListener('error', () => {
  showToast('🔇 Ses yüklenemedi.', 'error');
  setPlayerLoading(false);
});

// ════════════════════════════════════════════════════════════════════════════════
// FAVORİLER & KÜTÜPHANE
// ════════════════════════════════════════════════════════════════════════════════

async function toggleFavorite(track, favBtnEl = null) {
  const isFav = state.favorites.has(track.id);

  if (isFav) {
    state.favorites.delete(track.id);
    if (favBtnEl) {
      favBtnEl.textContent = '♡';
      favBtnEl.classList.remove('active');
    }
    if (state.queue[state.queueIndex]?.id === track.id) {
      playerFavBtn.textContent = '♡';
      playerFavBtn.classList.remove('active');
    }
    showToast('Favorilerden kaldırıldı');
    saveLocalFavorites();

    if (state.currentUser) {
      deleteDoc(doc(db, 'users', state.currentUser.uid, 'favorites', track.id)).catch(console.warn);
    }
  } else {
    state.favorites.set(track.id, track);
    if (favBtnEl) {
      favBtnEl.textContent = '♥';
      favBtnEl.classList.add('active');
    }
    if (state.queue[state.queueIndex]?.id === track.id) {
      playerFavBtn.textContent = '♥';
      playerFavBtn.classList.add('active');
    }
    showToast('❤ Favorilere eklendi!', 'success');
    saveLocalFavorites();

    if (state.currentUser) {
      setDoc(doc(db, 'users', state.currentUser.uid, 'favorites', track.id), {
        videoId:   track.id,
        title:     track.title,
        artist:    track.artist,
        thumbnail: track.thumbnail,
        duration:  track.duration || 0,
        addedAt:   new Date(),
      }).catch(console.warn);
    }
  }
}

playerFavBtn.addEventListener('click', () => {
  const track = state.queue[state.queueIndex];
  if (!track) return;
  toggleFavorite(track, playerFavBtn);
});

async function loadFavorites(uid) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'favorites'));
    snap.docs.forEach(d => {
      const data = d.data();
      state.favorites.set(d.id, {
        id: data.videoId || d.id,
        title: data.title,
        artist: data.artist,
        thumbnail: data.thumbnail,
        durationFormatted: formatTime(data.duration),
      });
    });
    saveLocalFavorites();
  } catch (e) {
    console.warn('Favoriler yüklenemedi:', e);
  }
}

async function savePlayHistory(track) {
  try {
    await setDoc(doc(db, 'users', state.currentUser.uid, 'history', track.id), {
      videoId:   track.id,
      title:     track.title,
      artist:    track.artist,
      thumbnail: track.thumbnail,
      playedAt:  new Date(),
    });
  } catch (e) {
    console.warn('Geçmiş kaydedilemedi:', e);
  }
}

// Favoriler Sayfasını Göster
function renderFavoritesView() {
  const favList = Array.from(state.favorites.values());
  libraryCount.textContent = `${favList.length} şarkı`;
  if (favList.length === 0) {
    libraryGrid.innerHTML = '<div class="results-empty">Henüz favori şarkı eklemediniz. Beğendiğiniz şarkıların kalbine tıklayın! ❤</div>';
    return;
  }
  renderSongsGrid(libraryGrid, favList, false);
}

// Son Dinlenenler Sayfasını Göster
function renderHistoryView() {
  libraryCount.textContent = `${state.history.length} şarkı`;
  if (state.history.length === 0) {
    libraryGrid.innerHTML = '<div class="results-empty">Henüz dinlenen bir şarkı yok. Arama yaparak bir şarkı çalın! 🎵</div>';
    return;
  }
  renderSongsGrid(libraryGrid, state.history, false);
}

// ── Sidebar Menü Navigasyonu ────────────────────────────────────────────────
document.querySelectorAll('.sidebar-nav .nav-item').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    const page = link.dataset.page;

    if (page === 'home') {
      heroSection.style.display = 'flex';
      quickSection.style.display = 'block';
      searchMainSection.style.display = state.queue.length > 0 ? 'block' : 'none';
      librarySection.style.display = 'none';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (page === 'search') {
      searchInput.focus();
      if (state.queue.length > 0) {
        searchMainSection.style.display = 'block';
        heroSection.style.display = 'none';
      }
      librarySection.style.display = 'none';
    } else if (page === 'favorites') {
      heroSection.style.display = 'none';
      searchMainSection.style.display = 'none';
      librarySection.style.display = 'block';
      libraryBadge.textContent = 'Favoriler';
      libraryTitle.textContent = 'Favori Şarkılarım';
      renderFavoritesView();
    } else if (page === 'library') {
      heroSection.style.display = 'none';
      searchMainSection.style.display = 'none';
      librarySection.style.display = 'block';
      libraryBadge.textContent = 'Geçmiş';
      libraryTitle.textContent = 'Son Çalınanlar';
      renderHistoryView();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// FIREBASE AUTH
// ════════════════════════════════════════════════════════════════════════════════

onAuthStateChanged(auth, async (user) => {
  state.currentUser = user;

  if (user) {
    userAvatar.textContent = user.displayName?.[0]?.toUpperCase()
                           || user.email?.[0]?.toUpperCase() || '?';
    userName.textContent   = user.displayName || user.email?.split('@')[0] || 'Kullanıcı';
    authBtn.textContent    = 'Çıkış';
    authBtn.onclick        = () => signOut(auth);
    await loadFavorites(user.uid);
  } else {
    userAvatar.textContent = '?';
    userName.textContent   = 'Giriş Yapılmadı';
    authBtn.textContent    = 'Giriş Yap';
    authBtn.onclick        = () => { authModal.style.display = 'grid'; };
  }
});

function setAuthError(msg) { authError.textContent = msg; }

loginBtn.addEventListener('click', async () => {
  setAuthError('');
  try {
    await signInWithEmailAndPassword(auth, authEmail.value, authPassword.value);
    authModal.style.display = 'none';
    showToast('✅ Giriş başarılı!', 'success');
  } catch (err) {
    setAuthError(mapAuthError(err.code));
  }
});

registerBtn.addEventListener('click', async () => {
  setAuthError('');
  try {
    await createUserWithEmailAndPassword(auth, authEmail.value, authPassword.value);
    authModal.style.display = 'none';
    showToast('🎉 Hesap oluşturuldu!', 'success');
  } catch (err) {
    setAuthError(mapAuthError(err.code));
  }
});

googleBtn.addEventListener('click', async () => {
  setAuthError('');
  try {
    await signInWithPopup(auth, googleProvider);
    authModal.style.display = 'none';
    showToast('✅ Google ile giriş yapıldı!', 'success');
  } catch (err) {
    setAuthError(mapAuthError(err.code));
  }
});

modalClose.addEventListener('click', () => { authModal.style.display = 'none'; });
authModal.addEventListener('click', (e) => { if (e.target === authModal) authModal.style.display = 'none'; });

function mapAuthError(code) {
  const m = {
    'auth/invalid-email':       'Geçersiz e-posta adresi.',
    'auth/user-not-found':      'Bu e-posta ile kayıtlı kullanıcı yok.',
    'auth/wrong-password':      'Hatalı şifre.',
    'auth/email-already-in-use':'Bu e-posta zaten kullanımda.',
    'auth/weak-password':       'Şifre en az 6 karakter olmalıdır.',
    'auth/popup-closed-by-user':'Giriş penceresi kapatıldı.',
  };
  return m[code] || `Hata: ${code}`;
}

// ── Sidebar Toggle (mobil) ───────────────────────────────────────────────────
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// ── ilk yükleme ──────────────────────────────────────────────────────────────
console.log('%c🎵 SigalMedia Audio Engine', 'font-size:18px;color:#8b5cf6;font-weight:bold;');
console.log('%cAudio Service → ' + AUDIO_SERVICE_BASE, 'color:#94a3b8');
