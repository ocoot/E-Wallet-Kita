const CACHE_NAME = "ewk-cache-v1";
const OFFLINE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png"
];

// Install Event - Pre-cache core shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Pre-caching offline shell");
      return cache.addAll(OFFLINE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Dynamic caching strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip POST, PUT, DELETE requests and non-http(s) requests (e.g. chrome-extension://)
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) {
    return;
  }

  // Bypass API requests and Supabase endpoints to ensure real-time financial data accuracy
  if (url.pathname.startsWith("/api") || url.hostname.includes("supabase.co")) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({ error: "Offline. Sinyal terputus atau offline." }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      })
    );
    return;
  }

  // Handle SPA navigation requests - serve /index.html if offline so React Router can handle routing
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match("/index.html") || caches.match("/");
      })
    );
    return;
  }

  // Cache-First with Network Fallback strategy for static files (assets, images, fonts)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached version, but optionally fetch fresh one in the background
        fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {/* Ignore background sync failures */});
        
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        // Dynamically cache newly fetched static assets
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback for missing images/resources when offline
        if (request.url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
          return caches.match("/logo.png");
        }
      });
    })
  );
});
