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
    stageData: [], // 각 단계별 실행 정보 [{stage: 1, time: 127, altitude: 60, velocity: 1530}, ...]
    rocketX: 50, // 로켓 X 위치 (%)
    backgroundElements: [],
    lastElementSpawn: 0,
    lastStarSpawn: 0,
    stars: [],
    stageActiveUntil: [null, null, null, null, null],
    lastFrameTime: Date.now()
};

// 목표 값 (실제 누리호 발사 데이터 기반, 게임 시간 5분 기준으로 압축)
const targets = {
    stage1: {
        time: 53, // 압축된 시간 (원래 127초)
        altitude: 60, // km
        velocity: 1530, // m/s (Mach 4.5)
        tolerance: { time: 10, altitude: 5, velocity: 50 }
    },
    stage2: {
        time: 83, // 압축된 시간 (원래 197초)
        altitude: 120,
        tolerance: { time: 10, altitude: 10 }
    },
    stage3: {
        time: 108, // 압축된 시간 (원래 257초)
        altitude: 200,
        tolerance: { time: 10, altitude: 15 }
    },
    stage4: {
        time: 420, // 압축된 시간 (원래 1000초)
        altitude: 700,
        tolerance: { time: 15, altitude: 20 }
    }
};

// 물리 시뮬레이션 파라미터
const physics = {
    rocketSpeed: 100 // 로켓 좌우 이동 속도 (%/second)
};

const altitudeProfile = [
    { time: 0, altitude: 0 },
    { time: 13, altitude: 10 },
    { time: 25, altitude: 35 },
    { time: 38, altitude: 50 },
    { time: 53, altitude: 60 },
    { time: 67, altitude: 90 },
    { time: 83, altitude: 125 },
    { time: 97, altitude: 160 },
    { time: 108, altitude: 200 },
    { time: 134, altitude: 280 },
    { time: 168, altitude: 360 },
    { time: 252, altitude: 500 },
    { time: 336, altitude: 620 },
    { time: 420, altitude: 700 },
    { time: 504, altitude: 750 },
    { time: 630, altitude: 780 }
];

const velocityProfile = [
    { time: 0, velocity: 0 },
    { time: 4, velocity: 300 },
    { time: 13, velocity: 800 },
    { time: 25, velocity: 1200 },
    { time: 38, velocity: 1500 },
    { time: 53, velocity: 1530 },
    { time: 67, velocity: 1800 },
    { time: 83, velocity: 2100 },
    { time: 97, velocity: 2400 },
    { time: 108, velocity: 2600 },
    { time: 134, velocity: 3200 },
    { time: 168, velocity: 4200 },
    { time: 252, velocity: 5500 },
    { time: 336, velocity: 6500 },
    { time: 420, velocity: 7600 },
    { time: 504, velocity: 7800 },
    { time: 630, velocity: 7900 }
];

// DOM 요소
const elements = {
    rocket: document.getElementById('rocket'),
    rocketDisplay: document.getElementById('rocket-display'),
    altitude: document.getElementById('altitude'),
    velocity: document.getElementById('velocity'),
    time: document.getElementById('time'),
    startBtn: document.getElementById('start-btn'),
    helpBtn: document.getElementById('help-btn'),
    helpModal: document.getElementById('help-modal'),
    helpModalClose: document.getElementById('help-modal-close'),
    accuracy: document.getElementById('accuracy'),
    successRate: document.getElementById('success-rate'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownDisplay: document.getElementById('countdown-display'),
    ignitionEffect: document.getElementById('ignition-effect'),
    steamEffect: document.getElementById('steam-effect'),
    launchPad: document.getElementById('launch-pad'),
    backgroundContainer: document.getElementById('background-container'),
    gameoverOverlay: document.getElementById('gameover-overlay'),
    gameoverReason: document.getElementById('gameover-reason'),
    restartBtn: document.getElementById('restart-btn'),
    backToMenuBtn: document.getElementById('back-to-menu-btn'),
    trajectory: document.getElementById('trajectory'),
    actionHint: document.getElementById('action-hint'),
    successOverlay: document.getElementById('success-overlay'),
    successMenuBtn: document.getElementById('success-menu-btn'),
    recordsBtn: document.getElementById('records-btn'),
    recordsModal: document.getElementById('records-modal'),
    recordsModalClose: document.getElementById('records-modal-close'),
    recordsList: document.getElementById('records-list')
};

// 버튼 및 상태 요소
const stageElements = [1, 2, 3, 4].map(num => ({
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
            
            // "발사!"와 동시에 점화 효과 시작
            startIgnition();
            
            setTimeout(() => {
                elements.countdownOverlay.classList.remove('active');
                gameState.isCountdown = false;
                startGame();
            }, 500);
        }
    }, 1000);
}

// 점화 효과
function startIgnition() {
    elements.ignitionEffect.classList.add('active');
    elements.steamEffect.classList.add('active'); // 수증기 효과 시작
    
    // 3초 후 수증기 효과 자동 비활성화
    setTimeout(() => {
        elements.steamEffect.classList.remove('active');
    }, 3000);
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
    // 델타타임 계산
    const now = Date.now();
    const deltaTime = (now - gameState.lastFrameTime) / 1000; // 초 단위
    gameState.lastFrameTime = now;
    
    // 키 입력에 따른 로켓 이동 (델타타임 기반)
    if (keys.left && gameState.rocketX > 10) {
        gameState.rocketX = Math.max(10, gameState.rocketX - physics.rocketSpeed * deltaTime);
    }
    if (keys.right && gameState.rocketX < 90) {
        gameState.rocketX = Math.min(90, gameState.rocketX + physics.rocketSpeed * deltaTime);
    }
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
    let rocketPosition;
    if (gameState.isCountdown || !gameState.isRunning) {
        // 발사 전: 발사 플랫폼 위에 고정 (20px)
        rocketPosition = 20;
    } else {
        // 발사 후: 고도에 따라 점차 상승
        rocketPosition = 20 + Math.min((gameState.altitude / 800) * 560, 560);
    }
    elements.rocket.style.bottom = `${rocketPosition}px`;
    
    // 점화 효과 위치 (로켓 하단 바로 아래)
    if (elements.ignitionEffect) {
        // 로켓 이미지 높이를 고려하여 불꽃을 로켓 하단 아래에 배치
        const rocketHeight = 150; // 로켓 이미지 높이
        const scaledHeight = rocketHeight * Math.max(0.3, 1 - (gameState.altitude / 800) * 0.7);
        elements.ignitionEffect.style.bottom = `${rocketPosition - scaledHeight}px`;
    }
    
    // 수증기 효과는 점화 시점에 한 번만 실행 (3초 후 자동 비활성화)
    // 애니메이션이 끝나면 자동으로 사라지므로 별도 처리 불필요
    
    // 엄빌리컬 페이드아웃 (1km부터 페이드아웃, 5km에서 완전히 사라짐)
    if (elements.launchPad) {
        if (gameState.altitude <= 1) {
            elements.launchPad.style.opacity = '1';
        } else if (gameState.altitude <= 5) {
            // 1km ~ 5km: 페이드아웃
            const fadeOut = (gameState.altitude - 1) / 4; // 0 ~ 1
            elements.launchPad.style.opacity = String(1 - fadeOut);
        } else {
            // 5km 이상: 완전히 사라짐
            elements.launchPad.style.opacity = '0';
        }
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
    
    // 배경색 변경 (고도에 따라 어두워짐)
    updateBackgroundColor();
    
    // 별 생성 (고도가 높아질수록 더 많이)
    spawnStars();
    
    // 점화 효과도 X 위치에 맞춰 이동
    if (elements.ignitionEffect) {
        elements.ignitionEffect.style.left = `${gameState.rocketX}%`;
    }
    
    // 배경색 변경 (고도에 따라 어두워짐)
    updateBackgroundColor();
    
    // 별 생성 (고도가 높아질수록 더 많이)
    spawnStars();
}

function updateBackgroundColor() {
    if (!elements.rocketDisplay) return;
    
    const altitude = gameState.altitude;
    let bgColor;
    
    if (altitude < 10) {
        // 0~10km: 밝은 하늘색
        bgColor = 'linear-gradient(to top, #000428 0%, #004e92 30%, #87ceeb 100%)';
    } else if (altitude < 50) {
        // 10~50km: 점점 어두워짐
        const ratio = (altitude - 10) / 40;
        bgColor = `linear-gradient(to top, #000428 0%, #001122 ${30 + ratio * 20}%, #003366 ${50 + ratio * 30}%, #87ceeb 100%)`;
    } else if (altitude < 100) {
        // 50~100km: 더 어두워짐
        const ratio = (altitude - 50) / 50;
        bgColor = `linear-gradient(to top, #000011 0%, #000428 ${20 + ratio * 30}%, #001122 ${50 + ratio * 30}%, #003366 100%)`;
    } else if (altitude < 200) {
        // 100~200km: 우주 공간
        const ratio = (altitude - 100) / 100;
        bgColor = `linear-gradient(to top, #000000 0%, #000011 ${30 + ratio * 20}%, #000428 ${60 + ratio * 20}%, #001122 100%)`;
    } else {
        // 200km 이상: 완전한 우주
        bgColor = 'linear-gradient(to top, #000000 0%, #000011 50%, #000428 100%)';
    }
    
    elements.rocketDisplay.style.background = bgColor;
}

function spawnStars() {
    if (!gameState.isRunning || gameState.isCountdown || gameState.isGameOver) return;
    if (!elements.backgroundContainer) return;
    
    const altitude = gameState.altitude;
    
    // 고도가 낮으면 별 생성 안 함
    if (altitude < 50) return;
    
    // 고도가 높을수록 별 생성 빈도 증가
    const starSpawnRate = Math.min(0.3, (altitude - 50) / 650 * 0.3); // 50km부터 시작, 700km에서 최대
    
    const now = Date.now();
    const timeSinceLastStar = now - gameState.lastStarSpawn;
    
    // 별 생성 간격 (고도가 높을수록 더 자주)
    const spawnInterval = 2000 - (altitude / 700) * 1500; // 2초 ~ 0.5초
    
    if (timeSinceLastStar > spawnInterval && Math.random() < starSpawnRate) {
        const star = document.createElement('div');
        star.className = 'background-element star';
        star.textContent = '✨';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${Math.random() * 2}s`;
        star.style.opacity = '0.6';
        
        elements.backgroundContainer.appendChild(star);
        
        gameState.stars.push({
            element: star,
            startTime: Date.now()
        });
        
        gameState.lastStarSpawn = now;
        
        // 오래된 별 제거 (10초 이상)
        gameState.stars = gameState.stars.filter(starData => {
            if (Date.now() - starData.startTime > 10000) {
                if (starData.element.parentNode) {
                    starData.element.parentNode.removeChild(starData.element);
                }
                return false;
            }
            return true;
        });
    }
}

function spawnBackgroundElements() {
    if (!gameState.isRunning || gameState.isCountdown || gameState.isGameOver) return;
    
    const now = Date.now();
    const timeSinceLastSpawn = now - gameState.lastElementSpawn;
    
    // 랜덤한 간격으로 요소 생성 (0.3초 ~ 1.0초) - 적절한 빈도
    if (timeSinceLastSpawn > (300 + Math.random() * 700)) {
        const spawnCount = Math.random() < 0.3 ? 2 : 1; // 2개 생성 확률 30%
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
    // 고도에 따라 사용 가능한 타입 필터링
    let availableTypes = [];
    let weights = [];
    
    // 구름은 항상 생성 가능 (장애물 아님)
    const shouldSpawnCloud = Math.random() < 0.3; // 30% 확률로 구름 생성
    
    // 고도 조건 확인 (화면에 표시되는 고도와 동일한 값 사용)
    const currentAlt = gameState.altitude;
    
    if (currentAlt >= 0 && currentAlt < 5) {
        // 0~5km: 새
        availableTypes = ['bird'];
        weights = [1.0];
    } else if (currentAlt >= 5 && currentAlt < 12) {
        // 5~12km: 비행기
        availableTypes = ['plane'];
        weights = [1.0];
    } else if (currentAlt >= 12 && currentAlt < 50) {
        // 12~50km: 유성
        availableTypes = ['meteor'];
        weights = [1.0];
    } else if (currentAlt >= 50 && currentAlt < 200) {
        // 50~200km: UFO
        availableTypes = ['ufo'];
        weights = [1.0];
    } else if (currentAlt >= 200 && currentAlt < 400) {
        // 200~400km: 인공위성
        availableTypes = ['satellite'];
        weights = [1.0];
    } else if (currentAlt >= 400 && currentAlt < 700) {
        // 400~700km: ISS, 인공위성
        availableTypes = ['iss', 'satellite'];
        weights = [0.3, 0.7];
    } else {
        // 700km 이상: 장애물 없음
        return null;
    }
    
    // availableTypes가 비어있으면 null 반환
    if (availableTypes.length === 0) {
        return null;
    }
    
    // 가중치 기반으로 타입 선택
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
    
    const type = availableTypes[typeIndex];
    
    // 구름 생성 (장애물이 아니므로 별도 처리, 장애물과 함께 생성)
    if (shouldSpawnCloud && currentAlt < 50) {
        // 50km 이하에서만 구름 생성
        const cloudElement = document.createElement('div');
        cloudElement.className = 'background-element cloud';
        cloudElement.textContent = '☁️';
        const xPos = 10 + Math.random() * 80;
        cloudElement.style.left = `${xPos}%`;
        cloudElement.style.top = '-50px';
        cloudElement.style.animationDuration = '6s';
        elements.backgroundContainer.appendChild(cloudElement);
        gameState.backgroundElements.push({
            element: cloudElement,
            type: 'cloud',
            x: xPos,
            startTime: Date.now(),
            duration: 6
        });
    }
    const element = document.createElement('div');
    element.className = `background-element ${type}`;
    
    // 이모지 설정
    if (type === 'cloud') {
        element.textContent = '☁️';
    } else if (type === 'bird') {
        element.textContent = '🐦';
    } else if (type === 'plane') {
        element.textContent = '✈️';
    } else if (type === 'ufo') {
        element.textContent = '🛸';
    } else if (type === 'satellite') {
        element.textContent = '🛰️';
    } else if (type === 'iss') {
        element.textContent = '🛰️'; // ISS는 인공위성 이모지 사용
    } else if (type === 'meteor') {
        element.textContent = '🌠';
    }
    
    // 랜덤 X 위치 (로켓 디스플레이 영역 내)
    const xPos = 10 + Math.random() * 80; // 10% ~ 90%
    element.style.left = `${xPos}%`;
    element.style.top = '-50px';
    
    // 애니메이션 속도 (타입별로 다르게)
    let duration;
    if (type === 'cloud') {
        duration = 6;
        element.style.animation = `fall ${duration}s linear`;
    } else if (type === 'bird') {
        duration = 3;
        element.style.animation = `fall ${duration}s linear`;
    } else if (type === 'plane') {
        duration = 4;
        element.style.animation = `fall ${duration}s linear`;
    } else if (type === 'ufo') {
        duration = 5;
        // UFO는 fall 애니메이션과 ufoFloat 애니메이션을 함께 사용
        element.style.animation = `fall ${duration}s linear, ufoFloat 2s ease-in-out infinite`;
    } else if (type === 'satellite') {
        duration = 4.5;
        element.style.animation = `fall ${duration}s linear`;
    } else if (type === 'iss') {
        duration = 5;
        element.style.animation = `fall ${duration}s linear`;
    } else if (type === 'meteor') {
        duration = 3.5;
        // 유성은 fall 애니메이션과 meteorTrail 애니메이션을 함께 사용
        element.style.animation = `fall ${duration}s linear, meteorTrail 0.5s ease-in-out infinite`;
    }
    
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
    // 게임오버 시 배경 애니메이션 중지
    if (gameState.isGameOver) {
        return;
    }
    
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
            const obstacleNames = {
                'bird': '새',
                'plane': '비행기',
                'meteor': '유성',
                'ufo': 'UFO',
                'satellite': '인공위성',
                'iss': '국제 우주정거장'
            };
            const obstacleName = obstacleNames[bgElement.type] || '장애물';
            gameOver(`${obstacleName}과 충돌했습니다!`);
        }
    });
}

function checkStageAvailability() {
    let hintShown = false;
    stageElements.forEach((elem, index) => {
        const stageNum = index + 1;
        const target = targets[`stage${stageNum}`];
        
        if (gameState.completedStages.includes(stageNum)) {
            elem.progress.classList.remove('active');
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
            elem.progress.classList.add('active');
            const remaining = Math.max(0, gameState.stageActiveUntil[stageNum] - gameState.currentTime);
            elem.status.textContent = `스페이스바! ${remaining.toFixed(1)}초`;
            elem.status.className = 'step-status waiting';
            
            if (!hintShown) {
                showActionHint(stageNum, remaining);
                hintShown = true;
            }
        } else {
            elem.progress.classList.remove('active');
            if (gameState.stage === stageNum - 1 && !gameState.completedStages.includes(stageNum)) {
                elem.status.textContent = '대기 중...';
                elem.status.className = 'step-status';
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
    
    // 단계별 실행 정보 저장
    gameState.stageData.push({
        stage: stageNum,
        time: gameState.currentTime,
        altitude: gameState.altitude,
        velocity: gameState.velocity
    });
    
    // UI 업데이트
    if (accuracy >= 80) {
        elem.status.textContent = `성공! (${accuracy.toFixed(0)}%)`;
        elem.status.className = 'step-status';
    } else if (accuracy >= 50) {
        elem.status.textContent = `보통 (${accuracy.toFixed(0)}%)`;
        elem.status.className = 'step-status';
    } else {
        elem.status.textContent = `실패 (${accuracy.toFixed(0)}%)`;
        elem.status.className = 'step-status';
    }
    
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

// 기록 저장
function saveRecord(isSuccess) {
    if (gameState.scores.length === 0) return;
    
    const avgAccuracy = gameState.scores.reduce((a, b) => a + b, 0) / gameState.scores.length;
    const allPassed = gameState.scores.every(score => score >= 70);
    const successRate = allPassed ? 
        Math.min(100, avgAccuracy * 1.1) : 
        Math.max(0, avgAccuracy * 0.8);
    
    const record = {
        date: new Date().toISOString(),
        isSuccess: isSuccess,
        accuracy: avgAccuracy,
        successRate: successRate,
        completedStages: gameState.completedStages.length,
        maxAltitude: gameState.altitude,
        maxVelocity: gameState.velocity,
        time: gameState.currentTime
    };
    
    // 로컬스토리지에서 기존 기록 불러오기
    let records = JSON.parse(localStorage.getItem('nuriGameRecords') || '[]');
    
    // 새 기록 추가
    records.push(record);
    
    // 최대 50개까지만 저장 (최근 10개만 표시하지만 더 많이 저장)
    if (records.length > 50) {
        records = records.slice(-50);
    }
    
    // 저장
    localStorage.setItem('nuriGameRecords', JSON.stringify(records));
}

// 기록 불러오기 및 표시
function loadAndDisplayRecords() {
    const records = JSON.parse(localStorage.getItem('nuriGameRecords') || '[]');
    
    if (records.length === 0) {
        elements.recordsList.innerHTML = '<p class="no-records">아직 기록이 없습니다.</p>';
        return;
    }
    
    // 최고 기록 찾기 (성공률 기준)
    const bestRecord = records.reduce((best, record) => {
        if (!best || record.successRate > best.successRate) {
            return record;
        }
        return best;
    }, null);
    
    // 최근 기록 10개 가져오기 (최신순)
    const recentRecords = records.slice(-10).reverse();
    
    // 최고 기록이 최근 10개에 포함되어 있지 않으면 추가
    let displayRecords = [...recentRecords];
    if (bestRecord && !recentRecords.find(r => r.date === bestRecord.date)) {
        displayRecords = [bestRecord, ...recentRecords];
    } else {
        // 최고 기록이 최근 10개에 포함되어 있으면 맨 위로
        displayRecords = displayRecords.sort((a, b) => {
            if (a.date === bestRecord.date) return -1;
            if (b.date === bestRecord.date) return 1;
            return new Date(b.date) - new Date(a.date);
        });
    }
    
    // 최대 11개 (최고 기록 + 최근 10개)
    displayRecords = displayRecords.slice(0, 11);
    
    // HTML 생성
    elements.recordsList.innerHTML = displayRecords.map((record, index) => {
        const isBest = record.date === bestRecord.date;
        const date = new Date(record.date);
        const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        
        return `
            <div class="record-item ${isBest ? 'best' : ''}">
                <div class="record-header">
                    <span class="record-title">${isBest ? '최고 기록' : (record.isSuccess ? '게임 클리어' : '게임 오버')}</span>
                    <span class="record-date">${dateStr}</span>
                </div>
                <div class="record-details">
                    <div class="record-detail-item">
                        <span class="record-detail-label">정확도</span>
                        <span class="record-detail-value">${record.accuracy.toFixed(1)}%</span>
                    </div>
                    <div class="record-detail-item">
                        <span class="record-detail-label">성공률</span>
                        <span class="record-detail-value">${record.successRate.toFixed(1)}%</span>
                    </div>
                    <div class="record-detail-item">
                        <span class="record-detail-label">완료 단계</span>
                        <span class="record-detail-value">${record.completedStages}/4</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function startGame() {
    gameState.isRunning = true;
    gameState.isGameOver = false;
    gameState.startTime = Date.now();
    gameState.lastFrameTime = Date.now();
    gameState.stage = 0;
    gameState.completedStages = [];
    gameState.stageData = [];
    gameState.scores = [];
    gameState.rocketX = 50;
    gameState.backgroundElements = [];
    gameState.lastElementSpawn = Date.now();
    gameState.stageActiveUntil = [null, null, null, null, null];
    
    elements.startBtn.disabled = true;
    elements.gameoverOverlay.classList.remove('active');
    elements.successOverlay.classList.remove('active');
    
    // 게임 중에는 컨트롤 버튼 숨김
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.add('hidden');
    }
    
    // 모든 단계 초기화
    stageElements.forEach(elem => {
        elem.status.textContent = '대기 중...';
        elem.status.className = 'step-status';
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
    
    // 로켓 위치 초기화 (발사 플랫폼 위)
    elements.rocket.style.bottom = '20px';
    
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
    elements.countdownOverlay.classList.remove('active');
    elements.gameoverOverlay.classList.remove('active');
    elements.successOverlay.classList.remove('active');
    elements.ignitionEffect.classList.remove('active');
    elements.steamEffect.classList.remove('active');
    if (elements.steamEffect) {
        elements.steamEffect.style.opacity = '0';
    }
    
    // 로켓 위치 초기화 (발사 플랫폼 위)
    elements.rocket.style.bottom = '20px';
    
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
        elem.status.textContent = '대기 중...';
        elem.status.className = 'step-status';
        elem.progress.classList.remove('active', 'completed');
    });
    hideActionHint();
}

function gameOver(reason) {
    gameState.isRunning = false;
    gameState.isGameOver = true;
    
    // 배경 애니메이션 중지
    gameState.backgroundElements.forEach(bgElement => {
        if (bgElement.element) {
            bgElement.element.style.animationPlayState = 'paused';
        }
    });
    
    // 새로운 배경 요소 생성 중지
    gameState.lastElementSpawn = Infinity;
    
    // 수증기 효과 중지
    elements.steamEffect.classList.remove('active');
    
    // 기록 저장
    saveRecord(false);
    
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
                const progressElement = document.getElementById(`progress-step${currentStage}`);
                if (progressElement && progressElement.classList.contains('active')) {
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
// 게임방법 모달 열기/닫기
elements.helpBtn.addEventListener('click', () => {
    elements.helpModal.classList.add('active');
});

elements.helpModalClose.addEventListener('click', () => {
    elements.helpModal.classList.remove('active');
});

// 모달 외부 클릭 시 닫기
elements.helpModal.addEventListener('click', (e) => {
    if (e.target === elements.helpModal) {
        elements.helpModal.classList.remove('active');
    }
});

// 기록보기 모달 열기/닫기
elements.recordsBtn.addEventListener('click', () => {
    loadAndDisplayRecords();
    elements.recordsModal.classList.add('active');
});

elements.recordsModalClose.addEventListener('click', () => {
    elements.recordsModal.classList.remove('active');
});

// 기록보기 모달 외부 클릭 시 닫기
elements.recordsModal.addEventListener('click', (e) => {
    if (e.target === elements.recordsModal) {
        elements.recordsModal.classList.remove('active');
    }
});

elements.startBtn.addEventListener('click', () => {
    if (!gameState.isCountdown && !gameState.isRunning) {
        countdown();
    }
});

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
    
    // 비교 테이블 생성
    displayComparisonTable();
    
    if (elements.successOverlay) {
        elements.successOverlay.classList.add('active');
    }
    
    const controlsElement = document.getElementById('controls');
    if (controlsElement) {
        controlsElement.classList.remove('hidden');
    }
}

function displayComparisonTable() {
    const tbody = document.getElementById('comparison-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // 실제 누리호 데이터 (원본 시간 기준)
    const realNuriData = {
        1: { time: 127, altitude: 60, velocity: 1530, label: '1단 분리' },
        2: { time: 197, altitude: 120, velocity: null, label: '페어링 분리' },
        3: { time: 257, altitude: 200, velocity: null, label: '2단 분리' },
        4: { time: 1000, altitude: 700, velocity: null, label: '페이로드 분리' }
    };
    
    // 게임 시간으로 변환된 실제 누리호 데이터 (5분 기준으로 압축)
    const gameTimeRatio = 420 / 1000; // 0.42
    const realNuriGameData = {
        1: { time: Math.round(127 * gameTimeRatio), altitude: 60, velocity: 1530, label: '1단 분리' },
        2: { time: Math.round(197 * gameTimeRatio), altitude: 120, velocity: null, label: '페어링 분리' },
        3: { time: Math.round(257 * gameTimeRatio), altitude: 200, velocity: null, label: '2단 분리' },
        4: { time: 420, altitude: 700, velocity: null, label: '페이로드 분리' }
    };
    
    gameState.stageData.forEach((playerData, index) => {
        const stageNum = playerData.stage;
        const realData = realNuriGameData[stageNum];
        if (!realData) return;
        
        const row = document.createElement('tr');
        
        // 단계명
        const stageCell = document.createElement('td');
        stageCell.textContent = realData.label;
        row.appendChild(stageCell);
        
        // 시간 비교
        const timeCell = document.createElement('td');
        const timeDiff = playerData.time - realData.time;
        const timeDiffStr = timeDiff >= 0 ? `+${timeDiff.toFixed(1)}초` : `${timeDiff.toFixed(1)}초`;
        timeCell.innerHTML = `
            <div>실제: ${formatTime(realData.time)}</div>
            <div>플레이어: ${formatTime(playerData.time)}</div>
            <div class="diff ${timeDiff === 0 ? 'perfect' : Math.abs(timeDiff) <= 5 ? 'good' : 'bad'}">${timeDiffStr}</div>
        `;
        row.appendChild(timeCell);
        
        // 고도 비교
        const altitudeCell = document.createElement('td');
        const altitudeDiff = playerData.altitude - realData.altitude;
        const altitudeDiffStr = altitudeDiff >= 0 ? `+${altitudeDiff.toFixed(1)}km` : `${altitudeDiff.toFixed(1)}km`;
        altitudeCell.innerHTML = `
            <div>실제: ${realData.altitude}km</div>
            <div>플레이어: ${playerData.altitude.toFixed(1)}km</div>
            <div class="diff ${altitudeDiff === 0 ? 'perfect' : Math.abs(altitudeDiff) <= 10 ? 'good' : 'bad'}">${altitudeDiffStr}</div>
        `;
        row.appendChild(altitudeCell);
        
        // 속도 비교 (1단만)
        const velocityCell = document.createElement('td');
        if (stageNum === 1 && realData.velocity) {
            const velocityDiff = playerData.velocity - realData.velocity;
            const velocityDiffStr = velocityDiff >= 0 ? `+${velocityDiff.toFixed(0)}m/s` : `${velocityDiff.toFixed(0)}m/s`;
            velocityCell.innerHTML = `
                <div>실제: ${realData.velocity}m/s</div>
                <div>플레이어: ${playerData.velocity.toFixed(0)}m/s</div>
                <div class="diff ${velocityDiff === 0 ? 'perfect' : Math.abs(velocityDiff) <= 50 ? 'good' : 'bad'}">${velocityDiffStr}</div>
            `;
        } else {
            velocityCell.innerHTML = '<div>-</div>';
        }
        row.appendChild(velocityCell);
        
        tbody.appendChild(row);
    });
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}분 ${secs}초`;
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

