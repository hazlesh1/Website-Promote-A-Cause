let currentScenarioId = null;
let score = 0;
let completed = 0;
let correctIds = [];
let wrongIds = [];
let timerInterval = null;
let timeLeft = 20;

const views = {
    home: document.getElementById('home-view'),
    quiz: document.getElementById('quiz-view'),
    feedback: document.getElementById('feedback-view'),
    end: document.getElementById('end-view')
};

// Elements
const loadingOverlay = document.getElementById('loading-overlay');
const themeToggle = document.getElementById('theme-toggle');

function showView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

// Dark Mode Toggle
themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeToggle.textContent = isDark ? '🌙' : '☀️';
});

// App Logic
window.addEventListener('DOMContentLoaded', async () => {
    loadingOverlay.querySelector('p').textContent = "Generating scenarios with AI...";
    document.getElementById('loading-progress-container').style.display = 'block';
    
    let p = 0;
    let pInterval = setInterval(() => {
        p += 5;
        if(p > 90) p = 90;
        document.getElementById('loading-progress-fill').style.width = p + '%';
    }, 1000);

    loadingOverlay.classList.remove('hidden');
    try {
        await fetch('/api/generate_scenarios', { method: 'POST' });
        document.getElementById('loading-progress-fill').style.width = '100%';
    } catch (e) {
        console.error("Failed to generate scenarios at init", e);
    } finally {
        clearInterval(pInterval);
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            document.getElementById('loading-progress-container').style.display = 'none';
        }, 500);
    }
});

function goHome() {
    updateStats();
    showView('home');
}

function restartGame() {
    correctIds = [];
    wrongIds = [];
    score = 0;
    completed = 0;
    updateStats();
    document.getElementById('live-score').textContent = score;
    document.getElementById('live-correct').textContent = '0';
    document.getElementById('live-wrong').textContent = '0';
    showView('home');
}

// Options event listeners removed (now using inline onclick)

function updateStats() {
    document.getElementById('stat-completed').textContent = completed;
    document.getElementById('stat-score').textContent = score;
}

function startTimer() {
    clearInterval(timerInterval);
    timeLeft = 20;
    const timerText = document.getElementById('timer-text');
    const timerBar = document.getElementById('timer-bar');
    
    timerText.textContent = `${timeLeft}s`;
    timerBar.style.width = '100%';
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerText.textContent = `${timeLeft}s`;
        timerBar.style.width = `${(timeLeft/20)*100}%`;
        
        if(timeLeft <= 0) {
            clearInterval(timerInterval);
            submitAnswer("timeout");
        }
    }, 1000);
}

async function loadScenario() {
    loadingOverlay.querySelector('p').textContent = "Loading scenario...";
    loadingOverlay.classList.remove('hidden');
    showView('quiz');
    
    try {
        const res = await fetch('/api/scenario', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correctIds: correctIds })
        });
        
        if (res.status === 404) {
            showEndScreen();
            return;
        }
        
        const data = await res.json();
        
        currentScenarioId = data.id;
        
        document.getElementById('category-badge').textContent = data.category;
        document.getElementById('scenario-text').textContent = data.scenario;
        document.getElementById('question-text').textContent = data.question;
        
        document.getElementById('option-a-text').textContent = data.options.a;
        document.getElementById('option-b-text').textContent = data.options.b;
        document.getElementById('option-c-text').textContent = data.options.c;
        
        startTimer();
        
    } catch (err) {
        console.error(err);
        alert("Failed to load scenario.");
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

async function showEndScreen() {
    showView('end');
    document.getElementById('end-correct-count').textContent = correctIds.length;
    document.getElementById('end-wrong-count').textContent = wrongIds.length;
    
    const total = correctIds.length + wrongIds.length;
    const correctPercent = total === 0 ? 0 : Math.round((correctIds.length / total) * 100);
    const pie = document.getElementById('results-pie');
    pie.style.background = `conic-gradient(var(--good-color) 0% ${correctPercent}%, var(--wrong-color) ${correctPercent}% 100%)`;
    
    try {
        const res = await fetch('/api/end_summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correctCount: correctIds.length, wrongCount: wrongIds.length })
        });
        const data = await res.json();
        document.getElementById('end-feedback-text').textContent = data.summary;
    } catch (e) {
        document.getElementById('end-feedback-text').textContent = "Failed to load summary.";
    }
}

async function submitAnswer(answer) {
    clearInterval(timerInterval);
    loadingOverlay.querySelector('p').textContent = "AI is thinking...";
    loadingOverlay.classList.remove('hidden');
    
    try {
        const res = await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scenarioId: currentScenarioId, answer: answer })
        });
        
        const feedback = await res.json();
        
        // Update feedback view
        const ratingBadge = document.getElementById('feedback-rating');
        ratingBadge.textContent = feedback.rating;
        ratingBadge.className = `rating-badge rating-${feedback.rating}`;
        
        document.getElementById('feedback-message').textContent = feedback.message;
        document.getElementById('feedback-tip').textContent = feedback.tip;
        
        if (feedback.rating === 'good') {
            score += 10;
            if (!correctIds.includes(currentScenarioId)) correctIds.push(currentScenarioId);
            wrongIds = wrongIds.filter(id => id !== currentScenarioId);
        } else if (feedback.rating === 'ok') {
            score += 5;
            if (!correctIds.includes(currentScenarioId)) correctIds.push(currentScenarioId);
            wrongIds = wrongIds.filter(id => id !== currentScenarioId);
        } else {
            if (!wrongIds.includes(currentScenarioId)) wrongIds.push(currentScenarioId);
        }
        completed++;
        
        document.getElementById('live-score').textContent = score;
        document.getElementById('live-correct').textContent = correctIds.length;
        document.getElementById('live-wrong').textContent = wrongIds.length;
        
        showView('feedback');
        
    } catch (err) {
        console.error(err);
        alert("Failed to get feedback.");
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}
