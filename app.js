// === Configuration ===
const CONFIG = {
    FIREBASE_CONFIG: {
            apiKey: "AIzaSyCO60FWOusczlcwS8aTXWPs_9QJTa1fBC4",
            authDomain: "gym4-nutrition.firebaseapp.com",
          databaseURL: "https://gym4-nutrition-default-rtdb.europe-west1.firebasedatabase.app",
          projectId: "gym4-nutrition",
          storageBucket: "gym4-nutrition.firebasestorage.app",
          messagingSenderId: "836431470907",
          appId: "1:836431470907:web:950d25ce704af4c2b0171e"
    },
    ADMIN_PIN: '1312',
    AUTO_REFRESH_INTERVAL: 60000, // 2 minutes
};


// === Initial Data ===
const INITIAL_CLASSES = [
    { id: '1a', className: '1-А', shift: 1, teacherName: 'Мельник О.М.', pin: '1111' },
    { id: '2b', className: '2-Б', shift: 1, teacherName: 'Коваль С.І.', pin: '2222' },
    { id: '5c', className: '5-В', shift: 1, teacherName: 'Бондар Ю.В.', pin: '5555' },
    { id: '6a', className: '6-А', shift: 2, teacherName: 'Шевченко Т.Г.', pin: '6666' },
    { id: '9b', className: '9-Б', shift: 2, teacherName: 'Франко І.Я.', pin: '9999' },
];

// === State Management ===
const state = {
    role: 'NONE',
    isAuthenticated: false,
    authClassId: null,
    classes: [],
    reports: [],
    history: [],
    canteenPin: '5555',
    isLoading: true,
    isOnline: true,
    autoRefreshTimer: null,
};

// === Firebase Database ===
let db = null;

function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK not loaded');
        return false;
    }
    try {
        firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        db = firebase.database();
        return true;
    } catch (e) {
        console.error('Firebase init error:', e);
        return false;
    }
}

// === API Layer ===
const api = {
    async getClasses() {
        try {
            if (!db) throw new Error('Firebase not initialized');
            const snapshot = await db.ref('classes').once('value');
            const data = snapshot.val();
            return data ? Object.values(data) : [];
        } catch (e) {
            console.warn('Backend offline, using local cache');
            const cached = localStorage.getItem('gym4_classes');
            return cached ? JSON.parse(cached) : [];
        }
    },

    async saveClasses(classes) {
        localStorage.setItem('gym4_classes', JSON.stringify(classes));
        try {
            if (!db) throw new Error('Firebase not initialized');
            await db.ref('classes').set(classes.reduce((acc, c) => ({ ...acc, [c.id]: c }), {}));
        } catch (e) {
            console.warn('Failed to sync classes to backend');
        }
    },

    async getReports(date) {
        try {
            if (!db) throw new Error('Firebase not initialized');
            const snapshot = await db.ref(`reports/${date}`).once('value');
            const data = snapshot.val();
            const reports = data ? Object.values(data) : [];
            // Зберегти в LocalStorage
            if (reports.length > 0) {
                localStorage.setItem(`gym4_reports_${date}`, JSON.stringify(reports));
            }
            return reports;
        } catch (e) {
            const cached = localStorage.getItem(`gym4_reports_${date}`);
            return cached ? JSON.parse(cached) : [];
        }
    },

    async getAllRecentReports(daysBack = 60) {
        try {
            if (!db) throw new Error('Firebase not initialized');
            
            // Отримати всі звіти за останні N днів
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - daysBack);
            
            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];
            
            const snapshot = await db.ref('reports')
                .orderByKey()
                .startAt(startDateStr)
                .endAt(endDateStr)
                .once('value');
            
            const data = snapshot.val();
            if (!data) return [];
            
            const allReports = [];
            Object.keys(data).forEach(date => {
                Object.values(data[date]).forEach(report => {
                    allReports.push(report);
                });
            });
            
            // Зберегти в LocalStorage по датах
            Object.keys(data).forEach(date => {
                const dateReports = Object.values(data[date]);
                localStorage.setItem(`gym4_reports_${date}`, JSON.stringify(dateReports));
            });
            
            return allReports;
        } catch (e) {
            console.warn('Failed to load recent reports, using cache');
            return [];
        }
    },

    async submitReport(report) {
        const date = report.date;
        
        // Оновити LocalStorage
        const existing = JSON.parse(localStorage.getItem(`gym4_reports_${date}`) || '[]');
        const filtered = existing.filter(r => !(r.classId === report.classId && r.date === report.date));
        const updated = [...filtered, report];
        localStorage.setItem(`gym4_reports_${date}`, JSON.stringify(updated));

        // Синхронізувати з Firebase
        try {
            if (!db) throw new Error('Firebase not initialized');
            await db.ref(`reports/${date}/${report.classId}`).set(report);
        } catch (e) {
            console.warn('Failed to sync report to backend');
        }
    },

    async getCanteenPin() {
        try {
            if (!db) throw new Error('Firebase not initialized');
            const snapshot = await db.ref('config/canteen_pin').once('value');
            return snapshot.val() || '5555';
        } catch (e) {
            return localStorage.getItem('gym4_canteen_pin') || '5555';
        }
    },

    async setCanteenPin(pin) {
        localStorage.setItem('gym4_canteen_pin', pin);
        try {
            if (!db) throw new Error('Firebase not initialized');
            await db.ref('config/canteen_pin').set(pin);
        } catch (e) {
            console.warn('Failed to sync canteen pin to backend');
        }
    }
};

// === Main App ===
const app = {
    init() {
        this.cleanupOldData();
        this.loadData();
        this.startAutoRefresh();
    },

    cleanupOldData() {
        try {
            const lastCleanup = localStorage.getItem('gym4_last_cleanup');
            const now = Date.now();
            const weekInMs = 7 * 24 * 60 * 60 * 1000;
            
            // Очищення раз на тиждень
            if (lastCleanup && (now - parseInt(lastCleanup)) < weekInMs) return;
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 90);
            const cutoffStr = cutoffDate.toISOString().split('T')[0];
            
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith('gym4_reports_')) {
                    const dateStr = key.replace('gym4_reports_', '');
                    if (dateStr < cutoffStr) localStorage.removeItem(key);
                }
            }
            
            localStorage.setItem('gym4_last_cleanup', now.toString());
        } catch (e) {
            console.warn('Cleanup failed:', e);
        }
    },

    async loadData() {
        const isAutoRefresh = !state.isLoading; // Перевірка чи це автооновлення
        const scrollPos = isAutoRefresh ? window.scrollY : 0; // Зберегти позицію
        
        state.isLoading = true;
        if (!isAutoRefresh) {
            this.updateOnlineStatus(true);
            this.render();
        }

        if (!db) {
            const initialized = initFirebase();
            if (!initialized) {
                console.warn('Firebase initialization failed, using offline mode');
                this.updateOnlineStatus(false);
            }
        }

        try {
            const [classes, pin] = await Promise.all([
                api.getClasses(),
                api.getCanteenPin()
            ]);

            state.classes = classes.length ? classes : INITIAL_CLASSES;
            state.canteenPin = pin;

            const today = this.getTodayISO();
            
            if (isAutoRefresh) {
                // Автооновлення - тільки сьогодні
                const todayReports = await api.getReports(today);
                state.reports = todayReports;
            } else {
                // Перше завантаження - історія за 60 днів
                const allReports = await api.getAllRecentReports(60);
                state.reports = allReports.filter(r => r.date === today);
                state.history = allReports.filter(r => r.date !== today);
            }

            this.updateOnlineStatus(true);
        } catch (e) {
            console.error('Failed to load data:', e);
            this.updateOnlineStatus(false);
        } finally {
            state.isLoading = false;
            if (isAutoRefresh) {
                this.updateContent(); // Оновити тільки контент
                window.scrollTo(0, scrollPos); // Повернути скрол
            } else {
                this.render();
            }
        }
    },

    updateContent() {
        // Оновлення тільки контенту без перебудови всієї сторінки
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;
        
        const currentScrollPos = window.scrollY;
        
        switch (state.role) {
            case 'TEACHER':
                mainContent.innerHTML = teacherView.render();
                break;
            case 'CANTEEN':
                mainContent.innerHTML = canteenView.render();
                canteenView.attachEvents();
                break;
            case 'ADMIN':
                mainContent.innerHTML = adminView.render();
                adminView.attachEvents();
                break;
        }
        
        window.scrollTo(0, currentScrollPos);
    },

    startAutoRefresh() {
        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
        }
        state.autoRefreshTimer = setInterval(() => {
            this.loadData();
        }, CONFIG.AUTO_REFRESH_INTERVAL);
    },

    updateOnlineStatus(isOnline) {
        state.isOnline = isOnline;
        const statusEl = document.getElementById('onlineStatus');
        if (statusEl) {
            statusEl.className = isOnline ? 'status online' : 'status offline';
            statusEl.innerHTML = isOnline
                ? '<svg class="icon-xs" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/></svg><span>CLOUD SYNC</span>'
                : '<svg class="icon-xs" viewBox="0 0 24 24"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z"/><line x1="4" y1="4" x2="20" y2="20"/></svg><span>OFFLINE</span>';
        }
    },

    getTodayISO() {
        return new Date().toISOString().split('T')[0];
    },

    getTodayUA() {
        return new Date().toLocaleDateString('uk-UA');
    },

    setRole(role) {
        state.role = role;
        state.isAuthenticated = false;
        state.authClassId = null;
        this.render();
    },

    handleAuthenticated(classId = null) {
        state.isAuthenticated = true;
        state.authClassId = classId;
        this.render();
    },

    logout() {
        state.role = 'NONE';
        state.isAuthenticated = false;
        state.authClassId = null;
        this.render();
    },

    render() {
        const mainContent = document.getElementById('mainContent');
        const headerActions = document.getElementById('headerActions');
        const roleBadge = document.getElementById('roleBadge');

        if (state.isLoading) {
            mainContent.innerHTML = this.renderLoading();
            headerActions.style.display = 'none';
            return;
        }

        if (state.role !== 'NONE' && state.isAuthenticated) {
            headerActions.style.display = 'flex';
            roleBadge.textContent = state.role === 'ADMIN' ? 'Адмін' : 
                                    state.role === 'CANTEEN' ? 'Їдальня' : 'Вчитель';
        } else {
            headerActions.style.display = 'none';
        }

        if (state.role !== 'NONE' && !state.isAuthenticated) {
            mainContent.innerHTML = this.renderLogin();
        } else {
            switch (state.role) {
                case 'TEACHER':
                    mainContent.innerHTML = teacherView.render();
                    break;
                case 'CANTEEN':
                    mainContent.innerHTML = canteenView.render();
                    canteenView.attachEvents();
                    break;
                case 'ADMIN':
                    mainContent.innerHTML = adminView.render();
                    adminView.attachEvents();
                    break;
                default:
                    mainContent.innerHTML = this.renderRoleSelector();
            }
        }

        const refreshIcon = document.getElementById('refreshIcon');
        if (refreshIcon && state.isLoading) {
            refreshIcon.style.animation = 'spin 1s linear infinite';
        } else if (refreshIcon) {
            refreshIcon.style.animation = '';
        }
    },

    renderLoading() {
        return `
            <div class="loading">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                </svg>
                <p>Завантаження даних...</p>
            </div>
        `;
    },

    renderRoleSelector() {
        return `
            <div class="role-selector">
                <div class="role-selector-header">
                    <h2>Оберіть ваш режим роботи</h2>
                    <p>Для доступу до функцій системи оберіть відповідну роль</p>
                </div>
                <div class="role-grid">
                    <div class="role-card teacher" onclick="app.setRole('TEACHER')">
                        <div class="role-icon">
                            <svg class="icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                        </div>
                        <h3>Класний керівник</h3>
                        <p>Подання щоденних заявок на харчування для класу</p>
                    </div>
                    <div class="role-card canteen" onclick="app.setRole('CANTEEN')">
                        <div class="role-icon">
                            <svg class="icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z"></path>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                            </svg>
                        </div>
                        <h3>Працівник їдальні</h3>
                        <p>Перегляд заявок за змінами та формування звітів</p>
                    </div>
                    <div class="role-card admin" onclick="app.setRole('ADMIN')">
                        <div class="role-icon">
                            <svg class="icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                        </div>
                        <h3>Адміністратор</h3>
                        <p>Керування списком класів та загальними звітами</p>
                    </div>
                </div>
            </div>
        `;
    },

    renderLogin() {
        return `
            <div class="login-container">
                <button class="back-btn" onclick="app.logout()">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    <span>Повернутись до вибору</span>
                </button>
                <div class="login-card">
                    <div class="login-header">
                        <div class="login-icon">
                            <svg class="icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                        </div>
                        <h2>Вхід у систему</h2>
                        <p>Введіть PIN для ${state.role === 'ADMIN' ? 'Адміна' : state.role === 'CANTEEN' ? 'Їдальні' : 'Вчителя'}</p>
                    </div>
                    <div class="pin-display">
                        <div class="pin-dot" id="pin1"></div>
                        <div class="pin-dot" id="pin2"></div>
                        <div class="pin-dot" id="pin3"></div>
                        <div class="pin-dot" id="pin4"></div>
                    </div>
                    <div class="keypad">
                        ${[1,2,3,4,5,6,7,8,9].map(n => 
                            `<button class="keypad-btn" onclick="login.addDigit('${n}')">${n}</button>`
                        ).join('')}
                        <button class="keypad-btn icon-btn" onclick="login.clear()">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                        </button>
                        <button class="keypad-btn" onclick="login.addDigit('0')">0</button>
                        <button class="keypad-btn icon-btn delete" onclick="login.backspace()">
                            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path>
                                <line x1="18" y1="9" x2="12" y2="15"></line>
                                <line x1="12" y1="9" x2="18" y2="15"></line>
                            </svg>
                        </button>
                    </div>
                    <div id="loginError"></div>
                </div>
            </div>
        `;
    }
};

// === Login Logic ===
const login = {
    pin: '',
    addDigit(digit) {
        if (this.pin.length < 4) {
            this.pin += digit;
            this.updateDisplay();
            if (this.pin.length === 4) this.verify();
        }
    },
    backspace() { this.pin = this.pin.slice(0, -1); this.updateDisplay(); },
    clear() { this.pin = ''; this.updateDisplay(); document.getElementById('loginError').innerHTML = ''; },
    updateDisplay() {
        for (let i = 1; i <= 4; i++) {
            const dot = document.getElementById(`pin${i}`);
            if (dot) dot.className = 'pin-dot' + (i <= this.pin.length ? ' filled' : '');
        }
    },
    verify() {
        let isValid = false, foundClassId = null;
        if (state.role === 'ADMIN') isValid = this.pin === CONFIG.ADMIN_PIN;
        else if (state.role === 'CANTEEN') isValid = this.pin === state.canteenPin;
        else if (state.role === 'TEACHER') {
            const found = state.classes.find(c => c.pin === this.pin);
            if (found) { isValid = true; foundClassId = found.id; }
        }
        if (isValid) { this.pin = ''; app.handleAuthenticated(foundClassId); }
        else this.showError();
    },
    showError() {
        for (let i = 1; i <= 4; i++) {
            const dot = document.getElementById(`pin${i}`);
            if (dot) dot.className = 'pin-dot error';
        }
        document.getElementById('loginError').innerHTML = '<p class="error-message">Невірний PIN-код</p>';
        setTimeout(() => { this.pin = ''; this.updateDisplay(); document.getElementById('loginError').innerHTML = ''; }, 1000);
    }
};

// === Teacher View ===
const teacherView = {
    formData: { total: 0, actual: 0, eating: 0, teacherEating: false },
    submitted: false,
    render() {
        const selectedClass = state.classes.find(c => c.id === state.authClassId);
        if (!selectedClass) return '<div class="loading"><p>Помилка авторизації класу</p></div>';
        const todayISO = app.getTodayISO();
        const todayUA = app.getTodayUA();
        const existingReport = state.reports.find(r => r.classId === state.authClassId && r.date === todayISO);
        if (existingReport) {
            this.formData = { total: existingReport.totalStudents, actual: existingReport.actualStudents, 
                eating: existingReport.eatingStudents, teacherEating: existingReport.teacherEating };
        }
        return `<div class="teacher-container"><div class="report-card"><div class="report-header">
            <h3><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9l2 2 4-4"></path></svg> Заявка: ${selectedClass.className}</h3>
            <span>${todayUA}</span></div><form class="report-form" onsubmit="teacherView.handleSubmit(event)">
            <div class="teacher-info"><label>Класний керівник</label><div class="teacher-name">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            ${selectedClass.teacherName}</div></div><div class="form-grid">
            <div class="form-field"><label>Всього в класі</label><input type="number" min="0" required value="${this.formData.total || ''}" oninput="teacherView.updateField('total', this.value)"></div>
            <div class="form-field"><label>Фактично присутні</label><input type="number" min="0" required value="${this.formData.actual || ''}" oninput="teacherView.updateField('actual', this.value)"></div>
            <div class="form-field eating"><label class="eating">Будуть їсти</label><input type="number" min="0" required value="${this.formData.eating || ''}" oninput="teacherView.updateField('eating', this.value)"></div>
            </div><div class="checkbox-field"><input type="checkbox" id="teacherEating" ${this.formData.teacherEating ? 'checked' : ''} onchange="teacherView.updateField('teacherEating', this.checked)">
            <label for="teacherEating">Я (класний керівник) також буду харчуватися</label></div>
            <button type="submit" class="submit-btn${this.submitted ? ' success' : ''}">
            ${this.submitted ? '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg><span>Оновлено!</span>' : '<span>Відправити заявку</span>'}
            </button></form>${existingReport ? `<div class="report-notice">Ви вже подали заявку сьогодні о ${new Date(existingReport.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}. Повторне відправлення оновить дані.</div>` : ''}</div></div>`;
    },
    updateField(field, value) {
        if (field === 'teacherEating') this.formData[field] = value;
        else this.formData[field] = parseInt(value) || 0;
    },
    async handleSubmit(e) {
        e.preventDefault();
        const selectedClass = state.classes.find(c => c.id === state.authClassId);
        if (!selectedClass) return;
        const report = { id: Math.random().toString(36).substr(2, 9), classId: selectedClass.id, date: app.getTodayISO(),
            totalStudents: this.formData.total, actualStudents: this.formData.actual, eatingStudents: this.formData.eating,
            teacherEating: this.formData.teacherEating, teacherName: selectedClass.teacherName, timestamp: Date.now() };
        state.reports = state.reports.filter(r => !(r.classId === report.classId && r.date === report.date));
        state.reports.push(report);
        await api.submitReport(report);
        this.submitted = true;
        app.render();
        setTimeout(() => { this.submitted = false; app.render(); }, 3000);
    }
};

// === Canteen View ===
const canteenView = {
    activeShift: 1, viewMode: 'grid', selectedDate: app.getTodayISO(),
    render() {
        const allReports = [...state.reports, ...state.history];
        const currentReports = allReports.filter(r => {
            const classInfo = state.classes.find(c => c.id === r.classId);
            return classInfo && r.date === this.selectedDate && (this.activeShift === 0 || classInfo.shift === this.activeShift);
        });
        return `<div class="view-container"><div class="view-controls no-print"><div class="controls-left">
            <div class="btn-group">${[1,2,0].map(s => `<button class="${this.activeShift === s ? 'active' : ''}" onclick="canteenView.setShift(${s})">
            ${s === 0 ? 'Усі класи' : s + ' зміна'}</button>`).join('')}</div>
            <div class="date-picker"><button onclick="canteenView.changeMonth(-1)"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
            <input type="date" value="${this.selectedDate}" onchange="canteenView.setDate(this.value)">
            <button onclick="canteenView.changeMonth(1)"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="9 18 15 12 9 6"></polyline></svg></button></div>
            <div class="btn-group">${['grid','report','month'].map(m => `<button class="${this.viewMode === m ? 'active' : ''}" onclick="canteenView.setViewMode('${m}')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">${m === 'grid' ? '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>' : m === 'report' ? '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"></path>' : '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>'}</svg>
            </button>`).join('')}</div></div><div class="controls-right">
            <button class="btn btn-success" onclick="canteenView.exportCSV()"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg><span>Завантажити звіт</span></button>
            <button class="btn btn-primary" onclick="canteenView.viewMode==='month'?canteenView.printMonthly():window.print()"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg><span>Друк</span></button>
            </div></div>${this.viewMode === 'grid' ? this.renderGrid(currentReports) : this.renderReport(currentReports, allReports)}</div>`;
    },
    renderGrid(reports) {
        return `<div class="class-grid no-print">${state.classes.filter(c => this.activeShift === 0 || c.shift === this.activeShift).sort((a,b) => a.className.localeCompare(b.className, 'uk')).map(c => {
            const report = reports.find(r => r.classId === c.id);
            const eatingCount = (report?.eatingStudents || 0) + (report?.teacherEating ? 1 : 0);
            return `<div class="class-card ${report ? 'submitted' : 'pending'}"><div class="class-card-header"><h4>${c.className}</h4><span>${c.teacherName}</span></div>
            ${report ? `<div class="eating-count"><p>Харчуються</p><p class="count">${eatingCount}</p>${report.teacherEating ? '<p class="teacher-badge">+ Вчитель</p>' : ''}</div>
            <div class="class-card-footer"><div><svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> ${new Date(report.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
            <div>${report.actualStudents} / ${report.totalStudents} учнів</div></div>` : '<div class="no-report">Немає заявки</div>'}</div>`;
        }).join('')}</div>`;
    },
    renderReport(currentReports, allReports) {
        const date = new Date(this.selectedDate);
        if (this.viewMode === 'month') return this.renderMonthlyTable(date, allReports);
        return `<div class="report-container"><div class="report-content"><div class="report-title">
            <h2>Звіт по харчуванню за ${date.toLocaleDateString('uk-UA')}</h2>
            <p>Гімназія №4 | ${this.activeShift === 0 ? 'Усі класи' : this.activeShift + ' зміна'}</p></div>
            <div class="table-wrapper"><table><thead><tr><th>Клас</th><th>Всього</th><th>Фактично</th><th>Харчуються</th><th>Підпис</th></tr></thead><tbody>
            ${state.classes.filter(c => this.activeShift === 0 || c.shift === this.activeShift).sort((a,b) => a.className.localeCompare(b.className, 'uk')).map(c => {
                const r = currentReports.find(rep => rep.classId === c.id);
                const eating = (r?.eatingStudents || 0) + (r?.teacherEating ? 1 : 0);
                return `<tr><td>${c.className}</td><td>${r?.totalStudents || ''}</td><td>${r?.actualStudents || ''}</td><td>${eating || ''}</td><td></td></tr>`;
            }).join('')}</tbody><tfoot><tr><td>Всього:</td><td>${currentReports.reduce((a,b) => a + b.totalStudents, 0)}</td><td>${currentReports.reduce((a,b) => a + b.actualStudents, 0)}</td>
            <td>${currentReports.reduce((a,b) => a + b.eatingStudents + (b.teacherEating ? 1 : 0), 0)}</td><td></td></tr></tfoot></table></div>
            <div class="report-signature"><p>Адміністрація</p><p>Їдальня</p></div></div></div>`;
    },
    renderMonthlyTable(date, allReports) {
        const year = date.getFullYear(), month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const dayTotals = new Array(days).fill(0);
        let grandTotal = 0;
        const classes = state.classes.filter(c => this.activeShift === 0 || c.shift === this.activeShift).sort((a,b) => a.className.localeCompare(b.className, 'uk'));
        
        return `<div class="report-container"><div class="report-content"><div class="report-title">
            <h2>Звіт по харчуванню (місячний) - ${date.toLocaleString('uk-UA', {month: 'long', year: 'numeric'})}</h2>
            <p>Гімназія №4 | ${this.activeShift === 0 ? 'Усі класи' : this.activeShift + ' зміна'}</p></div>
            <div class="table-wrapper"><table class="monthly-table"><thead><tr><th>Клас</th>
            ${Array.from({length: days}, (_, i) => `<th>${i+1}</th>`).join('')}<th class="total-col">Σ</th></tr></thead><tbody>
            ${classes.map(c => {
                let classTotal = 0;
                return `<tr><td>${c.className}</td>${Array.from({length: days}, (_, i) => {
                    const d = i + 1;
                    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const r = allReports.find(rep => rep.classId === c.id && rep.date === dStr);
                    const val = r ? r.actualStudents : 0;
                    classTotal += val;
                    dayTotals[i] += val;
                    return `<td class="${val > 0 ? 'value' : 'empty'}">${val || '-'}</td>`;
                }).join('')}<td class="total-col">${classTotal}</td></tr>`;
            }).join('')}</tbody><tfoot><tr><td>Всього:</td>
            ${dayTotals.map(t => { grandTotal += t; return `<td>${t || '-'}</td>`; }).join('')}<td class="total-col">${grandTotal}</td></tr></tfoot></table></div>
            <div class="report-signature"><p>Адміністрація</p><p>Їдальня</p></div></div></div>`;
    },
    setShift(shift) { this.activeShift = shift; app.render(); },
    setViewMode(mode) { 
        document.body.classList.remove('print-monthly-landscape', 'print-landscape');
        this.viewMode = mode; 
        app.render(); 
    },
    setDate(date) { 
        this.selectedDate = date;
        this.loadDateReports(date);
    },
    async loadDateReports(date) {
        // Перевірити чи є дані в history
        const hasData = [...state.reports, ...state.history].some(r => r.date === date);
        if (!hasData) {
            // Завантажити якщо немає
            const dateReports = await api.getReports(date);
            if (dateReports.length > 0) {
                state.history.push(...dateReports);
            }
        }
        app.render();
    },
    changeMonth(offset) {
        const d = new Date(this.selectedDate);
        d.setMonth(d.getMonth() + offset);
        this.selectedDate = d.toISOString().split('T')[0];
        this.loadMonthReports(d);
    },
    async loadMonthReports(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        
        // Завантажити всі дні місяця якщо немає
        const promises = [];
        for (let day = 1; day <= days; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hasData = [...state.reports, ...state.history].some(r => r.date === dateStr);
            if (!hasData) {
                promises.push(api.getReports(dateStr));
            }
        }
        
        if (promises.length > 0) {
            const results = await Promise.all(promises);
            results.forEach(dayReports => {
                if (dayReports.length > 0) {
                    state.history.push(...dayReports);
                }
            });
        }
        
        app.render();
    },
    printMonthly() {
        const date = new Date(this.selectedDate);
        const allReports = [...state.reports, ...state.history];
        const html = this.renderMonthlyTable(date, allReports);
        
        // Створити окреме вікно з повернутою таблицею
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Місячний звіт</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; }
        @media print {
            @page { size: A4 landscape; margin: 0.8cm; }
            body { margin: 0; padding: 0; }
        }
        @media screen {
            body { padding: 1cm; background: #f0f0f0; }
        }
        .report-container { background: white; }
        .report-content { padding: 1cm; }
        .report-title { text-align: center; margin-bottom: 1.5rem; }
        .report-title h2 { font-size: 18px; margin-bottom: 10px; }
        .report-title p { font-size: 12px; color: #666; }
        table { width: 100%; border-collapse: collapse; font-size: 8px; }
        th, td { border: 1px solid black; padding: 3px 2px; text-align: center; }
        th { background: #f0f0f0; font-weight: bold; }
        .total-col { background: #e8f4f8; font-weight: bold; }
        .value { font-weight: 500; }
        .empty { color: #ccc; }
        .report-signature { margin-top: 2rem; display: flex; justify-content: space-between; }
        .report-signature p { font-size: 12px; }
    </style>
</head>
<body>
    ${html}
    <script>
        window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
        };
        window.onafterprint = function() {
            setTimeout(function() { window.close(); }, 100);
        };
    </script>
</body>
</html>
        `);
        printWindow.document.close();
    },
    exportCSV() {
        let csv = "\uFEFF"; // UTF-8 BOM
        const date = new Date(this.selectedDate);
        if (this.viewMode === 'month') {
            const year = date.getFullYear(), month = date.getMonth();
            const days = new Date(year, month + 1, 0).getDate();
            csv += "Клас;" + Array.from({length: days}, (_, i) => i + 1).join(";") + ";Разом\n";
            const dayTotals = new Array(days).fill(0);
            let grandTotal = 0;
            const allReports = [...state.reports, ...state.history];
            state.classes.filter(c => this.activeShift === 0 || c.shift === this.activeShift).sort((a,b) => a.className.localeCompare(b.className, 'uk')).forEach(c => {
                let row = [c.className];
                let classTotal = 0;
                for (let d = 1; d <= days; d++) {
                    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const r = allReports.find(rep => rep.classId === c.id && rep.date === dStr);
                    const val = r ? r.actualStudents : 0;
                    row.push(val.toString());
                    classTotal += val;
                    dayTotals[d-1] += val;
                }
                row.push(classTotal.toString());
                grandTotal += classTotal;
                csv += row.join(";") + "\n";
            });
            csv += "ВСЬОГО;" + dayTotals.join(";") + ";" + grandTotal + "\n";
        } else {
            csv += "Клас;Всього;Фактично;Харчуються\n";
            const allReports = [...state.reports, ...state.history];
            const currentReports = allReports.filter(r => {
                const classInfo = state.classes.find(c => c.id === r.classId);
                return classInfo && r.date === this.selectedDate && (this.activeShift === 0 || classInfo.shift === this.activeShift);
            });
            state.classes.filter(c => this.activeShift === 0 || c.shift === this.activeShift).sort((a,b) => a.className.localeCompare(b.className, 'uk')).forEach(c => {
                const r = currentReports.find(rep => rep.classId === c.id);
                const eating = (r?.eatingStudents || 0) + (r?.teacherEating ? 1 : 0);
                csv += `${c.className};${r?.totalStudents || 0};${r?.actualStudents || 0};${eating}\n`;
            });
        }
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `zvit_${this.selectedDate}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
    attachEvents() {}
};

// === Admin View ===
const adminView = {
    activeTab: 'classes', reportType: 'daily', selectedDate: app.getTodayISO(),
    newClass: { id: '', className: '', teacherName: '', pin: '', shift: 1 }, editingId: null,
    render() {
        return `<div class="view-container"><div class="admin-tabs no-print">
            ${['classes','reports','history','security'].map(tab => `<button class="tab-btn ${this.activeTab === tab ? 'active' : ''}" onclick="adminView.setTab('${tab}')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">${this.getTabIcon(tab)}</svg>
            <span>${this.getTabLabel(tab)}</span></button>`).join('')}</div>${this.renderTabContent()}</div>`;
    },
    getTabIcon(tab) {
        const icons = { classes: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
            reports: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>',
            history: '<circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m5.2-14.2L13.4 8.6m-2.8 2.8-3.8 3.8M23 12h-6m-6 0H1m14.2 5.2-3.8-3.8m-2.8-2.8-3.8-3.8"></path>',
            security: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' };
        return icons[tab] || '';
    },
    getTabLabel(tab) {
        const labels = { classes: 'Класи', reports: 'Звіти', history: 'Архів', security: 'Безпека' };
        return labels[tab] || '';
    },
    renderTabContent() {
        switch (this.activeTab) {
            case 'classes': return this.renderClasses();
            case 'reports': return this.renderReports();
            case 'history': return this.renderHistory();
            case 'security': return this.renderSecurity();
            default: return '';
        }
    },
    renderClasses() {
        return `<div class="admin-grid"><div class="card"><div class="card-header">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
            ${this.editingId ? 'Редагувати клас' : 'Додати клас'}</div><div class="card-form">
            ${this.editingId ? `<button class="btn btn-primary" onclick="adminView.cancelEdit()" style="margin-bottom:1rem;width:100%;">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Скасувати редагування</button>` : ''}
            <form onsubmit="adminView.handleSubmit(event)"><div class="form-group"><input type="text" placeholder="Назва (напр. 4-А)" value="${this.newClass.className}" oninput="adminView.updateForm('className', this.value)" required></div>
            <div class="form-group"><input type="text" placeholder="Прізвище вчителя" value="${this.newClass.teacherName}" oninput="adminView.updateForm('teacherName', this.value)" required></div>
            <div class="form-group"><input type="text" maxlength="4" placeholder="ПІН (4 цифри)" value="${this.newClass.pin}" oninput="adminView.updateForm('pin', this.value.replace(/\\D/g,''))" required></div>
            <div class="form-group"><select onchange="adminView.updateForm('shift', parseInt(this.value))">
            <option value="1" ${this.newClass.shift === 1 ? 'selected' : ''}>1 Зміна (1-5)</option>
            <option value="2" ${this.newClass.shift === 2 ? 'selected' : ''}>2 Зміна (6-9)</option></select></div>
            <button type="submit" class="btn btn-primary" style="width:100%;">${this.editingId ? 'Зберегти зміни' : 'Додати клас'}</button></form></div></div>
            <div class="card"><div class="card-header">Список класів (${state.classes.length})</div><div class="class-list">
            ${state.classes.sort((a,b) => a.className.localeCompare(b.className, 'uk')).map(c => `<div class="class-item ${this.editingId === c.id ? 'editing' : ''}">
            <div class="class-info"><span class="class-name">${c.className}</span><span class="class-details">${c.teacherName} • PIN: ${c.pin} • ${c.shift} Зм.</span></div>
            <div class="class-actions"><button class="icon-btn edit" onclick="adminView.editClass('${c.id}')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
            <button class="icon-btn delete" onclick="adminView.deleteClass('${c.id}')">
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>`).join('')}</div></div></div>`;
    },
    renderReports() {
        return canteenView.render().replace('canteenView', 'adminView');
    },
    renderHistory() {
        const allReports = [...state.reports, ...state.history];
        return `<div class="history-container"><h3>Архів записів (${allReports.length})</h3><div class="history-list">
            ${allReports.slice(-20).reverse().map(h => {
                const cls = state.classes.find(c => c.id === h.classId);
                return `<div class="history-item"><div>${h.date} — <span class="class">${cls?.className || 'Видалений'}</span></div>
                <div>${h.eatingStudents + (h.teacherEating ? 1 : 0)} харч.</div></div>`;
            }).join('')}</div></div>`;
    },
    renderSecurity() {
        const storageSize = this.getStorageSize();
        const reportCount = this.getReportsCount();
        const lastCleanup = localStorage.getItem('gym4_last_cleanup');
        const lastCleanupDate = lastCleanup ? new Date(parseInt(lastCleanup)).toLocaleDateString('uk-UA') : 'Ніколи';
        
        return `<div class="security-container"><div class="security-card"><h3>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> PIN-коди</h3>
            <div class="security-fields"><div class="security-field editable"><label>PIN для Їдальні</label>
            <input type="text" maxlength="4" value="${state.canteenPin}" oninput="adminView.updateCanteenPin(this.value.replace(/\\D/g,''))"></div>
            <div class="security-field readonly"><label>PIN Адміністратора</label><p>1312</p></div></div></div>
            
            <div class="security-card" style="margin-top:1.5rem;"><h3>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> Локальне сховище</h3>
            <div class="security-fields"><div style="padding:1rem;background:var(--slate-50);border-radius:1rem;">
            <p style="font-size:0.75rem;margin-bottom:0.5rem;"><strong>Використано:</strong> ${storageSize}</p>
            <p style="font-size:0.75rem;margin-bottom:0.5rem;"><strong>Звітів у кеші:</strong> ${reportCount}</p>
            <p style="font-size:0.75rem;margin-bottom:0.5rem;"><strong>Останнє очищення:</strong> ${lastCleanupDate}</p>
            <p style="font-size:0.625rem;color:var(--slate-400);margin-top:1rem;">Автоочищення: кожні 7 днів, видаляє дані старше 90 днів</p>
            <button onclick="adminView.forceCleanup()" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Примусове очищення</button>
            <button onclick="adminView.clearOldCache()" class="btn btn-primary" style="width:100%;margin-top:0.5rem;">Видалити старше N днів</button>
            </div></div></div></div>`;
    },
    getStorageSize() {
        let total = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                total += localStorage[key].length + key.length;
            }
        }
        return (total / 1024).toFixed(2) + ' KB';
    },
    getReportsCount() {
        let count = 0;
        for (let key in localStorage) {
            if (key.startsWith('gym4_reports_')) count++;
        }
        return count;
    },
    clearOldCache() {
        const days = prompt('Видалити дані старше скількох днів?', '90');
        if (!days) return;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
        const cutoffStr = cutoffDate.toISOString().split('T')[0];
        let deleted = 0;
        const keysToDelete = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('gym4_reports_')) {
                const dateStr = key.replace('gym4_reports_', '');
                if (dateStr < cutoffStr) keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => { localStorage.removeItem(key); deleted++; });
        alert(`Видалено ${deleted} застарілих записів`);
        app.render();
    },
    forceCleanup() {
        app.cleanupOldData();
        localStorage.setItem('gym4_last_cleanup', Date.now().toString());
        alert('Очищення виконано');
        app.render();
    },
    setTab(tab) { this.activeTab = tab; app.render(); },
    updateForm(field, value) { this.newClass[field] = value; },
    updateCanteenPin(pin) { state.canteenPin = pin; api.setCanteenPin(pin); },
    editClass(id) {
        const cls = state.classes.find(c => c.id === id);
        if (cls) {
            this.editingId = id;
            this.newClass = { ...cls };
            app.render();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    },
    cancelEdit() {
        this.editingId = null;
        this.newClass = { id: '', className: '', teacherName: '', pin: '', shift: 1 };
        app.render();
    },
    deleteClass(id) {
        if (confirm('Видалити цей клас?')) {
            state.classes = state.classes.filter(c => c.id !== id);
            api.saveClasses(state.classes);
            app.render();
        }
    },
    async handleSubmit(e) {
        e.preventDefault();
        if (!this.newClass.className || !this.newClass.teacherName || !this.newClass.pin) return;
        if (this.editingId) {
            state.classes = state.classes.map(c => c.id === this.editingId ? { ...this.newClass, id: this.editingId } : c);
        } else {
            state.classes.push({ ...this.newClass, id: Math.random().toString(36).substr(2, 9) });
        }
        await api.saveClasses(state.classes);
        this.editingId = null;
        this.newClass = { id: '', className: '', teacherName: '', pin: '', shift: 1 };
        app.render();
    },
    attachEvents() {
        if (this.activeTab === 'reports') canteenView.attachEvents();
    }
};

// === Initialize ===
document.addEventListener('DOMContentLoaded', () => app.init());
