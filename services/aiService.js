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
            return await this.getGnugoMove(gameId, level, gameState);
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

    async getGnugoMove(gameId, level, gameState) {
        return new Promise((resolve, reject) => {
            const gnugoPath = process.env.GNUGO_PATH || 'gnugo';
            const gnugo = spawn(gnugoPath, [
                '--level', level.toString(),
                '--mode', 'gtp'
            ]);

            let output = '';

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

            // Request move
            gnugo.stdin.write('genmove W\n'); // AI plays white
            gnugo.stdin.end();

            gnugo.stdout.on('data', (data) => {
                output += data.toString();
            });

            gnugo.stderr.on('data', (data) => {
                console.error(`Gnugo error: ${data}`);
            });

            gnugo.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Gnugo exited with code ${code}`));
                    return;
                }

                // Parse output
                const moveMatch = output.match(/^= ([A-T])(\d+)|^= pass/i);
                if (!moveMatch) {
                    reject(new Error('Failed to parse Gnugo output'));
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

