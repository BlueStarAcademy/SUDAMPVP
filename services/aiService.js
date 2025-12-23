const aiQueue = require('../queue/aiQueue');
const { spawn } = require('child_process');
const gameService = require('./gameService');

class AIService {
    constructor() {
        this.setupQueueProcessor();
    }

    setupQueueProcessor() {
        aiQueue.process('gnugo-move', async (job) => {
            const { gameId, level, gameState, isCasualMode } = job.data;
            
            // 놀이바둑일 때는 우리가 만든 AI봇 사용 (그누고 사용 안 함)
            if (isCasualMode) {
                return await this.getCasualAiMove(gameId, level, gameState);
            }
            
            // 기본값을 'demo'로 변경하여 테스트 용이하게 (Gnugo 연결이 어려운 경우)
            const aiMode = process.env.AI_MODE || 'demo';
            
            if (aiMode === 'demo') {
                return await this.getDemoMove(gameId, level, gameState);
            } else {
                // Gnugo를 사용하려고 시도하지만, 실패하면 데모 모드로 폴백
                try {
                    return await this.getGnugoMove(gameId, level, gameState);
                } catch (error) {
                    console.warn('Gnugo failed, falling back to demo mode:', error.message);
                    return await this.getDemoMove(gameId, level, gameState);
                }
            }
        });

        aiQueue.process('katago-score', async (job) => {
            const { gameId, gameState } = job.data;
            const aiMode = process.env.AI_MODE || 'gnugo';
            
            if (aiMode === 'demo') {
                return await this.getDemoScore(gameId, gameState);
            } else {
                try {
                    return await this.getKatagoScore(gameId, gameState);
                } catch (error) {
                    console.error('Katago scoring failed, using demo fallback:', error);
                    return await this.getDemoScore(gameId, gameState);
                }
            }
        });
    }

    async getDemoScore(gameId, gameState) {
        // Very simple territory estimation for demo
        let blackPoints = 0;
        let whitePoints = 0;
        
        const board = Array(19).fill(null).map(() => Array(19).fill(null));
        gameState.moves.forEach(move => {
            if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                board[move.y][move.x] = move.color;
            }
        });

        // Basic count: stones on board + captured
        for (let y = 0; y < 19; y++) {
            for (let x = 0; x < 19; x++) {
                if (board[y][x] === 'black') blackPoints++;
                else if (board[y][x] === 'white') whitePoints++;
            }
        }

        blackPoints += gameState.capturedBlack || 0;
        whitePoints += (gameState.capturedWhite || 0) + 6.5; // Komi

        return {
            blackScore: blackPoints,
            whiteScore: whitePoints,
            winner: blackPoints > whitePoints ? 'black' : 'white'
        };
    }

    async getAiMove(gameId, level) {
        try {
            const game = await gameService.getGame(gameId);
            const gameState = await gameService.getGameState(gameId);
            
            // 놀이바둑 모드 확인
            const casualModes = ['DICE', 'COPS', 'OMOK', 'TTAK', 'ALKKAGI', 'CURLING'];
            const isCasualMode = casualModes.includes(game.mode) || gameState.isCasualMode;
            
            // 놀이바둑일 때는 단일 AI봇 사용 (level은 null이거나 기본값 사용)
            const finalLevel = isCasualMode ? (level || 5) : level;

            // Add to queue
            const job = await aiQueue.add('gnugo-move', {
                gameId,
                level: finalLevel,
                gameState,
                isCasualMode: isCasualMode,
            }, {
                priority: 1,
                timeout: 30000, // 30 second timeout
            });

            // Wait for result
            const result = await job.finished();
            
            if (!result) {
                throw new Error('AI move failed');
            }

            // Make the move
            let moveResult = null;
            if (result.isPass) {
                moveResult = await gameService.makeMove(gameId, 'ai', {
                    isPass: true,
                    color: game.aiColor,
                });
            } else if (result.x !== undefined && result.y !== undefined) {
                moveResult = await gameService.makeMove(gameId, 'ai', {
                    x: result.x,
                    y: result.y,
                    color: game.aiColor,
                });
            }

            // Notify via socket
            const io = require('../server').io;
            if (io && moveResult) {
                io.to(`game-${gameId}`).emit('ai_move', {
                    move: moveResult
                });
            }

            return moveResult;
        } catch (error) {
            console.error('AI move error:', error);
            const io = require('../server').io;
            if (io) {
                io.to(`game-${gameId}`).emit('ai_error', { error: error.message });
            }
            throw error;
        }
    }

    // 데모 모드: 간단한 휴리스틱 기반 AI (테스트용 - 시간 소모 및 초읽기 테스트 가능)
    async getDemoMove(gameId, level, gameState) {
        return new Promise(async (resolve) => {
            // 테스트를 위해 더 긴 지연 시간 설정 (1~5초)
            // 초읽기 모드 테스트를 위해 시간이 소모되도록 함
            const delay = 1000 + Math.random() * 4000; // 1~5초 지연
            
            setTimeout(async () => {
                try {
                    const game = await gameService.getGame(gameId);
                    const aiColor = game?.aiColor || 'white';
                    
                    // 현재 보드 상태 재구성
                    const board = Array(19).fill(null).map(() => Array(19).fill(null));
                    if (gameState.stones) {
                        // gameState.stones가 있으면 직접 사용
                        for (let y = 0; y < 19; y++) {
                            for (let x = 0; x < 19; x++) {
                                board[y][x] = gameState.stones[y][x] || null;
                            }
                        }
                    } else {
                        // moves에서 재구성
                        gameState.moves.forEach(move => {
                            if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                                board[move.y][move.x] = move.color;
                            }
                        });
                    }
                    
                    // 간단한 휴리스틱: 빈 공간 중 랜덤하게 선택하되, 약간의 스마트한 선택
                    const validMoves = [];
                    for (let y = 0; y < 19; y++) {
                        for (let x = 0; x < 19; x++) {
                            if (board[y][x] === null) {
                                // 주변에 돌이 있는 위치를 선호 (약간의 전략)
                                let score = Math.random();
                                for (let dy = -1; dy <= 1; dy++) {
                                    for (let dx = -1; dx <= 1; dx++) {
                                        if (dx === 0 && dy === 0) continue;
                                        const ny = y + dy;
                                        const nx = x + dx;
                                        if (ny >= 0 && ny < 19 && nx >= 0 && nx < 19) {
                                            if (board[ny][nx] !== null) {
                                                score += 0.1; // 주변에 돌이 있으면 점수 증가
                                            }
                                        }
                                    }
                                }
                                validMoves.push({ x, y, score });
                            }
                        }
                    }
                    
                    if (validMoves.length === 0) {
                        resolve({ isPass: true });
                        return;
                    }
                    
                    // 난이도에 따라 선택 방식 변경
                    let selectedMove;
                    if (level <= 3) {
                        // 낮은 난이도: 완전 랜덤 선택 (테스트용)
                        selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
                    } else if (level <= 6) {
                        // 중간 난이도: 점수가 높은 상위 30% 중에서 선택
                        validMoves.sort((a, b) => b.score - a.score);
                        const top30 = Math.max(1, Math.floor(validMoves.length * 0.3));
                        selectedMove = validMoves[Math.floor(Math.random() * top30)];
                    } else {
                        // 높은 난이도: 점수가 높은 상위 10% 중에서 선택
                        validMoves.sort((a, b) => b.score - a.score);
                        const top10 = Math.max(1, Math.floor(validMoves.length * 0.1));
                        selectedMove = validMoves[Math.floor(Math.random() * top10)];
                    }
                    
                    resolve({ x: selectedMove.x, y: selectedMove.y });
                } catch (error) {
                    console.error('Demo AI move error:', error);
                    // 에러 발생 시 랜덤 위치 선택
                    const randomX = Math.floor(Math.random() * 19);
                    const randomY = Math.floor(Math.random() * 19);
                    resolve({ x: randomX, y: randomY });
                }
            }, delay);
        });
    }

    // 놀이바둑 전용 AI (그누고 사용 안 함)
    async getCasualAiMove(gameId, level, gameState) {
        return new Promise(async (resolve) => {
            // 테스트를 위해 더 긴 지연 시간 설정 (1~5초)
            // 초읽기 모드 테스트를 위해 시간이 소모되도록 함
            const delay = 1000 + Math.random() * 4000; // 1~5초 지연
            
            setTimeout(async () => {
                try {
                    const game = await gameService.getGame(gameId);
                    const aiColor = game?.aiColor || 'white';
                    const gameMode = game?.mode || 'DICE';
                    
                    // 현재 보드 상태 재구성
                    const board = Array(19).fill(null).map(() => Array(19).fill(null));
                    if (gameState.stones) {
                        // gameState.stones가 있으면 직접 사용
                        for (let y = 0; y < 19; y++) {
                            for (let x = 0; x < 19; x++) {
                                board[y][x] = gameState.stones[y][x] || null;
                            }
                        }
                    } else {
                        // moves에서 재구성
                        gameState.moves.forEach(move => {
                            if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                                board[move.y][move.x] = move.color;
                            }
                        });
                    }
                    
                    // 게임 모드별로 다른 AI 로직 적용
                    let move;
                    switch(gameMode) {
                        case 'DICE': // 주사위바둑
                        case 'COPS': // 경찰과도둑
                        case 'OMOK': // 오목
                        case 'TTAK': // 따목
                        case 'ALKKAGI': // 알까기
                        case 'CURLING': // 바둑컬링
                        default:
                            // 기본적으로 데모 AI와 유사한 로직 사용
                            // 추후 각 게임 모드별로 특화된 AI 로직 추가 가능
                            move = await this.getCasualDefaultMove(board, aiColor);
                            break;
                    }
                    
                    if (!move) {
                        resolve({ isPass: true });
                        return;
                    }
                    
                    resolve(move);
                } catch (error) {
                    console.error('Casual AI move error:', error);
                    // 에러 발생 시 랜덤 위치 선택
                    const randomX = Math.floor(Math.random() * 19);
                    const randomY = Math.floor(Math.random() * 19);
                    resolve({ x: randomX, y: randomY });
                }
            }, delay);
        });
    }

    // 놀이바둑 기본 AI 로직 (테스트용 - 간단한 랜덤 선택)
    async getCasualDefaultMove(board, aiColor) {
        const validMoves = [];
        for (let y = 0; y < 19; y++) {
            for (let x = 0; x < 19; x++) {
                if (board[y][x] === null) {
                    // 테스트를 위해 간단하게 모든 빈 위치를 수집
                    validMoves.push({ x, y });
                }
            }
        }
        
        if (validMoves.length === 0) {
            return null;
        }
        
        // 테스트용: 완전 랜덤 선택 (어떤 위치든 선택 가능)
        const selectedMove = validMoves[Math.floor(Math.random() * validMoves.length)];
        
        return { x: selectedMove.x, y: selectedMove.y };
    }

    async getGnugoMove(gameId, level, gameState) {
        return new Promise((resolve, reject) => {
            const gnugoPath = process.env.GNUGO_PATH || 'gnugo';
            
            // Gnugo 실행 시도
            let gnugo;
            try {
                gnugo = spawn(gnugoPath, [
                    '--level', level.toString(),
                    '--mode', 'gtp'
                ]);
            } catch (error) {
                reject(new Error(`Gnugo를 실행할 수 없습니다: ${error.message}. Gnugo가 설치되어 있는지 확인해주세요.`));
                return;
            }

            let output = '';
            let errorOutput = '';

            // Send game state to Gnugo
            gnugo.stdin.write('boardsize 19\n');
            gnugo.stdin.write('clear_board\n');

            // Replay moves
            gameState.moves.forEach(move => {
                if (!move.isPass) {
                    const x = String.fromCharCode(65 + move.x);
                    const y = (move.y + 1).toString();
                    gnugo.stdin.write(`play ${move.color === 'black' ? 'B' : 'W'} ${x}${y}\n`);
                } else {
                    gnugo.stdin.write(`play ${move.color === 'black' ? 'B' : 'W'} pass\n`);
                }
            });

            // Get AI color from game
            const game = await gameService.getGame(gameId);
            const aiColor = game.aiColor || 'white';
            const aiColorLetter = aiColor === 'black' ? 'B' : 'W';

            // Request move
            gnugo.stdin.write(`genmove ${aiColorLetter}\n`);
            gnugo.stdin.end();

            gnugo.stdout.on('data', (data) => {
                output += data.toString();
            });

            gnugo.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error(`Gnugo stderr: ${data}`);
            });

            gnugo.on('close', (code) => {
                if (code !== 0) {
                    const errorMsg = errorOutput || `Gnugo가 종료 코드 ${code}로 종료되었습니다.`;
                    reject(new Error(`Gnugo 오류: ${errorMsg}. Gnugo가 올바르게 설치되어 있는지 확인해주세요.`));
                    return;
                }

                // Parse output - 여러 줄에서 패턴 찾기
                const lines = output.split('\n');
                let moveMatch = null;
                
                for (const line of lines) {
                    // GTP 형식: "= A1" 또는 "= pass"
                    const match = line.match(/^=\s*([A-T])(\d+)|^=\s*pass/i);
                    if (match) {
                        moveMatch = match;
                        break;
                    }
                }

                if (!moveMatch) {
                    console.error('Gnugo output:', output);
                    reject(new Error(`Gnugo 출력을 파싱할 수 없습니다. 출력: ${output.substring(0, 200)}`));
                    return;
                }

                if (moveMatch[0].toLowerCase().includes('pass')) {
                    resolve({ isPass: true });
                } else {
                    const x = moveMatch[1].charCodeAt(0) - 65;
                    const y = parseInt(moveMatch[2]) - 1;
                    resolve({ x, y });
                }
            });

            gnugo.on('error', (error) => {
                reject(new Error(`Failed to start Gnugo: ${error.message}`));
            });

            // Timeout
            setTimeout(() => {
                gnugo.kill();
                reject(new Error('Gnugo timeout'));
            }, 30000);
        });
    }

    async calculateScore(gameId) {
        const gameState = await gameService.getGameState(gameId);

        // Add to queue
        const job = await aiQueue.add('katago-score', {
            gameId,
            gameState,
        }, {
            priority: 2,
            timeout: 60000, // 60 second timeout
        });

        const result = await job.finished();
        return result;
    }

    async getKatagoScore(gameId, gameState) {
        return new Promise((resolve, reject) => {
            const katagoPath = process.env.KATAGO_PATH || 'katago';
            const katago = spawn(katagoPath, [
                'analysis',
                '-model', process.env.KATAGO_MODEL || 'default_model.bin.gz',
                '-config', process.env.KATAGO_CONFIG || 'analysis.cfg'
            ]);

            // Convert game state to SGF
            const sgf = this.gameStateToSGF(gameState);

            let output = '';

            katago.stdin.write(sgf);
            katago.stdin.end();

            katago.stdout.on('data', (data) => {
                output += data.toString();
            });

            katago.stderr.on('data', (data) => {
                console.error(`Katago error: ${data}`);
            });

            katago.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Katago exited with code ${code}`));
                    return;
                }

                // Parse score from output
                // This is a simplified parser - actual Katago output format may vary
                const scoreMatch = output.match(/Score:.*?([\d.]+)/);
                if (!scoreMatch) {
                    reject(new Error('Failed to parse Katago score'));
                    return;
                }

                const score = parseFloat(scoreMatch[1]);
                const winner = score > 0 ? 'black' : 'white';

                resolve({
                    blackScore: score > 0 ? score : 0,
                    whiteScore: score < 0 ? Math.abs(score) : 0,
                    winner,
                });
            });

            katago.on('error', (error) => {
                reject(new Error(`Failed to start Katago: ${error.message}`));
            });

            // Timeout
            setTimeout(() => {
                katago.kill();
                reject(new Error('Katago timeout'));
            }, 60000);
        });
    }

    gameStateToSGF(gameState) {
        let sgf = '(;FF[4]SZ[19]';
        
        gameState.moves.forEach(move => {
            if (move.isPass) {
                sgf += `;${move.color === 'black' ? 'B' : 'W'}[]`;
            } else {
                const x = String.fromCharCode(97 + move.x);
                const y = String.fromCharCode(97 + move.y);
                sgf += `;${move.color === 'black' ? 'B' : 'W'}[${x}${y}]`;
            }
        });

        sgf += ')';
        return sgf;
    }
}

module.exports = new AIService();

