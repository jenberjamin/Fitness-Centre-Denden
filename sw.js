const CACHE_NAME = 'lifehub-v1-core';
const filesToCache = [
    './',
    './LifeHub.html',
    './FITNESS-CENTRE.html',
    './fitness-centre-training_deck.html',
    './fitness-centre-active_session.html',
    './fitness-centre-progress_tracker.html',
    './fitness-centre-measurement.html',
    './fitness-centre-gallery.html',
    './fitness-centre-calendar.html',
    './fitness-centre-history_log.html',
    './fitness-centre-exercise_index.html',
    './js/core.js'
];

// 1. INSTALL: Cache the files
self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching all: app shell and content');
            return cache.addAll(filesToCache);
        })
    );
});

// 2. FETCH: Network First, Fallback to Cache
// (This ensures you see code updates immediately when online, but still works when offline)
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request).catch(() => {
            return caches.match(e.request);
        })
    );
});

// 3. ACTIVATE: Clean up old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
});