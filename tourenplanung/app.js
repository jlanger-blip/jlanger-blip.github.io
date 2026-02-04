// === Configuration ===
// API-Server läuft auf dem Moltbot-Server Port 8086
// Für lokale Entwicklung: http://localhost:8086
// Für Produktion über SSH-Tunnel oder VPN: Anpassen
const API_BASE = (() => {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
        return 'http://localhost:8086';
    }
    // Produktion: Moltbot Server
    return 'http://89.167.23.45:8086';
})();

let refreshTimer = null;
let currentAppointments = [];
let settings = {
    autoAcceptWindow: 30,
    refreshInterval: 30
};

// === Initialization ===
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initKWSelector();
    loadSettings();
    refreshStatus();
    startAutoRefresh();
});

// === Theme Management ===
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    document.getElementById('themeToggle').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

// === KW Selector ===
function initKWSelector() {
    const select = document.getElementById('kwSelect');
    const currentDate = new Date();
    const currentKW = getWeekNumber(currentDate);
    
    // Generate KW options for current year
    for (let kw = 1; kw <= 52; kw++) {
        const option = document.createElement('option');
        option.value = kw;
        option.textContent = `KW ${kw}`;
        if (kw === currentKW) {
            option.selected = true;
        }
        select.appendChild(option);
    }
    
    select.addEventListener('change', () => {
        refreshStatus();
    });
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// === Settings ===
function loadSettings() {
    const saved = localStorage.getItem('tourenplanung_settings');
    if (saved) {
        settings = JSON.parse(saved);
        document.getElementById('autoAcceptWindow').value = settings.autoAcceptWindow;
        document.getElementById('refreshInterval').value = settings.refreshInterval;
    }
}

function saveSettings() {
    settings.autoAcceptWindow = parseInt(document.getElementById('autoAcceptWindow').value) || 30;
    settings.refreshInterval = parseInt(document.getElementById('refreshInterval').value) || 30;
    
    localStorage.setItem('tourenplanung_settings', JSON.stringify(settings));
    
    // Update auto-refresh
    startAutoRefresh();
    
    // Send to server
    apiCall('/api/settings', 'POST', settings)
        .then(() => showToast('Einstellungen gespeichert', 'success'))
        .catch(() => showToast('Fehler beim Speichern', 'error'));
}

// === Auto Refresh ===
function startAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    
    if (settings.refreshInterval > 0) {
        refreshTimer = setInterval(refreshStatus, settings.refreshInterval * 1000);
    }
}

// === API Calls ===
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(API_BASE + endpoint, options);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
}

// === Refresh Status ===
async function refreshStatus() {
    const connectionStatus = document.getElementById('connectionStatus');
    
    try {
        const selectedKW = document.getElementById('kwSelect').value;
        const data = await apiCall(`/api/status?kw=${selectedKW}`);
        
        // Update connection status
        connectionStatus.className = 'connection-status connected';
        connectionStatus.querySelector('.status-text').textContent = 'Verbunden';
        
        // Update stats
        updateStats(data);
        
        // Update workflow phase
        updateWorkflowPhase(data.phase || 0, data.workflowStatus || 'inactive');
        
        // Update appointments
        currentAppointments = data.appointments || [];
        updateAppointmentsTable(currentAppointments);
        
        // Update technician filter
        updateTechnicianFilter(currentAppointments);
        
        // Update button states
        updateButtonStates(data.workflowStatus);
        
        // Update last update time
        document.getElementById('lastUpdate').textContent = 
            `Letztes Update: ${new Date().toLocaleTimeString('de-DE')}`;
            
    } catch (error) {
        console.error('Error fetching status:', error);
        connectionStatus.className = 'connection-status error';
        connectionStatus.querySelector('.status-text').textContent = 'Offline';
        
        // Show demo data when offline
        showDemoData();
    }
}

function showDemoData() {
    // Show demo data for UI preview (echte Techniker-Namen!)
    const demoAppointments = [
        { id: 1, technician: 'Anton Lay', customer: 'P.H.G. GmbH / BEACHCLUB COLOGNE', date: '2026-02-03', time: '08:30', status: 'confirmed' },
        { id: 2, technician: 'Anton Lay', customer: 'Vonovia Engineering GmbH', date: '2026-02-03', time: '13:00', status: 'pending' },
        { id: 3, technician: 'Julian Gottwald', customer: 'Autohaus Schmidt', date: '2026-02-03', time: '09:00', status: 'pending' },
        { id: 4, technician: 'Mehmet Hattatuglu', customer: 'Stadtwerke Frankfurt', date: '2026-02-04', time: '09:00', status: 'confirmed' },
        { id: 5, technician: 'Jason Heidrich', customer: 'Klinikum Erfurt', date: '2026-02-04', time: '10:00', status: 'pending' },
        { id: 6, technician: 'Stefan Höfer', customer: 'Industriepark Siegen', date: '2026-02-05', time: '08:00', status: 'pending' },
    ];
    
    currentAppointments = demoAppointments;
    
    document.getElementById('statPending').textContent = '4';
    document.getElementById('statConfirmed').textContent = '2';
    document.getElementById('statRejected').textContent = '0';
    document.getElementById('statTotal').textContent = '6';
    
    updateAppointmentsTable(demoAppointments);
    updateTechnicianFilter(demoAppointments);
}

// === Update Functions ===
function updateStats(data) {
    const appointments = data.appointments || [];
    
    const pending = appointments.filter(a => a.status === 'pending').length;
    const confirmed = appointments.filter(a => a.status === 'confirmed').length;
    const rejected = appointments.filter(a => a.status === 'rejected').length;
    
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statConfirmed').textContent = confirmed;
    document.getElementById('statRejected').textContent = rejected;
    document.getElementById('statTotal').textContent = appointments.length;
}

function updateWorkflowPhase(phase, status) {
    const phaseItems = document.querySelectorAll('.phase-item');
    
    phaseItems.forEach((item, index) => {
        item.classList.remove('active', 'completed');
        
        if (index + 1 < phase) {
            item.classList.add('completed');
        } else if (index + 1 === phase) {
            item.classList.add('active');
        }
    });
    
    const statusText = document.getElementById('workflowStatusText');
    statusText.className = 'workflow-status-text';
    
    switch (status) {
        case 'running':
            statusText.textContent = '▶️ Workflow läuft...';
            statusText.classList.add('running');
            break;
        case 'paused':
            statusText.textContent = '⏸️ Pausiert';
            statusText.classList.add('paused');
            break;
        case 'completed':
            statusText.textContent = '✅ Abgeschlossen';
            break;
        default:
            statusText.textContent = '⏹️ Inaktiv';
    }
}

function updateButtonStates(status) {
    const btnStart = document.getElementById('btnStart');
    const btnPause = document.getElementById('btnPause');
    const btnStop = document.getElementById('btnStop');
    
    switch (status) {
        case 'running':
            btnStart.disabled = true;
            btnPause.disabled = false;
            btnStop.disabled = false;
            break;
        case 'paused':
            btnStart.disabled = false;
            btnStart.querySelector('.btn-icon').textContent = '▶️';
            btnPause.disabled = true;
            btnStop.disabled = false;
            break;
        default:
            btnStart.disabled = false;
            btnStart.querySelector('.btn-icon').textContent = '▶️';
            btnPause.disabled = true;
            btnStop.disabled = true;
    }
}

function updateTechnicianFilter(appointments) {
    const select = document.getElementById('filterTechnician');
    const currentValue = select.value;
    
    // Get unique technicians
    const technicians = [...new Set(appointments.map(a => a.technician))].sort();
    
    // Clear and rebuild options
    select.innerHTML = '<option value="">Alle Techniker</option>';
    
    technicians.forEach(tech => {
        const option = document.createElement('option');
        option.value = tech;
        option.textContent = tech;
        select.appendChild(option);
    });
    
    // Restore selection if still valid
    if (technicians.includes(currentValue)) {
        select.value = currentValue;
    }
}

function updateAppointmentsTable(appointments) {
    const tbody = document.getElementById('appointmentsBody');
    
    if (appointments.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">Keine Termine vorhanden</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = appointments.map(apt => `
        <tr data-id="${apt.id}">
            <td>${escapeHtml(apt.technician)}</td>
            <td>${escapeHtml(apt.customer)}</td>
            <td>${formatDate(apt.date)}</td>
            <td>${apt.time}</td>
            <td>
                <span class="status-badge ${apt.status}">
                    ${getStatusIcon(apt.status)} ${getStatusText(apt.status)}
                </span>
            </td>
            <td>
                <div class="row-actions">
                    ${apt.status === 'pending' ? `
                        <button class="btn btn-sm btn-success" onclick="confirmAppointment(${apt.id})" title="Bestätigen">✅</button>
                        <button class="btn btn-sm btn-danger" onclick="rejectAppointment(${apt.id})" title="Ablehnen">❌</button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// === Filters ===
function applyFilters() {
    const techFilter = document.getElementById('filterTechnician').value;
    const statusFilter = document.getElementById('filterStatus').value;
    
    let filtered = currentAppointments;
    
    if (techFilter) {
        filtered = filtered.filter(a => a.technician === techFilter);
    }
    
    if (statusFilter) {
        filtered = filtered.filter(a => a.status === statusFilter);
    }
    
    updateAppointmentsTable(filtered);
}

// === Workflow Actions ===
async function workflowAction(action) {
    try {
        const selectedKW = document.getElementById('kwSelect').value;
        await apiCall(`/api/workflow/${action}`, 'POST', { kw: selectedKW });
        showToast(`Workflow ${getActionText(action)}`, 'success');
        refreshStatus();
    } catch (error) {
        showToast(`Fehler: ${error.message}`, 'error');
    }
}

function getActionText(action) {
    switch (action) {
        case 'start': return 'gestartet';
        case 'pause': return 'pausiert';
        case 'stop': return 'gestoppt';
        default: return action;
    }
}

// === Appointment Actions ===
async function confirmAppointment(id) {
    showConfirmModal(
        'Termin bestätigen',
        'Möchten Sie diesen Termin wirklich bestätigen?',
        async () => {
            try {
                await apiCall('/api/confirm', 'POST', { appointmentId: id });
                showToast('Termin bestätigt', 'success');
                refreshStatus();
            } catch (error) {
                showToast(`Fehler: ${error.message}`, 'error');
            }
        }
    );
}

async function rejectAppointment(id) {
    showConfirmModal(
        'Termin ablehnen',
        'Möchten Sie diesen Termin wirklich ablehnen?',
        async () => {
            try {
                await apiCall('/api/reject', 'POST', { appointmentId: id });
                showToast('Termin abgelehnt', 'success');
                refreshStatus();
            } catch (error) {
                showToast(`Fehler: ${error.message}`, 'error');
            }
        }
    );
}

// === Modal ===
let modalCallback = null;

function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalMessage').textContent = message;
    modalCallback = onConfirm;
    modal.classList.add('active');
    
    document.getElementById('modalConfirmBtn').onclick = () => {
        closeModal();
        if (modalCallback) modalCallback();
    };
}

function closeModal() {
    document.getElementById('confirmModal').classList.remove('active');
    modalCallback = null;
}

// Close modal on outside click
document.getElementById('confirmModal').addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') {
        closeModal();
    }
});

// === Toast ===
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span>${getToastIcon(type)}</span>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getToastIcon(type) {
    switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        default: return 'ℹ️';
    }
}

// === Helpers ===
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit'
    });
}

function getStatusIcon(status) {
    switch (status) {
        case 'confirmed': return '✅';
        case 'rejected': return '❌';
        case 'pending': return '⏳';
        default: return '❓';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'confirmed': return 'Bestätigt';
        case 'rejected': return 'Abgesagt';
        case 'pending': return 'Wartend';
        default: return 'Unbekannt';
    }
}

// === Keyboard Shortcuts ===
document.addEventListener('keydown', (e) => {
    // Escape closes modal
    if (e.key === 'Escape') {
        closeModal();
    }
    
    // R = Refresh
    if (e.key === 'r' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT') {
        refreshStatus();
    }
});
