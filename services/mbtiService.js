class MbtiService {
    constructor() {
        // MBTI별 바둑 플레이 스타일 정의
        this.mbtiStyles = {
            'INTJ': {
                name: '건축가',
                style: '전략적이고 체계적인 플레이',
                strengths: ['장기 전략 수립', '복잡한 수순 계산', '상대 패턴 분석'],
                weaknesses: ['즉흥적 대응', '감각적 판단', '단기 전술']
            },
            'INTP': {
                name: '논리술사',
                style: '이론적이고 분석적인 플레이',
                strengths: ['수학적 계산', '이론적 접근', '새로운 수법 탐구'],
                weaknesses: ['실전 감각', '시간 관리', '감정적 판단']
            },
            'ENTJ': {
                name: '통솔자',
                style: '공격적이고 주도적인 플레이',
                strengths: ['공세 전개', '상대 압박', '빠른 판단'],
                weaknesses: ['과도한 공격', '수비 소홀', '성급한 판단']
            },
            'ENTP': {
                name: '변론가',
                style: '창의적이고 변화무쌍한 플레이',
                strengths: ['기발한 수법', '예측 불가능한 전술', '적응력'],
                weaknesses: ['일관성 부족', '기본기 소홀', '집중력']
            },
            'INFJ': {
                name: '선의의 옹호자',
                style: '직관적이고 예측 가능한 플레이',
                strengths: ['상대 심리 파악', '직관적 판단', '균형잡힌 플레이'],
                weaknesses: ['과도한 신중함', '공격성 부족', '결단력']
            },
            'INFP': {
                name: '중재자',
                style: '유연하고 창의적인 플레이',
                strengths: ['다양한 수법', '유연한 대응', '감각적 판단'],
                weaknesses: ['체계성 부족', '일관성', '경쟁 의식']
            },
            'ENFJ': {
                name: '주인',
                style: '협력적이고 조화로운 플레이',
                strengths: ['상대 이해', '균형잡힌 전략', '안정적 플레이'],
                weaknesses: ['공격성 부족', '과도한 신중함', '결단력']
            },
            'ENFP': {
                name: '활동가',
                style: '즉흥적이고 역동적인 플레이',
                strengths: ['즉흥적 대응', '창의적 수법', '적응력'],
                weaknesses: ['계획성 부족', '일관성', '집중력']
            },
            'ISTJ': {
                name: '논리주의자',
                style: '체계적이고 신중한 플레이',
                strengths: ['기본기 탄탄', '안정적 플레이', '실수 최소화'],
                weaknesses: ['창의성 부족', '변화 대응', '공격성']
            },
            'ISFJ': {
                name: '수호자',
                style: '방어적이고 신중한 플레이',
                strengths: ['수비력', '안정성', '인내심'],
                weaknesses: ['공격성 부족', '적극성', '변화 대응']
            },
            'ESTJ': {
                name: '경영자',
                style: '체계적이고 효율적인 플레이',
                strengths: ['효율적 전략', '빠른 판단', '실용적 접근'],
                weaknesses: ['유연성 부족', '창의성', '감각적 판단']
            },
            'ESFJ': {
                name: '집정관',
                style: '협력적이고 안정적인 플레이',
                strengths: ['안정적 플레이', '협력적 전략', '신중함'],
                weaknesses: ['공격성 부족', '독창성', '변화 대응']
            },
            'ISTP': {
                name: '만능재주꾼',
                style: '실용적이고 즉흥적인 플레이',
                strengths: ['실전 감각', '즉흥적 대응', '유연성'],
                weaknesses: ['장기 전략', '계획성', '일관성']
            },
            'ISFP': {
                name: '모험가',
                style: '감각적이고 유연한 플레이',
                strengths: ['감각적 판단', '유연한 대응', '창의성'],
                weaknesses: ['체계성 부족', '장기 전략', '일관성']
            },
            'ESTP': {
                name: '사업가',
                style: '공격적이고 즉흥적인 플레이',
                strengths: ['빠른 판단', '공격적 전술', '실전 감각'],
                weaknesses: ['장기 전략', '신중함', '계획성']
            },
            'ESFP': {
                name: '연예인',
                style: '즉흥적이고 역동적인 플레이',
                strengths: ['즉흥적 대응', '감각적 판단', '적응력'],
                weaknesses: ['계획성 부족', '장기 전략', '일관성']
            }
        };

        // MBTI 상성 매트릭스 (16x16)
        // 점수: 0-100 (높을수록 좋은 상성)
        this.compatibilityMatrix = this.buildCompatibilityMatrix();
    }

    buildCompatibilityMatrix() {
        const mbtis = Object.keys(this.mbtiStyles);
        const matrix = {};

        mbtis.forEach(myMbti => {
            matrix[myMbti] = {};
            mbtis.forEach(opponentMbti => {
                if (myMbti === opponentMbti) {
                    matrix[myMbti][opponentMbti] = 50; // 동일 MBTI는 중간
                } else {
                    // MBTI 차원별 비교
                    const score = this.calculateCompatibility(myMbti, opponentMbti);
                    matrix[myMbti][opponentMbti] = score;
                }
            });
        });

        return matrix;
    }

    calculateCompatibility(myMbti, opponentMbti) {
        // MBTI 4차원 비교
        // I/E, N/S, T/F, J/P
        let score = 50; // 기본 점수

        // I/E 차원: 내향 vs 외향
        const myIE = myMbti[0];
        const oppIE = opponentMbti[0];
        if (myIE !== oppIE) {
            score += 10; // 상반된 성향은 상성 좋음
        }

        // N/S 차원: 직관 vs 감각
        const myNS = myMbti[1];
        const oppNS = opponentMbti[1];
        if (myNS !== oppNS) {
            score += 15; // 상반된 성향은 상성 좋음
        }

        // T/F 차원: 사고 vs 감정
        const myTF = myMbti[2];
        const oppTF = opponentMbti[2];
        if (myTF !== oppTF) {
            score += 10; // 상반된 성향은 상성 좋음
        }

        // J/P 차원: 판단 vs 인식
        const myJP = myMbti[3];
        const oppJP = opponentMbti[3];
        if (myJP !== oppJP) {
            score += 15; // 상반된 성향은 상성 좋음
        }

        // 점수 정규화 (0-100)
        return Math.max(0, Math.min(100, score));
    }

    compareBadukMBTI(myMBTI, opponentMBTI) {
        if (!myMBTI || !opponentMBTI) {
            return null;
        }

        myMBTI = myMBTI.toUpperCase();
        opponentMBTI = opponentMBTI.toUpperCase();

        if (!this.mbtiStyles[myMBTI] || !this.mbtiStyles[opponentMBTI]) {
            return null;
        }

        const compatibilityScore = this.compatibilityMatrix[myMBTI][opponentMBTI];
        const myStyle = this.mbtiStyles[myMBTI];
        const opponentStyle = this.mbtiStyles[opponentMBTI];

        // 상성 평가
        let compatibilityLevel = '보통';
        let compatibilityColor = '#fbbf24'; // 노란색
        if (compatibilityScore >= 70) {
            compatibilityLevel = '좋음';
            compatibilityColor = '#10b981'; // 초록색
        } else if (compatibilityScore <= 40) {
            compatibilityLevel = '나쁨';
            compatibilityColor = '#ef4444'; // 빨간색
        }

        // 상대의 강점과 약점 분석
        const opponentStrengths = opponentStyle.strengths;
        const opponentWeaknesses = opponentStyle.weaknesses;
        const myStrengths = myStyle.strengths;

        // 공략법 생성
        const strategies = this.generateStrategies(myMBTI, opponentMBTI, myStyle, opponentStyle, compatibilityScore);

        return {
            compatibilityScore: compatibilityScore,
            compatibilityLevel: compatibilityLevel,
            compatibilityColor: compatibilityColor,
            myMBTI: {
                type: myMBTI,
                name: myStyle.name,
                style: myStyle.style,
                strengths: myStrengths
            },
            opponentMBTI: {
                type: opponentMBTI,
                name: opponentStyle.name,
                style: opponentStyle.style,
                strengths: opponentStrengths,
                weaknesses: opponentWeaknesses
            },
            strategies: strategies,
            tips: this.generateTips(myMBTI, opponentMBTI, compatibilityScore)
        };
    }

    generateStrategies(myMBTI, opponentMBTI, myStyle, opponentStyle, score) {
        const strategies = [];

        // 상대의 약점을 노리는 전략
        opponentStyle.weaknesses.forEach(weakness => {
            if (myStyle.strengths.some(strength => 
                (weakness.includes('공격') && strength.includes('공격')) ||
                (weakness.includes('수비') && strength.includes('수비')) ||
                (weakness.includes('계획') && strength.includes('전략')) ||
                (weakness.includes('즉흥') && strength.includes('계획'))
            )) {
                strategies.push({
                    type: '약점 공략',
                    description: `상대의 "${weakness}" 약점을 노려 ${myStyle.strengths.find(s => 
                        (weakness.includes('공격') && s.includes('공격')) ||
                        (weakness.includes('수비') && s.includes('수비')) ||
                        (weakness.includes('계획') && s.includes('전략')) ||
                        (weakness.includes('즉흥') && s.includes('계획'))
                    )}를 활용하세요.`
                });
            }
        });

        // 상성 점수에 따른 전략
        if (score >= 70) {
            strategies.push({
                type: '상성 활용',
                description: '좋은 상성입니다. 자신의 강점을 믿고 공격적으로 플레이하세요.'
            });
        } else if (score <= 40) {
            strategies.push({
                type: '신중한 플레이',
                description: '상성이 좋지 않습니다. 신중하게 플레이하고 실수를 최소화하세요.'
            });
        }

        // MBTI 특성별 맞춤 전략
        if (opponentMBTI.startsWith('E') && myMBTI.startsWith('I')) {
            strategies.push({
                type: '속도 대응',
                description: '상대는 빠른 판단을 선호합니다. 신중하게 생각하고 급하게 대응하지 마세요.'
            });
        }

        if (opponentMBTI.startsWith('I') && myMBTI.startsWith('E')) {
            strategies.push({
                type: '주도권 확보',
                description: '상대는 신중한 플레이를 선호합니다. 주도권을 잡고 공격적으로 나가세요.'
            });
        }

        if (opponentMBTI[1] === 'S' && myMBTI[1] === 'N') {
            strategies.push({
                type: '직관 활용',
                description: '상대는 실용적 접근을 선호합니다. 직관을 활용한 창의적 수법을 시도하세요.'
            });
        }

        if (opponentMBTI[1] === 'N' && myMBTI[1] === 'S') {
            strategies.push({
                type: '실전 감각',
                description: '상대는 이론적 접근을 선호합니다. 실전 감각을 활용한 실용적 수법을 사용하세요.'
            });
        }

        return strategies;
    }

    generateTips(myMBTI, opponentMBTI, score) {
        const tips = [];

        if (score >= 70) {
            tips.push('이 조합은 당신에게 유리합니다. 자신감을 가지고 플레이하세요.');
            tips.push('상대의 약점을 노리는 공격적 전략이 효과적입니다.');
        } else if (score <= 40) {
            tips.push('이 조합은 당신에게 불리할 수 있습니다. 신중하게 플레이하세요.');
            tips.push('실수를 최소화하고 안정적인 수를 두는 것이 중요합니다.');
        } else {
            tips.push('균형잡힌 플레이가 중요합니다. 기회를 노리되 무리하지 마세요.');
        }

        return tips;
    }
}

module.exports = new MbtiService();

