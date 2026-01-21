// 프로필 모달 관리

let currentProfileUserId = null;

// 프로필 모달 표시
async function showProfileModal(userId) {
    if (!userId) {
        console.error('User ID is required');
        return;
    }

    // 자신의 프로필을 클릭한 경우는 처리하지 않음 (기존 프로필 수정 모달 사용)
    const currentUserId = getCurrentUserId();
    if (userId === currentUserId) {
        return;
    }

    currentProfileUserId = userId;
    const modal = document.getElementById('profileModalOverlay');
    const modalBody = document.getElementById('profileModalBody');

    if (!modal || !modalBody) {
        console.error('Profile modal elements not found');
        return;
    }

    // 로딩 상태 표시
    modalBody.innerHTML = '<div style="text-align: center; padding: 40px;">로딩 중...</div>';
    modal.classList.add('active');

    try {
        // 프로필 데이터 가져오기
        const response = await fetch(`/api/user/profile/${userId}`, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('프로필을 불러올 수 없습니다.');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || '프로필을 불러올 수 없습니다.');
        }

        const profile = data.profile;
        const currentUserMBTI = data.currentUserMBTI;

        // 프로필 모달 내용 렌더링
        renderProfileModal(profile, currentUserMBTI);
    } catch (error) {
        console.error('Error loading profile:', error);
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <p>프로필을 불러올 수 없습니다.</p>
                <p style="font-size: 14px; color: #666;">${error.message}</p>
            </div>
        `;
    }
}

// 프로필 모달 내용 렌더링
function renderProfileModal(profile, currentUserMBTI) {
    const modalBody = document.getElementById('profileModalBody');
    if (!modalBody) return;

    // 티어 이미지 경로
    const tierImage = `/images/tire${profile.tier}.webp`;

    // 아바타 이미지 경로
    const avatarImage = `/images/profile${profile.avatar}.webp`;

    let html = `
        <div class="profile-modal-content">
            <div class="profile-header">
                <div class="profile-avatar-large-modal">
                    <img src="${avatarImage}" alt="${profile.nickname}" onerror="this.style.display='none'; this.parentElement.textContent='${profile.nickname.charAt(0).toUpperCase()}';">
                </div>
                <div class="profile-info-header">
                    <div class="profile-nickname-modal">${escapeHtml(profile.nickname)}</div>
                    <div class="profile-rating-modal">
                        <img src="${tierImage}" alt="티어${profile.tier}" class="profile-tier-icon-modal" onerror="this.style.display='none';">
                        레이팅: ${profile.rating}
                    </div>
                </div>
            </div>

            <div class="profile-stats-grid">
                <div class="profile-stat-item">
                    <div class="profile-stat-value" style="color: #667eea !important;">${profile.wins}</div>
                    <div class="profile-stat-label">승</div>
                </div>
                <div class="profile-stat-item">
                    <div class="profile-stat-value" style="color: #ef4444 !important;">${profile.losses}</div>
                    <div class="profile-stat-label">패</div>
                </div>
                <div class="profile-stat-item">
                    <div class="profile-stat-value" style="color: #10b981 !important;">${profile.winRate}%</div>
                    <div class="profile-stat-label">승률</div>
                </div>
            </div>

            <div class="profile-details">
                <div class="profile-detail-item">
                    <span class="profile-detail-label">총 게임 수</span>
                    <span class="profile-detail-value">${profile.totalGames}게임</span>
                </div>
                <div class="profile-detail-item">
                    <span class="profile-detail-label">매너점수</span>
                    <span class="profile-detail-value">${profile.mannerScore}</span>
                </div>
                <div class="profile-detail-item">
                    <span class="profile-detail-label">바둑MBTI</span>
                    <span class="profile-detail-value">${profile.badukMBTI || '설정하지 않음'}</span>
                </div>
            </div>
    `;

    html += '</div>';
    modalBody.innerHTML = html;

    // 바둑MBTI 비교 섹션 (양쪽 모두 설정된 경우) - 비동기로 로드
    if (profile.badukMBTI && currentUserMBTI) {
        loadMBTIComparison(profile.badukMBTI, currentUserMBTI);
    }
}

// 바둑MBTI 비교 결과 로드 및 표시
async function loadMBTIComparison(opponentMBTI, myMBTI) {
    const modalBody = document.getElementById('profileModalBody');
    if (!modalBody) return;

    try {
        const comparisonHtml = await renderMBTIComparison(opponentMBTI, myMBTI);
        if (comparisonHtml) {
            const content = modalBody.querySelector('.profile-modal-content');
            if (content) {
                content.innerHTML += comparisonHtml;
            }
        }
    } catch (error) {
        console.error('Error loading MBTI comparison:', error);
    }
}

// 바둑MBTI 비교 결과 렌더링
async function renderMBTIComparison(opponentMBTI, myMBTI) {
    try {
        // 서버에서 MBTI 비교 결과 가져오기
        const response = await fetch(`/api/user/compare-mbti?myMBTI=${myMBTI}&opponentMBTI=${opponentMBTI}`, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            return ''; // 비교 실패 시 빈 문자열 반환
        }

        const data = await response.json();
        if (!data.success || !data.comparison) {
            return '';
        }

        const comp = data.comparison;

        let html = `
            <div class="mbti-comparison-section">
                <div class="mbti-comparison-title">
                    <span>바둑MBTI 상성 분석</span>
                </div>
                <div style="text-align: center; margin-bottom: 20px;">
                    <div class="compatibility-badge" style="background: ${comp.compatibilityColor}; color: white;">
                        상성: ${comp.compatibilityLevel}
                    </div>
                    <div class="compatibility-score">${comp.compatibilityScore}점</div>
                </div>

                <div class="mbti-info-card">
                    <h4>상대 플레이 스타일 (${comp.opponentMBTI.type} - ${comp.opponentMBTI.name})</h4>
                    <p>${comp.opponentMBTI.style}</p>
                </div>

                <div class="mbti-info-card">
                    <h4>상대의 강점</h4>
                    <ul class="strengths-list">
                        ${comp.opponentMBTI.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                </div>

                <div class="mbti-info-card">
                    <h4>상대의 약점</h4>
                    <ul class="weaknesses-list">
                        ${comp.opponentMBTI.weaknesses.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
                    </ul>
                </div>

                <div class="strategies-section">
                    <h4 style="margin-bottom: 10px; color: #333;">추천 공략법</h4>
                    ${comp.strategies.map(strategy => `
                        <div class="strategy-item">
                            <div class="strategy-type">${escapeHtml(strategy.type)}</div>
                            <div class="strategy-description">${escapeHtml(strategy.description)}</div>
                        </div>
                    `).join('')}
                </div>

                <div class="tips-section">
                    <h4>팁</h4>
                    <ul class="tips-list">
                        ${comp.tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;

        return html;
    } catch (error) {
        console.error('Error comparing MBTI:', error);
        return '';
    }
}

// 프로필 모달 닫기
function closeProfileModal() {
    const modal = document.getElementById('profileModalOverlay');
    if (modal) {
        modal.classList.remove('active');
    }
    currentProfileUserId = null;
}

// HTML 이스케이프 함수
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 현재 유저 ID 가져오기 (전역 변수 또는 데이터 속성에서)
function getCurrentUserId() {
    // 여러 방법으로 시도
    if (typeof currentUser !== 'undefined' && currentUser && currentUser.id) {
        return currentUser.id;
    }
    if (typeof window.currentUser !== 'undefined' && window.currentUser && window.currentUser.id) {
        return window.currentUser.id;
    }
    // currentUserId 전역 변수 확인 (대기실에서 사용)
    if (typeof currentUserId !== 'undefined' && currentUserId) {
        return currentUserId;
    }
    // 데이터 속성에서 가져오기
    const userElement = document.querySelector('[data-user-id]');
    if (userElement) {
        return userElement.getAttribute('data-user-id');
    }
    return null;
}

// 모달 외부 클릭 시 닫기
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('profileModalOverlay');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeProfileModal();
            }
        });
    }

    // ESC 키로 닫기
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('profileModalOverlay');
            if (modal && modal.classList.contains('active')) {
                closeProfileModal();
            }
        }
    });
});

