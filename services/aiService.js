const aiQueue = require('../queue/aiQueue');
const { spawn } = require('child_process');
const gameService = require('./gameService');

class AIService {
    constructor() {
        this.setupQueueProcessor();
    }

    setupQueueProcessor() {
        aiQueue.process('gnugo-move', async (job) => {
            const { gameId, level, gameState } = job.data;
            const aiMode = process.env.AI_MODE || 'gnugo';
            
            if (aiMode === 'demo') {
                return await this.getDemoMove(gameId, level, gameState);
            } else {
                return await this.getGnugoMove(gameId, level, gameState);
            }
        });

        aiQueue.process('katago-score', async (job) => {
            const { gameId, gameState } = job.data;
            return await this.getKatagoScore(gameId, gameState);
        });
    }

    async getAiMove(gameId, level) {
        try {
            const game = await gameService.getGame(gameId);
            const gameState = await gameService.getGameState(gameId);

            // Add to queue
            const job = await aiQueue.add('gnugo-move', {
                gameId,
                level,
                gameState,
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

    // 데모 모드: 간단한 휴리스틱 기반 AI
    async getDemoMove(gameId, level, gameState) {
        return new Promise(async (resolve) => {
            // 약간의 지연을 추가하여 실제 AI처럼 보이게 함
            setTimeout(async () => {
                try {
                    const game = await gameService.getGame(gameId);
                    const aiColor = game?.aiColor || 'white';
                    
                    // 현재 보드 상태 재구성
                    const board = Array(19).fill(null).map(() => Array(19).fill(null));
                    gameState.moves.forEach(move => {
                        if (!move.isPass && move.x !== undefined && move.y !== undefined) {
                            board[move.y][move.x] = move.color;
                        }
                    });
                    
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
                        // 낮은 난이도: 랜덤 선택
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
            }, 500 + Math.random() * 1000); // 0.5~1.5초 지연
        });
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

