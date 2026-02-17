// ============================================
// Configuration
// ============================================
const API_BASE_URL = 'http://localhost:8000';
const UPDATE_INTERVAL = 2000; // Update setiap 2 detik

// ============================================
// State Management
// ============================================
let currentTheme = 'light';
let map = null;
let markers = [];
let trajectoryChart = null;
let speedChart = null;
let currentTrack = 'A';
let selectedImageFilename = null;

// Admin Auth State
let isAdminLoggedIn = false;

// Credentials (untuk produksi, validasi sebaiknya di backend)
const ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'asv2025'
};

// ============================================
// Initialize App
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initTabs();
    initMap();
    initCharts();
    loadAdminState();
    startDataUpdate();
    initEventListeners();
    loadGallery();

    // Restore sesi admin jika ada
    if (sessionStorage.getItem('adminLoggedIn') === 'true') {
        isAdminLoggedIn = true;
        document.getElementById('adminBadge').style.display = 'inline';
    }
});

// ============================================
// Theme Management
// ============================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

function setTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const themeIcon = document.querySelector('.theme-icon');
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';

    // Ganti title image sesuai tema
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        headerTitle.src = theme === 'dark'
            ? 'assets/title-dark.png'
            : 'assets/title-light.png';
    }
}

function toggleTheme() {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);

    // Update theme di backend juga
    updateAdminState({ theme: newTheme });
}

// ============================================
// Tab Navigation
// ============================================
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');

            // Jika klik tab admin dan belum login, tampilkan modal login
            if (targetTab === 'admin' && !isAdminLoggedIn) {
                openAdminLoginModal();
                return;
            }

            // Remove active class from all
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to selected
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');

            // Refresh map jika tab monitoring/map dibuka
            if (targetTab === 'monitoring' && map) {
                setTimeout(() => map.invalidateSize(), 100);
            }
        });
    });
}

// ============================================
// Admin Login / Logout
// ============================================
function openAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminLoginError').textContent = '';
    modal.classList.add('active');
    setTimeout(() => document.getElementById('adminUsername').focus(), 100);
}

function closeAdminLoginModal() {
    const modal = document.getElementById('adminLoginModal');
    modal.classList.remove('active');
}

function handleAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    const errorEl = document.getElementById('adminLoginError');
    const box = document.querySelector('.admin-login-box');

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        isAdminLoggedIn = true;
        sessionStorage.setItem('adminLoggedIn', 'true');
        closeAdminLoginModal();

        // Pindah ke tab admin
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelector('[data-tab="admin"]').classList.add('active');
        document.getElementById('admin').classList.add('active');

        // Tampilkan badge aktif
        document.getElementById('adminBadge').style.display = 'inline';

        showNotification('Login berhasil! Selamat datang, Admin.', 'success');
    } else {
        errorEl.textContent = 'Username atau password salah!';
        // Animasi shake
        box.classList.remove('shake');
        void box.offsetWidth; // reflow
        box.classList.add('shake');
        setTimeout(() => box.classList.remove('shake'), 500);
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminPassword').focus();
    }
}

function handleAdminLogout() {
    isAdminLoggedIn = false;
    sessionStorage.removeItem('adminLoggedIn');
    document.getElementById('adminBadge').style.display = 'none';

    // Kembali ke tab monitoring
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="monitoring"]').classList.add('active');
    document.getElementById('monitoring').classList.add('active');

    showNotification('Anda telah logout dari Admin.', 'info');
}

// ============================================
// Map Initialization
// ============================================
function initMap() {
    // Initialize Leaflet map
    const defaultLat = -7.0476;
    const defaultLon = 110.4418;

    map = L.map('map').setView([defaultLat, defaultLon], 18);

    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Load initial track
    loadTrackData(currentTrack);
}

async function loadTrackData(track) {
    try {
        const response = await fetch(`${API_BASE_URL}/uploads/lintasan_${track.toLowerCase()}.csv`);
        const csvText = await response.text();

        // Parse CSV
        const lines = csvText.split('\n').slice(1); // Skip header
        const waypoints = [];

        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];

        lines.forEach(line => {
            if (!line.trim()) return;

            const [lat, lon, type, round, rotation] = line.split(',');
            const latNum = parseFloat(lat);
            const lonNum = parseFloat(lon);

            if (isNaN(latNum) || isNaN(lonNum)) return;

            waypoints.push([latNum, lonNum]);

            // Create marker with custom icon based on type
            let markerColor = 'blue';
            let markerIcon = '📍';

            if (type.includes('red')) {
                markerColor = 'red';
                markerIcon = '🔴';
            } else if (type.includes('green')) {
                markerColor = 'green';
                markerIcon = '🟢';
            } else if (type.includes('blue')) {
                markerColor = 'blue';
                markerIcon = '🔵';
            }

            const marker = L.marker([latNum, lonNum], {
                icon: L.divIcon({
                    className: 'custom-marker',
                    html: `<div style="font-size: 20px;">${markerIcon}</div>`,
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(map);

            marker.bindPopup(`
                <strong>${type}</strong><br>
                Round: ${round}<br>
                Lat: ${latNum.toFixed(6)}<br>
                Lon: ${lonNum.toFixed(6)}
            `);

            markers.push(marker);
        });

        // Draw route line
        if (waypoints.length > 0) {
            L.polyline(waypoints, {
                color: '#0071e3',
                weight: 3,
                opacity: 0.7,
                dashArray: '10, 5'
            }).addTo(map);

            // Fit map to show all markers
            map.fitBounds(waypoints);
        }

    } catch (error) {
        console.error('Error loading track data:', error);
        showNotification('Failed to load track data', 'error');
    }
}

// ============================================
// Charts Initialization
// ============================================
function initCharts() {
    // Trajectory Chart
    const trajectoryCtx = document.getElementById('trajectoryChart');
    if (trajectoryCtx) {
        trajectoryChart = new Chart(trajectoryCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'X Position',
                    data: [],
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.1)',
                    tension: 0.4
                }, {
                    label: 'Y Position',
                    data: [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'ASV Position Trajectory'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false
                    }
                }
            }
        });
    }

    // Speed Chart
    const speedCtx = document.getElementById('speedChart');
    if (speedCtx) {
        speedChart = new Chart(speedCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Speed (knots)',
                    data: [],
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'Speed Over Time'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

function updateCharts() {
    // Simulate data update untuk demo
    const now = new Date().toLocaleTimeString();

    if (trajectoryChart) {
        if (trajectoryChart.data.labels.length > 20) {
            trajectoryChart.data.labels.shift();
            trajectoryChart.data.datasets[0].data.shift();
            trajectoryChart.data.datasets[1].data.shift();
        }

        trajectoryChart.data.labels.push(now);
        trajectoryChart.data.datasets[0].data.push(Math.random() * 10 - 5);
        trajectoryChart.data.datasets[1].data.push(Math.random() * 10 - 5);
        trajectoryChart.update('none');
    }

    if (speedChart) {
        if (speedChart.data.labels.length > 20) {
            speedChart.data.labels.shift();
            speedChart.data.datasets[0].data.shift();
        }

        speedChart.data.labels.push(now);
        speedChart.data.datasets[0].data.push(Math.random() * 5 + 2);
        speedChart.update('none');
    }
}

// ============================================
// Admin State Management
// ============================================
async function loadAdminState() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/state`);
        const state = await response.json();

        // Update UI dengan state dari backend
        setTheme(state.theme);
        currentTrack = state.defaultTrack;

        // Update CV counts
        document.getElementById('cvRed').textContent = state.cv_counts.red;
        document.getElementById('cvGreen').textContent = state.cv_counts.green;
        document.getElementById('cvTrack').textContent = state.cv_counts.track;

        // Update admin form
        document.getElementById('adminTheme').value = state.theme;
        document.getElementById('adminTrack').value = state.defaultTrack;
        document.getElementById('adminRed').value = state.cv_counts.red;
        document.getElementById('adminGreen').value = state.cv_counts.green;
        document.getElementById('adminTrackCount').value = state.cv_counts.track;

        // Update track selector
        document.getElementById('trackSelector').value = state.defaultTrack;

        // Update info kapal di card
        const shipTrackInfo = document.getElementById('shipTrackInfo');
        if (shipTrackInfo) {
            shipTrackInfo.textContent = `Lintasan ${state.defaultTrack}`;
        }

        updateConnectionStatus(true);
    } catch (error) {
        console.error('Error loading admin state:', error);
        updateConnectionStatus(false);
    }
}

async function updateAdminState(updates) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });

        const result = await response.json();

        if (result.status === 'success') {
            showNotification('Settings updated successfully', 'success');
            loadAdminState(); // Reload state
        }
    } catch (error) {
        console.error('Error updating admin state:', error);
        showNotification('Failed to update settings', 'error');
    }
}

// ============================================
// Gallery Management
// ============================================
async function loadGallery() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/images`);
        const data = await response.json();

        const galleryGrid = document.getElementById('galleryGrid');
        galleryGrid.innerHTML = '';

        if (data.images.length === 0) {
            galleryGrid.innerHTML = `
                <div class="gallery-empty">
                    <span class="gallery-empty-icon">📷</span>
                    <p>No images captured yet</p>
                </div>
            `;
            return;
        }

        data.images.forEach(filename => {
            const item = document.createElement('div');
            item.className = 'gallery-item';
            item.innerHTML = `
                <img src="${API_BASE_URL}/uploads/${filename}" alt="${filename}">
                <div class="gallery-item-overlay">
                    <p>${filename}</p>
                </div>
            `;

            item.addEventListener('click', () => openImageModal(filename));
            galleryGrid.appendChild(item);
        });

    } catch (error) {
        console.error('Error loading gallery:', error);
    }
}

function openImageModal(filename) {
    selectedImageFilename = filename;
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');

    modalImage.src = `${API_BASE_URL}/uploads/${filename}`;
    modal.classList.add('active');
}

function closeImageModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.remove('active');
    selectedImageFilename = null;
}

async function deleteImage(filename) {
    if (!confirm(`Delete ${filename}?`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/images/${filename}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.status === 'success') {
            showNotification('Image deleted successfully', 'success');
            closeImageModal();
            loadGallery();
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        showNotification('Failed to delete image', 'error');
    }
}

async function clearAllImages() {
    if (!confirm('Delete all images? This action cannot be undone.')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/images/all/clear`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.status === 'success') {
            showNotification(`${result.deleted_count} images deleted`, 'success');
            loadGallery();
        }
    } catch (error) {
        console.error('Error clearing gallery:', error);
        showNotification('Failed to clear gallery', 'error');
    }
}

// ============================================
// File Upload
// ============================================
async function uploadFile(file, type = 'csv') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    try {
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.status === 'success') {
            showNotification(`File ${result.filename} uploaded successfully`, 'success');

            // Jika CSV track, reload map
            if (type === 'csv') {
                loadTrackData(currentTrack);
            }
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        showNotification('Failed to upload file', 'error');
    }
}

// ============================================
// Sensor Data Simulation
// ============================================
function updateSensorData() {
    // Simulate sensor readings
    const now = new Date();

    document.getElementById('heading').textContent = `${Math.floor(Math.random() * 360)}°`;
    document.getElementById('speed').textContent = `${(Math.random() * 5 + 2).toFixed(1)} kts`;
    document.getElementById('temperature').textContent = `${(Math.random() * 5 + 28).toFixed(1)}°C`;
    document.getElementById('humidity').textContent = `${Math.floor(Math.random() * 20 + 60)}%`;
    document.getElementById('latitude').textContent = `${(-7.047 + Math.random() * 0.001).toFixed(6)}`;
    document.getElementById('longitude').textContent = `${(110.441 + Math.random() * 0.001).toFixed(6)}`;
    document.getElementById('updateTime').textContent = `Updated: ${now.toLocaleTimeString()}`;
}

// ============================================
// Auto Update
// ============================================
function startDataUpdate() {
    // Update sensor data
    setInterval(() => {
        updateSensorData();
        updateCharts();
    }, UPDATE_INTERVAL);

    // Initial update
    updateSensorData();
}

// ============================================
// Event Listeners
// ============================================
function initEventListeners() {
    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    // Track selector
    document.getElementById('trackSelector').addEventListener('change', (e) => {
        currentTrack = e.target.value;
        loadTrackData(currentTrack);
    });

    // ── Admin Login Modal ──────────────────────────
    document.getElementById('adminLoginBtn').addEventListener('click', handleAdminLogin);
    document.getElementById('adminLoginCancel').addEventListener('click', closeAdminLoginModal);

    // Klik backdrop untuk tutup modal
    document.getElementById('adminLoginModal').addEventListener('click', (e) => {
        if (e.target.id === 'adminLoginModal') closeAdminLoginModal();
    });

    // Enter key di form login
    ['adminUsername', 'adminPassword'].forEach(id => {
        document.getElementById(id).addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleAdminLogin();
        });
    });

    // ── Admin Logout ──────────────────────────────
    document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);

    // Admin - Save Settings
    document.getElementById('saveAdminSettings').addEventListener('click', () => {
        const updates = {
            theme: document.getElementById('adminTheme').value,
            defaultTrack: document.getElementById('adminTrack').value,
            cv_counts: {
                red: parseInt(document.getElementById('adminRed').value),
                green: parseInt(document.getElementById('adminGreen').value),
                track: parseInt(document.getElementById('adminTrackCount').value)
            }
        };

        updateAdminState(updates);
    });

    // Admin - Reset Settings
    document.getElementById('resetAdminSettings').addEventListener('click', () => {
        if (confirm('Reset all settings to default?')) {
            const defaults = {
                theme: 'light',
                defaultTrack: 'A',
                cv_counts: {
                    red: 0,
                    green: 0,
                    track: 0
                }
            };

            updateAdminState(defaults);
        }
    });

    // CSV File Upload
    document.getElementById('csvFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadFile(file, 'csv');
            e.target.value = ''; // Reset input
        }
    });

    // Gallery - Refresh
    document.getElementById('refreshGallery').addEventListener('click', loadGallery);

    // Gallery - Clear All
    document.getElementById('clearGallery').addEventListener('click', clearAllImages);

    // Modal - Close
    document.querySelector('.modal-close').addEventListener('click', closeImageModal);

    // Modal - Delete Image
    document.getElementById('deleteImageBtn').addEventListener('click', () => {
        if (selectedImageFilename) {
            deleteImage(selectedImageFilename);
        }
    });

    // Modal - Click outside to close
    document.getElementById('imageModal').addEventListener('click', (e) => {
        if (e.target.id === 'imageModal') {
            closeImageModal();
        }
    });
}

// ============================================
// Helper Functions
// ============================================
function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connectionStatus');
    if (connected) {
        statusElement.textContent = 'Connected';
        statusElement.className = 'status-connected';
    } else {
        statusElement.textContent = 'Disconnected';
        statusElement.className = 'status-disconnected';
    }
}

function showNotification(message, type = 'info') {
    // Simple notification (bisa diganti dengan library toast yang lebih bagus)
    const colors = {
        success: '#34c759',
        error: '#ff3b30',
        info: '#0071e3',
        warning: '#ff9500'
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Add animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);