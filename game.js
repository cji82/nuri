const ACTIVE_WINDOW_DURATION = 5; // seconds
const SIMULATION_SPEED = 1.4;

// 게임 상태
const gameState = {
    isRunning: false,
    isCountdown: false,
    isGameOver: false,
    startTime: 0,
    currentTime: 0,
    altitude: 0, // km
    velocity: 0, // m/s
    stage: 0, // 0: 대기, 1-4: 각 단계
    scores: [],
    completedStages: [],
    rocketX: 50, // 로켓 X 위치 (%)
    backgroundElements: [],
    lastElementSpawn: 0,
    stageActiveUntil: [null, null, null, null, null]
};

// 목표 값 (실제 누리호 발사 데이터 기반)
const targets = {
    stage1: {
        time: 127, // 2분 7초
        altitude: 60, // km
        velocity: 1530, // m/s (Mach 4.5)
        tolerance: { time: 10, altitude: 5, velocity: 50 }
    },
    stage2: {
        time: 197, // 3분 17초
        altitude: 120,
        tolerance: { time: 10, altitude: 10 }
    },
    stage3: {
        time: 257, // 4분 17초
        altitude: 200,
        tolerance: { time: 10, altitude: 15 }
    },
    stage4: {
        time: 1000, // 16분 40초
        altitude: 700,
        tolerance: { time: 15, altitude: 20 }
    }
};

// 물리 시뮬레이션 파라미터
const physics = {
    rocketSpeed: 2 // 로켓 좌우 이동 속도 (%/frame)
};

const altitudeProfile = [
    { time: 0, altitude: 0 },
    { time: 30, altitude: 10 },
    { time: 60, altitude: 35 },
    { time: 90, altitude: 50 },
    { time: 127, altitude: 60 },
    { time: 160, altitude: 90 },
    { time: 197, altitude: 125 },
    { time: 230, altitude: 160 },
    { time: 257, altitude: 200 },
    { time: 320, altitude: 280 },
    { time: 400, altitude: 360 },
    { time: 600, altitude: 500 },
    { time: 800, altitude: 620 },
    { time: 1000, altitude: 700 },
    { time: 1200, altitude: 750 },
    { time: 1500, altitude: 780 }
];

const velocityProfile = [
    { time: 0, velocity: 0 },
    { time: 10, velocity: 300 },
    { time: 30, velocity: 800 },
    { time: 60, velocity: 1200 },
    { time: 90, velocity: 1500 },
    { time: 127, velocity: 1530 },
    { time: 160, velocity: 1800 },
    { time: 197, velocity: 2100 },
    { time: 230, velocity: 2400 },
    { time: 257, velocity: 2600 },
    { time: 320, velocity: 3200 },
    { time: 400, velocity: 4200 },
    { time: 600, velocity: 5500 },
    { time: 800, velocity: 6500 },
    { time: 1000, velocity: 7600 },
    { time: 1200, velocity: 7800 },
    { time: 1500, velocity: 7900 }
];

// DOM 요소
const elements = {
    rocket: document.getElementById('rocket'),
    rocketDisplay: document.getElementById('rocket-display'),
    altitude: document.getElementById('altitude'),
    velocity: document.getElementById('velocity'),
    time: document.getElementById('time'),
    startBtn: document.getElementById('start-btn'),
    resetBtn: document.getElementById('reset-btn'),
    accuracy: document.getElementById('accuracy'),
    successRate: document.getElementById('success-rate'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownDisplay: document.getElementById('countdown-display'),
    ignitionEffect: document.getElementById('ignition-effect'),
    backgroundContainer: document.getElementById('background-container'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    gameoverReason: document.getElementById('gameover-reason'),
    restartBtn: document.getElementById('restart-btn'),
    backToMenuBtn: document.getElementById('back-to-menu-btn'),
    trajectory: document.getElementById('trajectory'),
    actionHint: document.getElementById('action-hint'),
    successOverlay: document.getElementById('success-overlay'),
    successMenuBtn: document.getElementById('success-menu-btn')
};

// 버튼 및 상태 요소
const stageElements = [1, 2, 3, 4].map(num => ({
    stage: document.getElementById(`stage${num}`),
    status: document.getElementById(`status${num}`),
    progress: document.getElementById(`progress-step${num}`)
}));

// 키 입력 상태
const keys = {
    left: false,
    right: false
};

// 카운트다운
function countdown() {
    gameState.isCountdown = true;
    elements.countdownOverlay.classList.add('active');
    
    // 카운트다운 시작 시 컨트롤 버튼 숨김
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.add('hidden');
    }
    
    let count = 10;
    elements.countdownDisplay.textContent = count;
    
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            elements.countdownDisplay.textContent = count;
        } else {
            elements.countdownDisplay.textContent = '발사!';
            clearInterval(countdownInterval);
            
            setTimeout(() => {
                elements.countdownOverlay.classList.remove('active');
                gameState.isCountdown = false;
                startIgnition();
                startGame();
            }, 500);
        }
    }, 1000);
}

// 점화 효과
function startIgnition() {
    elements.ignitionEffect.classList.add('active');
    
    setTimeout(() => {
        // 점화 효과는 계속 유지되지만 약간 줄임
    }, 2000);
}

// 게임 루프
function gameLoop() {
    if (!gameState.isRunning || gameState.isGameOver) return;
    
    const elapsed = ((Date.now() - gameState.startTime) / 1000) * SIMULATION_SPEED;
    gameState.currentTime = elapsed;
    
    // 물리 계산
    updatePhysics(elapsed);
    
    // 로켓 위치 업데이트
    updateRocketPosition();
    
    // UI 업데이트
    updateUI();
    
    // 배경 요소 생성 및 애니메이션
    spawnBackgroundElements();
    animateBackgroundElements();
    
    // 충돌 감지
    checkCollision();
    
    // 단계 활성화 체크
    checkStageAvailability();
    
    // 단계 타이밍 실패 체크
    checkStageTimeout();
    
    requestAnimationFrame(gameLoop);
}

function updatePhysics(elapsed) {
    // 고도 계산 (프로필 기반)
    const stageBonus = gameState.completedStages.length * 5;
    gameState.altitude = Math.min(getAltitudeFromProfile(elapsed) + stageBonus, 800);
    
    // 속도 계산 (프로필 기반)
    const velocityBonus = gameState.completedStages.length * 50;
    gameState.velocity = Math.min(getVelocityFromProfile(elapsed) + velocityBonus, 8000);
}

function updateRocketPosition() {
    // 키 입력에 따른 로켓 이동
    if (keys.left && gameState.rocketX > 10) {
        gameState.rocketX = Math.max(10, gameState.rocketX - physics.rocketSpeed);
    }
    if (keys.right && gameState.rocketX < 90) {
        gameState.rocketX = Math.min(90, gameState.rocketX + physics.rocketSpeed);
    }
    
    // 로켓 X 위치 적용 (updateUI에서도 적용되므로 여기서는 제거)
}

function updateUI() {
    // 텔레메트리 업데이트
    elements.altitude.textContent = `${gameState.altitude.toFixed(1)} km`;
    const mach = gameState.velocity / 340;
    elements.velocity.textContent = `${gameState.velocity.toFixed(0)} m/s (Mach ${mach.toFixed(2)})`;
    
    const minutes = Math.floor(gameState.currentTime / 60);
    const seconds = Math.floor(gameState.currentTime % 60);
    elements.time.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // 로켓 위치 업데이트 (고도에 따라)
    const rocketPosition = Math.min((gameState.altitude / 800) * 580, 580);
    elements.rocket.style.bottom = `${rocketPosition}px`;
    
    // 점화 효과 위치 (로켓 하단 바로 아래)
    if (elements.ignitionEffect) {
        // 로켓 이미지 높이를 고려하여 불꽃을 로켓 하단 아래에 배치
        const rocketHeight = 150; // 로켓 이미지 높이
        const scaledHeight = rocketHeight * Math.max(0.3, 1 - (gameState.altitude / 800) * 0.7);
        elements.ignitionEffect.style.bottom = `${rocketPosition - scaledHeight}px`;
    }
    
    // 궤적 업데이트
    elements.trajectory.style.height = `${rocketPosition}px`;
    
    // 로켓 크기 (원근감)
    const scale = Math.max(0.3, 1 - (gameState.altitude / 800) * 0.7);
    const rocketImage = document.getElementById('rocket-image');
    if (rocketImage) {
        rocketImage.style.transform = `scale(${scale})`;
    }
    
    // 로켓 X 위치 적용
    elements.rocket.style.left = `${gameState.rocketX}%`;
    
    // 점화 효과도 X 위치에 맞춰 이동
    if (elements.ignitionEffect) {
        elements.ignitionEffect.style.left = `${gameState.rocketX}%`;
    }
}

function spawnBackgroundElements() {
    if (!gameState.isRunning || gameState.isCountdown) return;
    
    const now = Date.now();
    const timeSinceLastSpawn = now - gameState.lastElementSpawn;
    
    // 랜덤한 간격으로 요소 생성 (0.4초 ~ 1.3초)
    if (timeSinceLastSpawn > (400 + Math.random() * 900)) {
        const spawnCount = Math.random() < 0.3 ? 2 : 1;
        for (let i = 0; i < spawnCount; i++) {
            const element = createBackgroundElement();
            if (element) {
                gameState.backgroundElements.push(element);
            }
        }
        gameState.lastElementSpawn = now;
    }
}

function createBackgroundElement() {
    const types = ['cloud', 'bird', 'plane'];
    const weights = [0.3, 0.4, 0.3]; // 장애물 비율 증가
    
    let rand = Math.random();
    let typeIndex = 0;
    let cumulative = 0;
    
    for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (rand < cumulative) {
            typeIndex = i;
            break;
        }
    }
    
    const type = types[typeIndex];
    const element = document.createElement('div');
    element.className = `background-element ${type}`;
    
    // 이모지 설정
    if (type === 'cloud') {
        element.textContent = '☁️';
    } else if (type === 'bird') {
        element.textContent = '🐦';
    } else if (type === 'plane') {
        element.textContent = '✈️';
    }
    
    // 랜덤 X 위치 (로켓 디스플레이 영역 내)
    const xPos = 10 + Math.random() * 80; // 10% ~ 90%
    element.style.left = `${xPos}%`;
    element.style.top = '-50px';
    
    // 애니메이션 속도 (새와 비행기가 더 빠름)
    const duration = type === 'cloud' ? 6 : type === 'bird' ? 3 : 4;
    element.style.animationDuration = `${duration}s`;
    
    elements.backgroundContainer.appendChild(element);
    
    return {
        element: element,
        type: type,
        x: xPos,
        startTime: Date.now(),
        duration: duration * 1000
    };
}

function animateBackgroundElements() {
    const now = Date.now();
    const toRemove = [];
    
    gameState.backgroundElements.forEach((bgElement, index) => {
        const elapsed = now - bgElement.startTime;
        
        // 화면 밖으로 나간 요소 제거
        if (elapsed > bgElement.duration) {
            toRemove.push(index);
        }
    });
    
    // 역순으로 제거 (인덱스 유지)
    toRemove.reverse().forEach(index => {
        const bgElement = gameState.backgroundElements[index];
        if (bgElement.element.parentNode) {
            bgElement.element.parentNode.removeChild(bgElement.element);
        }
        gameState.backgroundElements.splice(index, 1);
    });
}

function checkCollision() {
    if (!gameState.isRunning || gameState.isGameOver) return;
    
    const rocketRect = elements.rocket.getBoundingClientRect();
    const rocketCenterX = rocketRect.left + rocketRect.width / 2;
    const rocketCenterY = rocketRect.top + rocketRect.height / 2;
    const rocketRadius = rocketRect.width / 2;
    
    gameState.backgroundElements.forEach(bgElement => {
        // 구름은 충돌하지 않음
        if (bgElement.type === 'cloud') return;
        
        const elementRect = bgElement.element.getBoundingClientRect();
        const elementCenterX = elementRect.left + elementRect.width / 2;
        const elementCenterY = elementRect.top + elementRect.height / 2;
        const elementRadius = Math.max(elementRect.width, elementRect.height) / 2;
        
        // 충돌 감지 (원형 충돌)
        const dx = rocketCenterX - elementCenterX;
        const dy = rocketCenterY - elementCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < rocketRadius + elementRadius) {
            gameOver('장애물과 충돌했습니다!');
        }
    });
}

function checkStageAvailability() {
    let hintShown = false;
    stageElements.forEach((elem, index) => {
        const stageNum = index + 1;
        const target = targets[`stage${stageNum}`];
        
        if (gameState.completedStages.includes(stageNum)) {
            elem.stage.classList.remove('active');
            return;
        }
        
        const timeDiff = Math.abs(gameState.currentTime - target.time);
        const altitudeDiff = Math.abs(gameState.altitude - target.altitude);
        const withinTolerance = timeDiff <= target.tolerance.time && altitudeDiff <= target.tolerance.altitude;
        
        if (withinTolerance && gameState.stage === stageNum - 1 && !gameState.stageActiveUntil[stageNum]) {
            gameState.stageActiveUntil[stageNum] = gameState.currentTime + ACTIVE_WINDOW_DURATION;
        }
        
        const isActiveWindow = gameState.stageActiveUntil[stageNum] &&
            gameState.currentTime <= gameState.stageActiveUntil[stageNum] &&
            gameState.stage === stageNum - 1;
        
        if (isActiveWindow) {
            elem.stage.classList.add('active');
            elem.progress.classList.add('active');
            const remaining = Math.max(0, gameState.stageActiveUntil[stageNum] - gameState.currentTime);
            elem.status.textContent = `스페이스바! ${remaining.toFixed(1)}초`;
            elem.status.className = 'status waiting';
            showActionHint(stageNum, remaining);
            hintShown = true;
        } else {
            elem.stage.classList.remove('active');
            elem.progress.classList.remove('active');
            if (gameState.stage === stageNum - 1 && !gameState.completedStages.includes(stageNum)) {
                elem.status.textContent = '대기 중...';
                elem.status.className = 'status';
            }
            if (gameState.stageActiveUntil[stageNum] && gameState.currentTime > gameState.stageActiveUntil[stageNum]) {
                gameState.stageActiveUntil[stageNum] = null;
            }
        }
    });
    
    if (!hintShown) {
        hideActionHint();
    }
}

function checkStageTimeout() {
    if (gameState.isGameOver) return;
    
    stageElements.forEach((elem, index) => {
        const stageNum = index + 1;
        const target = targets[`stage${stageNum}`];
        
        // 이미 완료된 단계는 체크하지 않음
        if (gameState.completedStages.includes(stageNum)) return;
        
        // 현재 단계가 아니면 체크하지 않음
        if (gameState.stage !== stageNum - 1) return;
        
        // 목표 시간을 지나쳤는지 체크
        const timeDiff = gameState.currentTime - target.time;
        
        // 목표 시간 + 허용 오차를 넘으면 게임오버
        if (timeDiff > target.tolerance.time) {
            gameOver(`단계 ${stageNum}의 타이밍을 놓쳤습니다!`);
        }
    });
}

function executeStage(stageNum) {
    if (gameState.completedStages.includes(stageNum) || gameState.isGameOver) return;
    
    const target = targets[`stage${stageNum}`];
    const elem = stageElements[stageNum - 1];
    
    // 정확도 계산
    const timeDiff = Math.abs(gameState.currentTime - target.time);
    const altitudeDiff = Math.abs(gameState.altitude - target.altitude);
    
    let accuracy = 0;
    
    // 시간 정확도
    const timeAccuracy = Math.max(0, 100 - (timeDiff / target.tolerance.time) * 100);
    
    // 고도 정확도
    const altitudeAccuracy = Math.max(0, 100 - (altitudeDiff / target.tolerance.altitude) * 100);
    
    // 속도 정확도 (1단만)
    let velocityAccuracy = 100;
    if (stageNum === 1 && target.velocity) {
        const velocityDiff = Math.abs(gameState.velocity - target.velocity);
        velocityAccuracy = Math.max(0, 100 - (velocityDiff / target.tolerance.velocity) * 100);
        accuracy = (timeAccuracy + altitudeAccuracy + velocityAccuracy) / 3;
    } else {
        accuracy = (timeAccuracy + altitudeAccuracy) / 2;
    }
    
    // 타이밍 실패 체크 (정확도가 너무 낮으면 게임오버)
    if (accuracy < 30) {
        gameOver(`단계 ${stageNum}의 정확도가 너무 낮습니다! (${accuracy.toFixed(1)}%)`);
        return;
    }
    
    gameState.scores.push(accuracy);
    gameState.completedStages.push(stageNum);
    gameState.stage = stageNum;
    
    // UI 업데이트
    if (accuracy >= 80) {
        elem.status.textContent = `성공! (정확도: ${accuracy.toFixed(1)}%)`;
        elem.status.className = 'status success';
    } else if (accuracy >= 50) {
        elem.status.textContent = `보통 (정확도: ${accuracy.toFixed(1)}%)`;
        elem.status.className = 'status waiting';
    } else {
        elem.status.textContent = `실패 (정확도: ${accuracy.toFixed(1)}%)`;
        elem.status.className = 'status error';
    }
    
    elem.stage.classList.remove('active');
    elem.progress.classList.remove('active');
    gameState.stageActiveUntil[stageNum] = null;
    hideActionHint();
    elem.progress.classList.add('completed');
    
    // 최종 점수 계산
    updateScore();
    
    // 모든 단계 완료 체크
    if (gameState.completedStages.length === 4) {
        handleMissionSuccess();
    }
}

function updateScore() {
    if (gameState.scores.length === 0) return;
    
    const avgAccuracy = gameState.scores.reduce((a, b) => a + b, 0) / gameState.scores.length;
    elements.accuracy.textContent = `${avgAccuracy.toFixed(1)}%`;
    
    // 성공률 계산 (모든 단계가 70% 이상이면 성공)
    const allPassed = gameState.scores.every(score => score >= 70);
    const successRate = allPassed ? 
        Math.min(100, avgAccuracy * 1.1) : 
        Math.max(0, avgAccuracy * 0.8);
    
    elements.successRate.textContent = `${successRate.toFixed(1)}%`;
}

function startGame() {
    gameState.isRunning = true;
    gameState.isGameOver = false;
    gameState.startTime = Date.now();
    gameState.stage = 0;
    gameState.completedStages = [];
    gameState.scores = [];
    gameState.rocketX = 50;
    gameState.backgroundElements = [];
    gameState.lastElementSpawn = Date.now();
    gameState.stageActiveUntil = [null, null, null, null, null];
    
    elements.startBtn.disabled = true;
    elements.resetBtn.disabled = false;
    elements.gameoverOverlay.classList.remove('active');
    elements.successOverlay.classList.remove('active');
    
    // 게임 중에는 컨트롤 버튼 숨김
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.add('hidden');
    }
    
    // 모든 단계 초기화
    stageElements.forEach(elem => {
        elem.stage.classList.remove('active');
        elem.status.textContent = '대기 중...';
        elem.status.className = 'status';
        elem.progress.classList.remove('active', 'completed');
    });
    hideActionHint();
    
    resetScoreBoard();
    
    // 배경 요소 초기화
    gameState.backgroundElements.forEach(bgElement => {
        if (bgElement.element.parentNode) {
            bgElement.element.parentNode.removeChild(bgElement.element);
        }
    });
    gameState.backgroundElements = [];
    
    gameLoop();
}

function resetGame() {
    gameState.isRunning = false;
    gameState.isCountdown = false;
    gameState.isGameOver = false;
    gameState.startTime = 0;
    gameState.currentTime = 0;
    gameState.altitude = 0;
    gameState.velocity = 0;
    gameState.stage = 0;
    gameState.scores = [];
    gameState.completedStages = [];
    gameState.rocketX = 50;
    gameState.backgroundElements = [];
    gameState.stageActiveUntil = [null, null, null, null, null];
    
    elements.startBtn.disabled = false;
    elements.resetBtn.disabled = false;
    elements.countdownOverlay.classList.remove('active');
    elements.gameoverOverlay.classList.remove('active');
    elements.successOverlay.classList.remove('active');
    elements.ignitionEffect.classList.remove('active');
    
    // 게임 정지 시 컨트롤 버튼 표시
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.remove('hidden');
    }
    
    updateUI();
    resetScoreBoard();
    
    // 배경 요소 제거
    while (elements.backgroundContainer.firstChild) {
        elements.backgroundContainer.removeChild(elements.backgroundContainer.firstChild);
    }
    
    stageElements.forEach(elem => {
        elem.stage.classList.remove('active');
        elem.status.textContent = '대기 중...';
        elem.status.className = 'status';
        elem.progress.classList.remove('active', 'completed');
    });
    hideActionHint();
}

function gameOver(reason) {
    gameState.isRunning = false;
    gameState.isGameOver = true;
    
    elements.gameoverReason.textContent = reason;
    elements.gameoverOverlay.classList.add('active');
    hideActionHint();
    
    // 게임오버 시 컨트롤 버튼 표시
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.remove('hidden');
    }
}

// 키보드 이벤트
function handleKeyDown(e) {
    // 스페이스바로 단계 실행
    if (e.key === ' ' || e.key === 'Spacebar' || e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();
        
        if (gameState.isGameOver) return;
        
        if (gameState.isRunning && !gameState.isCountdown) {
            // 현재 활성화된 단계 찾기
            const currentStage = gameState.stage + 1;
            if (currentStage <= 4 && !gameState.completedStages.includes(currentStage)) {
                const stageElement = document.getElementById(`stage${currentStage}`);
                if (stageElement && stageElement.classList.contains('active')) {
                    executeStage(currentStage);
                }
            }
        }
        return;
    }
    
    if (gameState.isGameOver || !gameState.isRunning) return;
    
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        keys.left = true;
        e.preventDefault();
    }
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        keys.right = true;
        e.preventDefault();
    }
}

function handleKeyUp(e) {
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        keys.left = false;
    }
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        keys.right = false;
    }
}

// 이벤트 리스너
elements.startBtn.addEventListener('click', () => {
    if (!gameState.isCountdown && !gameState.isRunning) {
        countdown();
    }
});

elements.resetBtn.addEventListener('click', resetGame);
elements.restartBtn.addEventListener('click', () => {
    resetGame();
    countdown();
});
elements.backToMenuBtn.addEventListener('click', () => {
    resetGame();
});


window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

elements.successMenuBtn.addEventListener('click', () => {
    elements.successOverlay.classList.remove('active');
    resetGame();
});

// 초기화
resetGame();

function showActionHint(stageNum, remaining) {
    if (!elements.actionHint) return;
    const stageNames = ['대기', '1단 분리', '페어링 분리', '2단 분리', '페이로드 분리'];
    elements.actionHint.textContent = `${stageNames[stageNum]} 준비! ${remaining.toFixed(1)}초 안에 스페이스바!`;
    elements.actionHint.classList.add('visible');
}

function hideActionHint() {
    if (!elements.actionHint) return;
    elements.actionHint.classList.remove('visible');
}

function resetScoreBoard() {
    elements.accuracy.textContent = '0%';
    elements.successRate.textContent = '0%';
}

function handleMissionSuccess() {
    gameState.isRunning = false;
    gameState.isGameOver = true;
    hideActionHint();
    
    if (elements.successOverlay) {
        elements.successOverlay.classList.add('active');
    }
    
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.remove('hidden');
    }
}

function getAltitudeFromProfile(time) {
    if (time <= altitudeProfile[0].time) return altitudeProfile[0].altitude;
    for (let i = 0; i < altitudeProfile.length - 1; i++) {
        const current = altitudeProfile[i];
        const next = altitudeProfile[i + 1];
        if (time <= next.time) {
            const ratio = (time - current.time) / (next.time - current.time);
            return current.altitude + (next.altitude - current.altitude) * ratio;
        }
    }
    const last = altitudeProfile[altitudeProfile.length - 1];
    return last.altitude + (time - last.time) * 0.02; // slow drift
}

function getVelocityFromProfile(time) {
    if (time <= velocityProfile[0].time) return velocityProfile[0].velocity;
    for (let i = 0; i < velocityProfile.length - 1; i++) {
        const current = velocityProfile[i];
        const next = velocityProfile[i + 1];
        if (time <= next.time) {
            const ratio = (time - current.time) / (next.time - current.time);
            return current.velocity + (next.velocity - current.velocity) * ratio;
        }
    }
    const last = velocityProfile[velocityProfile.length - 1];
    return last.velocity;
}

